import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { mapCategoryToAccount, toNumber } from './ledger';
import type { LedgerEntryType } from './ledger';

const logger = createLogger('LedgerProjection');

/**
 * CQRS projection: financial_events (journal) → ledger_entries (read model).
 *
 * Semantics:
 * - REPLACE: materialized entries are keyed by entity (reference_id + type).
 *   Each event kind upserts the "current state" of its entity, so replayed or
 *   re-ordered events converge to the same final state (idempotent).
 * - The entry's event_id points at the latest applied event = checkpoint.
 * - Incremental sync runs by recorded_at since the stored checkpoint;
 *   rebuilds replay everything in occurred_at order for correctness.
 * - USD presentation uses the event's FROZEN amount_usd (no read-time re-rating).
 */

export interface ProjectionScope {
  userId: string;
  workspaceId: string;
}

interface LedgerEntryRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  event_id: string;
  date: string;
  description: string;
  account: string;
  debit: number;
  credit: number;
  type: LedgerEntryType;
  reference_id: string;
  category: string | null;
  currency: string;
}

interface FinancialEventRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  occurred_at: string;
  recorded_at: string;
  payload: Record<string, unknown>;
  amount: number | null;
  currency: string | null;
  amount_usd: number | null;
  direction: 'in' | 'out' | 'none';
}

const isPersonal = (workspaceId: string): boolean => workspaceId.startsWith('ws_personal_');

function projectEvent(event: FinancialEventRow): {
  action: 'insert' | 'delete' | 'ignore';
  entry?: Omit<LedgerEntryRow, 'id' | 'created_at'>;
  deleteWhere?: { reference_id: string; type: LedgerEntryType };
} {
  const ref = event.entity_id;
  const date = event.occurred_at.slice(0, 10);
  const usd = event.amount_usd ?? toNumber(event.amount);

  switch (event.event_type) {
    case 'document.paid': {
      const payload = event.payload || {};
      const isCredit = payload.bookkeeping_only === true;
      const type: LedgerEntryType = isCredit ? 'credit' : 'revenue';
      return {
        action: 'insert',
        deleteWhere: { reference_id: ref, type },
        entry: {
          user_id: event.user_id,
          workspace_id: event.workspace_id,
          event_id: event.id,
          date,
          description: String(payload.title || (isCredit ? 'Credit entry' : 'Invoice payment')),
          account: isCredit ? 'Other Income' : 'Revenue',
          debit: 0,
          credit: usd,
          type,
          reference_id: ref,
          category: null,
          currency: 'USD',
        },
      };
    }

    case 'expense.created':
    case 'expense.updated': {
      const payload = event.payload || {};
      const category = String(payload.category || 'other');
      return {
        action: 'insert',
        deleteWhere: { reference_id: ref, type: 'expense' },
        entry: {
          user_id: event.user_id,
          workspace_id: event.workspace_id,
          event_id: event.id,
          date,
          description: String(payload.note || `${category} expense`),
          account: mapCategoryToAccount(category),
          debit: usd,
          credit: 0,
          type: 'expense',
          reference_id: ref,
          category,
          currency: 'USD',
        },
      };
    }

    case 'expense.deleted': {
      return { action: 'delete', deleteWhere: { reference_id: ref, type: 'expense' } };
    }

    case 'imported_transaction.created': {
      const payload = event.payload || {};
      const isDebit = payload.type === 'debit';
      const category = payload.category ? String(payload.category) : null;
      return {
        action: 'insert',
        deleteWhere: { reference_id: ref, type: 'transfer' },
        entry: {
          user_id: event.user_id,
          workspace_id: event.workspace_id,
          event_id: event.id,
          date,
          description: String(payload.description || 'Imported transaction'),
          account: isDebit ? mapCategoryToAccount(category) : 'Imported Credit',
          debit: isDebit ? usd : 0,
          credit: isDebit ? 0 : usd,
          type: 'transfer',
          reference_id: ref,
          category,
          currency: 'USD',
        },
      };
    }

    case 'imported_transaction.updated': {
      const payload = event.payload || {};
      // Consumed transactions drop out of the ledger (their derived
      // expense/document entries take their place).
      if (payload.status === 'expensed' || payload.status === 'skipped') {
        return { action: 'delete', deleteWhere: { reference_id: ref, type: 'transfer' } };
      }
      const isDebit = payload.type === 'debit';
      const category = payload.category ? String(payload.category) : null;
      return {
        action: 'insert',
        deleteWhere: { reference_id: ref, type: 'transfer' },
        entry: {
          user_id: event.user_id,
          workspace_id: event.workspace_id,
          event_id: event.id,
          date,
          description: String(payload.description || 'Imported transaction'),
          account: isDebit ? mapCategoryToAccount(category) : 'Imported Credit',
          debit: isDebit ? usd : 0,
          credit: isDebit ? 0 : usd,
          type: 'transfer',
          reference_id: ref,
          category,
          currency: 'USD',
        },
      };
    }

    case 'offramp.settled': {
      const payload = event.payload || {};
      return {
        action: 'insert',
        deleteWhere: { reference_id: ref, type: 'transfer' },
        entry: {
          user_id: event.user_id,
          workspace_id: event.workspace_id,
          event_id: event.id,
          date,
          description: `Withdrawal${payload.bank_name ? ` — ${String(payload.bank_name)}` : ''}`,
          account: 'Withdrawals',
          debit: usd,
          credit: 0,
          type: 'transfer',
          reference_id: ref,
          category: 'withdrawals',
          currency: 'USD',
        },
      };
    }

    case 'offramp.refunded': {
      return {
        action: 'insert',
        deleteWhere: { reference_id: ref, type: 'credit' },
        entry: {
          user_id: event.user_id,
          workspace_id: event.workspace_id,
          event_id: event.id,
          date,
          description: 'Refunded withdrawal',
          account: 'Refunds',
          debit: 0,
          credit: usd,
          type: 'credit',
          reference_id: ref,
          category: 'refunds',
          currency: 'USD',
        },
      };
    }

    case 'wallet.deposit.received': {
      const payload = event.payload || {};
      return {
        action: 'insert',
        deleteWhere: { reference_id: ref, type: 'credit' },
        entry: {
          user_id: event.user_id,
          workspace_id: event.workspace_id,
          event_id: event.id,
          date,
          description: `Deposit${payload.label ? ` — ${String(payload.label)}` : ''}`,
          account: 'Other Income',
          debit: 0,
          credit: usd,
          type: 'credit',
          reference_id: ref,
          category: 'deposits',
          currency: 'USD',
        },
      };
    }

    default:
      return { action: 'ignore' };
  }
}

async function applyEvent(event: FinancialEventRow): Promise<void> {
  const projected = projectEvent(event);
  if (projected.action === 'ignore') return;

  if (projected.action === 'delete' && projected.deleteWhere) {
    const { error } = await supabase
      .from('ledger_entries')
      .delete()
      .eq('reference_id', projected.deleteWhere.reference_id)
      .eq('type', projected.deleteWhere.type);
    if (error) throw new Error(`projection delete failed: ${error.message}`);
    return;
  }

  if (projected.entry) {
    const { error } = await supabase.from('ledger_entries').insert(projected.entry);
    if (error) throw new Error(`projection insert failed: ${error.message}`);
  }
}

function eventQuery(scope: ProjectionScope, afterRecordedAt?: string, from = 0, to = 499) {
  let q = supabase
    .from('financial_events')
    .select('id,user_id,workspace_id,event_type,entity_type,entity_id,occurred_at,recorded_at,payload,amount,currency,amount_usd,direction')
    .order('occurred_at', { ascending: true })
    .order('recorded_at', { ascending: true })
    .range(from, to);

  if (isPersonal(scope.workspaceId)) {
    q = q.eq('user_id', scope.userId);
  } else {
    q = q.eq('workspace_id', scope.workspaceId);
  }
  if (afterRecordedAt) {
    q = q.gt('recorded_at', afterRecordedAt);
  }
  return q;
}

async function getWorkspaceMaxRecordedAt(scope: ProjectionScope): Promise<string> {
  let latestQuery = supabase.from('financial_events').select('recorded_at');
  if (isPersonal(scope.workspaceId)) {
    latestQuery = latestQuery.eq('user_id', scope.userId);
  } else {
    latestQuery = latestQuery.eq('workspace_id', scope.workspaceId);
  }
  const { data, error } = await latestQuery
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`projection checkpoint lookup failed: ${error.message}`);
  return data?.recorded_at ?? new Date(0).toISOString();
}

/**
 * Incremental or full sync of the projection for a workspace.
 * Idempotent: safe to call on every ledger read.
 */
export async function ensureProjection(scope: ProjectionScope): Promise<void> {
  try {
    const { data: state, error: stateError } = await supabase
      .from('ledger_projection_state')
      .select('last_recorded_at')
      .eq('user_id', scope.userId)
      .eq('workspace_id', scope.workspaceId)
      .maybeSingle();

    if (stateError) throw new Error(`projection state lookup failed: ${stateError.message}`);

    if (!state) {
      await rebuildProjection(scope);
      return;
    }

    // Incremental sync of events recorded since the checkpoint
    let processed = 0;
    for (let from = 0; from < 20000; from += 500) {
      const { data: events, error } = await eventQuery(scope, state.last_recorded_at, from, from + 499);
      if (error) throw new Error(`projection event fetch failed: ${error.message}`);
      const batch = events || [];
      for (const event of batch) {
        await applyEvent(event as unknown as FinancialEventRow);
        processed++;
      }
      if (batch.length < 500) break;
    }

    if (processed === 0) return;

    // Advance checkpoint to the latest processed record — best-effort: events
    // that arrive out of order are reconciled by the next full rebuild.
    const latest = await getWorkspaceMaxRecordedAt(scope);

    const { error: checkpointError } = await supabase
      .from('ledger_projection_state')
      .upsert({
        user_id: scope.userId,
        workspace_id: scope.workspaceId,
        last_recorded_at: latest,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,workspace_id' });

    if (checkpointError) throw new Error(`projection checkpoint update failed: ${checkpointError.message}`);
  } catch (error) {
    logger.error('ensureProjection failed', { message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Full replay: wipe the workspace projection and rebuild from all events in
 * occurred_at order. Guarantees a correct final state regardless of prior
 * out-of-order syncs.
 */
export async function rebuildProjection(scope: ProjectionScope): Promise<void> {
  const { error: deleteError } = await supabase
    .from('ledger_entries')
    .delete()
    .eq('user_id', scope.userId)
    .eq('workspace_id', scope.workspaceId);
  if (deleteError) throw new Error(`projection reset failed: ${deleteError.message}`);

  let processed = 0;
  for (let from = 0; from < 20000; from += 500) {
    const { data: events, error } = await eventQuery(scope, undefined, from, from + 499);
    if (error) throw new Error(`projection rebuild fetch failed: ${error.message}`);
    const batch = events || [];
    for (const event of batch) {
      await applyEvent(event as unknown as FinancialEventRow);
      processed++;
    }
    if (batch.length < 500) break;
  }

  const { error: stateError } = await supabase
    .from('ledger_projection_state')
    .upsert({
      user_id: scope.userId,
      workspace_id: scope.workspaceId,
      last_recorded_at: await getWorkspaceMaxRecordedAt(scope),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,workspace_id' });
  if (stateError) throw new Error(`projection state write failed: ${stateError.message}`);

  logger.info('Projection rebuilt', { workspaceId: scope.workspaceId, events: processed });
}

/**
 * Read the projected ledger for a workspace, filtered to entries on or after
 * the given start date, newest first (matches the /ledger endpoint contract).
 */
export async function readProjectionEntries(scope: ProjectionScope, start: Date): Promise<LedgerEntryRow[]> {
  const { data, error } = await supabase
    .from('ledger_entries')
    .select('id,user_id,workspace_id,event_id,date,description,account,debit,credit,type,reference_id,category,currency')
    .eq('user_id', scope.userId)
    .eq('workspace_id', scope.workspaceId)
    .gte('date', start.toISOString().slice(0, 10))
    .order('date', { ascending: false });

  if (error) throw new Error(`projection read failed: ${error.message}`);
  return (data || []) as unknown as LedgerEntryRow[];
}
