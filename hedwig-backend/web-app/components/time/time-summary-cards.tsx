'use client';

import { ClockCountdown, CurrencyDollar, UsersThree, FolderSimple } from '@/components/ui/lucide-icons';
import { AttachedStatGrid, type AttachedStatCardItem } from '@/components/ui/attached-stat-cards';
import type { TimeSummary } from '@/components/time/types';

function fmtHours(h: number): string {
  if (h <= 0) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins === 0 ? `${whole}h` : `${whole}h ${mins}m`;
}

export function TimeSummaryCards({ summary }: { summary: TimeSummary }) {
  const items: AttachedStatCardItem[] = [
    { id: 'today', title: 'Today', value: fmtHours(summary.hoursToday), icon: ClockCountdown },
    { id: 'week', title: 'This week', value: fmtHours(summary.hoursThisWeek), icon: ClockCountdown },
    { id: 'month', title: 'This month', value: fmtHours(summary.hoursThisMonth), icon: ClockCountdown },
    { id: 'billable', title: 'Billable', value: `$${summary.billableAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: CurrencyDollar },
    { id: 'top-client', title: 'Top client', value: summary.topClient?.name || '—', helper: summary.topClient ? `${summary.topClient.hours.toFixed(1)}h` : undefined, icon: UsersThree },
    { id: 'top-project', title: 'Top project', value: summary.topProject?.name || '—', helper: summary.topProject ? `${summary.topProject.hours.toFixed(1)}h` : undefined, icon: FolderSimple },
  ];

  return (
    <AttachedStatGrid items={items} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" />
  );
}
