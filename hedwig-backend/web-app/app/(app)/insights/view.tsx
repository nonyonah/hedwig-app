'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  ChartBar,
  CheckCircle,
  CurrencyDollar,
  DownloadSimple,
  FolderSimple,
  LinkSimple,
  Minus,
  Sparkle,
  Target,
  UsersThree,
  ArrowsClockwise,
  Warning,
} from '@/components/ui/lucide-icons';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ExportDialog } from '@/components/export/export-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/components/providers/toast-provider';
import { useCurrency } from '@/components/providers/currency-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { backendConfig } from '@/lib/auth/config';
import { hedwigApi } from '@/lib/api/client';
import type { BillingStatusSummary } from '@/lib/api/client';
import { canUseFeature } from '@/lib/billing/feature-gates';
import { ProLockCard } from '@/components/billing/pro-lock-card';
import { ContextualSuggestions } from '@/components/assistant/contextual-suggestions';
import { buildExpenseAnalysis, buildInsightRisks } from '@/lib/revenue-analytics';
import type { AnalyticsRange } from '@/lib/revenue-analytics';
import type { ExpenseRecord, ClientRevenueBreakdown } from '@/lib/types/revenue';
import type { Invoice } from '@/lib/models/entities';

/* ─── types ─── */
type InsightsRange = '7d' | '30d' | '90d' | '1y';

interface InsightItem {
  id: string;
  title: string;
  description: string;
  priority: number;
  actionLabel?: string;
  actionRoute?: string;
  trend: 'up' | 'down' | 'neutral';
}

interface InsightsSummary {
  monthlyEarnings: number;
  currentMonthEarnings?: number;
  previousPeriodEarnings: number;
  earningsDeltaPct: number;
  pendingInvoicesCount: number;
  pendingInvoicesTotal: number;
  paymentRate: number;
  paidDocuments: number;
  totalDocuments: number;
  clientsCount: number;
  activeProjects: number;
  paymentLinksCount: number;
  topClient: { name: string; totalEarnings: number } | null;
  transactionsCount: number;
  receivedAmount: number;
  withdrawalsPending: number;
  withdrawalsCompletedAmount: number;
  onrampPending?: number;
  onrampCompletedFiatAmount?: number;
  onrampCompletedCryptoAmount?: number;
  onrampCount?: number;
}

interface InsightsData {
  range: string;
  lastUpdatedAt: string;
  summary: InsightsSummary;
  series: { earnings: { key: string; value: number }[] };
  insights: InsightItem[];
}

/* ─── constants ─── */
const RANGE_LABELS: Record<InsightsRange, string> = {
  '7d': '7D',
  '30d': '30D',
  '90d': '90D',
  '1y': '1 Year',
};
const RANGES: InsightsRange[] = ['7d', '30d', '90d', '1y'];

const EXPENSE_CATEGORY_BAR: Record<string, string> = {
  software: 'bg-[var(--color-accent)]',
  equipment: 'bg-[var(--color-accent)]',
  marketing: 'bg-[var(--color-warning)]',
  travel: 'bg-[var(--color-success)]',
  operations: 'bg-[var(--color-text-tertiary)]',
  contractor: 'bg-[var(--color-accent)]',
  subscriptions: 'bg-[var(--color-primary-dark)]',
  other: 'bg-[var(--color-text-muted)]',
};

const SEVERITY_STYLES = {
  high:   { dot: 'bg-[var(--color-danger)]', bg: 'bg-[var(--color-danger-soft)]', icon: 'text-[var(--color-danger)]', badge: 'text-[var(--color-danger)]', label: 'High' },
  medium: { dot: 'bg-[var(--color-warning)]', bg: 'bg-[var(--color-warning-soft)]', icon: 'text-[var(--color-warning)]', badge: 'text-[var(--color-warning)]', label: 'Medium' },
  low:    { dot: 'bg-[var(--color-text-muted)]', bg: 'bg-[var(--color-surface-tertiary)]', icon: 'text-[var(--color-text-tertiary)]', badge: 'text-[var(--color-text-tertiary)]', label: 'Low' },
};

/* ─── helpers ─── */
function formatTimeAgo(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Updated ${hrs}h ago`;
  return `Updated ${Math.floor(hrs / 24)}d ago`;
}

/* ─── earnings tooltip ─── */
function EarningsTooltip({ active, payload, label, formatAmount }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 shadow-lg">
      <p className="text-[11px] text-[var(--color-text-muted)]">{label}</p>
      <p className="text-[14px] font-bold text-[var(--color-text-primary)]">
        {formatAmount(payload[0].value as number, { compact: true })}
      </p>
    </div>
  );
}

/* ─── ring chart ─── */
function RingChart({ value, total, size = 132, strokeWidth = 10 }: {
  value: number; total: number; size?: number; strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const progress = total > 0 ? Math.min(value / total, 1) : 0;
  const offset = circ * (1 - progress);
  const c = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
      <circle cx={c} cy={c} r={r} stroke="var(--color-border)" strokeWidth={strokeWidth} fill="none" />
      <circle
        cx={c} cy={c} r={r}
        stroke="var(--color-accent)"
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─── sparkline ─── */
function Sparkline({ values }: { values: number[] }) {
  const w = 80; const h = 28;
  if (values.length < 2) return <div style={{ width: w, height: h }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} aria-hidden>
      <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── set target dialog ─── */
function SetTargetDialog({ open, current, onSave, onClose, isSaving }: {
  open: boolean; current: number; onSave: (v: number) => void; onClose: () => void; isSaving: boolean;
}) {
  const [value, setValue] = useState(String(current));
  useEffect(() => { if (open) setValue(String(current)); }, [open, current]);
  const handleSave = () => {
    const parsed = parseFloat(value.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) onSave(parsed);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="md">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set monthly target</DialogTitle>
          <DialogDescription>Your ring progress tracks earnings toward this goal.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <label className="block text-[13px] font-medium text-[var(--color-text-secondary)]">Monthly target</label>
          <div className="mt-1.5 flex items-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs transition duration-100 focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent-soft)]">
            <span className="flex h-full items-center border-r border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-[14px] font-semibold text-[var(--color-text-muted)]">$</span>
            <Input
              type="number"
              min="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="10000"
              className="flex-1 bg-transparent px-3 py-2.5 text-[14px] font-semibold text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none border-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">Enter the USD amount you aim to earn this month.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving…' : 'Save target'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── main component ─── */
export function InsightsClient({
  accessToken,
  initialData,
  initialTarget,
  billing,
  initialExpenses,
  clientBreakdown,
  invoices,
}: {
  accessToken: string | null;
  initialData: InsightsData | null;
  initialTarget: number;
  billing: BillingStatusSummary | null;
  initialExpenses: ExpenseRecord[];
  clientBreakdown: ClientRevenueBreakdown[];
  invoices: Invoice[];
}) {
  const { formatAmount, formatUsdText } = useCurrency();
  const { toast } = useToast();

  useAssistantPageContext('Insights', {
    monthlyTarget: initialTarget,
    expensesCount: initialExpenses.length,
    clientCount: clientBreakdown.length,
    invoicesCount: invoices.length,
  });

  const canViewAdvancedInsights = canUseFeature('assistant_summary_advanced', billing);

  const [range, setRange] = useState<InsightsRange>('30d');
  const [data, setData] = useState<InsightsData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialData === null ? 'Could not load insights data. The server may be temporarily unavailable.' : null);
  const [monthlyTarget, setMonthlyTarget] = useState(initialTarget);
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [isSavingTarget, setIsSavingTarget] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [clientsByRevenue, setClientsByRevenue] = useState<ClientRevenueBreakdown[]>(clientBreakdown);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fetchData = useCallback(async (r: InsightsRange) => {
    if (!accessToken) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${backendConfig.apiBaseUrl}/api/insights/summary?range=${r}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error?.message ?? 'Failed to load');
      if (mounted.current) setData(json.data);
    } catch (e: any) {
      if (mounted.current) setError(e?.message ?? 'Something went wrong');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [accessToken]);

  const handleRangeChange = (r: InsightsRange) => {
    setRange(r);
    fetchData(r);
    if (accessToken) {
      void hedwigApi.revenueBreakdown(r, { accessToken }).then((bd: any) => {
        if (mounted.current && Array.isArray(bd?.clients)) setClientsByRevenue(bd.clients);
      }).catch(() => {});
    }
  };

  const handleSaveTarget = async (newTarget: number) => {
    setIsSavingTarget(true);
    try {
      const res = await fetch(`${backendConfig.apiBaseUrl}/api/users/profile`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyTarget: newTarget }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.success === false) throw new Error(json?.error?.message || 'Failed to update target');
      setMonthlyTarget(newTarget);
      toast({ type: 'success', title: 'Target updated', message: `Monthly target set to ${formatAmount(newTarget)}` });
    } catch (err: any) {
      toast({ type: 'error', title: 'Could not save target', message: err?.message || 'Please try again.' });
    } finally {
      setIsSavingTarget(false);
      setShowTargetDialog(false);
    }
  };

  /* ─── derived ─── */
  const summary = data?.summary ?? null;
  const insights = data?.insights ?? [];
  const series = data?.series ?? { earnings: [] };
  const sparkValues = series.earnings.map((p) => p.value);
  const periodEarnings = summary?.monthlyEarnings ?? 0;
  const currentMonthEarnings = summary?.currentMonthEarnings ?? periodEarnings;
  const earningsDeltaPct = summary?.earningsDeltaPct ?? 0;
  const earningsTrend: 'up' | 'down' | 'neutral' =
    earningsDeltaPct > 0 ? 'up' : earningsDeltaPct < 0 ? 'down' : 'neutral';
  const remainingAmount = Math.max(0, monthlyTarget - currentMonthEarnings);
  const hasExceededTarget = currentMonthEarnings > monthlyTarget;

  const isEmpty = !loading && !error && (!summary ||
    (summary.totalDocuments === 0 && summary.transactionsCount === 0 && summary.clientsCount === 0));

  const expenseAnalysis = useMemo(
    () => buildExpenseAnalysis(initialExpenses, range as AnalyticsRange),
    [initialExpenses, range],
  );

  const insightRisks = useMemo(
    () => buildInsightRisks({
      range: range as AnalyticsRange,
      summary: data?.summary,
      clientBreakdown: clientsByRevenue,
      expenses: initialExpenses,
      invoices,
    }),
    [range, data?.summary, clientsByRevenue, initialExpenses, invoices],
  );

  return (
    <div className="flex flex-col gap-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Insights</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">Revenue trends, expense patterns, and business intelligence.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 mt-0.5">
          <button
            type="button"
            onClick={() => setShowExportDialog(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] shadow-xs transition duration-100 ease-linear hover:bg-[var(--color-background)]"
          >
            <DownloadSimple className="h-4 w-4" weight="bold" />
            Export
          </button>
          <button
            type="button"
            onClick={() => fetchData(range)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] shadow-xs transition duration-100 ease-linear hover:bg-[var(--color-background)]"
          >
            <ArrowsClockwise className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} weight="bold" />
            Refresh
          </button>
        </div>
        <ExportDialog open={showExportDialog} onOpenChange={setShowExportDialog} />
      </div>

      <ContextualSuggestions
        title="Tax and risk review"
        description="Only actionable cross-cutting suggestions appear here, without creating another inbox."
        query={{ insightsPage: true, limit: 1 }}
      />

      {/* ── Range filter + timestamp ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleRangeChange(r)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition duration-100 ease-linear ${
                range === r
                  ? 'bg-[var(--color-text-primary)] text-[var(--color-background)]'
                  : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-[var(--color-text-muted)]">{formatTimeAgo(data?.lastUpdatedAt ?? null)}</p>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--color-surface)] px-6 py-10 text-center ring-1 ring-[var(--color-border)] shadow-xs">
          <p className="text-[15px] font-semibold text-[var(--color-text-primary)]">Could not load insights</p>
          <p className="text-[13px] text-[var(--color-text-tertiary)]">{error}</p>
          <Button variant="secondary" onClick={() => fetchData(range)}>Try again</Button>
        </div>
      )}

      {!error && (
        <>
          <AttachedStatGrid
            items={[
              {
                id: 'monthly-earnings',
                title: 'Period earnings',
                value: loading ? '...' : formatAmount(periodEarnings, { compact: true }),
                helper: (
                  <span className={`flex items-center gap-1 ${earningsTrend === 'up' ? 'text-[var(--color-success)]' : earningsTrend === 'down' ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]'}`}>
                    {earningsTrend === 'up' && <ArrowUpRight className="h-3 w-3 text-[var(--color-success)]" weight="bold" />}
                    {earningsTrend === 'down' && <ArrowDownRight className="h-3 w-3 text-[var(--color-danger)]" weight="bold" />}
                    <span>{earningsDeltaPct >= 0 ? '+' : ''}{earningsDeltaPct.toFixed(0)}% vs previous</span>
                  </span>
                ),
                icon: CurrencyDollar,
                href: '/payments',
                loading,
              },
              {
                id: 'payment-rate',
                title: 'Payment rate',
                value: loading ? '...' : `${summary?.paymentRate ?? 0}%`,
                helper: summary ? `${summary.paidDocuments}/${summary.totalDocuments} paid` : '—',
                icon: CheckCircle,
                href: '/payments',
                loading,
              },
              {
                id: 'pending-invoices',
                title: 'Pending invoices',
                value: loading ? '...' : String(summary?.pendingInvoicesCount ?? 0),
                helper: (() => {
                    if (!summary) return '—';
                    const settlementPending = (summary.withdrawalsPending ?? 0) + (summary.onrampPending ?? 0);
                    const base = `${formatAmount(summary.pendingInvoicesTotal, { compact: true })} outstanding`;
                    return settlementPending > 0
                        ? `${base} · ${settlementPending} settlement${settlementPending === 1 ? '' : 's'} pending`
                        : base;
                })(),
                icon: Warning,
                href: '/payments',
                loading,
              },
              {
                id: 'active-clients',
                title: 'Active clients',
                value: loading ? '...' : String(summary?.clientsCount ?? 0),
                helper: summary?.topClient?.name ? `Top: ${summary.topClient.name}` : 'No top client yet',
                icon: UsersThree,
                href: '/clients',
                loading,
              },
            ]}
            className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
          />

          {/* ── Revenue trend chart ── */}
          <article className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
            <div className="flex items-center justify-between border-b border-[var(--color-surface-secondary)] px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Revenue trend</h2>
                <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">Earnings over the selected period.</p>
              </div>
              {earningsTrend !== 'neutral' && !loading && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  earningsTrend === 'up' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                }`}>
                  {earningsTrend === 'up'
                    ? <ArrowUpRight className="h-3 w-3" weight="bold" />
                    : <ArrowDownRight className="h-3 w-3" weight="bold" />}
                  {earningsDeltaPct >= 0 ? '+' : ''}{earningsDeltaPct.toFixed(0)}% vs prev period
                </span>
              )}
            </div>

            {loading ? (
              <div className="h-[180px] animate-pulse bg-[var(--color-surface-secondary)]" />
            ) : series.earnings.length < 2 ? (
              <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-center">
                <ChartBar className="h-8 w-8 text-[var(--color-border)]" weight="regular" />
                <p className="text-[13px] text-[var(--color-text-muted)]">Not enough data to show a trend yet.</p>
              </div>
            ) : (
              <div className="px-2 pb-4 pt-2">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={series.earnings} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--color-surface-tertiary)" />
                    <XAxis
                      dataKey="key"
                      tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      tickMargin={8}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      width={46}
                      tickFormatter={(v: number) => formatAmount(v, { compact: true })}
                    />
                    <Tooltip
                      content={<EarningsTooltip formatAmount={formatAmount} />}
                      cursor={{ stroke: 'var(--color-accent)', strokeWidth: 1.5, strokeDasharray: '4 2' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      fill="url(#earningsGrad)"
                      dot={false}
                      activeDot={{ r: 4, fill: 'var(--color-accent)', stroke: 'white', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </article>

          {/* ── Risks & recommendations ── */}
          {insightRisks.length > 0 && (
            <div>
              <h2 className="mb-3 text-[15px] font-semibold text-[var(--color-text-primary)]">Risks & recommendations</h2>
              <div className={`grid gap-3 ${insightRisks.length === 1 ? 'max-w-sm' : insightRisks.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
                {insightRisks.map((risk) => {
                  const sev = SEVERITY_STYLES[risk.severity];
                  const card = (
                    <article className={`flex flex-col gap-3 rounded-2xl bg-[var(--color-surface)] p-5 shadow-xs ring-1 ring-[var(--color-border)] ${risk.actionRoute ? 'transition duration-100 ease-linear hover:bg-[var(--color-background)]' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${sev.bg}`}>
                          <Warning className={`h-4 w-4 ${sev.icon}`} weight="fill" />
                        </div>
                        <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sev.bg} ${sev.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
                          {sev.label}
                        </span>
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{risk.title}</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-tertiary)]">{formatUsdText(risk.description)}</p>
                      </div>
                      {risk.actionLabel && (
                        <p className="text-[12px] font-semibold text-[var(--color-accent)]">{risk.actionLabel} →</p>
                      )}
                    </article>
                  );
                  return risk.actionRoute ? (
                    <Link key={risk.id} href={risk.actionRoute}>{card}</Link>
                  ) : (
                    <div key={risk.id}>{card}</div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Monthly progress + Insights feed ── */}
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">

            <article className="flex flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
              <div className="flex items-center justify-between border-b border-[var(--color-surface-secondary)] px-5 py-4">
                <div>
                  <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">Monthly progress</h2>
                  <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">Earnings toward your monthly target.</p>
                </div>
                <Sparkline values={sparkValues} />
              </div>

              <div className="flex flex-1 flex-col items-center justify-center px-6 py-6 gap-4">
                <div className="relative flex items-center justify-center">
                  <RingChart value={currentMonthEarnings} total={monthlyTarget} />
                  <div className="absolute flex flex-col items-center">
                    <p className="text-[20px] font-bold tracking-[-0.03em] text-[var(--color-text-primary)] leading-none">
                      {formatAmount(currentMonthEarnings, { compact: true })}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Earned</p>
                  </div>
                </div>

                <div className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-xl bg-[var(--color-border)] ring-1 ring-[var(--color-border)]">
                  <div className="flex flex-col items-center bg-[var(--color-surface)] px-4 py-3">
                    <p className="text-[11px] text-[var(--color-text-muted)]">{hasExceededTarget ? 'Exceeded by' : 'Remaining'}</p>
                    <p className={`mt-0.5 text-[16px] font-bold tracking-[-0.03em] ${hasExceededTarget ? 'text-[var(--color-success)]' : 'text-[var(--color-text-primary)]'}`}>
                      {hasExceededTarget
                        ? `+${formatAmount(currentMonthEarnings - monthlyTarget, { compact: true })}`
                        : formatAmount(remainingAmount, { compact: true })}
                    </p>
                  </div>
                  <div className="flex flex-col items-center bg-[var(--color-surface)] px-4 py-3">
                    <p className="text-[11px] text-[var(--color-text-muted)]">Target</p>
                    <p className="mt-0.5 text-[16px] font-bold tracking-[-0.03em] text-[var(--color-text-primary)]">
                      {formatAmount(monthlyTarget, { compact: true })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--color-surface-secondary)] px-5 py-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  earningsTrend === 'up' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' :
                  earningsTrend === 'down' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' :
                  'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)]'
                }`}>
                  {earningsTrend === 'up' && <ArrowUpRight className="h-3 w-3" weight="bold" />}
                  {earningsTrend === 'down' && <ArrowDownRight className="h-3 w-3" weight="bold" />}
                  {earningsTrend === 'neutral' && <Minus className="h-3 w-3" weight="bold" />}
                  {earningsDeltaPct >= 0 ? '+' : ''}{earningsDeltaPct.toFixed(0)}% vs previous period
                </span>
                <button
                  type="button"
                  onClick={() => setShowTargetDialog(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--color-text-secondary)] shadow-xs transition duration-100 ease-linear hover:bg-[var(--color-background)]"
                >
                  <Target className="h-3.5 w-3.5" weight="bold" />
                  Set target
                </button>
              </div>
            </article>

            {canViewAdvancedInsights ? (
              <article className="flex flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
                <div className="flex items-center gap-2.5 border-b border-[var(--color-surface-secondary)] px-5 py-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
                    <Sparkle className="h-4 w-4 text-[var(--color-accent)]" weight="fill" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">Insights feed</h2>
                    <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">Priority updates from your account activity.</p>
                  </div>
                </div>

                {isEmpty ? (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                    <p className="text-[14px] font-semibold text-[var(--color-text-secondary)]">No account activity yet</p>
                    <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
                      Create an invoice, payment link, or project to start populating this feed.
                    </p>
                  </div>
                ) : loading ? (
                  <div className="divide-y divide-[var(--color-surface-secondary)]">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-start gap-3 px-5 py-4 animate-pulse">
                        <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-[var(--color-surface-tertiary)]" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 w-2/3 rounded bg-[var(--color-surface-tertiary)]" />
                          <div className="h-3 w-full rounded bg-[var(--color-surface-tertiary)]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--color-surface-secondary)]">
                    {insights.map((insight) => {
                      const dotColor = insight.trend === 'up' ? 'bg-[var(--color-success)]' : insight.trend === 'down' ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-accent)]';
                      const dotBg = insight.trend === 'up' ? 'bg-[var(--color-success-soft)]' : insight.trend === 'down' ? 'bg-[var(--color-danger-soft)]' : 'bg-[var(--color-accent-soft)]';
                      const inner = (
                        <div className="group flex items-start gap-3 px-5 py-4 transition duration-100 ease-linear hover:bg-[var(--color-background)]">
                          <div className={`mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${dotBg}`}>
                            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">{insight.title}</p>
                            <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">{formatUsdText(insight.description)}</p>
                            {insight.actionLabel && (
                              <p className="mt-1.5 text-[12px] font-semibold text-[var(--color-accent)]">{insight.actionLabel}</p>
                            )}
                          </div>
                          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-border-input)] transition-colors group-hover:text-[var(--color-text-muted)]" />
                        </div>
                      );
                      return insight.actionRoute ? (
                        <Link key={insight.id} href={insight.actionRoute}>{inner}</Link>
                      ) : (
                        <div key={insight.id}>{inner}</div>
                      );
                    })}
                  </div>
                )}
              </article>
            ) : (
              <ProLockCard
                title="Insights feed is on Pro"
                description="Unlock priority insights across payments, cash flow, and project activity."
                compact
              />
            )}
          </div>

          {/* ── Expense analysis + Client performance ── */}
          <div className="grid gap-4 lg:grid-cols-2">

            <article className="flex flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
              <div className="border-b border-[var(--color-surface-secondary)] px-5 py-4">
                <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Expense breakdown</h2>
                <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">Top categories by spend this period.</p>
              </div>

              {expenseAnalysis.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                  <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">No expenses recorded</p>
                  <p className="text-[12px] text-[var(--color-text-muted)]">Add expenses on the Revenue page to see spend patterns here.</p>
                  <Link href="/revenue" className="mt-1 text-[12px] font-semibold text-[var(--color-accent)] hover:text-[var(--color-primary-dark)]">
                    Go to Revenue →
                  </Link>
                </div>
              ) : (
                <div className="space-y-4 px-5 py-5">
                  {expenseAnalysis.map((item) => {
                    const barColor = EXPENSE_CATEGORY_BAR[item.category] ?? 'bg-[var(--color-text-muted)]';
                    return (
                      <div key={item.category}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{item.label}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                              {formatAmount(item.value, { compact: true })}
                            </span>
                            <span className="w-8 text-right text-[11px] font-semibold text-[var(--color-text-muted)]">
                              {item.pct.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${item.pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            <article className="flex flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
              <div className="flex items-center justify-between border-b border-[var(--color-surface-secondary)] px-5 py-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Client performance</h2>
                  <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">Revenue contribution by client.</p>
                </div>
                <Link href="/clients" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-accent)] hover:text-[var(--color-primary-dark)]">
                  All clients <ArrowRight className="h-3.5 w-3.5" weight="bold" />
                </Link>
              </div>

              {clientsByRevenue.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                  <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">No client data yet</p>
                  <p className="text-[12px] text-[var(--color-text-muted)]">Send invoices to clients to see their revenue contribution.</p>
                </div>
              ) : (
                <div className="space-y-4 px-5 py-5">
                  {clientsByRevenue.slice(0, 4).map((c) => (
                    <div key={c.clientId}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{c.company || c.clientName}</p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">{c.invoiceCount} invoice{c.invoiceCount !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="ml-3 flex items-center gap-2 shrink-0">
                          <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                            {formatAmount(c.totalRevenue, { compact: true })}
                          </span>
                          <span className="w-9 text-right text-[11px] font-semibold text-[var(--color-text-muted)]">
                            {c.shareOfTotal.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                        <div className="h-full rounded-full bg-[var(--color-accent)] transition-all" style={{ width: `${c.shareOfTotal}%` }} />
                      </div>
                      {c.shareOfTotal >= 50 && (
                        <p className="mt-1 text-[11px] text-[var(--color-warning)]">
                          High concentration — {c.shareOfTotal.toFixed(0)}% of total revenue
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>

        </>
      )}

      <SetTargetDialog
        open={showTargetDialog}
        current={monthlyTarget}
        onSave={handleSaveTarget}
        onClose={() => setShowTargetDialog(false)}
        isSaving={isSavingTarget}
      />
    </div>
  );
}
