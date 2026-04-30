'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  DownloadSimple,
  FileText,
  FolderSimple,
  Receipt,
  Warning,
} from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { useToast } from '@/components/providers/toast-provider';
import { useCurrency } from '@/components/providers/currency-provider';
import { formatShortDate } from '@/lib/utils';
import { ContextualSuggestions } from '@/components/assistant/contextual-suggestions';
import type {
  TaxAlert,
  TaxCategorySummary,
  TaxDeductibleFilter,
  TaxEntitySummary,
  TaxExpenseItem,
  TaxPeriodPreset,
  TaxSourceState,
  TaxWorkspaceData
} from '@/lib/types/tax';
import type { ExpenseCategory } from '@/lib/types/revenue';

const PERIOD_LABELS: Record<TaxPeriodPreset, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  custom: 'Custom range'
};

const DEDUCTIBLE_FILTERS: Array<{ value: TaxDeductibleFilter; label: string }> = [
  { value: 'all', label: 'All expenses' },
  { value: 'deductible', label: 'Deductible' },
  { value: 'non_deductible', label: 'Non-deductible' }
];

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  software: 'Software',
  equipment: 'Equipment',
  marketing: 'Marketing',
  travel: 'Travel',
  operations: 'Operations',
  contractor: 'Contractor',
  subscriptions: 'Subscriptions',
  other: 'Other'
};

const ALERT_STYLES = {
  high: { badge: 'bg-[#fff1f0] text-[#b42318]', dot: 'bg-[#f04438]' },
  medium: { badge: 'bg-[#fffaeb] text-[#b45309]', dot: 'bg-[#f79009]' },
  low: { badge: 'bg-[#f2f4f7] text-[#717680]', dot: 'bg-[#a4a7ae]' }
} as const;

function getDefaultCustomRange() {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 2);

  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10)
  };
}

function getPeriodRange(period: TaxPeriodPreset, customRange: { from: string; to: string }, now = new Date()) {
  const end = new Date(now);

  if (period === 'monthly') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end
    };
  }

  if (period === 'quarterly') {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return {
      start: new Date(now.getFullYear(), quarterStartMonth, 1),
      end
    };
  }

  if (period === 'yearly') {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end
    };
  }

  const start = customRange.from ? new Date(`${customRange.from}T00:00:00`) : new Date(now.getFullYear(), 0, 1);
  const customEnd = customRange.to ? new Date(`${customRange.to}T23:59:59`) : end;
  return { start, end: customEnd };
}

function isWithinRange(dateValue: string, start: Date, end: Date) {
  const timestamp = new Date(dateValue).getTime();
  return Number.isFinite(timestamp) && timestamp >= start.getTime() && timestamp <= end.getTime();
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function buildEntitySummary<T>(
  items: T[],
  getId: (item: T) => string,
  getLabel: (item: T) => string,
  getSublabel: (item: T) => string | undefined,
  getAmount: (item: T) => number
): TaxEntitySummary[] {
  const totals = new Map<string, TaxEntitySummary>();

  for (const item of items) {
    const id = getId(item) || 'unassigned';
    const existing = totals.get(id);
    const amountUsd = getAmount(item);

    if (existing) {
      existing.amountUsd += amountUsd;
      existing.count += 1;
      continue;
    }

    totals.set(id, {
      id,
      label: getLabel(item),
      sublabel: getSublabel(item),
      amountUsd,
      count: 1,
      shareOfTotal: 0
    });
  }

  const totalAmount = sum(Array.from(totals.values()).map((entry) => entry.amountUsd));

  return Array.from(totals.values())
    .map((entry) => ({
      ...entry,
      amountUsd: Number(entry.amountUsd.toFixed(2)),
      shareOfTotal: totalAmount > 0 ? Number(((entry.amountUsd / totalAmount) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.amountUsd - a.amountUsd);
}

function buildCategorySummary(expenses: TaxExpenseItem[]): TaxCategorySummary[] {
  const totals = new Map<TaxCategorySummary['category'], TaxCategorySummary>();

  for (const expense of expenses) {
    const category = expense.category === 'other' || expense.needsReview ? 'uncategorized' : expense.category;
    const existing = totals.get(category);

    if (existing) {
      existing.amountUsd += expense.convertedAmountUsd;
      existing.count += 1;
      if (expense.isDeductible) {
        existing.deductibleAmountUsd += expense.convertedAmountUsd;
      } else {
        existing.nonDeductibleAmountUsd += expense.convertedAmountUsd;
      }
      continue;
    }

    totals.set(category, {
      category,
      label: category === 'uncategorized' ? 'Uncategorized' : CATEGORY_LABELS[category],
      amountUsd: expense.convertedAmountUsd,
      count: 1,
      deductibleAmountUsd: expense.isDeductible ? expense.convertedAmountUsd : 0,
      nonDeductibleAmountUsd: expense.isDeductible ? 0 : expense.convertedAmountUsd
    });
  }

  return Array.from(totals.values())
    .map((item) => ({
      ...item,
      amountUsd: Number(item.amountUsd.toFixed(2)),
      deductibleAmountUsd: Number(item.deductibleAmountUsd.toFixed(2)),
      nonDeductibleAmountUsd: Number(item.nonDeductibleAmountUsd.toFixed(2))
    }))
    .sort((a, b) => b.amountUsd - a.amountUsd);
}

function buildTaxAlerts({
  uncategorizedExpenses,
  filteredExpenses,
  incomeByClient,
  paidIncome,
  formatAmount,
}: {
  uncategorizedExpenses: TaxExpenseItem[];
  filteredExpenses: TaxExpenseItem[];
  incomeByClient: TaxEntitySummary[];
  paidIncome: number;
  formatAmount: (amountUsd: number) => string;
}): TaxAlert[] {
  const alerts: TaxAlert[] = [];

  if (uncategorizedExpenses.length > 0) {
    alerts.push({
      id: 'uncategorized',
      kind: 'uncategorized_expenses',
      severity: uncategorizedExpenses.length >= 3 ? 'high' : 'medium',
      title: `${uncategorizedExpenses.length} expense${uncategorizedExpenses.length === 1 ? '' : 's'} still need review`,
      description: `${formatAmount(sum(uncategorizedExpenses.map((expense) => expense.convertedAmountUsd)))} is still uncategorized or missing context.`
    });
  }

  const missingRecordCount = filteredExpenses.filter(
    (expense) => expense.receiptStatus === 'missing' || (!expense.clientId && !expense.projectId)
  ).length;

  if (missingRecordCount > 0) {
    alerts.push({
      id: 'missing-records',
      kind: 'missing_records',
      severity: missingRecordCount >= 4 ? 'medium' : 'low',
      title: 'Some records are incomplete',
      description: `${missingRecordCount} expense record${missingRecordCount === 1 ? '' : 's'} could use a receipt, client, or project attachment before filing.`
    });
  }

  const topClient = incomeByClient[0];
  if (topClient && topClient.shareOfTotal >= 55) {
    alerts.push({
      id: 'unusual-client-concentration',
      kind: 'unusual_patterns',
      severity: topClient.shareOfTotal >= 70 ? 'high' : 'medium',
      title: 'Revenue is concentrated in one client',
      description: `${topClient.label} accounts for ${topClient.shareOfTotal}% of paid income in this tax period.`
    });
  }

  const expenseTotal = sum(filteredExpenses.map((expense) => expense.convertedAmountUsd));
  if (paidIncome > 0 && expenseTotal / paidIncome >= 0.45) {
    alerts.push({
      id: 'expense-ratio',
      kind: 'unusual_patterns',
      severity: 'medium',
      title: 'Expenses are unusually high for this period',
      description: `Business expenses represent ${Math.round((expenseTotal / paidIncome) * 100)}% of paid income right now.`
    });
  }

  return alerts.slice(0, 3);
}

function EmptySection({
  title,
  description,
  actionLabel,
  actionRoute
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionRoute?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d5d7da] bg-[#fafafa] px-5 py-8 text-center">
      <p className="text-[14px] font-semibold text-[#181d27]">{title}</p>
      <p className="mt-1 text-[13px] text-[#717680]">{description}</p>
      {actionLabel && actionRoute ? (
        <Link href={actionRoute} className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" weight="bold" />
        </Link>
      ) : null}
    </div>
  );
}

export function TaxWorkspaceClient({
  initialData,
  sourceState,
  initialError
}: {
  initialData: TaxWorkspaceData;
  sourceState: TaxSourceState;
  initialError: string | null;
}) {
  const { toast } = useToast();
  const { formatAmount } = useCurrency();

  const [period, setPeriod] = useState<TaxPeriodPreset>('quarterly');
  const [regionCode, setRegionCode] = useState(initialData.regions[0]?.code || 'US');
  const [deductibleFilter, setDeductibleFilter] = useState<TaxDeductibleFilter>('all');
  const [customRange, setCustomRange] = useState(getDefaultCustomRange);
  const [expenses, setExpenses] = useState<TaxExpenseItem[]>(initialData.expenses);

  const selectedRegion = initialData.regions.find((region) => region.code === regionCode) || initialData.regions[0];
  const range = useMemo(() => getPeriodRange(period, customRange), [period, customRange]);

  const filteredIncomes = useMemo(
    () => initialData.incomes.filter((income) => isWithinRange(income.date, range.start, range.end)),
    [initialData.incomes, range.end, range.start]
  );

  const filteredExpenses = useMemo(
    () => expenses.filter((expense) => isWithinRange(expense.date, range.start, range.end)),
    [expenses, range.end, range.start]
  );

  const paidIncome = useMemo(
    () => sum(filteredIncomes.filter((income) => income.status === 'paid').map((income) => income.amountUsd)),
    [filteredIncomes]
  );

  const pendingIncome = useMemo(
    () => sum(filteredIncomes.filter((income) => income.status === 'pending' || income.status === 'overdue').map((income) => income.amountUsd)),
    [filteredIncomes]
  );

  const deductibleExpenses = useMemo(
    () => filteredExpenses.filter((expense) => expense.isDeductible),
    [filteredExpenses]
  );

  const deductibleExpensesTotal = useMemo(
    () => sum(deductibleExpenses.map((expense) => expense.convertedAmountUsd)),
    [deductibleExpenses]
  );

  const totalExpenses = useMemo(
    () => sum(filteredExpenses.map((expense) => expense.convertedAmountUsd)),
    [filteredExpenses]
  );

  const uncategorizedExpenses = useMemo(
    () => filteredExpenses.filter((expense) => expense.needsReview || expense.category === 'other'),
    [filteredExpenses]
  );

  const taxableIncomeEstimate = Math.max(0, paidIncome - deductibleExpensesTotal);
  const roughTaxEstimate = selectedRegion?.roughTaxRate ? taxableIncomeEstimate * selectedRegion.roughTaxRate : null;

  const incomeByClient = useMemo(
    () => buildEntitySummary(
      filteredIncomes.filter((income) => income.status === 'paid'),
      (income) => income.clientId || 'unassigned-client',
      (income) => income.clientName,
      () => 'Paid revenue',
      (income) => income.amountUsd
    ),
    [filteredIncomes]
  );

  const incomeByProject = useMemo(
    () => buildEntitySummary(
      filteredIncomes.filter((income) => income.status === 'paid'),
      (income) => income.projectId || 'unassigned-project',
      (income) => income.projectName,
      (income) => income.clientName,
      (income) => income.amountUsd
    ),
    [filteredIncomes]
  );

  const filteredExpensesForSummary = useMemo(() => {
    if (deductibleFilter === 'deductible') {
      return filteredExpenses.filter((expense) => expense.isDeductible);
    }

    if (deductibleFilter === 'non_deductible') {
      return filteredExpenses.filter((expense) => !expense.isDeductible);
    }

    return filteredExpenses;
  }, [deductibleFilter, filteredExpenses]);

  const categorizedExpenses = useMemo(
    () => buildCategorySummary(filteredExpensesForSummary),
    [filteredExpensesForSummary]
  );

  const alerts = useMemo(
    () => buildTaxAlerts({ uncategorizedExpenses, filteredExpenses, incomeByClient, paidIncome, formatAmount }),
    [filteredExpenses, formatAmount, incomeByClient, paidIncome, uncategorizedExpenses]
  );

  const hasRecords = filteredIncomes.length > 0 || filteredExpenses.length > 0;

  const pagePeriodLabel = period === 'custom'
    ? `${formatShortDate(range.start.toISOString())} - ${formatShortDate(range.end.toISOString())}`
    : PERIOD_LABELS[period];

  const handleExpenseUpdate = (id: string, updates: Partial<TaxExpenseItem>) => {
    setExpenses((current) => current.map((expense) => {
      if (expense.id !== id) return expense;

      const nextCategory = updates.category ?? expense.category;
      const nextDeductible = updates.isDeductible ?? expense.isDeductible;
      const nextReceiptStatus = updates.receiptStatus ?? expense.receiptStatus;
      const nextClientId = updates.clientId !== undefined ? updates.clientId : expense.clientId;
      const nextProjectId = updates.projectId !== undefined ? updates.projectId : expense.projectId;
      const nextClientName = nextClientId
        ? initialData.clients.find((client) => client.id === nextClientId)?.company || initialData.clients.find((client) => client.id === nextClientId)?.name
        : undefined;
      const nextProjectName = nextProjectId
        ? initialData.projects.find((project) => project.id === nextProjectId)?.name
        : undefined;

      return {
        ...expense,
        ...updates,
        category: nextCategory,
        isDeductible: nextDeductible,
        receiptStatus: nextReceiptStatus,
        clientId: nextClientId ?? null,
        projectId: nextProjectId ?? null,
        clientName: nextClientName,
        projectName: nextProjectName,
        needsReview:
          nextCategory === 'other' ||
          nextReceiptStatus === 'missing' ||
          (!nextClientId && !nextProjectId)
      };
    }));
  };

  const exportCsv = () => {
    const rows = [
      ['Record type', 'Date', 'Status', 'Client', 'Project', 'Category', 'Deductible', 'Amount USD', 'Title'],
      ...filteredIncomes.map((income) => [
        'income',
        income.date,
        income.status,
        income.clientName,
        income.projectName,
        '',
        '',
        income.amountUsd.toFixed(2),
        income.invoiceNumber
      ]),
      ...filteredExpenses.map((expense) => [
        'expense',
        expense.date,
        expense.receiptStatus,
        expense.clientName || '',
        expense.projectName || '',
        expense.category,
        expense.isDeductible ? 'yes' : 'no',
        expense.convertedAmountUsd.toFixed(2),
        expense.title
      ])
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hedwig-tax-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      type: 'success',
      title: 'Tax CSV exported',
      message: 'The selected income and expense records were downloaded.'
    });
  };

  const exportPdfSummary = () => {
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=980,height=720');
    if (!popup) {
      toast({
        type: 'warning',
        title: 'Pop-up blocked',
        message: 'Allow pop-ups to export a printable PDF summary.'
      });
      return;
    }

    const clientRows = incomeByClient.slice(0, 5)
      .map((client) => `<tr><td>${client.label}</td><td style="text-align:right">${formatAmount(client.amountUsd)}</td></tr>`)
      .join('');

    popup.document.write(`
      <html>
        <head>
          <title>Hedwig Tax Summary</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #181d27; }
            h1, h2 { margin: 0 0 8px; }
            p { color: #535862; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 24px 0; }
            .card { border: 1px solid #e9eaeb; border-radius: 16px; padding: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            td, th { padding: 8px 0; border-bottom: 1px solid #f2f4f7; font-size: 13px; }
          </style>
        </head>
        <body>
          <h1>Tax summary</h1>
          <p>${pagePeriodLabel} • ${selectedRegion?.label || 'Region not set'} • This is not tax advice.</p>
          <div class="grid">
            <div class="card"><strong>Paid revenue</strong><div>${formatAmount(paidIncome)}</div></div>
            <div class="card"><strong>Pending income</strong><div>${formatAmount(pendingIncome)}</div></div>
            <div class="card"><strong>Total expenses</strong><div>${formatAmount(totalExpenses)}</div></div>
            <div class="card"><strong>Estimated taxable income</strong><div>${formatAmount(taxableIncomeEstimate)}</div></div>
          </div>
          <div class="card">
            <h2>Income by client</h2>
            <table>
              <tbody>${clientRows || '<tr><td>No client income for this period.</td><td></td></tr>'}</tbody>
            </table>
          </div>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();

    toast({
      type: 'success',
      title: 'Printable summary opened',
      message: 'Use the print dialog to save the summary as a PDF.'
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-[#181d27]">Tax</h1>
          <p className="mt-0.5 text-[13px] text-[#a4a7ae]">
            Prepare clean tax records from your Hedwig income and expenses without leaving the workspace.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={exportCsv}>
            <DownloadSimple className="h-4 w-4" weight="bold" />
            Export CSV
          </Button>
          <Button variant="secondary" onClick={exportPdfSummary}>
            <FileText className="h-4 w-4" weight="bold" />
            Export PDF
          </Button>
        </div>
      </div>

      {initialError ? (
        <div className="rounded-2xl border border-[#f5d7b0] bg-[#fffaeb] px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white">
              <Warning className="h-4 w-4 text-[#b45309]" weight="regular" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#181d27]">
                {sourceState === 'error' ? 'Live tax data is unavailable' : 'Live tax data is partially available'}
              </p>
              <p className="mt-1 text-[13px] text-[#717680]">{initialError}</p>
            </div>
          </div>
        </div>
      ) : null}

      <ContextualSuggestions
        title="Tax review"
        description="Hedwig keeps filing prep suggestions inside the tax workspace so you can resolve them where the data lives."
        query={{ taxPage: true, limit: 1 }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 shadow-xs ring-1 ring-[#e9eaeb]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[15px] font-semibold text-[#181d27]">Tax period</p>
              <p className="mt-1 text-[13px] text-[#717680]">Switch between filing views or define a custom reporting range.</p>
            </div>
            <span className="rounded-full bg-[#f2f4f7] px-3 py-1 text-[11px] font-semibold text-[#535862]">
              {pagePeriodLabel}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(PERIOD_LABELS) as TaxPeriodPreset[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPeriod(option)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                  period === option
                    ? 'bg-[#181d27] text-white'
                    : 'text-[#717680] hover:bg-[#f2f4f7] hover:text-[#344054]'
                }`}
              >
                {PERIOD_LABELS[option]}
              </button>
            ))}
          </div>

          {period === 'custom' ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[12px] font-semibold text-[#414651]">From</p>
                <input
                  type="date"
                  value={customRange.from}
                  onChange={(event) => setCustomRange((current) => ({ ...current, from: event.target.value }))}
                  className="w-full rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[13px] text-[#181d27] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#eff4ff]"
                />
              </div>
              <div>
                <p className="mb-1 text-[12px] font-semibold text-[#414651]">To</p>
                <input
                  type="date"
                  value={customRange.to}
                  onChange={(event) => setCustomRange((current) => ({ ...current, to: event.target.value }))}
                  className="w-full rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[13px] text-[#181d27] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#eff4ff]"
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-xs ring-1 ring-[#e9eaeb]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[15px] font-semibold text-[#181d27]">Region</p>
              <p className="mt-1 text-[13px] text-[#717680]">Choose the filing region you want to prepare this workspace for.</p>
            </div>
            <span className="rounded-full bg-[#fff1f0] px-3 py-1 text-[11px] font-semibold text-[#b42318]">
              This is not tax advice
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[220px_1fr]">
            <select
              value={regionCode}
              onChange={(event) => setRegionCode(event.target.value)}
              className="rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[13px] text-[#181d27] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#eff4ff]"
            >
              {initialData.regions.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.label}
                </option>
              ))}
            </select>

            <div className="rounded-xl bg-[#f9fafb] px-4 py-3">
              <p className="text-[12px] font-semibold text-[#414651]">
                {selectedRegion?.filingLabel || 'Rough estimate'}{selectedRegion?.roughTaxRate ? ` • ${Math.round(selectedRegion.roughTaxRate * 100)}% benchmark` : ''}
              </p>
              <p className="mt-1 text-[12px] text-[#717680]">{selectedRegion?.disclaimer || 'This is not tax advice.'}</p>
            </div>
          </div>
        </section>
      </div>

      <AttachedStatGrid
        items={[
          { id: 'paid-revenue', title: 'Paid revenue', value: formatAmount(paidIncome), helper: `${filteredIncomes.filter((income) => income.status === 'paid').length} settled records`, icon: CheckCircle },
          { id: 'pending-income', title: 'Pending income', value: formatAmount(pendingIncome), helper: `${filteredIncomes.filter((income) => income.status === 'pending' || income.status === 'overdue').length} waiting`, icon: Warning },
          { id: 'total-expenses', title: 'Total expenses', value: formatAmount(totalExpenses), helper: `${filteredExpenses.length} records`, icon: Receipt },
          { id: 'taxable-estimate', title: 'Taxable estimate', value: formatAmount(taxableIncomeEstimate), helper: 'Paid revenue less deductible expenses', icon: FolderSimple },
        ]}
        className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
      />

      {!hasRecords ? (
        <EmptySection
          title="No tax activity for this period"
          description="Try a wider date range or add more invoices and expenses to prepare your filing workspace."
          actionLabel="Go to revenue"
          actionRoute="/revenue"
        />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
              <div className="border-b border-[#f5f5f5] px-5 py-4">
                <h2 className="text-[15px] font-semibold text-[#181d27]">Income summary</h2>
                <p className="mt-1 text-[13px] text-[#717680]">See what was collected, what is still outstanding, and where taxable income is coming from.</p>
              </div>

              <AttachedStatGrid
                items={[
                  { id: 'income-paid', title: 'Total paid revenue', value: formatAmount(paidIncome) },
                  { id: 'income-pending', title: 'Pending income', value: formatAmount(pendingIncome) },
                  { id: 'income-taxable', title: 'Taxable income estimate', value: formatAmount(taxableIncomeEstimate) },
                ]}
                className="sm:grid-cols-3 rounded-none bg-[#f2f4f7] ring-0"
              />

              <div className="grid gap-4 px-5 py-4 lg:grid-cols-2">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[12px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Income by client</p>
                    <Link href="/clients" className="text-[12px] font-semibold text-[#2563eb] hover:text-[#1d4ed8]">View clients</Link>
                  </div>
                  {incomeByClient.length === 0 ? (
                    <EmptySection title="No paid client income yet" description="Paid invoices will appear here once revenue is settled." />
                  ) : (
                    <div className="space-y-3">
                      {incomeByClient.slice(0, 5).map((item) => (
                        <div key={item.id}>
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-[#181d27]">{item.label}</p>
                              <p className="text-[11px] text-[#a4a7ae]">{item.count} record{item.count === 1 ? '' : 's'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[13px] font-semibold text-[#181d27]">{formatAmount(item.amountUsd)}</p>
                              <p className="text-[11px] text-[#a4a7ae]">{item.shareOfTotal}%</p>
                            </div>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f2f4f7]">
                            <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${Math.min(item.shareOfTotal, 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[12px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Income by project</p>
                    <Link href="/projects" className="text-[12px] font-semibold text-[#2563eb] hover:text-[#1d4ed8]">View projects</Link>
                  </div>
                  {incomeByProject.length === 0 ? (
                    <EmptySection title="No project income yet" description="Attach invoices to projects to get a cleaner filing breakdown." />
                  ) : (
                    <div className="space-y-2">
                      {incomeByProject.slice(0, 5).map((item, index) => (
                        <div key={item.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-[#fafafa]">
                          <span className="w-4 shrink-0 text-[11px] font-semibold text-[#c1c5cd]">{index + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-[#181d27]">{item.label}</p>
                            <p className="text-[11px] text-[#a4a7ae]">{item.sublabel || 'Unassigned client'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[13px] font-semibold text-[#181d27]">{formatAmount(item.amountUsd)}</p>
                            <p className="text-[11px] text-[#a4a7ae]">{item.count} invoice{item.count === 1 ? '' : 's'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
              <div className="border-b border-[#f5f5f5] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[15px] font-semibold text-[#181d27]">Expense summary</h2>
                    <p className="mt-1 text-[13px] text-[#717680]">Review recorded business costs, category totals, and what currently looks deductible.</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {DEDUCTIBLE_FILTERS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDeductibleFilter(option.value)}
                        className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                          deductibleFilter === option.value
                            ? 'bg-[#181d27] text-white'
                            : 'bg-[#f9fafb] text-[#717680] hover:bg-[#f2f4f7]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <AttachedStatGrid
                items={[
                  { id: 'expense-total', title: 'Total expenses', value: formatAmount(totalExpenses) },
                  { id: 'expense-categorized', title: 'Categorized expenses', value: formatAmount(totalExpenses - sum(uncategorizedExpenses.map((expense) => expense.convertedAmountUsd))) },
                  { id: 'expense-uncategorized', title: 'Uncategorized expenses', value: formatAmount(sum(uncategorizedExpenses.map((expense) => expense.convertedAmountUsd))) },
                ]}
                className="sm:grid-cols-3 rounded-none bg-[#f2f4f7] ring-0"
              />

              <div className="px-5 py-4">
                {categorizedExpenses.length === 0 ? (
                  <EmptySection title="No expenses in this period" description="Record business expenses to prepare a stronger deduction trail." actionLabel="Go to revenue" actionRoute="/revenue" />
                ) : (
                  <div className="space-y-3">
                    {categorizedExpenses.map((category) => {
                      const totalForView = deductibleFilter === 'deductible'
                        ? category.deductibleAmountUsd
                        : deductibleFilter === 'non_deductible'
                          ? category.nonDeductibleAmountUsd
                          : category.amountUsd;
                      const pct = totalExpenses > 0 ? (totalForView / totalExpenses) * 100 : 0;

                      if (totalForView <= 0) {
                        return null;
                      }

                      return (
                        <div key={category.category}>
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[13px] font-semibold text-[#181d27]">{category.label}</p>
                              <p className="text-[11px] text-[#a4a7ae]">{category.count} record{category.count === 1 ? '' : 's'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[13px] font-semibold text-[#181d27]">{formatAmount(totalForView)}</p>
                              <p className="text-[11px] text-[#a4a7ae]">{pct.toFixed(0)}%</p>
                            </div>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f2f4f7]">
                            <div className="h-full rounded-full bg-[#181d27]" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
            <div className="border-b border-[#f5f5f5] px-5 py-4">
              <h2 className="text-[15px] font-semibold text-[#181d27]">Deduction review</h2>
              <p className="mt-1 text-[13px] text-[#717680]">Clean up uncategorized expenses before export by attaching the right category, client, project, and deduction status.</p>
            </div>

            {uncategorizedExpenses.length === 0 ? (
              <div className="px-5 py-5">
                <EmptySection title="All caught up" description="There are no uncategorized expenses in this tax period right now." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-[#f2f4f7] bg-[#fafafa]">
                      <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Expense</th>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Category</th>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Deductible</th>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Client</th>
                      <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Project</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f9fafb]">
                    {uncategorizedExpenses.map((expense) => (
                      <tr key={expense.id}>
                        <td className="px-4 py-3 align-top">
                          <p className="text-[13px] font-semibold text-[#181d27]">{expense.title}</p>
                          <p className="mt-1 text-[11px] text-[#a4a7ae]">
                            {formatShortDate(expense.date)} • {formatAmount(expense.convertedAmountUsd)}
                          </p>
                          {expense.receiptStatus === 'missing' ? (
                            <span className="mt-2 inline-flex rounded-full bg-[#fff1f0] px-2.5 py-1 text-[11px] font-semibold text-[#b42318]">
                              Receipt missing
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <select
                            value={expense.category}
                            onChange={(event) => handleExpenseUpdate(expense.id, { category: event.target.value as ExpenseCategory })}
                            className="w-full min-w-[140px] rounded-xl border border-[#e9eaeb] px-3 py-2 text-[12px] text-[#181d27] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#eff4ff]"
                          >
                            {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((category) => (
                              <option key={category} value={category}>
                                {CATEGORY_LABELS[category]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <button
                            type="button"
                            onClick={() => handleExpenseUpdate(expense.id, { isDeductible: !expense.isDeductible })}
                            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                              expense.isDeductible
                                ? 'bg-[#ecfdf3] text-[#027a48]'
                                : 'bg-[#f2f4f7] text-[#717680]'
                            }`}
                          >
                            {expense.isDeductible ? 'Deductible' : 'Non-deductible'}
                          </button>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <select
                            value={expense.clientId || ''}
                            onChange={(event) => handleExpenseUpdate(expense.id, { clientId: event.target.value || null })}
                            className="w-full min-w-[160px] rounded-xl border border-[#e9eaeb] px-3 py-2 text-[12px] text-[#181d27] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#eff4ff]"
                          >
                            <option value="">No client</option>
                            {initialData.clients.map((client) => (
                              <option key={client.id} value={client.id}>
                                {client.company || client.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <select
                            value={expense.projectId || ''}
                            onChange={(event) => handleExpenseUpdate(expense.id, { projectId: event.target.value || null })}
                            className="w-full min-w-[180px] rounded-xl border border-[#e9eaeb] px-3 py-2 text-[12px] text-[#181d27] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#eff4ff]"
                          >
                            <option value="">No project</option>
                            {initialData.projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-2xl bg-white p-5 shadow-xs ring-1 ring-[#e9eaeb]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#181d27]">Tax estimate</h2>
                  <p className="mt-1 text-[13px] text-[#717680]">A rough filing snapshot based on paid income and the expenses currently marked deductible.</p>
                </div>
                <span className="rounded-full bg-[#fff1f0] px-3 py-1 text-[11px] font-semibold text-[#b42318]">
                  This is not tax advice
                </span>
              </div>

              <AttachedStatGrid
                items={[
                  { id: 'estimate-taxable', title: 'Estimated taxable income', value: formatAmount(taxableIncomeEstimate) },
                  { id: 'estimate-deductible', title: 'Deductible expenses', value: formatAmount(deductibleExpensesTotal) },
                  { id: 'estimate-rough-tax', title: 'Rough tax estimate', value: roughTaxEstimate === null ? 'N/A' : formatAmount(roughTaxEstimate) },
                ]}
                className="mt-5 sm:grid-cols-3"
              />

              <div className="mt-4 rounded-2xl bg-[#f9fafb] px-4 py-3">
                <p className="text-[12px] font-semibold text-[#414651]">
                  {selectedRegion?.label || 'Selected region'} estimate
                </p>
                <p className="mt-1 text-[12px] text-[#717680]">
                  Hedwig uses paid revenue and your current deductible toggle to build a rough estimate for planning. Review this with a qualified tax professional before filing.
                </p>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow-xs ring-1 ring-[#e9eaeb]">
              <h2 className="text-[15px] font-semibold text-[#181d27]">Tax alerts</h2>
              <p className="mt-1 text-[13px] text-[#717680]">Hedwig highlights issues that could slow down filing or make the summary less reliable.</p>

              {alerts.length === 0 ? (
                <div className="mt-4">
                  <EmptySection title="No tax alerts" description="Everything in this period looks clean enough to export right now." />
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="rounded-2xl border border-[#f2f4f7] bg-[#fafafa] px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className={`mt-1 h-2.5 w-2.5 rounded-full ${ALERT_STYLES[alert.severity].dot}`} />
                          <div>
                            <p className="text-[13px] font-semibold text-[#181d27]">{alert.title}</p>
                            <p className="mt-1 text-[12px] text-[#717680]">{alert.description}</p>
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ALERT_STYLES[alert.severity].badge}`}>
                          {alert.severity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="rounded-2xl bg-white p-5 shadow-xs ring-1 ring-[#e9eaeb]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-[#181d27]">Export</h2>
                <p className="mt-1 text-[13px] text-[#717680]">Download records for your accountant or open a printable filing summary from this exact period and region view.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={exportCsv}>
                  <DownloadSimple className="h-4 w-4" weight="bold" />
                  Export CSV
                </Button>
                <Button variant="secondary" onClick={exportPdfSummary}>
                  <FileText className="h-4 w-4" weight="bold" />
                  Export PDF summary
                </Button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
