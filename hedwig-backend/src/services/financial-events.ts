import { createHash } from 'node:crypto';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { convertToUsd, getRateSnapshot } from './currency';

const logger = createLogger('FinancialEvents');

/**
 * Money-only financial event taxonomy. Timeline-only events (contract.signed,
 * invoice.sent, ...) are intentionally deferred — they are not money facts.
 */
export const FINANCIAL_EVENT_TYPES = {
  DOCUMENT_PAID: 'document.paid',
  EXPENSE_CREATED: 'expense.created',
  EXPENSE_UPDATED: 'expense.updated',
  EXPENSE_DELETED: 'expense.deleted',
  IMPORTED_TRANSACTION_CREATED: 'imported_transaction.created',
  IMPORTED_TRANSACTION_UPDATED: 'imported_transaction.updated',
  OFFRAMP_SETTLED: 'offramp.settled',
  OFFRAMP_REFUNDED: 'offramp.refunded',
  WALLET_DEPOSIT_RECEIVED: 'wallet.deposit.received',
} as const;

export type FinancialEventType = (typeof FINANCIAL_EVENT_TYPES)[keyof typeof FINANCIAL_EVENT_TYPES];

export type FinancialEventDirection = 'in' | 'out' | 'none';

export interface EmitFinancialEventInput {
  userId: string;
  workspaceId?: string | null;
  eventType: FinancialEventType;
  entityType: string;
  entityId: string;
  /** Distinguishes distinct occurrences of the same event on the same entity
   *  (e.g. a second payment on the same document). Must be stable for the
   *  same occurrence — pass the tx hash / unique reference, not a timestamp
   *  of a mutable field. */
  version?: string | number;
  occurredAt?: Date | string;
  payload?: Record<string, unknown>;
  amount?: number | string | null;
  /** Native currency of the amount (defaults to USD). */
  currency?: string | null;
  /** Pre-computed USD reference (skips FX lookup). */
  amountUsd?: number | string | null;
  fxRateUsd?: number | string | null;
  fxSource?: string | null;
  direction?: FinancialEventDirection;
  source?: string | null;
  correlationId?: string | null;
}

/**
 * Deterministic fingerprint: sha256(event_type|entity_type|entity_id|version).
 * The unique constraint on fingerprint makes emission idempotent against
 * webhook replays, retries, and double-delivered events.
 */
export function computeEventFingerprint(
  eventType: string,
  entityType: string,
  entityId: string,
  version: string | number
): string {
  return createHash('sha256')
    .update([eventType, entityType, entityId, version].join('|'))
    .digest('hex');
}

/**
 * Emits a financial event. Idempotent: re-emitting the same
 * (event_type, entity_type, entity_id, version) is a no-op.
 *
 * The USD amount reference is FROZEN at event time (fx_rate_usd / fx_source
 * captured from the deterministic rate snapshot). Later re-rates never touch
 * already-recorded events — historical P&L stays stable.
 *
 * The helper never throws: emission is best-effort and must not break the
 * primary write path. Failures are logged; the retry relay (scheduler) can
 * re-emit later since emission is idempotent.
 */
export async function emitFinancialEvent(input: EmitFinancialEventInput): Promise<{ emitted: boolean; id: string | null }> {
  const fail = (reason: string): { emitted: boolean; id: null } => {
    logger.warn('emitFinancialEvent skipped', { reason, eventType: input.eventType, entityType: input.entityType, entityId: input.entityId });
    return { emitted: false, id: null };
  };

  try {
    if (!input.userId || !input.entityType || !input.entityId || !input.eventType) {
      return fail('missing required field');
    }
    if (input.version === undefined || input.version === null || input.version === '') {
      return fail('missing version');
    }

    const currency = String(input.currency || 'USD').toUpperCase().trim();
    const amount = input.amount === null || input.amount === undefined || input.amount === '' ? null : Number(input.amount);

    let amountUsd: number | null = input.amountUsd === null || input.amountUsd === undefined || input.amountUsd === '' ? null : Number(input.amountUsd);
    let fxRateUsd: number | null = input.fxRateUsd === null || input.fxRateUsd === undefined || input.fxRateUsd === '' ? null : Number(input.fxRateUsd);
    let fxSource: string | null = input.fxSource ?? null;

    // Freeze the USD reference at event time from the deterministic rate snapshot.
    if (amountUsd === null && amount !== null) {
      if (currency === 'USD' || currency === 'USDC' || currency === 'USDT') {
        amountUsd = amount;
        fxRateUsd = 1;
        fxSource = 'identity';
      } else {
        try {
          amountUsd = await convertToUsd(amount, currency);
          const snapshot = await getRateSnapshot();
          const unitsPerUsd = snapshot.rates[currency]; // units of `currency` per 1 USD
          if (typeof unitsPerUsd === 'number' && unitsPerUsd > 0) {
            fxRateUsd = 1 / unitsPerUsd;
            fxSource = snapshot.source;
          }
        } catch (error) {
          logger.warn('FX conversion unavailable; storing native amount only', {
            currency,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const row = {
      user_id: input.userId,
      workspace_id: input.workspaceId ?? null,
      event_type: input.eventType,
      entity_type: input.entityType,
      entity_id: input.entityId,
      fingerprint: computeEventFingerprint(input.eventType, input.entityType, input.entityId, input.version),
      occurred_at: input.occurredAt ? new Date(input.occurredAt).toISOString() : new Date().toISOString(),
      payload: input.payload ?? {},
      amount,
      currency: amount === null ? null : currency,
      amount_usd: amountUsd,
      fx_rate_usd: fxRateUsd,
      fx_source: fxSource,
      direction: input.direction ?? 'none',
      source: input.source ?? null,
      correlation_id: input.correlationId ?? null,
      version: typeof input.version === 'number' ? input.version : 1,
    };

    const { data, error } = await supabase
      .from('financial_events')
      .upsert(row, { onConflict: 'fingerprint', ignoreDuplicates: true })
      .select('id')
      .maybeSingle();

    if (error) {
      logger.error('emitFinancialEvent failed', { eventType: input.eventType, entityId: input.entityId, message: error.message });
      return { emitted: false, id: null };
    }

    return { emitted: Boolean(data?.id), id: data?.id ?? null };
  } catch (error) {
    logger.error('emitFinancialEvent threw', { eventType: input.eventType, entityId: input.entityId, message: error instanceof Error ? error.message : String(error) });
    return { emitted: false, id: null };
  }
}
