'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarBlank, CheckCircle, Coins, Receipt, Warning } from '@/components/ui/lucide-icons';
import { Loader } from '@/components/ui/loader';
import { hedwigApi } from '@/lib/api/client';
import { useCurrency } from '@/components/providers/currency-provider';
import { formatShortDate } from '@/lib/utils';
import type { UpcomingObligation, UpcomingObligations as UpcomingObligationsData } from '@/lib/types/revenue';

/**
 * Upcoming & Obligations — the forward layer of the Revenue page.
 * Expected payments (dated invoice/payment-link rows), overdue to chase,
 * quarterly tax set-aside, and detected subscriptions.
 */
export function UpcomingObligations({ accessToken }: { accessToken: string | null }) {
  const { formatAmount } = useCurrency();
  const [data, setData] = useState<UpcomingObligationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const res = await hedwigApi.upcoming({ accessToken });
      // Payment links are disabled — only open invoices count as expected payments.
      setData({ ...res, upcoming: (res.upcoming ?? []).filter((o) => o.type !== 'payment_link') });
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const overdueTotal = (data?.overdue ?? []).reduce((sum, o) => sum + (Number(o.amountUsd) || 0), 0);
  const showTax = (data?.tax.estimatedSetAside ?? 0) > 0;
  const isEmpty = !data
    || (data.upcoming.length === 0 && data.overdue.length === 0 && data.subscriptions.items.length === 0 && !showTax);

  return (
    <article className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs">
      <div className="flex items-center justify-between border-b border-[var(--color-surface-secondary)] px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Upcoming &amp; obligations</h2>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">Expected payments, tax set-aside, and recurring costs.</p>
        </div>
        {data && (data.upcoming.length > 0 || data.overdue.length > 0) && (
          <Link
            href="/payments"
            className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[var(--color-accent)] hover:text-[var(--color-primary-dark)]"
          >
            View payments <ArrowRight className="h-3.5 w-3.5" weight="bold" />
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader size="md" color="accent" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Could not load upcoming obligations</p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-[var(--color-border-light)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-accent)] transition hover:bg-[var(--color-surface-tertiary)]"
          >
            Try again
          </button>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <CheckCircle className="h-5 w-5 text-[var(--color-success)]" weight="bold" />
          <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">You&apos;re all caught up</p>
          <p className="max-w-xs text-[12px] text-[var(--color-text-muted)]">
            Expected payments, tax set-aside, and recurring costs will appear here.
          </p>
        </div>
      ) : (
        <div>
          {/* Expected payments */}
          {data!.upcoming.length > 0 && (
            <div className="border-b border-[var(--color-surface-secondary)] px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                  Expected payments ({data!.upcoming.length})
                </p>
                <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                  {formatAmount(data!.upcoming.reduce((s, o) => s + (Number(o.amountUsd) || 0), 0))}
                </p>
              </div>
              <div className="space-y-1">
                {data!.upcoming.map((ob) => <ObligationRow key={ob.id} ob={ob} formatAmount={formatAmount} />)}
              </div>
            </div>
          )}

          {/* Overdue */}
          {data!.overdue.length > 0 && (
            <div className="flex items-center justify-between border-b border-[var(--color-surface-secondary)] bg-[var(--color-danger-soft)]/40 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Warning className="h-4 w-4 shrink-0 text-[var(--color-danger)]" weight="bold" />
                <div>
                  <p className="text-[13px] font-semibold text-[var(--color-danger)]">Overdue</p>
                  <p className="text-[12px] text-[var(--color-text-muted)]">
                    {data!.overdue.length} invoice{data!.overdue.length !== 1 ? 's' : ''} past due
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-[15px] font-bold tracking-[-0.01em] text-[var(--color-danger)]">
                  {formatAmount(overdueTotal)}
                </span>
                <Link
                  href="/payments"
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-danger)] hover:opacity-80"
                >
                  Follow up <ArrowRight className="h-3.5 w-3.5" weight="bold" />
                </Link>
              </div>
            </div>
          )}

          {/* Tax set-aside */}
          {showTax && (
            <div className="flex items-center justify-between border-b border-[var(--color-surface-secondary)] px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Coins className="h-4 w-4 shrink-0 text-[var(--color-accent)]" weight="bold" />
                <div>
                  <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Tax set-aside</p>
                  <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">
                    {data!.tax.nextDeadline ? formatShortDate(data!.tax.nextDeadline) : 'Next quarter'} · {data!.tax.daysUntil} day{data!.tax.daysUntil !== 1 ? 's' : ''} to deadline
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-[15px] font-bold tracking-[-0.01em] text-[var(--color-text-primary)]">
                {formatAmount(data!.tax.estimatedSetAside)}
              </span>
            </div>
          )}

          {/* Subscriptions */}
          {data!.subscriptions.items.length > 0 && (
            <div className="px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">Subscriptions</p>
                <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                  {formatAmount(data!.subscriptions.monthlyTotal)}/mo
                </p>
              </div>
              <div className="space-y-1">
                {data!.subscriptions.items.map((sub) => (
                  <div key={`${sub.label}-${sub.amountUsd}`} className="flex items-center justify-between rounded-xl px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Receipt className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
                      <p className="truncate text-[13px] font-medium capitalize text-[var(--color-text-primary)]">{sub.label}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-muted)]">
                        {sub.monthlyCount}mo
                      </span>
                      <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                        {formatAmount(sub.amountUsd)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ObligationRow({
  ob,
  formatAmount,
}: {
  ob: UpcomingObligation;
  formatAmount: (usdAmount: number, options?: { compact?: boolean }) => string;
}) {
  const dueLabel = ob.daysLeft === 0
    ? 'Due today'
    : `${ob.daysLeft} day${ob.daysLeft !== 1 ? 's' : ''} left`;
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors hover:bg-[var(--color-background)]"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <CalendarBlank className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{ob.title}</p>
          <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">
            {formatShortDate(ob.dueDate)} · {dueLabel}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-[13px] font-semibold text-[var(--color-text-primary)]">
        {formatAmount(Number(ob.amountUsd) || 0)}
      </span>
    </button>
  );
}
