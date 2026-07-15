'use client';

import { useState } from 'react';
import { DownloadSimple, SpinnerGap } from '@/components/ui/lucide-icons';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast-provider';
import type { Client } from '@/lib/models/entities';

type ExportType = 'invoices' | 'transactions' | 'summary';

const EXPORT_TYPES: { value: ExportType; label: string; description: string }[] = [
  { value: 'invoices',     label: 'Invoices',     description: 'Invoice ID, client, amount, status, dates' },
  { value: 'transactions', label: 'Transactions', description: 'All on-chain payments and settlements' },
  { value: 'summary',      label: 'Earnings summary', description: 'Totals for the selected date range' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'paid', label: 'Paid only' },
  { value: 'sent', label: 'Sent / Unpaid' },
  { value: 'overdue', label: 'Overdue' },
];

export function ExportDialog({
  open,
  onOpenChange,
  clients = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients?: Pick<Client, 'id' | 'name'>[];
}) {
  const { toast } = useToast();

  const [exportType, setExportType] = useState<ExportType>('invoices');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!dateFrom || !dateTo) {
      toast({ type: 'warning', title: 'Date range required', message: 'Please select a start and end date.' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: exportType,
          dateFrom,
          dateTo,
          filters: {
            ...(clientId ? { clientId } : {}),
            ...(status ? { status } : {}),
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Export failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hedwig-${exportType}-${dateFrom}-to-${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ type: 'success', title: 'Export successful', message: 'Your CSV file has been downloaded.' });
      onOpenChange(false);
    } catch (err: any) {
      toast({ type: 'error', title: 'Export failed', message: err.message || 'Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="2xl">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export data</DialogTitle>
          <DialogDescription>Download a clean CSV file for accounting or record-keeping.</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {/* Type selector */}
          <div>
            <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Data type
            </label>
            <div className="space-y-2">
              {EXPORT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setExportType(t.value)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    exportType === t.value
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-background)]'
                  }`}
                >
                  <div className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-all ${
                    exportType === t.value ? 'border-[var(--color-accent)] bg-[var(--color-accent)]' : 'border-[var(--color-border-input)]'
                  }`} />
                  <div>
                    <p className={`text-[13px] font-semibold ${exportType === t.value ? 'text-[var(--color-accent)]' : 'text-[var(--color-foreground)]'}`}>
                      {t.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{t.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Date range
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[11px] text-[var(--color-text-tertiary)]">From</p>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-[var(--color-text-tertiary)]">To</p>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
                />
              </div>
            </div>
          </div>

          {/* Optional filters — shown for invoices only */}
          {exportType === 'invoices' && (
            <div>
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Filters <span className="normal-case font-normal text-[var(--color-text-placeholder)]">(optional)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {clients.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] text-[var(--color-text-tertiary)]">Client</p>
                    <select
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
                    >
                      <option value="">All clients</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <p className="mb-1 text-[11px] text-[var(--color-text-tertiary)]">Status</p>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* File info */}
          <div className="rounded-xl bg-[var(--color-background)] px-4 py-3">
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              Output: <span className="font-semibold text-[var(--color-foreground)]">hedwig-{exportType}-{dateFrom}-to-{dateTo}.csv</span>
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
              ISO dates · numeric amounts · accountant-ready headers
            </p>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={loading}>
            {loading
              ? <><SpinnerGap className="h-4 w-4 animate-spin" weight="bold" /> Generating…</>
              : <><DownloadSimple className="h-4 w-4" weight="bold" /> Download CSV</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
