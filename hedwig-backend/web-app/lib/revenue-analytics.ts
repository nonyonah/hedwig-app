import type { Invoice } from '@/lib/models/entities';
import type {
  ClientRevenueBreakdown,
  ExpenseCategory,
  ExpenseRecord,
  InsightRisk,
} from '@/lib/types/revenue';

export type AnalyticsRange = '7d' | '30d' | '90d' | '1y' | 'ytd';

export interface ExpenseAnalysisItem {
  category: ExpenseCategory;
  label: string;
  value: number;
  pct: number;
}

interface InsightSummarySnapshot {
  pendingInvoicesCount?: number;
  pendingInvoicesTotal?: number;
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  software: 'Software',
  equipment: 'Equipment',
  marketing: 'Marketing',
  travel: 'Travel',
  operations: 'Operations',
  contractor: 'Contractor',
  subscriptions: 'Subscriptions',
  other: 'Other',
};

const RANGE_DAYS: Record<Exclude<AnalyticsRange, 'ytd'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export function normalizeExpenseRecord(raw: any): ExpenseRecord {
  return {
    id: String(raw?.id || `exp_${Date.now()}`),
    amount: toNumber(raw?.amount),
    currency: String(raw?.currency || 'USD'),
    convertedAmountUsd: toNumber(raw?.converted_amount_usd ?? raw?.convertedAmountUsd ?? raw?.amount),
    category: (raw?.category || 'other') as ExpenseCategory,
    projectId: raw?.project_id ?? raw?.projectId ?? null,
    clientId: raw?.client_id ?? raw?.clientId ?? null,
    note: String(raw?.note || ''),
    sourceType: raw?.source_type ?? raw?.sourceType ?? 'manual',
    date: String(raw?.date ?? raw?.created_at ?? raw?.createdAt ?? new Date().toISOString()),
    createdAt: String(raw?.created_at ?? raw?.createdAt ?? raw?.date ?? new Date().toISOString()),
    updatedAt: String(raw?.updated_at ?? raw?.updatedAt ?? raw?.date ?? new Date().toISOString()),
  };
}

export function normalizeExpenseRecords(raw: any[] | null | undefined): ExpenseRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeExpenseRecord);
}

export function getRangeStart(range: AnalyticsRange, now = new Date()): Date {
  if (range === 'ytd') return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
}

function getPreviousRangeStart(range: AnalyticsRange, currentStart: Date): Date {
  if (range === 'ytd') {
    return new Date(currentStart.getFullYear() - 1, 0, 1);
  }
  return new Date(currentStart.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
}

function isWithinPeriod(dateValue: string, start: Date, end: Date): boolean {
  const time = new Date(dateValue).getTime();
  return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
}

function isOverdueInvoice(invoice: Invoice, now: Date): boolean {
  if (invoice.status === 'overdue') return true;
  if (invoice.status !== 'sent' && invoice.status !== 'viewed') return false;
  const dueTime = new Date(invoice.dueAt).getTime();
  return Number.isFinite(dueTime) && dueTime < now.getTime();
}

export function buildExpenseAnalysis(
  expenses: ExpenseRecord[],
  range: AnalyticsRange,
  now = new Date(),
): ExpenseAnalysisItem[] {
  const start = getRangeStart(range, now);
  const totals = new Map<ExpenseCategory, number>();

  for (const expense of expenses) {
    if (!isWithinPeriod(expense.date, start, now)) continue;
    totals.set(
      expense.category,
      (totals.get(expense.category) || 0) + toNumber(expense.convertedAmountUsd),
    );
  }

  const grandTotal = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);

  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([category, value]) => ({
      category,
      label: CATEGORY_LABELS[category],
      value: Number(value.toFixed(2)),
      pct: grandTotal > 0 ? Number(((value / grandTotal) * 100).toFixed(1)) : 0,
    }));
}

export function buildInsightRisks({
  range,
  summary,
  clientBreakdown,
  expenses,
  invoices,
  now = new Date(),
}: {
  range: AnalyticsRange;
  summary?: InsightSummarySnapshot | null;
  clientBreakdown: ClientRevenueBreakdown[];
  expenses: ExpenseRecord[];
  invoices: Invoice[];
  now?: Date;
}): InsightRisk[] {
  const risks: InsightRisk[] = [];

  const overdueInvoices = invoices.filter((invoice) => isOverdueInvoice(invoice, now));
  if (overdueInvoices.length > 0) {
    const overdueTotal = overdueInvoices.reduce((sum, invoice) => sum + toNumber(invoice.amountUsd), 0);
    const firstInvoice = overdueInvoices[0];

    risks.push({
      id: 'risk-overdue-invoices',
      severity: 'high',
      title: overdueInvoices.length === 1
        ? `Invoice overdue${firstInvoice?.number ? `: ${firstInvoice.number}` : ''}`
        : `${overdueInvoices.length} invoices overdue`,
      description: overdueInvoices.length === 1
        ? `${firstInvoice?.number || 'This invoice'} is overdue. ${overdueTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} outstanding.`
        : `${overdueInvoices.length} invoices are overdue with ${overdueTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} outstanding.`,
      actionLabel: 'Review invoices',
      actionRoute: '/payments',
    });
  } else if ((summary?.pendingInvoicesCount || 0) > 0) {
    const pendingTotal = toNumber(summary?.pendingInvoicesTotal);
    risks.push({
      id: 'risk-pending-invoices',
      severity: 'medium',
      title: 'Pending invoices still open',
      description: `${summary?.pendingInvoicesCount || 0} invoice(s) are still awaiting payment${pendingTotal > 0 ? ` for ${pendingTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}` : ''}.`,
      actionLabel: 'Follow up',
      actionRoute: '/payments',
    });
  }

  const topClient = clientBreakdown[0];
  if (topClient && topClient.shareOfTotal >= 50) {
    risks.push({
      id: 'risk-client-concentration',
      severity: topClient.shareOfTotal >= 70 ? 'high' : 'medium',
      title: 'High client concentration',
      description: `${topClient.company || topClient.clientName} accounts for ${topClient.shareOfTotal.toFixed(1)}% of revenue in this period.`,
      actionLabel: 'Review clients',
      actionRoute: '/clients',
    });
  }

  const currentStart = getRangeStart(range, now);
  const previousStart = getPreviousRangeStart(range, currentStart);
  const currentExpenses = expenses.reduce((sum, expense) => (
    isWithinPeriod(expense.date, currentStart, now)
      ? sum + toNumber(expense.convertedAmountUsd)
      : sum
  ), 0);
  const previousExpenses = expenses.reduce((sum, expense) => (
    isWithinPeriod(expense.date, previousStart, currentStart)
      ? sum + toNumber(expense.convertedAmountUsd)
      : sum
  ), 0);

  if (currentExpenses > 0 && previousExpenses >= 0) {
    const delta = currentExpenses - previousExpenses;
    const pct = previousExpenses > 0 ? (delta / previousExpenses) * 100 : 100;

    if (delta > 0 && (previousExpenses === 0 || pct >= 20)) {
      risks.push({
        id: 'risk-expense-growth',
        severity: pct >= 50 ? 'medium' : 'low',
        title: 'Expenses are rising',
        description: previousExpenses > 0
          ? `Expenses are up ${pct.toFixed(0)}% versus the previous period.`
          : `You recorded ${currentExpenses.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} in new expenses this period.`,
        actionLabel: 'Manage expenses',
        actionRoute: '/revenue',
      });
    }
  }

  return risks.slice(0, 3);
}
