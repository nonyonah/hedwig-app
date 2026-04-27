'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  CurrencyDollar,
  Info,
  Sparkle,
  Warning,
  WarningCircle,
} from '@/components/ui/lucide-icons';
import { cn, formatCompactCurrency } from '@/lib/utils';
import type { AssistantBrief, AssistantEvent, WeeklySummary } from '@/lib/types/assistant';

type Tab = 'today' | 'week' | 'attention';

const SEV_ICON = {
  urgent: WarningCircle,
  warning: Warning,
  info: Info,
};
const SEV_COLOR = {
  urgent: 'text-[#b42318]',
  warning: 'text-[#92400e]',
  info: 'text-[#2563eb]',
};
const SEV_BG = {
  urgent: 'bg-[#fef3f2]',
  warning: 'bg-[#fffaeb]',
  info: 'bg-[#eff4ff]',
};

function EventRow({ event }: { event: AssistantEvent }) {
  const Icon = SEV_ICON[event.severity];
  const content = (
    <div className={cn('flex items-start gap-3 rounded-xl px-3 py-2.5', SEV_BG[event.severity])}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', SEV_COLOR[event.severity])} weight="fill" />
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] font-semibold', SEV_COLOR[event.severity])}>{event.title}</p>
        {event.body && <p className="mt-0.5 text-[12px] text-[#717680]">{event.body}</p>}
      </div>
      {event.href && <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c1c5cd]" />}
    </div>
  );

  if (event.href) {
    return <Link href={event.href}>{content}</Link>;
  }
  return content;
}

function Skeleton() {
  return (
    <div className="space-y-2.5 animate-pulse">
      {[120, 90, 105].map((w) => (
        <div key={w} className="h-12 rounded-xl bg-[#f2f4f7]" style={{ width: `${w}%`.replace('0%', '%') }} />
      ))}
    </div>
  );
}

function TodayTab({ brief }: { brief: AssistantBrief | null; loading: boolean } & { loading: boolean }) {
  if (!brief) return <Skeleton />;
  const allClear = brief.events.length === 0;

  return (
    <div className="space-y-4">
      {/* Gemini summary */}
      <div className="rounded-xl bg-[#f9fafb] px-4 py-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Sparkle className="h-3.5 w-3.5 text-[#2563eb]" weight="fill" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Daily brief</span>
        </div>
        <p className="text-[13px] leading-relaxed text-[#414651]">{brief.summary}</p>
        {brief.highlights.map((h, i) => (
          <p key={i} className="mt-1 text-[12px] text-[#717680]">· {h}</p>
        ))}
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Unpaid', value: brief.metrics.unpaidCount, sub: formatCompactCurrency(brief.metrics.unpaidAmountUsd), warn: brief.metrics.unpaidCount > 0 },
          { label: 'Overdue', value: brief.metrics.overdueCount, sub: formatCompactCurrency(brief.metrics.overdueAmountUsd), warn: brief.metrics.overdueCount > 0 },
          { label: 'Deadlines', value: brief.metrics.upcomingDeadlines, sub: 'next 14 days', warn: brief.metrics.upcomingDeadlines > 0 },
        ].map(({ label, value, sub, warn }) => (
          <div key={label} className={cn('rounded-xl px-3 py-2.5 text-center', warn && value > 0 ? 'bg-[#fffaeb]' : 'bg-[#f9fafb]')}>
            <p className={cn('text-[18px] font-bold tracking-[-0.03em]', warn && value > 0 ? 'text-[#92400e]' : 'text-[#181d27]')}>{value}</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">{label}</p>
            <p className="mt-0.5 text-[10px] text-[#c1c5cd]">{sub}</p>
          </div>
        ))}
      </div>

      {/* Events */}
      {allClear ? (
        <div className="flex items-center gap-2 rounded-xl bg-[#ecfdf3] px-4 py-3">
          <CheckCircle className="h-4 w-4 text-[#12b76a]" weight="fill" />
          <p className="text-[13px] font-semibold text-[#027a48]">All clear — nothing needs attention today</p>
        </div>
      ) : (
        <div className="space-y-2">
          {brief.events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function WeekTab({ weekly }: { weekly: WeeklySummary | null; loading: boolean } & { loading: boolean }) {
  if (!weekly) return <Skeleton />;

  return (
    <div className="space-y-4">
      {/* Week label */}
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">{weekly.weekLabel}</p>

      {/* Revenue + key stats */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Revenue', value: formatCompactCurrency(weekly.revenueUsd), icon: CurrencyDollar, highlight: true },
          { label: 'Paid invoices', value: weekly.paidInvoiceCount, icon: CheckCircle, highlight: false },
          { label: 'New invoices', value: weekly.newInvoiceCount, icon: ArrowRight, highlight: false },
          { label: 'Overdue', value: weekly.overdueCount, icon: WarningCircle, highlight: weekly.overdueCount > 0 },
        ].map(({ label, value, icon: Icon, highlight }) => (
          <div key={label} className={cn('rounded-xl px-3 py-3', highlight ? 'bg-[#eff4ff]' : 'bg-[#f9fafb]')}>
            <Icon className={cn('h-3.5 w-3.5 mb-1', highlight ? 'text-[#2563eb]' : 'text-[#a4a7ae]')} weight="fill" />
            <p className={cn('text-[20px] font-bold tracking-[-0.03em]', highlight ? 'text-[#2563eb]' : 'text-[#181d27]')}>{value}</p>
            <p className="text-[11px] text-[#a4a7ae]">{label}</p>
          </div>
        ))}
      </div>

      {/* Top clients */}
      {weekly.topClients.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Top clients</p>
          <div className="space-y-1.5">
            {weekly.topClients.map((c) => (
              <div key={c.name} className="flex items-center justify-between rounded-lg px-3 py-2 bg-[#f9fafb]">
                <p className="text-[13px] font-medium text-[#414651]">{c.name}</p>
                <p className="text-[13px] font-bold tabular-nums text-[#181d27]">{formatCompactCurrency(c.amountUsd)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gemini insight */}
      <div className="rounded-xl bg-[#f9fafb] px-4 py-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Sparkle className="h-3.5 w-3.5 text-[#2563eb]" weight="fill" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Weekly insight</span>
        </div>
        <p className="text-[13px] leading-relaxed text-[#414651]">{weekly.aiInsight}</p>
      </div>
    </div>
  );
}

function AttentionTab({ brief }: { brief: AssistantBrief | null; loading: boolean } & { loading: boolean }) {
  if (!brief) return <Skeleton />;

  const urgent = brief.events.filter((e) => e.severity === 'urgent');
  const warning = brief.events.filter((e) => e.severity === 'warning');
  const info = brief.events.filter((e) => e.severity === 'info');

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

export function AssistantPanel() {
  const [tab, setTab] = useState<Tab>('today');
  const [brief, setBrief] = useState<AssistantBrief | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(true);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [weeklyFetched, setWeeklyFetched] = useState(false);

  useEffect(() => {
    fetch('/api/assistant/brief')
      .then((r) => r.json())
      .then((d) => { if (d.success) setBrief(d.data); })
      .catch(() => {})
      .finally(() => setLoadingBrief(false));
  }, []);

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

  const urgentCount = brief?.events.filter((e) => e.severity === 'urgent').length ?? 0;

  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'This week' },
    { id: 'attention', label: 'Needs attention', badge: urgentCount > 0 ? urgentCount : undefined },
  ];

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-[#f2f4f7] px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#eff4ff]">
          <Sparkle className="h-3.5 w-3.5 text-[#2563eb]" weight="fill" />
        </div>
        <div>
          <h2 className="text-[14px] font-semibold text-[#181d27]">Hedwig Assistant</h2>
          <p className="text-[11px] text-[#a4a7ae]">AI-powered workspace overview</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#f2f4f7]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-semibold transition-colors',
              tab === t.id ? 'text-[#2563eb]' : 'text-[#717680] hover:text-[#414651]',
            )}
          >
            {t.label}
            {t.badge != null && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#fef3f2] px-1 text-[10px] font-bold text-[#b42318]">
                {t.badge}
              </span>
            )}
            {tab === t.id && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#2563eb]" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-5">
        {tab === 'today' && <TodayTab brief={brief} loading={loadingBrief} />}
        {tab === 'week' && <WeekTab weekly={weekly} loading={loadingWeekly} />}
        {tab === 'attention' && <AttentionTab brief={brief} loading={loadingBrief} />}
      </div>
    </article>
  );
}
