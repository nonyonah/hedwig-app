import { supabase } from '../lib/supabase';
import { convertToUsd } from './currency';

/**
 * Ledger entry contract — byte-compatible with the /api/revenue/ledger
 * response shape. Entries are single-sided (debit XOR credit), USD-presented.
 */
export interface LedgerEntry {
  date: string;
  description: string;
  account: string;
  debit: number;
  credit: number;
  type: 'revenue' | 'expense' | 'credit' | 'transfer';
  referenceId: string;
  category: string | null;
  currency: string;
}

export type LedgerEntryType = LedgerEntry['type'];

const PAGE_SIZE = 500;
const MAX_ROWS = 20000;

export const toNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

export const normalizeStatus = (value: unknown): string => String(value || '').trim().toUpperCase();

export const getDocumentPaidAt = (doc: any): Date => {
    const candidates = [
        doc?.paid_at,
        doc?.paidAt,
        doc?.content?.paid_at,
        doc?.content?.paidAt,
        doc?.content?.payment_date,
        doc?.content?.recorded_at,
        doc?.updated_at,
        doc?.created_at,
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        const date = new Date(candidate);
        if (!Number.isNaN(date.getTime())) return date;
    }

    return new Date(0);
};

export function mapCategoryToAccount(category: string | null): string {
  const map: Record<string, string> = {
    software: 'Software & Tools',
    contractors: 'Contractors',
    marketing: 'Marketing',
    travel: 'Travel',
    meals: 'Meals & Entertainment',
    office: 'Office Supplies',
    operations: 'Operations',
    taxes: 'Taxes & Licenses',
    subscriptions: 'Subscriptions',
    shopping: 'Shopping',
    entertainment: 'Entertainment',
    groceries: 'Groceries',
    utilities: 'Utilities',
    health: 'Health',
    education: 'Education',
    transportation: 'Transportation',
    rent: 'Rent',
    personal_care: 'Personal Care',
  };
  return map[category || ''] || 'Other Expenses';
}

async function fetchPaged<T>(
    label: string,
    fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
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

export interface BuildLedgerInput {
  userId: string;
  workspaceId: string | null;
  start: Date;
}

/**
 * The LEGACY ledger read path: hand-aggregates documents + expenses +
 * imported transactions and converts FX at READ time. Kept verbatim so the
 * projection can be shadow-diffed against it, then replaced by the flag.
 */
export async function buildLegacyLedgerEntries(input: BuildLedgerInput): Promise<LedgerEntry[]> {
  const { userId, workspaceId, start } = input;
  const startIso = start.toISOString();
  const wsId = workspaceId || 'ws_personal_' + userId;

  const [invoices, expenses, importedTxns] = await Promise.all([
    fetchPaged<any>('ledger_invoices', (from, to) =>
      supabase
        .from('documents')
        .select('id,type,status,amount,currency,title,created_at,updated_at,content,client_id')
        .eq('user_id', userId)
        .eq('workspace_id', wsId)
        .in('type', ['INVOICE', 'PAYMENT_LINK'])
        .or(`created_at.gte.${startIso},updated_at.gte.${startIso}`)
        .order('updated_at', { ascending: false })
        .range(from, to)
    ),
    fetchPaged<any>('ledger_expenses', (from, to) =>
      supabase
        .from('expenses')
        .select('id,amount,currency,converted_amount_usd,category,note,date,client_id,created_at')
        .eq('user_id', userId)
        .gte('date', startIso)
        .order('date', { ascending: false })
        .range(from, to)
    ).catch(() => [] as any[]),
    fetchPaged<any>('ledger_imported', (from, to) =>
      supabase
        .from('imported_transactions')
        .select('id,transaction_date,description,amount,converted_amount_usd,currency,type,category,status,created_at')
        .eq('user_id', userId)
        .gte('created_at', startIso)
        .order('transaction_date', { ascending: false })
        .range(from, to)
    ).catch(() => [] as any[]),
  ]);

  const entries: LedgerEntry[] = [];

  // Paid invoices → revenue (convert non-USD to USD equivalent)
  for (const inv of invoices) {
    const s = normalizeStatus(inv.status);
    if (s !== 'PAID') continue;
    const paidAt = getDocumentPaidAt(inv);
    if (paidAt < start) continue;
    const isCredit = inv.content?.bookkeeping_only === true;
    let revAmount = toNumber(inv.amount);
    const revCurrency = inv.currency || 'USD';
    if (revCurrency !== 'USD' && revAmount > 0) {
      try { revAmount = await convertToUsd(revAmount, revCurrency); }
      catch { /* leave as-is */ }
    }
    entries.push({
      date: paidAt.toISOString().slice(0, 10),
      description: inv.title || (isCredit ? 'Credit entry' : 'Invoice payment'),
      account: isCredit ? 'Other Income' : 'Revenue',
      debit: 0,
      credit: revAmount,
      type: isCredit ? 'credit' : 'revenue',
      referenceId: inv.id,
      category: null,
      currency: 'USD',
    });
  }

  // Expenses
  for (const exp of expenses) {
    let debitAmount = toNumber(exp.converted_amount_usd);
    if (!debitAmount || debitAmount === 0) {
      debitAmount = toNumber(exp.amount);
      const expCurr = exp.currency || 'USD';
      if (expCurr !== 'USD' && debitAmount > 0) {
        try { debitAmount = await convertToUsd(debitAmount, expCurr); }
        catch { /* leave raw */ }
      }
    }
    entries.push({
      date: exp.date?.slice(0, 10) || exp.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      description: exp.note || `${exp.category || 'other'} expense`,
      account: mapCategoryToAccount(exp.category),
      debit: debitAmount,
      credit: 0,
      type: 'expense',
      referenceId: exp.id,
      category: exp.category || 'other',
      currency: 'USD',
    });
  }

  // Imported transactions (unmatched ones still in pending)
  for (const txn of importedTxns) {
    if (txn.status === 'skipped' || txn.status === 'expensed') continue;
    let effectiveAmount = txn.converted_amount_usd;
    if (!effectiveAmount || effectiveAmount === 0) {
      effectiveAmount = toNumber(txn.amount);
      const txnCurr = txn.currency || 'USD';
      if (txnCurr !== 'USD' && effectiveAmount > 0) {
        try { effectiveAmount = await convertToUsd(effectiveAmount, txnCurr); }
        catch { /* leave raw */ }
      }
    }
    entries.push({
      date: txn.transaction_date?.slice(0, 10) || txn.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      description: txn.description || 'Imported transaction',
      account: txn.type === 'debit' ? mapCategoryToAccount(txn.category) : 'Imported Credit',
      debit: txn.type === 'debit' ? toNumber(effectiveAmount) : 0,
      credit: txn.type === 'credit' ? toNumber(effectiveAmount) : 0,
      type: 'transfer',
      referenceId: txn.id,
      category: txn.category || null,
      currency: 'USD',
    });
  }

  entries.sort((a, b) => b.date.localeCompare(a.date));
  return entries;
}
