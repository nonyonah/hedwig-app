import 'dotenv/config';
import { supabase } from '../src/lib/supabase';
import { createLogger } from '../src/utils/logger';
import { emitFinancialEvent, FINANCIAL_EVENT_TYPES } from '../src/services/financial-events';

/**
 * Phase 2: idempotent backfill of financial_events from pre-existing data.
 *
 * Safe to re-run: emission dedupes on fingerprint
 * (sha256 of event_type|entity_type|entity_id|version), so existing events
 * are never duplicated.
 *
 * Coverage:
 *  - documents (INVOICE/PAYMENT_LINK, PAID)        → document.paid
 *  - expenses                                      → expense.created
 *  - imported_transactions                         → imported_transaction.created
 *      + status expensed/skipped                   → imported_transaction.updated
 *  - offramp_orders (COMPLETED)                    → offramp.settled
 *  - transactions (PAYMENT_RECEIVED, USDC, no doc) → wallet.deposit.received
 */

const logger = createLogger('BackfillFinancialEvents');

const PAGE_SIZE = 500;
const MAX_ROWS = 20000;

async function fetchPaged<T>(label: string, fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(`${label} query failed: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

const summarize = (error: any): string => error?.message || 'unknown error';

async function backfillDocuments() {
  const rows = await fetchPaged<any>('backfill_documents', (from, to) =>
    supabase
      .from('documents')
      .select('id,user_id,workspace_id,type,status,amount,currency,title,content,created_at,updated_at')
      .in('type', ['INVOICE', 'PAYMENT_LINK'])
      .eq('status', 'PAID')
      .range(from, to)
  );

  let emitted = 0;
  for (const doc of rows) {
    const content = doc.content && typeof doc.content === 'object' ? doc.content : {};
    // Mirror migration 091's version derivation EXACTLY (fingerprint parity):
    // content timestamps are used verbatim; column timestamps are truncated to
    // milliseconds like new Date(x).toISOString().
    const contentPaidAt = content.paid_at || content.paidAt || content.payment_date;
    const paidAtRaw = contentPaidAt || doc.updated_at || doc.created_at || new Date().toISOString();
    const paidAt = contentPaidAt ? contentPaidAt : new Date(paidAtRaw).toISOString();
    const version = content.tx_hash || paidAt || 'backfill';
    const { emitted: ok } = await emitFinancialEvent({
      userId: doc.user_id,
      workspaceId: doc.workspace_id ?? null,
      eventType: FINANCIAL_EVENT_TYPES.DOCUMENT_PAID,
      entityType: 'document',
      entityId: doc.id,
      version,
      occurredAt: paidAt,
      amount: doc.amount,
      currency: doc.currency || 'USD',
      direction: 'in',
      source: 'backfill',
      payload: {
        title: doc.title,
        doc_type: doc.type,
        backfilled: true,
        bookkeeping_only: content.bookkeeping_only === true,
      },
    });
    if (ok) emitted++;
  }
  logger.info('Backfilled documents', { scanned: rows.length, emitted });
}

async function backfillExpenses() {
  const rows = await fetchPaged<any>('backfill_expenses', (from, to) =>
    supabase
      .from('expenses')
      .select('id,user_id,workspace_id,amount,currency,converted_amount_usd,category,note,date,created_at')
      .range(from, to)
  );

  let emitted = 0;
  for (const exp of rows) {
    const { emitted: ok } = await emitFinancialEvent({
      userId: exp.user_id,
      workspaceId: exp.workspace_id ?? null,
      eventType: FINANCIAL_EVENT_TYPES.EXPENSE_CREATED,
      entityType: 'expense',
      entityId: exp.id,
      version: exp.created_at ? new Date(exp.created_at).toISOString() : 'backfill',
      occurredAt: exp.date || exp.created_at || new Date(),
      amount: exp.amount,
      currency: exp.currency || 'USD',
      amountUsd: exp.converted_amount_usd ?? null,
      direction: 'out',
      source: 'backfill',
      payload: { category: exp.category, note: exp.note, backfilled: true },
    });
    if (ok) emitted++;
  }
  logger.info('Backfilled expenses', { scanned: rows.length, emitted });
}

async function backfillImportedTransactions() {
  const rows = await fetchPaged<any>('backfill_imported', (from, to) =>
    supabase
      .from('imported_transactions')
      .select('id,user_id,workspace_id,transaction_date,description,amount,currency,converted_amount_usd,fx_rate,fx_source,type,category,status,created_at,updated_at')
      .range(from, to)
  );

  let created = 0;
  let updated = 0;
  for (const txn of rows) {
    const { emitted: createdOk } = await emitFinancialEvent({
      userId: txn.user_id,
      workspaceId: txn.workspace_id ?? null,
      eventType: FINANCIAL_EVENT_TYPES.IMPORTED_TRANSACTION_CREATED,
      entityType: 'imported_transaction',
      entityId: txn.id,
      version: 1,
      occurredAt: txn.transaction_date || txn.created_at || new Date(),
      amount: txn.amount,
      currency: txn.currency || 'USD',
      amountUsd: txn.converted_amount_usd ?? null,
      fxRateUsd: txn.fx_rate ?? null,
      fxSource: txn.fx_source ?? null,
      direction: txn.type === 'debit' ? 'out' : 'in',
      source: 'backfill',
      payload: {
        description: txn.description,
        type: txn.type,
        category: txn.category,
        backfilled: true,
      },
    });
    if (createdOk) created++;

    // Terminal states for already-processed transactions
    if (txn.status === 'expensed' || txn.status === 'skipped') {
      const { emitted: updatedOk } = await emitFinancialEvent({
        userId: txn.user_id,
        workspaceId: txn.workspace_id ?? null,
        eventType: FINANCIAL_EVENT_TYPES.IMPORTED_TRANSACTION_UPDATED,
        entityType: 'imported_transaction',
        entityId: txn.id,
        version: `${txn.updated_at ? new Date(txn.updated_at).toISOString() : 'backfill'}|${txn.status}`,
        occurredAt: txn.transaction_date || txn.created_at || new Date(),
        amount: txn.amount,
        currency: txn.currency || 'USD',
        amountUsd: txn.converted_amount_usd ?? null,
        direction: 'none',
        source: 'backfill',
        payload: {
          status: txn.status,
          type: txn.type,
          category: txn.category,
          description: txn.description,
          backfilled: true,
        },
      });
      if (updatedOk) updated++;
    }
  }
  logger.info('Backfilled imported transactions', { scanned: rows.length, created, updated });
}

async function backfillOfframps() {
  const rows = await fetchPaged<any>('backfill_offramps', (from, to) =>
    supabase
      .from('offramp_orders')
      .select('id,user_id,workspace_id,status,crypto_amount,token,fiat_amount,fiat_currency,bank_name,account_number,updated_at,tx_hash')
      .eq('status', 'COMPLETED')
      .range(from, to)
  );

  let emitted = 0;
  for (const order of rows) {
    const settledAt = new Date(order.updated_at || new Date()).toISOString();
    const { emitted: ok } = await emitFinancialEvent({
      userId: order.user_id,
      workspaceId: order.workspace_id ?? null,
      eventType: FINANCIAL_EVENT_TYPES.OFFRAMP_SETTLED,
      entityType: 'offramp_order',
      entityId: order.id,
      version: settledAt,
      occurredAt: settledAt,
      amount: order.crypto_amount,
      currency: order.token || 'USDC',
      direction: 'out',
      source: 'backfill',
      correlationId: order.tx_hash || null,
      payload: {
        fiat_amount: order.fiat_amount,
        fiat_currency: order.fiat_currency,
        bank_name: order.bank_name,
        account_number: order.account_number,
        tx_hash: order.tx_hash,
        backfilled: true,
      },
    });
    if (ok) emitted++;
  }
  logger.info('Backfilled offramp settlements', { scanned: rows.length, emitted });
}

async function backfillWalletDeposits() {
  const rows = await fetchPaged<any>('backfill_deposits', (from, to) =>
    supabase
      .from('transactions')
      .select('id,user_id,document_id,tx_hash,amount,token,chain,from_address,to_address,timestamp')
      .eq('type', 'PAYMENT_RECEIVED')
      .eq('status', 'CONFIRMED')
      .eq('token', 'USDC')
      .is('document_id', null)
      .not('tx_hash', 'is', null)
      .range(from, to)
  );

  let emitted = 0;
  for (const txn of rows) {
    const { emitted: ok } = await emitFinancialEvent({
      userId: txn.user_id,
      workspaceId: null,
      eventType: FINANCIAL_EVENT_TYPES.WALLET_DEPOSIT_RECEIVED,
      entityType: 'transaction',
      entityId: txn.tx_hash,
      version: 1,
      occurredAt: txn.timestamp || new Date(),
      amount: txn.amount,
      currency: 'USDC',
      direction: 'in',
      source: 'backfill',
      correlationId: txn.tx_hash,
      payload: {
        chain: txn.chain,
        from_address: txn.from_address,
        to_address: txn.to_address,
        tx_hash: txn.tx_hash,
        backfilled: true,
      },
    });
    if (ok) emitted++;
  }
  logger.info('Backfilled wallet deposits', { scanned: rows.length, emitted });
}

async function main() {
  const started = Date.now();
  logger.info('Starting financial events backfill');

  try {
    await backfillDocuments();
    await backfillExpenses();
    await backfillImportedTransactions();
    await backfillOfframps();
    await backfillWalletDeposits();
    logger.info(`Backfill complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (error) {
    logger.error('Backfill failed', { message: summarize(error) });
    process.exitCode = 1;
  }
}

void main();
