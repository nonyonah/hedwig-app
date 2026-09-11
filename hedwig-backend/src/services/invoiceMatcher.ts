import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('InvoiceMatcher');

export interface MatchCandidate {
  transactionId: string;
  invoiceId: string;
  score: number;
  reasons: string[];
  transactionLabel?: string;
  invoiceLabel?: string;
  amount?: number;
}

interface Txn {
  id: string;
  description: string;
  amount: number;
  currency: string;
  transaction_date: string;
  type: string;
}

interface Invoice {
  id: string;
  amount: number;
  title: string;
  client_name: string | null;
  due_date: string | null;
  created_at: string;
}

const tokens = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );

/** Score 0..1 that an imported bank transaction pays a given invoice. */
export function scoreMatch(txn: Txn, invoice: Invoice): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Amount: exact or within 1% (max weight — money must agree).
  const tAmt = Math.abs(Number(txn.amount) || 0);
  const iAmt = Math.abs(Number(invoice.amount) || 0);
  if (tAmt > 0 && iAmt > 0) {
    const diff = Math.abs(tAmt - iAmt) / Math.max(tAmt, iAmt);
    if (diff === 0) {
      score += 0.55;
      reasons.push('exact amount match');
    } else if (diff <= 0.01) {
      score += 0.45;
      reasons.push('amount within 1%');
    } else if (diff <= 0.05) {
      score += 0.2;
      reasons.push('amount within 5%');
    }
  }

  // Date: bank debit near invoice creation/due date (within 21 days).
  try {
    const tDate = new Date(txn.transaction_date).getTime();
    const anchors = [invoice.due_date, invoice.created_at].map((d) => (d ? new Date(d).getTime() : NaN));
    const best = Math.min(...anchors.map((a) => Math.abs(tDate - a)).filter((n) => Number.isFinite(n)));
    if (Number.isFinite(best)) {
      const days = best / 86400000;
      if (days <= 3) {
        score += 0.25;
        reasons.push('date within 3 days');
      } else if (days <= 21) {
        score += 0.15;
        reasons.push('date within 3 weeks');
      }
    }
  } catch {
    // ignore unparsable dates
  }

  // Counterparty: token overlap between bank description and client/title.
  const tTokens = tokens(`${txn.description ?? ''}`);
  const iTokens = tokens(`${invoice.client_name ?? ''} ${invoice.title ?? ''}`);
  if (tTokens.size > 0 && iTokens.size > 0) {
    let overlap = 0;
    for (const t of tTokens) if (iTokens.has(t)) overlap++;
    const ratio = overlap / Math.min(tTokens.size, iTokens.size);
    if (ratio >= 0.5) {
      score += 0.2;
      reasons.push('counterparty name match');
    } else if (ratio >= 0.25) {
      score += 0.1;
      reasons.push('partial name overlap');
    }
  }

  return { score: Math.min(1, Math.round(score * 100) / 100), reasons };
}

async function unpaidInvoices(userId: string, workspaceId: string | null): Promise<Invoice[]> {
  let q = supabase
    .from('documents')
    .select('id,amount,title,created_at,content')
    .eq('user_id', userId)
    .eq('type', 'INVOICE')
    .in('status', ['DRAFT', 'SENT', 'VIEWED', 'OVERDUE'])
    .order('created_at', { ascending: false })
    .limit(200);
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data, error } = await q;
  if (error) throw new Error(`unpaid invoices query failed: ${error.message}`);
  return (data ?? []).map((d: Record<string, unknown>) => ({
    id: d.id as string,
    amount: Number(d.amount ?? 0),
    title: String(d.title ?? ''),
    client_name: ((d.content ?? {}) as Record<string, unknown>).client_name != null
      ? String(((d.content ?? {}) as Record<string, unknown>).client_name)
      : null,
    due_date: ((d.content ?? {}) as Record<string, unknown>).due_date != null
      ? String(((d.content ?? {}) as Record<string, unknown>).due_date)
      : null,
    created_at: String(d.created_at ?? ''),
  }));
}

async function unmatchedTransactions(
  userId: string,
  workspaceId: string | null,
  includeStatements = false
): Promise<Txn[]> {
  let q = supabase
    .from('imported_transactions')
    .select('id,description,amount,currency,transaction_date,type,statement_id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .is('matched_invoice_id', null)
    .eq('type', 'debit')
    .order('transaction_date', { ascending: false })
    .limit(200);
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data, error } = await q;
  if (error) throw new Error(`unmatched transactions query failed: ${error.message}`);
  let rows = (data ?? []) as (Txn & { statement_id: string })[];
  // Receipts only by default: bank-statement batches (csv/ofx/qfx) are
  // excluded until explicitly re-enabled. Email + document imports stay eligible.
  if (!includeStatements && rows.length > 0) {
    const statementIds = Array.from(new Set(rows.map((r) => r.statement_id).filter(Boolean)));
    if (statementIds.length > 0) {
      const { data: statements } = await supabase
        .from('statement_imports')
        .select('id,file_format')
        .in('id', statementIds);
      const bankStatements = new Set(
        ((statements ?? []) as Array<{ id: string; file_format: string }>)
          .filter((s) => ['csv', 'ofx', 'qfx'].includes(String(s.file_format ?? '').toLowerCase()))
          .map((s) => s.id)
      );
      rows = rows.filter((r) => !bankStatements.has(r.statement_id));
    }
  }
  return rows;
}

/** Best invoice candidate per unmatched debit transaction. */
export async function suggestMatches(
  userId: string,
  workspaceId: string | null,
  minScore = 0.5,
  includeStatements = false
): Promise<MatchCandidate[]> {
  const [txns, invoices] = await Promise.all([
    unmatchedTransactions(userId, workspaceId, includeStatements),
    unpaidInvoices(userId, workspaceId),
  ]);
  const out: MatchCandidate[] = [];
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  for (const txn of txns) {
    let best: MatchCandidate | null = null;
    for (const inv of invoices) {
      const { score, reasons } = scoreMatch(txn, inv);
      if (score >= minScore && (!best || score > best.score)) {
        best = { transactionId: txn.id, invoiceId: inv.id, score, reasons };
      }
    }
    if (best) {
      const inv = invoiceById.get(best.invoiceId);
      out.push({
        ...best,
        transactionLabel: txn.description || txn.id,
        invoiceLabel: inv ? `${inv.title || 'Invoice'} (${inv.client_name || 'no client'})` : best.invoiceId,
        amount: Math.abs(Number(txn.amount) || 0),
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Persist high-confidence matches (status → matched). Returns applied count. */
export async function applyMatches(
  userId: string,
  candidates: MatchCandidate[],
  minScore = 0.9
): Promise<number> {
  const eligible = candidates.filter((c) => c.score >= minScore);
  let applied = 0;
  for (const c of eligible) {
    const { error } = await supabase
      .from('imported_transactions')
      .update({
        matched_invoice_id: c.invoiceId,
        match_confidence: c.score,
        match_method: 'auto',
        status: 'matched',
        updated_at: new Date().toISOString(),
      })
      .eq('id', c.transactionId)
      .eq('user_id', userId)
      .eq('status', 'pending');
    if (!error) applied++;
    else logger.warn('auto-match apply failed', { transactionId: c.transactionId });
  }
  return applied;
}
