'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  ArrowsLeftRight,
  Bank,
  CheckCircle,
  Coins,
  CurrencyDollar,
  FolderSimple,
  LinkSimple,
  Minus,
  Sparkle,
  Target,
  UsersThree,
  ArrowsClockwise,
  Warning,
} from '@/components/ui/lucide-icons';
import { PageHeader } from '@/components/data/page-header';
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

const RANGE_LABELS: Record<InsightsRange, string> = {
  '7d': '7D',
  '30d': '30D',
  '90d': '90D',
  '1y': '1 Year',
};
const RANGES: InsightsRange[] = ['7d', '30d', '90d', '1y'];

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

/* ─── SVG ring chart ─── */
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
          <label className="block text-[13px] font-medium text-[#414651]">
            Monthly target
          </label>
          <div className="mt-1.5 flex items-center gap-0 overflow-hidden rounded-xl border border-[#e9eaeb] bg-white shadow-xs transition duration-100 focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#eff4ff]">
            <span className="flex h-full items-center border-r border-[#e9eaeb] bg-[#f9fafb] px-3 py-2.5 text-[14px] font-semibold text-[#a4a7ae]">
              $
            </span>
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
          <p className="mt-2 text-[12px] text-[#a4a7ae]">
            Enter the USD amount you aim to earn this month.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save target'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── main component ─── */
export function InsightsClient({
  accessToken, initialData, initialTarget,
}: {
  accessToken: string | null;
  initialData: InsightsData;
  initialTarget: number;
}) {
  const { currency } = useCurrency();
  const { toast } = useToast();

  const [range, setRange] = useState<InsightsRange>('30d');
  const [data, setData] = useState<InsightsData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthlyTarget, setMonthlyTarget] = useState(initialTarget);
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [isSavingTarget, setIsSavingTarget] = useState(false);
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

  const handleRangeChange = (r: InsightsRange) => { setRange(r); fetchData(r); };

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

  const { summary, insights, series } = data;
  const sparkValues = series.earnings.map((p) => p.value);
  const monthlyEarnings = summary?.monthlyEarnings ?? 0;
  const earningsDeltaPct = summary?.earningsDeltaPct ?? 0;
  const earningsTrend: 'up' | 'down' | 'neutral' =
    earningsDeltaPct > 0 ? 'up' : earningsDeltaPct < 0 ? 'down' : 'neutral';
  const remainingAmount = Math.max(0, monthlyTarget - monthlyEarnings);
  const hasExceededTarget = monthlyEarnings > monthlyTarget;

  const isEmpty = !loading && !error && (!summary ||
    (summary.totalDocuments === 0 && summary.transactionsCount === 0 && summary.clientsCount === 0));

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <PageHeader
        eyebrow="Analytics"
        title="Insights"
        description="AI-powered metrics and trends from your account activity."
        actions={
          <Button variant="secondary" onClick={() => fetchData(range)} disabled={loading}>
            <ArrowsClockwise className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} weight="bold" />
            Refresh
          </Button>
        }
      />

      {/* Range filter + timestamp */}
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
        <p className="text-[12px] text-[#a4a7ae]">{formatTimeAgo(data.lastUpdatedAt)}</p>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-[#e9eaeb] shadow-xs">
          <p className="text-[15px] font-semibold text-[#181d27]">Could not load insights</p>
          <p className="text-[13px] text-[#717680]">{error}</p>
          <Button variant="secondary" onClick={() => fetchData(range)}>Try again</Button>
        </div>
      )}

      {!error && (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-4 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
            {/* Monthly earnings */}
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

            {/* Payment rate */}
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

            {/* Pending invoices */}
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
                {summary ? `$${summary.pendingInvoicesTotal.toLocaleString()} outstanding` : '—'}
              </p>
            </Link>

            {/* Active clients */}
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

          {/* Two-column: monthly progress + AI insights */}
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">

            {/* Monthly progress card */}
            <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
              <div className="flex items-center justify-between border-b border-[#f5f5f5] px-5 py-4">
                <div>
                  <h2 className="text-[16px] font-semibold text-[#181d27]">Monthly progress</h2>
                  <p className="mt-0.5 text-[13px] text-[#717680]">Earnings toward your monthly target.</p>
                </div>
                <Sparkline values={sparkValues} />
              </div>

              <div className="flex flex-1 flex-col items-center justify-center px-6 py-6 gap-4">
                {/* Ring chart */}
                <div className="relative flex items-center justify-center">
                  <RingChart value={monthlyEarnings} total={monthlyTarget} />
                  <div className="absolute flex flex-col items-center">
                    <p className="text-[20px] font-bold tracking-[-0.03em] text-[#181d27] leading-none">
                      ${monthlyEarnings.toLocaleString()}
                    </p>
                    <p className="mt-1 text-[11px] text-[#a4a7ae]">Earned</p>
                  </div>
                </div>

                {/* Left/right stats below ring */}
                <div className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
                  <div className="flex flex-col items-center bg-white px-4 py-3">
                    <p className="text-[11px] text-[#a4a7ae]">{hasExceededTarget ? 'Exceeded by' : 'Remaining'}</p>
                    <p className={`mt-0.5 text-[16px] font-bold tracking-[-0.03em] ${hasExceededTarget ? 'text-[#12b76a]' : 'text-[#181d27]'}`}>
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

              {/* Footer: trend + set target */}
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

            {/* AI Insights card */}
            <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
              <div className="flex items-center gap-2.5 border-b border-[#f5f5f5] px-5 py-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eff4ff]">
                  <Sparkle className="h-4 w-4 text-[#2563eb]" weight="fill" />
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#181d27]">AI Insights</h2>
                  <p className="mt-0.5 text-[13px] text-[#717680]">Generated from your account activity.</p>
                </div>
              </div>

              {isEmpty ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                  <p className="text-[14px] font-semibold text-[#414651]">No activity yet</p>
                  <p className="mt-1 text-[13px] text-[#a4a7ae]">
                    Create an invoice, payment link, or project to start receiving tailored insights.
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
                    const dotColor =
                      insight.trend === 'up' ? 'bg-[#12b76a]' :
                      insight.trend === 'down' ? 'bg-[#f04438]' :
                      'bg-[#2563eb]';
                    const dotBg =
                      insight.trend === 'up' ? 'bg-[#ecfdf3]' :
                      insight.trend === 'down' ? 'bg-[#fff1f0]' :
                      'bg-[#eff4ff]';
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
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#d5d7da] group-hover:text-[#a4a7ae] transition-colors" />
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
          </div>

          {/* Workstream mini-cards */}
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
                  { value: `$${(summary?.receivedAmount ?? 0).toLocaleString()}`, title: 'Received', helper: 'In this period', href: '/wallet', Icon: Coins },
                  { value: String(summary?.withdrawalsPending ?? 0), title: 'Withdrawals', helper: 'Pending', href: '/offramp', Icon: Bank },
                  { value: String(summary?.transactionsCount ?? 0), title: 'Transactions', helper: 'In this period', href: '/wallet', Icon: ArrowsLeftRight },
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
