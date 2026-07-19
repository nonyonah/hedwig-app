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
import { formatShortDate } from '@/lib/utils';
import { CreateRecurringInvoiceDialog } from './create-recurring-invoice-dialog';

const FREQ_LABELS: Record<string, { label: string; short: string; color: string }> = {
 weekly: { label: 'Weekly', short: 'Wk', color: 'bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]' },
 biweekly: { label: 'Bi-weekly', short: 'Bwk', color: 'bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]' },
 monthly: { label: 'Monthly', short: 'Mo', color: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]' },
 quarterly: { label: 'Quarterly', short: 'Qtr', color: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]' },
 annual: { label: 'Annual', short: 'Yr', color: 'bg-[var(--color-warning-soft)] text-[var(--color-text-tertiary)]' },
};

const STATUS_STYLES: Record<RecurringInvoice['status'], { dot: string; label: string; bg: string; text: string }> = {
 active: { dot: 'bg-[var(--color-success)]', label: 'Active', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-text-tertiary)]' },
 paused: { dot: 'bg-[var(--color-warning)]', label: 'Paused', bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-text-tertiary)]' },
 cancelled: { dot: 'bg-[var(--color-text-muted)]', label: 'Cancelled', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
};

function FreqBadge({ frequency }: { frequency: string }) {
 const f = FREQ_LABELS[frequency] ?? { label: frequency, short: frequency, color: 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)]' };
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
 const { formatAmount } = useCurrency();
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
 <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
 <div>
 <p className="text-[14px] font-semibold text-[var(--color-foreground)]">Recurring invoices</p>
 <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">Auto-generate invoices on a fixed schedule</p>
 </div>
 <Button variant="outline" onClick={() => setShowCreate(true)}>
 <Repeat className="h-4 w-4" /> Set up recurring
 </Button>
 </div>
 <div className="flex flex-col items-center gap-3 py-14 text-center">
 <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)]">
 <Repeat className="h-6 w-6 text-[var(--color-border-input)]" weight="duotone" />
 </div>
 <p className="text-[13px] text-[var(--color-text-muted)] max-w-[280px]">
 No recurring invoices yet. Set one up to auto-bill clients on a fixed schedule.
 </p>
 </div>
 {createDialog}
 </>
 );

 if (asTabContent) return emptyContent;
 return (
 <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
 {emptyContent}
 </div>
 );
 }

 const innerContent = (
 <>
 {/* Header — only shown when not embedded as a tab */}
 {!asTabContent && (
 <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
 <div>
 <p className="text-[14px] font-semibold text-[var(--color-foreground)]">Recurring invoices</p>
 <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
 {items.filter((r) => r.status === 'active').length} active template{items.filter((r) => r.status === 'active').length !== 1 ? 's' : ''}
 </p>
 </div>
 <Button variant="outline" onClick={() => setShowCreate(true)}>
 <Repeat className="h-4 w-4" /> New recurring
 </Button>
 </div>
 )}

 {/* Column headers */}
 <div className="grid grid-cols-[1fr_120px_100px_110px_100px_44px] gap-3 border-b border-[var(--color-surface-tertiary)] px-5 py-2">
 <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Title</span>
 <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Frequency</span>
 <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Status</span>
 <span className="text-right text-[11px] font-semibold text-[var(--color-text-muted)]">Amount</span>
 <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Next date</span>
 <span />
 </div>

 {/* Rows */}
 <div className="divide-y divide-[var(--color-background)]">
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
 className={`grid grid-cols-[1fr_120px_100px_110px_100px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--color-background)] ${isLoading ? 'opacity-50' : ''} ${onRowClick ? 'cursor-pointer' : ''}`}
 >
 {/* Template info */}
 <div className="min-w-0">
 <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)]">
 {r.title || 'Recurring invoice'}
 </p>
 <p className="text-[11px] text-[var(--color-text-muted)] truncate">
 {r.clientName || r.clientEmail || 'No client assigned'}
 {r.generatedCount > 0 && (
 <span className="ml-2 text-[var(--color-border-input)]">· {r.generatedCount} generated</span>
 )}
 </p>
 </div>

 {/* Frequency */}
 <FreqBadge frequency={r.frequency} />

 {/* Status */}
 <StatusPill status={r.status} />

 {/* Amount */}
 <p className="text-right text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">
 {formatAmount(r.amountUsd, { compact: true })}
 </p>

 {/* Next due date */}
 <p className="text-[12px] text-[var(--color-text-tertiary)]">
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
 <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
 {innerContent}
 </div>
 );
}
