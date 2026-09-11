'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, ClockCountdown, CurrencyDollar, MagnifyingGlass } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { hedwigApi } from '@/lib/api/client';
import { useToast } from '@/components/providers/toast-provider';
import { useCurrency } from '@/components/providers/currency-provider';

type Suggestion = {
  transactionId: string;
  invoiceId: string;
  score: number;
  reasons: string[];
  transactionLabel?: string;
  invoiceLabel?: string;
  amount?: number;
};

type UnpaidInvoice = {
  id: string;
  title: string;
  amount: number | string;
  currency?: string;
  status: string;
  client_name?: string | null;
  due_date?: string | null;
};

/**
 * Matches + payables hub for the Insights page: run auto-match across
 * imported bank debits, approve suggestions one by one (or all ≥90%),
 * scan the inbox for new receipts, and pay unpaid invoices.
 */
export function MatchesPayablesSection({ accessToken }: { accessToken: string | null }) {
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [unpaid, setUnpaid] = useState<UnpaidInvoice[]>([]);
  const [unpaidTotal, setUnpaidTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  const opts = { accessToken: accessToken ?? '', disableMockFallback: true };

  const refreshUnpaid = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await hedwigApi.unpaidInvoices(opts);
      setUnpaid((res.invoices ?? []) as UnpaidInvoice[]);
      setUnpaidTotal(Number(res.total ?? 0));
    } catch {
      // keep previous list on failure
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    void refreshUnpaid();
  }, [refreshUnpaid]);

  const runAutoMatch = async (apply: boolean) => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await hedwigApi.autoMatchImportedTransactions({ minScore: 0.5, apply }, opts);
      setSuggestions((res.suggestions ?? []) as Suggestion[]);
      if (apply) {
        toast({
          type: 'success',
          title: 'Auto-match complete',
          message: `${res.applied ?? 0} high-confidence matches applied.`,
        });
      } else if ((res.suggestions ?? []).length === 0) {
        toast({ type: 'default', title: 'No matches found', message: 'Nothing scored above 50%.' });
      }
    } catch (err: unknown) {
      toast({
        type: 'error',
        title: 'Auto-match failed',
        message: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const applyOne = async (s: Suggestion) => {
    if (!accessToken) return;
    setApplying(s.transactionId);
    try {
      await hedwigApi.matchImportedTransaction(
        s.transactionId,
        { matchedInvoiceId: s.invoiceId, matchMethod: 'manual', status: 'matched' },
        opts
      );
      setSuggestions((prev) => prev.filter((x) => x.transactionId !== s.transactionId));
      toast({ type: 'success', title: 'Matched', message: 'Transaction linked to invoice.' });
    } catch (err: unknown) {
      toast({
        type: 'error',
        title: 'Match failed',
        message: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setApplying(null);
    }
  };

  const runInboxScan = async () => {
    if (!accessToken) return;
    setScanning(true);
    try {
      const res = await hedwigApi.inboxScan({ applyMatches: false }, opts);
      const found = (res.suggestions ?? []) as Suggestion[];
      setSuggestions(found);
      toast({
        type: 'success',
        title: 'Inbox scanned',
        message: `${res.imported ?? 0} receipt${res.imported === 1 ? '' : 's'} imported, ${found.length} match suggestion${found.length === 1 ? '' : 's'}.`,
      });
    } catch (err: unknown) {
      toast({
        type: 'error',
        title: 'Inbox scan failed',
        message: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setScanning(false);
    }
  };

  const payInvoice = async (id: string) => {
    if (!accessToken) return;
    setPaying(id);
    try {
      await hedwigApi.payInvoice(id, {}, opts);
      setUnpaid((prev) => prev.filter((i) => i.id !== id));
      toast({ type: 'success', title: 'Invoice paid', message: 'Marked as paid.' });
    } catch (err: unknown) {
      toast({
        type: 'error',
        title: 'Payment failed',
        message: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setPaying(null);
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-surface-secondary)] px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Matches & payables</h2>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">
            Match bank imports to invoices, scan your inbox, and clear unpaid bills.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={runInboxScan} disabled={scanning || loading}>
            <MagnifyingGlass className="h-3.5 w-3.5" weight="bold" />
            {scanning ? 'Scanning…' : 'Scan inbox'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => runAutoMatch(false)} disabled={loading || scanning}>
            {loading ? 'Matching…' : 'Review matches'}
          </Button>
          <Button size="sm" onClick={() => runAutoMatch(true)} disabled={loading || scanning}>
            Auto-match
          </Button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="border-b border-[var(--color-surface-secondary)]">
          <p className="px-5 pb-1 pt-4 text-[11px] font-medium text-[var(--color-text-tertiary)]">
            Suggested matches
          </p>
          <div className="divide-y divide-[var(--color-border)]">
            {suggestions.map((s) => (
              <div key={s.transactionId} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)]">
                    {s.transactionLabel ?? s.transactionId}
                  </p>
                  <p className="truncate text-[12px] text-[var(--color-text-tertiary)]">
                    → {s.invoiceLabel ?? s.invoiceId} · {(s.score * 100).toFixed(0)}% · {s.reasons.join(', ')}
                    {s.amount != null ? ` · ${formatAmount(Number(s.amount), { compact: true })}` : ''}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={applying === s.transactionId}
                  onClick={() => applyOne(s)}
                >
                  {applying === s.transactionId ? 'Applying…' : 'Apply'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <p className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
          Unpaid invoices{unpaid.length > 0 ? ` · ${formatAmount(unpaidTotal, { compact: true })} outstanding` : ''}
        </p>
      </div>
      {unpaid.length === 0 ? (
        <div className="flex items-center gap-2.5 px-5 pb-5 pt-1 text-[13px] text-[var(--color-text-tertiary)]">
          <CheckCircle className="h-4 w-4 text-[var(--color-success)]" weight="bold" />
          Nothing unpaid. You&apos;re all caught up.
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-border)] pb-2">
          {unpaid.slice(0, 8).map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 px-5 py-3">
              <ClockCountdownIcon />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)]">{inv.title}</p>
                <p className="truncate text-[12px] text-[var(--color-text-tertiary)]">
                  {inv.client_name ?? 'No client'}
                  {inv.due_date ? ` · due ${inv.due_date}` : ''} · {inv.status.toLowerCase()}
                </p>
              </div>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                {formatAmount(Number(inv.amount) || 0, { compact: true })}
              </span>
              <Button variant="outline" size="sm" disabled={paying === inv.id} onClick={() => payInvoice(inv.id)}>
                <CurrencyDollar className="h-3.5 w-3.5" weight="bold" />
                {paying === inv.id ? 'Paying…' : 'Pay'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ClockCountdownIcon() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-warning-soft)] text-[12px] font-bold text-[var(--color-warning)]">
      !
    </span>
  );
}
