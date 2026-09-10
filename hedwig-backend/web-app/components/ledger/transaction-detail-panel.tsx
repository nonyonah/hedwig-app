'use client';

import { useEffect, useState } from 'react';
import { X } from '@/components/ui/lucide-icons';
import { ClientPortal } from '@/components/ui/client-portal';
import { FinancialEventDetail } from '@/components/ledger/financial-event-detail';
import { hedwigApi } from '@/lib/api/client';
import type { LedgerEntry, LedgerFinancialEvent } from '@/lib/types/revenue';

/**
 * Right slide-in detail panel for a transaction — same shell pattern as the
 * send-money modal. Mount conditionally from the Transactions table.
 */
export function TransactionDetailPanel({
  entry,
  accessToken,
  onClose,
}: {
  entry: LedgerEntry;
  accessToken: string | null;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<LedgerFinancialEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvents([]);
    hedwigApi
      .ledgerEvents(entry.referenceId, { accessToken })
      .then((payload: any) => {
        if (cancelled) return;
        setEvents((payload?.data?.events as LedgerFinancialEvent[]) || []);
      })
      .catch(() => {
        if (!cancelled) setError('Try again in a moment.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry, accessToken]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <ClientPortal>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 animate-in bg-black/30 fade-in-0 backdrop-blur-sm duration-200"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full max-w-[480px] animate-in flex-col overflow-hidden rounded-l-xl bg-[var(--color-surface)] shadow-2xl duration-300 ease-out slide-in-from-right-full">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <p className="text-[15px] font-bold text-[var(--color-foreground)]">Transaction details</p>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
              {entry.description || 'Transaction'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <FinancialEventDetail entry={entry} events={events} loading={loading} error={error} />
        </div>
      </div>
    </ClientPortal>
  );
}
