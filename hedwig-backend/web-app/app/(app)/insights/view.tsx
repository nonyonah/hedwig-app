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
import { formatCompactCurrency } from '@/lib/utils';
import { backendConfig } from '@/lib/auth/config';
import { hedwigApi } from '@/lib/api/client';
import type { BillingStatusSummary } from '@/lib/api/client';
import { canUseFeature } from '@/lib/billing/feature-gates';
import { ProLockCard } from '@/components/billing/pro-lock-card';
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
}

interface InsightsData {
  range: string;
  lastUpdatedAt: string;
  summary: InsightsSummary;
  series: { earnings: { key: string; value: number }[] };
  insights: InsightItem[];
}

interface TaxSummaryMonthlyBucket {
  month: string;
  incomeUsd: number;
  estimatedFeesUsd: number;
  withdrawalsUsd: number;
  netEstimateUsd: number;
}

interface TaxSummaryData {
  year: number;
  generatedAt: string;
  feeMethod: string;
  totals: {
    incomeUsd: number;
    estimatedFeesUsd: number;
    withdrawalsUsd: number;
    netEstimateUsd: number;
  };
  monthly: TaxSummaryMonthlyBucket[];
  topClients: Array<{
    clientId: string;
    name: string;
    incomeUsd: number;
    invoiceCount: number;
  }>;
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
  software: 'bg-[#2563eb]',
  equipment: 'bg-[#7c3aed]',
  marketing: 'bg-[#c2410c]',
  travel: 'bg-[#15803d]',
  operations: 'bg-[#717680]',
  contractor: 'bg-[#7e22ce]',
  subscriptions: 'bg-[#1d4ed8]',
  other: 'bg-[#a4a7ae]',
};

const SEVERITY_STYLES = {
  high:   { dot: 'bg-[#f04438]', bg: 'bg-[#fff1f0]', icon: 'text-[#b42318]', badge: 'text-[#b42318]', label: 'High' },
  medium: { dot: 'bg-[#f79009]', bg: 'bg-[#fffaeb]', icon: 'text-[#b45309]', badge: 'text-[#b45309]', label: 'Medium' },
  low:    { dot: 'bg-[#a4a7ae]', bg: 'bg-[#f2f4f7]', icon: 'text-[#717680]', badge: 'text-[#717680]', label: 'Low' },
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
      <circle cx={c} cy={c} r={r} stroke="#e9eaeb" strokeWidth={strokeWidth} fill="none" />
      <circle
        cx={c} cy={c} r={r}
        stroke="#2563eb"
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
      <polyline points={points} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Set monthly target</DialogTitle>
          <DialogDescription>Your ring progress tracks earnings toward this goal.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <label className="block text-[13px] font-medium text-[#414651]">Monthly target</label>
          <div className="mt-1.5 flex items-center overflow-hidden rounded-xl border border-[#e9eaeb] bg-white shadow-xs transition duration-100 focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#eff4ff]">
            <span className="flex h-full items-center border-r border-[#e9eaeb] bg-[#f9fafb] px-3 py-2.5 text-[14px] font-semibold text-[#a4a7ae]">$</span>
            <input
              type="number"
              min="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="10000"
              className="flex-1 bg-transparent px-3 py-2.5 text-[14px] font-semibold text-[#181d27] placeholder:text-[#a4a7ae] focus:outline-none"
            />
          </div>
          <p className="mt-2 text-[12px] text-[#a4a7ae]">Enter the USD amount you aim to earn this month.</p>
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
  const { currency } = useCurrency();
  const { toast } = useToast();
  const canViewAdvancedInsights = canUseFeature('assistant_summary_advanced', billing);
  const canViewTaxSummary = canUseFeature('tax_summary', billing);

  const [range, setRange] = useState<InsightsRange>('30d');
  const [data, setData] = useState<InsightsData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialData === null ? 'Could not load insights data. The server may be temporarily unavailable.' : null);
  const [monthlyTarget, setMonthlyTarget] = useState(initialTarget);
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [isSavingTarget, setIsSavingTarget] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [taxYear, setTaxYear] = useState<number>(new Date().getUTCFullYear());
  const [taxSummary, setTaxSummary] = useState<TaxSummaryData | null>(null);
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxError, setTaxError] = useState<string | null>(null);
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
      await fetch(`${backendConfig.apiBaseUrl}/api/users/profile`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyTarget: newTarget }),
      });
      setMonthlyTarget(newTarget);
      toast({ type: 'success', title: 'Target updated', message: `Monthly target set to $${newTarget.toLocaleString()}` });
    } catch {
      setMonthlyTarget(newTarget);
    } finally {
      setIsSavingTarget(false);
      setShowTargetDialog(false);
    }
  };

  const fetchTaxSummary = useCallback(async (year: number) => {
    if (!accessToken) return;
    setTaxLoading(true); setTaxError(null);
    try {
      const response = await fetch(`${backendConfig.apiBaseUrl}/api/insights/tax-summary?year=${year}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || 'Failed to load tax summary');
      if (mounted.current) setTaxSummary(payload.data as TaxSummaryData);
    } catch (taxErr: any) {
      if (mounted.current) setTaxError(taxErr?.message || 'Could not load tax summary');
    } finally {
      if (mounted.current) setTaxLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!canViewTaxSummary) return;
    void fetchTaxSummary(taxYear);
  }, [canViewTaxSummary, fetchTaxSummary, taxYear]);

  /* ─── derived ─── */
  const summary = data?.summary ?? null;
  const insights = data?.insights ?? [];
  const series = data?.series ?? { earnings: [] };
  const sparkValues = series.earnings.map((p) => p.value);
  const monthlyEarnings = summary?.monthlyEarnings ?? 0;
  const earningsDeltaPct = summary?.earningsDeltaPct ?? 0;
  const earningsTrend: 'up' | 'down' | 'neutral' =
    earningsDeltaPct > 0 ? 'up' : earningsDeltaPct < 0 ? 'down' : 'neutral';
  const remainingAmount = Math.max(0, monthlyTarget - monthlyEarnings);
  const hasExceededTarget = monthlyEarnings > monthlyTarget;

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
          <h1 className="text-[15px] font-semibold text-[#181d27]">Insights</h1>
          <p className="mt-0.5 text-[13px] text-[#a4a7ae]">Revenue trends, expense patterns, and business intelligence.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 mt-0.5">
          <Button variant="secondary" onClick={() => setShowExportDialog(true)}>
            <DownloadSimple className="h-4 w-4" weight="bold" />
            Export
          </Button>
          <Button variant="secondary" onClick={() => fetchData(range)} disabled={loading}>
            <ArrowsClockwise className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} weight="bold" />
            Refresh
          </Button>
        </div>
        <ExportDialog open={showExportDialog} onOpenChange={setShowExportDialog} />
      </div>

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
                  ? 'bg-[#181d27] text-white'
                  : 'text-[#717680] hover:bg-[#f2f4f7] hover:text-[#344054]'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-[#a4a7ae]">{formatTimeAgo(data?.lastUpdatedAt ?? null)}</p>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-[#e9eaeb] shadow-xs">
          <p className="text-[15px] font-semibold text-[#181d27]">Could not load insights</p>
          <p className="text-[13px] text-[#717680]">{error}</p>
          <Button variant="secondary" onClick={() => fetchData(range)}>Try again</Button>
        </div>
      )}

      {!error && (
        <>
          {/* ── Stats bar ── */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb] sm:grid-cols-4">
            <Link href="/payments" className="group flex flex-col bg-white px-5 py-4 transition duration-100 ease-linear hover:bg-[#fafafa]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-medium text-[#717680]">Monthly earnings</p>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]">
                  <CurrencyDollar className="h-3.5 w-3.5 text-[#717680]" weight="regular" />
                </div>
              </div>
              {loading ? <div className="h-6 w-24 animate-pulse rounded bg-[#f2f4f7]" /> : (
                <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">
                  {formatCompactCurrency(monthlyEarnings, currency)}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-1">
                {earningsTrend === 'up' && <ArrowUpRight className="h-3 w-3 text-[#12b76a]" weight="bold" />}
                {earningsTrend === 'down' && <ArrowDownRight className="h-3 w-3 text-[#f04438]" weight="bold" />}
                <p className={`text-[11px] ${earningsTrend === 'up' ? 'text-[#12b76a]' : earningsTrend === 'down' ? 'text-[#f04438]' : 'text-[#a4a7ae]'}`}>
                  {earningsDeltaPct >= 0 ? '+' : ''}{earningsDeltaPct.toFixed(0)}% vs previous
                </p>
              </div>
            </Link>

            <Link href="/payments" className="group flex flex-col bg-white px-5 py-4 transition duration-100 ease-linear hover:bg-[#fafafa]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-medium text-[#717680]">Payment rate</p>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]">
                  <CheckCircle className="h-3.5 w-3.5 text-[#717680]" weight="regular" />
                </div>
              </div>
              {loading ? <div className="h-6 w-16 animate-pulse rounded bg-[#f2f4f7]" /> : (
                <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">
                  {summary?.paymentRate ?? 0}%
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-[#a4a7ae]">
                {summary ? `${summary.paidDocuments}/${summary.totalDocuments} paid` : '—'}
              </p>
            </Link>

            <Link href="/payments" className="group flex flex-col bg-white px-5 py-4 transition duration-100 ease-linear hover:bg-[#fafafa]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-medium text-[#717680]">Pending invoices</p>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]">
                  <Warning className="h-3.5 w-3.5 text-[#717680]" weight="regular" />
                </div>
              </div>
              {loading ? <div className="h-6 w-12 animate-pulse rounded bg-[#f2f4f7]" /> : (
                <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">
                  {summary?.pendingInvoicesCount ?? 0}
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-[#a4a7ae]">
                {summary ? `${formatCompactCurrency(summary.pendingInvoicesTotal, currency)} outstanding` : '—'}
              </p>
            </Link>

            <Link href="/clients" className="group flex flex-col bg-white px-5 py-4 transition duration-100 ease-linear hover:bg-[#fafafa]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-medium text-[#717680]">Active clients</p>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]">
                  <UsersThree className="h-3.5 w-3.5 text-[#717680]" weight="regular" />
                </div>
              </div>
              {loading ? <div className="h-6 w-8 animate-pulse rounded bg-[#f2f4f7]" /> : (
                <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">
                  {summary?.clientsCount ?? 0}
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-[#a4a7ae]">
                {summary?.topClient?.name ? `Top: ${summary.topClient.name}` : 'No top client yet'}
              </p>
            </Link>
          </div>

          {/* ── Revenue trend chart ── */}
          <article className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
            <div className="flex items-center justify-between border-b border-[#f5f5f5] px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold text-[#181d27]">Revenue trend</h2>
                <p className="mt-0.5 text-[13px] text-[#717680]">Earnings over the selected period.</p>
              </div>
              {earningsTrend !== 'neutral' && !loading && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  earningsTrend === 'up' ? 'bg-[#ecfdf3] text-[#027a48]' : 'bg-[#fff1f0] text-[#b42318]'
                }`}>
                  {earningsTrend === 'up'
                    ? <ArrowUpRight className="h-3 w-3" weight="bold" />
                    : <ArrowDownRight className="h-3 w-3" weight="bold" />}
                  {earningsDeltaPct >= 0 ? '+' : ''}{earningsDeltaPct.toFixed(0)}% vs prev period
                </span>
              )}
            </div>

            {loading ? (
              <div className="h-[180px] animate-pulse bg-[#f9fafb]" />
            ) : series.earnings.length < 2 ? (
              <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-center">
                <ChartBar className="h-8 w-8 text-[#e9eaeb]" weight="regular" />
                <p className="text-[13px] text-[#a4a7ae]">Not enough data to show a trend yet.</p>
              </div>
            ) : (
              <div className="px-2 py-4">
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={series.earnings} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="earningsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f2f4f7" vertical={false} />
                    <XAxis
                      dataKey="key"
                      tick={{ fontSize: 11, fill: '#a4a7ae' }}
                      axisLine={false}
                      tickLine={false}
                      tickMargin={8}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#a4a7ae' }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                      tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid #e9eaeb',
                        fontSize: 12,
                        boxShadow: '0px 4px 6px -1px rgba(10,13,18,0.1)',
                      }}
                      formatter={(value: any) => formatCompactCurrency(value as number, currency)}
                      labelStyle={{ color: '#414651', fontWeight: 600, marginBottom: 4 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#2563eb"
                      strokeWidth={2}
                      fill="url(#earningsGrad)"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0, fill: '#2563eb' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </article>

          {/* ── Risks & recommendations ── */}
          {insightRisks.length > 0 && (
            <div>
              <h2 className="mb-3 text-[15px] font-semibold text-[#181d27]">Risks & recommendations</h2>
              <div className={`grid gap-3 ${insightRisks.length === 1 ? 'max-w-sm' : insightRisks.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
                {insightRisks.map((risk) => {
                  const sev = SEVERITY_STYLES[risk.severity];
                  const card = (
                    <article className={`flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-xs ring-1 ring-[#e9eaeb] ${risk.actionRoute ? 'transition duration-100 ease-linear hover:bg-[#fafafa]' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${sev.bg}`}>
                          <Warning className={`h-4 w-4 ${sev.icon}`} weight="fill" />
                        </div>
                        <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sev.bg} ${sev.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
                          {sev.label}
                        </span>
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-[#181d27]">{risk.title}</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-[#717680]">{risk.description}</p>
                      </div>
                      {risk.actionLabel && (
                        <p className="text-[12px] font-semibold text-[#2563eb]">{risk.actionLabel} →</p>
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

            <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
              <div className="flex items-center justify-between border-b border-[#f5f5f5] px-5 py-4">
                <div>
                  <h2 className="text-[16px] font-semibold text-[#181d27]">Monthly progress</h2>
                  <p className="mt-0.5 text-[13px] text-[#717680]">Earnings toward your monthly target.</p>
                </div>
                <Sparkline values={sparkValues} />
              </div>

              <div className="flex flex-1 flex-col items-center justify-center px-6 py-6 gap-4">
                <div className="relative flex items-center justify-center">
                  <RingChart value={monthlyEarnings} total={monthlyTarget} />
                  <div className="absolute flex flex-col items-center">
                    <p className="text-[20px] font-bold tracking-[-0.03em] text-[#181d27] leading-none">
                      ${monthlyEarnings.toLocaleString()}
                    </p>
                    <p className="mt-1 text-[11px] text-[#a4a7ae]">Earned</p>
                  </div>
                </div>

                <div className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
                  <div className="flex flex-col items-center bg-white px-4 py-3">
                    <p className="text-[11px] text-[#a4a7ae]">{hasExceededTarget ? 'Exceeded by' : 'Remaining'}</p>
                    <p className={`mt-0.5 text-[16px] font-bold tracking-[-0.03em] ${hasExceededTarget ? 'text-[#027a48]' : 'text-[#181d27]'}`}>
                      {hasExceededTarget
                        ? `+$${(monthlyEarnings - monthlyTarget).toLocaleString()}`
                        : `$${remainingAmount.toLocaleString()}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-center bg-white px-4 py-3">
                    <p className="text-[11px] text-[#a4a7ae]">Target</p>
                    <p className="mt-0.5 text-[16px] font-bold tracking-[-0.03em] text-[#181d27]">
                      ${monthlyTarget.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[#f5f5f5] px-5 py-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  earningsTrend === 'up' ? 'bg-[#ecfdf3] text-[#027a48]' :
                  earningsTrend === 'down' ? 'bg-[#fff1f0] text-[#b42318]' :
                  'bg-[#f2f4f7] text-[#717680]'
                }`}>
                  {earningsTrend === 'up' && <ArrowUpRight className="h-3 w-3" weight="bold" />}
                  {earningsTrend === 'down' && <ArrowDownRight className="h-3 w-3" weight="bold" />}
                  {earningsTrend === 'neutral' && <Minus className="h-3 w-3" weight="bold" />}
                  {earningsDeltaPct >= 0 ? '+' : ''}{earningsDeltaPct.toFixed(0)}% vs previous period
                </span>
                <button
                  type="button"
                  onClick={() => setShowTargetDialog(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#d5d7da] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#414651] shadow-xs transition duration-100 ease-linear hover:bg-[#fafafa]"
                >
                  <Target className="h-3.5 w-3.5" weight="bold" />
                  Set target
                </button>
              </div>
            </article>

            {canViewAdvancedInsights ? (
              <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
                <div className="flex items-center gap-2.5 border-b border-[#f5f5f5] px-5 py-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eff4ff]">
                    <Sparkle className="h-4 w-4 text-[#2563eb]" weight="fill" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-semibold text-[#181d27]">Insights feed</h2>
                    <p className="mt-0.5 text-[13px] text-[#717680]">Priority updates from your account activity.</p>
                  </div>
                </div>

                {isEmpty ? (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                    <p className="text-[14px] font-semibold text-[#414651]">No account activity yet</p>
                    <p className="mt-1 text-[13px] text-[#a4a7ae]">
                      Create an invoice, payment link, or project to start populating this feed.
                    </p>
                  </div>
                ) : loading ? (
                  <div className="divide-y divide-[#f5f5f5]">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-start gap-3 px-5 py-4 animate-pulse">
                        <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-[#f2f4f7]" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 w-2/3 rounded bg-[#f2f4f7]" />
                          <div className="h-3 w-full rounded bg-[#f2f4f7]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="divide-y divide-[#f5f5f5]">
                    {insights.map((insight) => {
                      const dotColor = insight.trend === 'up' ? 'bg-[#12b76a]' : insight.trend === 'down' ? 'bg-[#f04438]' : 'bg-[#2563eb]';
                      const dotBg = insight.trend === 'up' ? 'bg-[#ecfdf3]' : insight.trend === 'down' ? 'bg-[#fff1f0]' : 'bg-[#eff4ff]';
                      const inner = (
                        <div className="group flex items-start gap-3 px-5 py-4 transition duration-100 ease-linear hover:bg-[#fafafa]">
                          <div className={`mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${dotBg}`}>
                            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-semibold text-[#181d27]">{insight.title}</p>
                            <p className="mt-0.5 text-[13px] text-[#717680]">{insight.description}</p>
                            {insight.actionLabel && (
                              <p className="mt-1.5 text-[12px] font-semibold text-[#2563eb]">{insight.actionLabel}</p>
                            )}
                          </div>
                          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#d5d7da] transition-colors group-hover:text-[#a4a7ae]" />
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

            <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
              <div className="border-b border-[#f5f5f5] px-5 py-4">
                <h2 className="text-[15px] font-semibold text-[#181d27]">Expense breakdown</h2>
                <p className="mt-0.5 text-[13px] text-[#717680]">Top categories by spend this period.</p>
              </div>

              {expenseAnalysis.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                  <p className="text-[13px] font-semibold text-[#414651]">No expenses recorded</p>
                  <p className="text-[12px] text-[#a4a7ae]">Add expenses on the Revenue page to see spend patterns here.</p>
                  <Link href="/revenue" className="mt-1 text-[12px] font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
                    Go to Revenue →
                  </Link>
                </div>
              ) : (
                <div className="space-y-4 px-5 py-5">
                  {expenseAnalysis.map((item) => {
                    const barColor = EXPENSE_CATEGORY_BAR[item.category] ?? 'bg-[#a4a7ae]';
                    return (
                      <div key={item.category}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-[13px] font-semibold text-[#181d27]">{item.label}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[#181d27]">
                              {formatCompactCurrency(item.value, currency)}
                            </span>
                            <span className="w-8 text-right text-[11px] font-semibold text-[#a4a7ae]">
                              {item.pct.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f2f4f7]">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${item.pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
              <div className="flex items-center justify-between border-b border-[#f5f5f5] px-5 py-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#181d27]">Client performance</h2>
                  <p className="mt-0.5 text-[13px] text-[#717680]">Revenue contribution by client.</p>
                </div>
                <Link href="/clients" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
                  All clients <ArrowRight className="h-3.5 w-3.5" weight="bold" />
                </Link>
              </div>

              {clientsByRevenue.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                  <p className="text-[13px] font-semibold text-[#414651]">No client data yet</p>
                  <p className="text-[12px] text-[#a4a7ae]">Send invoices to clients to see their revenue contribution.</p>
                </div>
              ) : (
                <div className="space-y-4 px-5 py-5">
                  {clientsByRevenue.slice(0, 4).map((c) => (
                    <div key={c.clientId}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-[#181d27]">{c.company || c.clientName}</p>
                          <p className="text-[11px] text-[#a4a7ae]">{c.invoiceCount} invoice{c.invoiceCount !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="ml-3 flex items-center gap-2 shrink-0">
                          <span className="text-[13px] font-semibold text-[#181d27]">
                            {formatCompactCurrency(c.totalRevenue, currency)}
                          </span>
                          <span className="w-9 text-right text-[11px] font-semibold text-[#a4a7ae]">
                            {c.shareOfTotal.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f2f4f7]">
                        <div className="h-full rounded-full bg-[#2563eb] transition-all" style={{ width: `${c.shareOfTotal}%` }} />
                      </div>
                      {c.shareOfTotal >= 50 && (
                        <p className="mt-1 text-[11px] text-[#f79009]">
                          High concentration — {c.shareOfTotal.toFixed(0)}% of total revenue
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>

          {/* ── Overview mini-cards ── */}
          <div>
            <h2 className="mb-3 text-[16px] font-semibold text-[#181d27]">Overview</h2>
            {loading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-xs ring-1 ring-[#e9eaeb] animate-pulse">
                    <div className="h-8 w-8 rounded-lg bg-[#f2f4f7]" />
                    <div className="space-y-1.5">
                      <div className="h-5 w-12 rounded bg-[#f2f4f7]" />
                      <div className="h-3 w-20 rounded bg-[#f2f4f7]" />
                      <div className="h-3 w-16 rounded bg-[#f2f4f7]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {([
                  { value: String(summary?.paymentLinksCount ?? 0), title: 'Payment links', helper: 'Total created', href: '/payments', Icon: LinkSimple },
                  { value: String(summary?.activeProjects ?? 0), title: 'Active projects', helper: 'In progress', href: '/projects', Icon: FolderSimple },
                  { value: formatCompactCurrency(summary?.receivedAmount ?? 0, currency), title: 'Received', helper: 'In this period', href: '/payments', Icon: CurrencyDollar },
                  { value: String(summary?.pendingInvoicesCount ?? 0), title: 'Pending invoices', helper: 'Awaiting payment', href: '/payments', Icon: Warning },
                  { value: `${summary?.paidDocuments ?? 0}/${summary?.totalDocuments ?? 0}`, title: 'Paid docs', helper: 'Paid vs total', href: '/payments', Icon: CheckCircle },
                ] as const).map((card) => (
                  <Link
                    key={card.title}
                    href={card.href}
                    className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-xs ring-1 ring-[#e9eaeb] transition duration-100 ease-linear hover:bg-[#fafafa]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f5f5f5]">
                      <card.Icon className="h-[16px] w-[16px] text-[#717680]" weight="regular" />
                    </div>
                    <div>
                      <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">{card.value}</p>
                      <p className="mt-1 text-[13px] font-semibold text-[#535862]">{card.title}</p>
                      <p className="mt-0.5 text-[12px] text-[#a4a7ae]">{card.helper}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ── Tax summary ── */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-[#181d27]">Tax summary</h2>
              {canViewTaxSummary ? (
                <div className="inline-flex items-center gap-2">
                  <select
                    value={taxYear}
                    onChange={(event) => setTaxYear(Number(event.target.value))}
                    className="rounded-lg border border-[#d5d7da] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#414651] outline-none"
                  >
                    {Array.from({ length: 6 }).map((_, index) => {
                      const year = new Date().getUTCFullYear() - index;
                      return <option key={year} value={year}>{year}</option>;
                    })}
                  </select>
                  <Button variant="secondary" onClick={() => fetchTaxSummary(taxYear)} disabled={taxLoading}>
                    Refresh
                  </Button>
                </div>
              ) : null}
            </div>

            {!canViewTaxSummary ? (
              <ProLockCard
                title="Tax summaries are on Pro"
                description="Get monthly income, fee estimates, withdrawals, and net totals with yearly rollups."
                compact
              />
            ) : taxError ? (
              <div className="rounded-2xl bg-white p-5 shadow-xs ring-1 ring-[#e9eaeb]">
                <p className="text-[14px] font-semibold text-[#181d27]">Could not load tax summary</p>
                <p className="mt-1 text-[13px] text-[#717680]">{taxError}</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
                <div className="grid grid-cols-4 gap-px bg-[#e9eaeb]">
                  {[
                    { title: 'Income', value: taxSummary?.totals.incomeUsd || 0 },
                    { title: 'Estimated fees', value: taxSummary?.totals.estimatedFeesUsd || 0 },
                    { title: 'Withdrawals', value: taxSummary?.totals.withdrawalsUsd || 0 },
                    { title: 'Net estimate', value: taxSummary?.totals.netEstimateUsd || 0 },
                  ].map((card) => (
                    <div key={card.title} className="bg-white px-4 py-3.5">
                      <p className="text-[11px] text-[#717680]">{card.title}</p>
                      <p className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-[#181d27]">
                        {formatCompactCurrency(card.value, currency)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-[#f2f4f7] px-5 py-3">
                  <p className="text-[12px] text-[#717680]">
                    {taxSummary
                      ? `Generated ${formatTimeAgo(taxSummary.generatedAt).replace('Updated ', '')}. Method: ${taxSummary.feeMethod === 'transactions' ? 'transaction fees' : '1% estimated fee model'}.`
                      : taxLoading
                        ? 'Loading tax summary…'
                        : 'No tax summary available yet.'}
                  </p>
                </div>

                <div className="overflow-x-auto border-t border-[#f2f4f7]">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-[#f2f4f7] bg-[#fafafa]">
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Month</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Income</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Fees</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Withdrawals</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f9fafb]">
                      {(taxSummary?.monthly || []).map((bucket) => (
                        <tr key={bucket.month} className="hover:bg-[#fafafa]">
                          <td className="px-4 py-2.5 text-[12px] font-semibold text-[#414651]">{bucket.month}</td>
                          <td className="px-4 py-2.5 text-right text-[12px] text-[#181d27]">{formatCompactCurrency(bucket.incomeUsd, currency)}</td>
                          <td className="px-4 py-2.5 text-right text-[12px] text-[#717680]">{formatCompactCurrency(bucket.estimatedFeesUsd, currency)}</td>
                          <td className="px-4 py-2.5 text-right text-[12px] text-[#717680]">{formatCompactCurrency(bucket.withdrawalsUsd, currency)}</td>
                          <td className="px-4 py-2.5 text-right text-[12px] font-semibold text-[#181d27]">{formatCompactCurrency(bucket.netEstimateUsd, currency)}</td>
                        </tr>
                      ))}
                      {!taxLoading && (taxSummary?.monthly || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-[13px] text-[#a4a7ae]">
                            No tax activity found for {taxYear}.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
