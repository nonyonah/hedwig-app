import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { computeEventFingerprint } from './financial-events';

const logger = createLogger('TimelineEvents');

/**
 * Non-money event taxonomy for the unified Financial Timeline.
 * These events are journaled in `timeline_events` — they are facts about the
 * business (invoice sent/viewed, contract signed, reminder sent, ...) but carry
 * no money and MUST NEVER be written to `financial_events` / `ledger_entries`.
 * The ledger projection stays untouched; the feed reads both journals.
 */
export const TIMELINE_EVENT_KINDS = {
  INVOICE: 'invoice',
  PAYMENT_LINK: 'payment_link',
  CONTRACT: 'contract',
  STATEMENT: 'statement',
  RECEIPT: 'receipt',
  REMINDER: 'reminder',
} as const;

export const TIMELINE_EVENT_VERBS = {
  CREATED: 'created',
  SENT: 'sent',
  VIEWED: 'viewed',
  ACTIVE: 'active',
  SIGNED: 'signed',
  IMPORTED: 'imported',
  REMINDED: 'reminded',
} as const;

export type TimelineEventKind = (typeof TIMELINE_EVENT_KINDS)[keyof typeof TIMELINE_EVENT_KINDS];
export type TimelineEventVerb = (typeof TIMELINE_EVENT_VERBS)[keyof typeof TIMELINE_EVENT_VERBS];

export interface EmitTimelineEventInput {
  userId: string;
  workspaceId?: string | null;
  /** Grouping kind: invoice, payment_link, contract, statement, receipt, reminder. */
  kind: TimelineEventKind | string;
  /** Entity class this event describes (invoice, contract, payment_link, statement_import, ...). */
  entityType: string;
  entityId: string;
  /** Verb: created, sent, viewed, active, signed, imported, reminded. */
  verb: TimelineEventVerb | string;
  /** Human title for the feed row, e.g. "Invoice INV-104 sent". */
  title: string;
  /**
   * Distinguishes distinct occurrences on the same entity (e.g. reminder #2 on
   * the same invoice). Must be stable for the same occurrence. When omitted,
   * the event is emitted once per entity+verb.
   */
  version?: string | number;
  occurredAt?: Date | string;
  /** Lightweight display metadata (title, amount, due_date, client_name, ...). */
  context?: Record<string, unknown>;
}

/**
 * Emits a timeline event. Idempotent: re-emitting the same
 * (kind.verb, entity_type, entity_id, version) is a no-op.
 *
 * Never throws: emission is best-effort and must not break the primary write
 * path. Failures are logged; retries re-emit safely because of the fingerprint.
 */
export async function emitTimelineEvent(input: EmitTimelineEventInput): Promise<{ emitted: boolean; id: string | null }> {
  const fail = (reason: string): { emitted: boolean; id: null } => {
    logger.warn('emitTimelineEvent skipped', {
      reason,
      kind: input.kind,
      verb: input.verb,
      entityType: input.entityType,
      entityId: input.entityId,
    });
    return { emitted: false, id: null };
  };

  try {
    if (!input.userId || !input.entityType || !input.entityId || !input.verb || !input.title) {
      return fail('missing required field');
    }

    const version = input.version ?? 1;
    const row = {
      user_id: input.userId,
      workspace_id: input.workspaceId ?? null,
      kind: input.kind,
      entity_type: input.entityType,
      entity_id: input.entityId,
      verb: input.verb,
      title: input.title,
      context: input.context ?? {},
      occurred_at: input.occurredAt ? new Date(input.occurredAt).toISOString() : new Date().toISOString(),
      fingerprint: computeEventFingerprint(`${input.kind}.${input.verb}`, input.entityType, input.entityId, version),
      version: typeof version === 'number' ? version : 1,
    };

    const { data, error } = await supabase
      .from('timeline_events')
      .upsert(row, { onConflict: 'fingerprint', ignoreDuplicates: true })
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('emitTimelineEvent failed', {
        kind: input.kind,
        verb: input.verb,
        entityId: input.entityId,
        message: error.message,
      });
      return { emitted: false, id: null };
    }

    return { emitted: Boolean(data?.id), id: data?.id ?? null };
  } catch (error) {
    logger.error('emitTimelineEvent threw', {
      kind: input.kind,
      verb: input.verb,
      entityId: input.entityId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { emitted: false, id: null };
  }
}
