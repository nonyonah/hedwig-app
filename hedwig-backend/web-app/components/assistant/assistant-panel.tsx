'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  CurrencyDollar,
  Info,
  Warning,
  WarningCircle,
} from '@/components/ui/lucide-icons';
import { useCurrency } from '@/components/providers/currency-provider';
import { cn } from '@/lib/utils';
import type {
  AssistantBrief,
  AssistantEvent,
  AssistantSuggestion,
  WeeklySummary,
} from '@/lib/types/assistant';
import { SuggestionCard } from './suggestion-card';
import { ApprovalModal } from './approval-modal';

type Tab = 'today' | 'week' | 'attention' | 'suggestions';

// ── Shared primitives ─────────────────────────────────────────────────────────

const SEV_ICON = { urgent: WarningCircle, warning: Warning, info: Info };
const SEV_COLOR = { urgent: 'text-[#b42318]', warning: 'text-[#92400e]', info: 'text-[#2563eb]' };
const SEV_BG   = { urgent: 'bg-[#fef3f2]',  warning: 'bg-[#fffaeb]',   info: 'bg-[#eff4ff]'  };

function EventRow({ event }: { event: AssistantEvent }) {
  const Icon = SEV_ICON[event.severity];
  const { formatUsdText } = useCurrency();
  const inner = (
    <div className={cn('flex items-start gap-3 rounded-xl px-3 py-2.5', SEV_BG[event.severity])}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', SEV_COLOR[event.severity])} weight="fill" />
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] font-semibold', SEV_COLOR[event.severity])}>{event.title}</p>
        {event.body && <p className="mt-0.5 text-[12px] text-[#717680]">{formatUsdText(event.body)}</p>}
      </div>
      {event.href && <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c1c5cd]" />}
    </div>
  );
  return event.href ? <Link href={event.href}>{inner}</Link> : inner;
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 rounded-xl bg-[#f2f4f7]" />
      ))}
    </div>
  );
}

// ── Today tab ─────────────────────────────────────────────────────────────────

function TodayTab({ brief, loading }: { brief: AssistantBrief | null; loading: boolean }) {
  const { formatAmount, formatUsdText } = useCurrency();
  if (loading || !brief) return <Skeleton />;
  const allClear = brief.events.length === 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#f9fafb] px-4 py-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Daily brief</span>
        </div>
        <p className="text-[13px] leading-relaxed text-[#414651]">{formatUsdText(brief.summary)}</p>
        {brief.highlights.map((h, i) => (
          <p key={i} className="mt-1 text-[12px] text-[#717680]">· {formatUsdText(h)}</p>
        ))}
      </div>

      {/* Financial trend */}
      {brief.financialTrend && (
        <div className={cn(
          'flex items-center gap-2 rounded-xl px-3 py-2',
          brief.financialTrend.direction === 'up' ? 'bg-[#ecfdf3]' :
          brief.financialTrend.direction === 'down' ? 'bg-[#fef3f2]' : 'bg-[#f9fafb]'
        )}>
          <span className="text-[18px]">
            {brief.financialTrend.direction === 'up' ? '↑' : brief.financialTrend.direction === 'down' ? '↓' : '→'}
          </span>
          <p className="text-[12px] font-medium text-[#414651]">{formatUsdText(brief.financialTrend.description)}</p>
        </div>
      )}

      {/* Metrics strip */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Unpaid',    value: brief.metrics.unpaidCount,    sub: formatAmount(brief.metrics.unpaidAmountUsd, { compact: true }),  warn: brief.metrics.unpaidCount > 0 },
          { label: 'Overdue',   value: brief.metrics.overdueCount,   sub: formatAmount(brief.metrics.overdueAmountUsd, { compact: true }), warn: brief.metrics.overdueCount > 0 },
          { label: 'Deadlines', value: brief.metrics.upcomingDeadlines, sub: 'next 14 days', warn: brief.metrics.upcomingDeadlines > 0 },
        ].map(({ label, value, sub, warn }) => (
          <div key={label} className={cn('rounded-xl px-3 py-2.5 text-center', warn && value > 0 ? 'bg-[#fffaeb]' : 'bg-[#f9fafb]')}>
            <p className={cn('text-[18px] font-bold tracking-[-0.03em]', warn && value > 0 ? 'text-[#92400e]' : 'text-[#181d27]')}>{value}</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">{label}</p>
            <p className="mt-0.5 text-[10px] text-[#c1c5cd]">{sub}</p>
          </div>
        ))}
      </div>

      {/* Events / all clear */}
      {allClear ? (
        <div className="flex items-center gap-2 rounded-xl bg-[#ecfdf3] px-4 py-3">
          <CheckCircle className="h-4 w-4 text-[#12b76a]" weight="fill" />
          <p className="text-[13px] font-semibold text-[#027a48]">All clear — nothing needs attention today</p>
        </div>
      ) : (
        <div className="space-y-2">
          {brief.events.map((event) => <EventRow key={event.id} event={event} />)}
        </div>
      )}

      {/* Tax hint */}
      {brief.taxHint && (
        <div className="flex items-start gap-2 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#92400e]" weight="fill" />
          <p className="text-[12px] text-[#92400e]">{formatUsdText(brief.taxHint)}</p>
        </div>
      )}

      {/* Project alerts */}
      {(brief.projectAlerts ?? []).length > 0 && (
        <div className="space-y-1.5">
          {brief.projectAlerts!.map((a, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-[#f9fafb] px-3 py-2">
              <Warning className="h-3.5 w-3.5 shrink-0 text-[#a4a7ae]" />
              <p className="text-[12px] text-[#717680]">{formatUsdText(a)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Week tab ──────────────────────────────────────────────────────────────────

function WeekTab({ weekly, loading }: { weekly: WeeklySummary | null; loading: boolean }) {
  const { formatAmount, formatUsdText } = useCurrency();
  if (loading || !weekly) return <Skeleton />;

  const changeColor = weekly.revenueChangePct >= 0 ? 'text-[#027a48]' : 'text-[#b42318]';
  const changePrefix = weekly.revenueChangePct >= 0 ? '+' : '';

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">{weekly.weekLabel}</p>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Revenue',       value: formatAmount(weekly.revenueUsd, { compact: true }), icon: CurrencyDollar, highlight: true,
            sub: weekly.previousWeekRevenueUsd > 0 ? <span className={changeColor}>{changePrefix}{weekly.revenueChangePct}% vs last week</span> : null },
          { label: 'Paid invoices', value: weekly.paidInvoiceCount, icon: CheckCircle, highlight: false, sub: null },
          { label: 'New invoices',  value: weekly.newInvoiceCount,  icon: ArrowRight, highlight: false, sub: null },
          { label: 'Overdue',       value: weekly.overdueCount, icon: WarningCircle,
            highlight: weekly.overdueCount > 0,
            sub: weekly.overdueCount > 0 ? <span className="text-[#b42318]">{formatAmount(weekly.overdueAmountUsd, { compact: true })}</span> : null },
        ].map(({ label, value, icon: Icon, highlight, sub }) => (
          <div key={label} className={cn('rounded-xl px-3 py-3', highlight ? 'bg-[#eff4ff]' : 'bg-[#f9fafb]')}>
            <Icon className={cn('h-3.5 w-3.5 mb-1', highlight ? 'text-[#2563eb]' : 'text-[#a4a7ae]')} weight="fill" />
            <p className={cn('text-[20px] font-bold tracking-[-0.03em]', highlight ? 'text-[#2563eb]' : 'text-[#181d27]')}>{value}</p>
            <p className="text-[11px] text-[#a4a7ae]">{label}</p>
            {sub && <p className="mt-0.5 text-[10px] font-semibold">{sub}</p>}
          </div>
        ))}
      </div>

      {weekly.topClients.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Top clients</p>
          <div className="space-y-1.5">
            {weekly.topClients.map((c) => (
              <div key={c.name} className="flex items-center justify-between rounded-lg bg-[#f9fafb] px-3 py-2">
                <p className="text-[13px] font-medium text-[#414651]">{c.name}</p>
                <p className="text-[13px] font-bold tabular-nums text-[#181d27]">{formatAmount(c.amountUsd, { compact: true })}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-[#f9fafb] px-4 py-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Weekly insight</span>
        </div>
        <p className="text-[13px] leading-relaxed text-[#414651]">{formatUsdText(weekly.aiInsight)}</p>
      </div>
    </div>
  );
}

// ── Needs attention tab ───────────────────────────────────────────────────────

function AttentionTab({ brief, loading }: { brief: AssistantBrief | null; loading: boolean }) {
  if (loading || !brief) return <Skeleton />;

  const urgent  = brief.events.filter((e) => e.severity === 'urgent');
  const warning = brief.events.filter((e) => e.severity === 'warning');
  const info    = brief.events.filter((e) => e.severity === 'info');

  if (brief.events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle className="h-8 w-8 text-[#12b76a]" weight="fill" />
        <p className="text-[14px] font-semibold text-[#181d27]">Nothing needs attention</p>
        <p className="text-[12px] text-[#a4a7ae]">You're on top of everything right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {urgent.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#b42318]">Urgent</p>
          <div className="space-y-2">{urgent.map((e) => <EventRow key={e.id} event={e} />)}</div>
        </div>
      )}
      {warning.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#92400e]">Review</p>
          <div className="space-y-2">{warning.map((e) => <EventRow key={e.id} event={e} />)}</div>
        </div>
      )}
      {info.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Info</p>
          <div className="space-y-2">{info.map((e) => <EventRow key={e.id} event={e} />)}</div>
        </div>
      )}
    </div>
  );
}

// ── Suggestions tab ───────────────────────────────────────────────────────────

function SuggestionsTab({
  suggestions, loading, generating,
  onRefresh, onReview, onRemove,
}: {
  suggestions: AssistantSuggestion[];
  loading: boolean;
  generating: boolean;
  onRefresh: () => void;
  onReview: (s: AssistantSuggestion) => void;
  onRemove: (id: string) => void;
}) {
  if (loading) return <Skeleton rows={2} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
          {suggestions.length > 0 ? `${suggestions.length} active` : 'No active suggestions'}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-3 py-1 text-[11px] font-semibold text-[#414651] transition-colors hover:bg-[#f9fafb] disabled:opacity-50"
        >
          <ArrowRight className={cn('h-3 w-3 text-[#2563eb]', generating && 'animate-pulse')} weight="bold" />
          {generating ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {suggestions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Info className="h-8 w-8 text-[#c1c5cd]" weight="regular" />
          <p className="text-[13px] font-semibold text-[#414651]">No active suggestions</p>
          <p className="text-[12px] text-[#a4a7ae]">Hedwig will surface new suggestions here when something worth acting on appears.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} onReview={onReview} onQuickReject={onRemove} />
          ))}
        </div>
      )}

      <p className="text-center text-[11px] text-[#c1c5cd]">
        Approving a suggestion records your intent — no action is taken automatically.
      </p>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function AssistantPanel({ className }: { className?: string }) {
  const [tab, setTab] = useState<Tab>('today');

  const [brief, setBrief] = useState<AssistantBrief | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(true);

  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [weeklyFetched, setWeeklyFetched] = useState(false);

  const [suggestions, setSuggestions] = useState<AssistantSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsFetched, setSuggestionsFetched] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [reviewTarget, setReviewTarget] = useState<AssistantSuggestion | null>(null);

  // Fetch brief on mount
  useEffect(() => {
      fetch('/api/assistant/brief')
        .then((r) => r.json())
        .then((d) => { if (d.success) setBrief(d.data); })
      .catch(() => {})
      .finally(() => setLoadingBrief(false));
  }, []);

  // Lazy-fetch weekly
  useEffect(() => {
    if (tab === 'week' && !weeklyFetched) {
      setLoadingWeekly(true);
      setWeeklyFetched(true);
      fetch('/api/assistant/weekly')
        .then((r) => r.json())
        .then((d) => { if (d.success) setWeekly(d.data); })
        .catch(() => {})
        .finally(() => setLoadingWeekly(false));
    }
  }, [tab, weeklyFetched]);

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const r = await fetch('/api/assistant/suggestions?surface=assistant_panel&limit=6');
      const d = await r.json();
      if (d.success) setSuggestions(d.data.suggestions ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    if (tab === 'suggestions' && !suggestionsFetched) {
      setSuggestionsFetched(true);
      fetchSuggestions();
    }
  }, [tab, suggestionsFetched]);

  const handleRefresh = async () => {
    setGenerating(true);
    try {
      const r = await fetch('/api/assistant/suggestions', { method: 'POST' });
      const d = await r.json();
      if (d.success) await fetchSuggestions();
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const removeSuggestion = (id: string) =>
    setSuggestions((prev) => prev.filter((s) => s.id !== id));

  const urgentCount = brief?.events.filter((e) => e.severity === 'urgent').length ?? 0;

  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'today',       label: 'Today' },
    { id: 'week',        label: 'This week' },
    { id: 'attention',   label: 'Attention', badge: urgentCount || undefined },
    { id: 'suggestions', label: 'Actions', badge: suggestions.length || undefined },
  ];

  return (
    <>
      <article className={cn('flex h-full min-h-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb] lg:max-h-[620px]', className)}>
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-[#f2f4f7] px-5 py-4">
          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-[#eff4ff]">
            <Image src="/hedwig-logo.png" alt="Hedwig" width={18} height={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold text-[#181d27]">Hedwig Assistant</h2>
              <span className="rounded-full bg-[#eff4ff] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2563eb]">Beta</span>
            </div>
            <p className="text-[11px] text-[#a4a7ae]">Read-only workspace intelligence</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-[#f2f4f7]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'relative flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold transition-colors',
                tab === t.id ? 'text-[#2563eb]' : 'text-[#717680] hover:text-[#414651]',
              )}
            >
              {t.label}
              {t.badge != null && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#eff4ff] px-1 text-[10px] font-bold text-[#2563eb]">
                  {t.badge}
                </span>
              )}
              {tab === t.id && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#2563eb]" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'today'       && <TodayTab brief={brief} loading={loadingBrief} />}
          {tab === 'week'        && <WeekTab weekly={weekly} loading={loadingWeekly} />}
          {tab === 'attention'   && <AttentionTab brief={brief} loading={loadingBrief} />}
          {tab === 'suggestions' && (
            <SuggestionsTab
              suggestions={suggestions}
              loading={loadingSuggestions}
              generating={generating}
              onRefresh={handleRefresh}
              onReview={setReviewTarget}
              onRemove={removeSuggestion}
            />
          )}
        </div>
      </article>

      {/* Approval modal — outside the card so it overlays everything */}
      <ApprovalModal
        suggestion={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onApprove={removeSuggestion}
        onReject={removeSuggestion}
      />
    </>
  );
}
