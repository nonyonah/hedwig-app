'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Repeat,
} from '@/components/ui/lucide-icons';
import type { RecurringInvoice, Client } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import { useToast } from '@/components/providers/toast-provider';
import { useCurrency } from '@/components/providers/currency-provider';
import { formatCompactCurrency, formatShortDate } from '@/lib/utils';
import { CreateRecurringInvoiceDialog } from './create-recurring-invoice-dialog';

const FREQ_LABELS: Record<string, { label: string; short: string; color: string }> = {
  weekly:    { label: 'Weekly',    short: 'Wk',  color: 'bg-[#f0fdf4] text-[#717680]' },
  biweekly:  { label: 'Bi-weekly', short: 'Bwk', color: 'bg-[#f0fdf4] text-[#717680]' },
  monthly:   { label: 'Monthly',   short: 'Mo',  color: 'bg-[#eff4ff] text-[#717680]' },
  quarterly: { label: 'Quarterly', short: 'Qtr', color: 'bg-[#fdf4ff] text-[#717680]' },
  annual:    { label: 'Annual',    short: 'Yr',  color: 'bg-[#fff7ed] text-[#717680]' },
};

const STATUS_STYLES: Record<RecurringInvoice['status'], { dot: string; label: string; bg: string; text: string }> = {
  active:    { dot: 'bg-[#12b76a]', label: 'Active',    bg: 'bg-[#ecfdf3]', text: 'text-[#717680]' },
  paused:    { dot: 'bg-[#f79009]', label: 'Paused',    bg: 'bg-[#fffaeb]', text: 'text-[#717680]' },
  cancelled: { dot: 'bg-[#a4a7ae]', label: 'Cancelled', bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
};

function FreqBadge({ frequency }: { frequency: string }) {
  const f = FREQ_LABELS[frequency] ?? { label: frequency, short: frequency, color: 'bg-[#f2f4f7] text-[#717680]' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${f.color}`}>
      <Repeat className="h-3 w-3" />
      {f.label}
    </span>
  );
}

function StatusPill({ status }: { status: RecurringInvoice['status'] }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

type Props = {
  initialItems: RecurringInvoice[];
  clients: Client[];
  accessToken: string | null;
  /** When true, renders without the outer card wrapper (for embedding inside a tab) */
  asTabContent?: boolean;
  statusFilter?: 'all' | 'active' | 'paused';
  onRowClick?: (item: RecurringInvoice) => void;
};

export function RecurringInvoicesSection({ initialItems, clients, accessToken, asTabContent, statusFilter = 'all', onRowClick }: Props) {
  const { currency } = useCurrency();
  const { toast } = useToast();
  const router = useRouter();

  const [items, setItems] = useState(initialItems);
  const [showCreate, setShowCreate] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleStatus = async (id: string, status: 'active' | 'paused' | 'cancelled') => {
    if (!accessToken) return;
    setLoadingId(id);
    try {
      const updated = await hedwigApi.setRecurringInvoiceStatus(id, status, { accessToken, disableMockFallback: true });
      setItems((cur) => cur.map((r) => (r.id === id ? updated : r)));
      toast({ type: 'success', title: status === 'active' ? 'Resumed' : status === 'paused' ? 'Paused' : 'Cancelled' });
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed', message: e?.message });
    } finally {
      setLoadingId(null);
    }
  };

  const handleTrigger = async (id: string) => {
    if (!accessToken) return;
    setLoadingId(id);
    try {
      await hedwigApi.triggerRecurringInvoice(id, { accessToken, disableMockFallback: true });
      toast({ type: 'success', title: 'Invoice generated', message: 'A new invoice was created from this template.' });
      router.refresh();
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed', message: e?.message });
    } finally {
      setLoadingId(null);
    }
  };

  const rowActions = (r: RecurringInvoice) => {
    const actions = [];
    if (r.status === 'active') {
      actions.push({ label: 'Generate now', onClick: () => handleTrigger(r.id) });
      actions.push({ label: 'Pause', onClick: () => handleStatus(r.id, 'paused') });
    } else if (r.status === 'paused') {
      actions.push({ label: 'Resume', onClick: () => handleStatus(r.id, 'active') });
    }
    if (r.status !== 'cancelled') {
      actions.push({ label: 'Cancel', onClick: () => handleStatus(r.id, 'cancelled'), destructive: true });
    }
    return actions;
  };

  const createDialog = (
    <CreateRecurringInvoiceDialog
      open={showCreate}
      clients={clients}
      accessToken={accessToken}
      onOpenChange={setShowCreate}
      onCreated={(r) => {
        setItems((cur) => [r, ...cur]);
        setShowCreate(false);
        router.refresh();
      }}
    />
  );

  if (items.length === 0 && !showCreate) {
    const emptyContent = (
      <>
        <div className="flex items-center justify-between border-b border-[#e9eaeb] px-5 py-4">
          <div>
            <p className="text-[14px] font-semibold text-[#181d27]">Recurring invoices</p>
            <p className="mt-0.5 text-[12px] text-[#a4a7ae]">Auto-generate invoices on a fixed schedule</p>
          </div>
          <Button variant="outline" onClick={() => setShowCreate(true)}>
            <Repeat className="h-4 w-4" /> Set up recurring
          </Button>
        </div>
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f2f4f7]">
            <Repeat className="h-6 w-6 text-[#d0d5dd]" weight="duotone" />
          </div>
          <p className="text-[13px] text-[#a4a7ae] max-w-[280px]">
            No recurring invoices yet. Set one up to auto-bill clients on a fixed schedule.
          </p>
        </div>
        {createDialog}
      </>
    );

    if (asTabContent) return emptyContent;
    return (
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        {emptyContent}
      </div>
    );
  }

  const innerContent = (
    <>
      {/* Header — only shown when not embedded as a tab */}
      {!asTabContent && (
        <div className="flex items-center justify-between border-b border-[#e9eaeb] px-5 py-4">
          <div>
            <p className="text-[14px] font-semibold text-[#181d27]">Recurring invoices</p>
            <p className="mt-0.5 text-[12px] text-[#a4a7ae]">
              {items.filter((r) => r.status === 'active').length} active template{items.filter((r) => r.status === 'active').length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button variant="outline" onClick={() => setShowCreate(true)}>
            <Repeat className="h-4 w-4" /> New recurring
          </Button>
        </div>
      )}

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_120px_100px_110px_100px_44px] gap-3 border-b border-[#f2f4f7] px-5 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Title</span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Frequency</span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Status</span>
        <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Amount</span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Next date</span>
        <span />
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#f9fafb]">
        {items.filter((r) => {
          if (statusFilter === 'all') return true;
          if (statusFilter === 'active') return r.status === 'active';
          if (statusFilter === 'paused') return r.status === 'paused';
          return true;
        }).map((r) => {
          const isLoading = loadingId === r.id;
          return (
            <div
              key={r.id}
              onClick={() => onRowClick?.(r)}
              className={`grid grid-cols-[1fr_120px_100px_110px_100px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fafafa] ${isLoading ? 'opacity-50' : ''} ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {/* Template info */}
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[#181d27]">
                  {r.title || 'Recurring invoice'}
                </p>
                <p className="text-[11px] text-[#a4a7ae] truncate">
                  {r.clientName || r.clientEmail || 'No client assigned'}
                  {r.generatedCount > 0 && (
                    <span className="ml-2 text-[#d0d5dd]">· {r.generatedCount} generated</span>
                  )}
                </p>
              </div>

              {/* Frequency */}
              <FreqBadge frequency={r.frequency} />

              {/* Status */}
              <StatusPill status={r.status} />

              {/* Amount */}
              <p className="text-right text-[13px] font-semibold tabular-nums text-[#181d27]">
                {formatCompactCurrency(r.amountUsd, currency)}
              </p>

              {/* Next due date */}
              <p className="text-[12px] text-[#717680]">
                {r.status === 'cancelled' ? '—' : formatShortDate(r.nextDueDate)}
              </p>

              {/* Actions */}
              <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                <RowActionsMenu items={rowActions(r)} />
              </div>
            </div>
          );
        })}
      </div>

      {createDialog}
    </>
  );

  if (asTabContent) return innerContent;

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
      {innerContent}
    </div>
  );
}
