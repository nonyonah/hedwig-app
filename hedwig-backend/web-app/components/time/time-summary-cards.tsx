'use client';

import { ClockCountdown, CurrencyDollar, UsersThree, FolderSimple } from '@/components/ui/lucide-icons';

interface TimeSummary {
  hoursToday: number;
  hoursThisWeek: number;
  hoursThisMonth: number;
  billableAmount: number;
  topClient: { id: string; name: string; hours: number } | null;
  topProject: { id: string; name: string; hours: number } | null;
}

function fmtHours(h: number): string {
  if (h <= 0) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins === 0) return `${whole}h`;
  return `${whole}h ${mins}m`;
}

export function TimeSummaryCards({ summary }: { summary: TimeSummary }) {
  const items = [
    { id: 'today', title: 'Today', value: fmtHours(summary.hoursToday), icon: ClockCountdown },
    { id: 'week', title: 'This week', value: fmtHours(summary.hoursThisWeek), icon: ClockCountdown },
    { id: 'month', title: 'This month', value: fmtHours(summary.hoursThisMonth), icon: ClockCountdown },
    { id: 'billable', title: 'Billable', value: `$${summary.billableAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: CurrencyDollar },
    { id: 'top-client', title: 'Top client', value: summary.topClient?.name || '—', icon: UsersThree },
    { id: 'top-project', title: 'Top project', value: summary.topProject?.name || '—', icon: FolderSimple },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.id}
          className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs px-4 py-3.5"
        >
          <div className="flex items-center gap-2">
            <item.icon className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" weight="bold" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
              {item.title}
            </span>
          </div>
          <p className="mt-2 text-[18px] font-bold tracking-tight text-[var(--color-foreground)] truncate">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
