import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { backendConfig } from '@/lib/auth/config';
import { verifyAccessToken } from '@/lib/auth/verify';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

interface ExportRequest {
  type: 'invoices' | 'transactions' | 'summary';
  dateFrom: string;
  dateTo: string;
  filters?: {
    clientId?: string;
    status?: string;
  };
}

function cell(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? '' : String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n');
}

function isoDate(s: string | null | undefined): string {
  if (!s) return '';
  try { return new Date(s).toISOString().slice(0, 10); } catch { return ''; }
}

function inDateRange(dateStr: string | null | undefined, from: string, to: string): boolean {
  if (!dateStr) return true;
  const d = isoDate(dateStr);
  return d >= from && d <= to;
}

async function fetchBackend(path: string, accessToken: string) {
  const res = await fetch(`${backendConfig.apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function POST(req: NextRequest) {
  // Exports build CSV from full datasets; cap to deter scraping.
  const limit = checkRateLimit(req, { name: 'export', limit: 10, windowMs: 60_000 });
  if (!limit.ok) return rateLimitResponse(limit.retryAfter);

  const cookieStore = await cookies();
  const accessToken = cookieStore.get('hedwig_access_token')?.value ?? null;

  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await verifyAccessToken(accessToken);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ExportRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { type, dateFrom, dateTo, filters = {} } = body;

  if (!type || !dateFrom || !dateTo) {
    return NextResponse.json({ error: 'type, dateFrom, and dateTo are required' }, { status: 400 });
  }

  if (!['invoices', 'transactions', 'summary'].includes(type)) {
    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
  }

  const filename = `hedwig-${type}-${dateFrom}-to-${dateTo}.csv`;
  let csv = '';

  try {
    if (type === 'invoices') {
      const data = await fetchBackend('/api/documents?type=INVOICE', accessToken);
      const docs: any[] = data?.documents ?? data?.data?.documents ?? [];

      const filtered = docs.filter((doc: any) => {
        const created = isoDate(doc.created_at || doc.createdAt);
        if (!inDateRange(created, dateFrom, dateTo)) return false;
        if (filters.clientId && doc.client_id !== filters.clientId && doc.clientId !== filters.clientId) return false;
        if (filters.status) {
          const st = String(doc.status || '').toLowerCase();
          if (st !== filters.status.toLowerCase()) return false;
        }
        return true;
      });

      const rows = filtered.map((doc: any) => [
        doc.id,
        doc.client_name || doc.clientName || '',
        doc.amount || doc.amountUsd || 0,
        doc.currency || 'USDC',
        doc.status || '',
        isoDate(doc.created_at || doc.createdAt),
        isoDate(doc.due_date || doc.dueAt),
        doc.status === 'paid' ? isoDate(doc.paid_at || doc.paidAt || doc.updated_at) : '',
      ]);

      csv = buildCsv(
        ['invoice_id', 'client_name', 'amount', 'currency', 'status', 'issue_date', 'due_date', 'paid_date'],
        rows
      );
    } else if (type === 'transactions') {
      const data = await fetchBackend('/api/transactions', accessToken);
      const txs: any[] = data?.transactions ?? data?.data?.transactions ?? [];

      const filtered = txs.filter((tx: any) => {
        const created = isoDate(tx.date || tx.created_at || tx.createdAt);
        if (!inDateRange(created, dateFrom, dateTo)) return false;
        return true;
      });

      const rows = filtered.map((tx: any) => [
        tx.id,
        tx.document_id || tx.documentId || tx.invoice_id || '',
        tx.description || tx.counterparty || '',
        tx.amount || 0,
        tx.token || tx.asset || 'USDC',
        tx.network || tx.chain || 'Base',
        tx.type || tx.kind || '',
        tx.status || 'completed',
        isoDate(tx.date || tx.created_at || tx.createdAt),
      ]);

      csv = buildCsv(
        ['transaction_id', 'invoice_id', 'client_name', 'amount', 'currency', 'chain', 'payment_method', 'status', 'date'],
        rows
      );
    } else {
      // summary
      const [invoiceData, txData] = await Promise.all([
        fetchBackend('/api/documents?type=INVOICE', accessToken),
        fetchBackend('/api/transactions', accessToken),
      ]);

      const docs: any[] = invoiceData?.documents ?? invoiceData?.data?.documents ?? [];
      const txs: any[] = txData?.transactions ?? txData?.data?.transactions ?? [];

      const inRange = (d: any) => inDateRange(isoDate(d.created_at || d.createdAt), dateFrom, dateTo);

      const filteredDocs = docs.filter(inRange);
      const filteredTxs = txs.filter(inRange);

      const totalEarned = filteredDocs
        .filter((d: any) => d.status === 'paid')
        .reduce((s: number, d: any) => s + Number(d.amount || d.amountUsd || 0), 0);

      const totalPending = filteredDocs
        .filter((d: any) => d.status !== 'paid' && d.status !== 'draft')
        .reduce((s: number, d: any) => s + Number(d.amount || d.amountUsd || 0), 0);

      const totalReceived = filteredTxs
        .filter((t: any) => ['receive', 'settlement'].includes(String(t.type || t.kind || '').toLowerCase()))
        .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

      csv = buildCsv(
        ['metric', 'value', 'currency', 'date_from', 'date_to'],
        [
          ['total_earned', totalEarned.toFixed(2), 'USD', dateFrom, dateTo],
          ['total_pending', totalPending.toFixed(2), 'USD', dateFrom, dateTo],
          ['total_received_on_chain', totalReceived.toFixed(2), 'USDC', dateFrom, dateTo],
          ['invoices_count', filteredDocs.length, '', dateFrom, dateTo],
          ['transactions_count', filteredTxs.length, '', dateFrom, dateTo],
        ]
      );
    }
  } catch (err) {
    console.error('[export] Failed to fetch or process data:', err);
    return NextResponse.json({ error: 'Failed to generate export' }, { status: 500 });
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
