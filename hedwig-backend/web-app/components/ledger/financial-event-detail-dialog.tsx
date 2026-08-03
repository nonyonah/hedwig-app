'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';
import { FinancialEventDetail } from '@/components/ledger/financial-event-detail';
import { hedwigApi } from '@/lib/api/client';
import type { LedgerEntry, LedgerFinancialEvent } from '@/lib/types/revenue';

/**
 * Fetching shell around `FinancialEventDetail` — open this from any ledger
 * row, timeline item, search result, or notification.
 */
export function FinancialEventDetailDialog({
  entry,
  open,
  onOpenChange,
  accessToken,
}: {
  entry: LedgerEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string | null;
}) {
  const [events, setEvents] = useState<LedgerFinancialEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entry) return;
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
    return () => { cancelled = true; };
  }, [open, entry, accessToken]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Financial event</DialogTitle>
        </DialogHeader>
        <DialogBody className="pb-6">
          {entry ? (
            <FinancialEventDetail entry={entry} events={events} loading={loading} error={error} />
          ) : (
            <div className="flex min-h-[120px] items-center justify-center" />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
