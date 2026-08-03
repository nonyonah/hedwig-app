'use client';

import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bank,
  Check,
  Copy,
  Receipt,
  ShieldCheck,
  Wallet,
  Warning,
} from '@/components/ui/lucide-icons';
import { Loader } from '@/components/ui/loader';
import { useCurrency } from '@/components/providers/currency-provider';
import { formatShortDate } from '@/lib/utils';
import type { LedgerEntry, LedgerFinancialEvent } from '@/lib/types/revenue';

/**
 * Reusable financial event detail — the drill-down surface for any ledger
 * entry, wallet event, or timeline item. Content adapts to the underlying
 * event type (invoice payment, expense, bank import, withdrawal, deposit,
 * refund) while keeping one consistent shell.
 *
 * Presentational: fetch events with `hedwigApi.ledgerEvents(referenceId)`
 * and pass them in. See `FinancialEventDetailDialog` for the fetching shell.
 */

type Tone = 'success' | 'warning' | 'neutral' | 'danger';

const toneClass: Record<Tone, string> = {
  success: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  neutral: 'bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]',
  danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
};

interface EventKindMeta {
  label: string;
  tone: Tone;
}

function eventKindMeta(eventType: string, payload: Record<string, unknown>): EventKindMeta {
  switch (eventType) {
    case 'document.paid':
      return { label: 'Payment', tone: 'success' };
    case 'expense.created':
      return { label: 'Expense', tone: 'neutral' };
    case 'expense.updated':
      return { label: 'Expense updated', tone: 'neutral' };
    case 'expense.deleted':
      return { label: 'Expense removed', tone: 'danger' };
    case 'imported_transaction.created':
    case 'imported_transaction.updated': {
      const status = String(payload.status || 'pending');
      if (status === 'matched' || status === 'expensed') return { label: 'Matched', tone: 'success' };
      if (status === 'skipped') return { label: 'Skipped', tone: 'neutral' };
      if (status === 'reviewing') return { label: 'Reviewing', tone: 'warning' };
      return { label: 'Pending', tone: 'warning' };
    }
    case 'offramp.settled':
      return { label: 'Settled', tone: 'success' };
    case 'offramp.refunded':
      return { label: 'Refunded', tone: 'warning' };
    case 'wallet.deposit.received':
      return { label: 'Received', tone: 'success' };
    default:
      return { label: 'Event', tone: 'neutral' };
  }
}

function kindIcon(eventType: string, direction: string | null): React.ReactNode {
  switch (eventType) {
    case 'document.paid':
    case 'expense.created':
    case 'expense.updated':
    case 'expense.deleted':
      return <Receipt className="h-4 w-4" weight="bold" />;
    case 'offramp.settled':
    case 'offramp.refunded':
      return <Wallet className="h-4 w-4" weight="bold" />;
    case 'wallet.deposit.received':
      return <Bank className="h-4 w-4" weight="bold" />;
    case 'imported_transaction.created':
    case 'imported_transaction.updated':
      return direction === 'in' ? <ArrowUp className="h-4 w-4" weight="bold" /> : <ArrowDown className="h-4 w-4" weight="bold" />;
    default:
      return direction === 'in' ? <ArrowUp className="h-4 w-4" weight="bold" /> : <ArrowDown className="h-4 w-4" weight="bold" />;
  }
}

function CopyValue({ value, display }: { value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  const shown = display ?? (value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <span className="group inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate font-mono text-[12px] text-[var(--color-text-secondary)]">{shown}</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy to clipboard"
        className="shrink-0 rounded-md p-1 text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-[var(--color-success)]" weight="bold" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <p className="text-[11px] font-medium text-[var(--color-text-tertiary)]">{label}</p>
      <div className="text-[13px] text-[var(--color-text-secondary)]">{children}</div>
    </div>
  );
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export function FinancialEventDetail({
  entry,
  events,
  loading,
  error,
}: {
  entry: LedgerEntry;
  events: LedgerFinancialEvent[];
  loading?: boolean;
  error?: string | null;
}) {
  const { formatAmount, formatNative } = useCurrency();
  const latest = events.length > 0 ? events[events.length - 1] : null;
  const eventType = latest?.eventType ?? entry.event_type ?? null;
  const payload = latest?.payload ?? {};
  const direction = latest?.direction ?? (entry.debit > 0 ? 'out' : 'in');
  const kindMeta = eventType ? eventKindMeta(eventType, payload) : { label: 'Event', tone: 'neutral' as Tone };
  const iconWrapClass = entry.credit > 0 ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]';

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
        <Warning className="h-6 w-6 text-[var(--color-warning)]" weight="thin" />
        <p className="max-w-[260px] text-[13px] text-[var(--color-text-muted)]">
          Could not load event details. {error}
        </p>
      </div>
    );
  }

  const amount = entry.credit > 0 ? entry.credit : entry.debit;
  const isIn = entry.credit > 0;
  const native = latest?.amount ?? null;
  const nativeCurrency = latest?.currency ?? entry.currency;
  const showNative = native !== null && nativeCurrency && nativeCurrency.toUpperCase() !== 'USD';
  const frozenNote = (() => {
    if (!latest) return null;
    if (latest.fxRateUsd === null) return null;
    if (latest.fxSource === 'identity') return 'USDC/USD — 1:1, no FX applied';
    const unitsPerUsd = latest.fxRateUsd > 0 ? 1 / latest.fxRateUsd : null;
    return unitsPerUsd
      ? `1 USD = ${unitsPerUsd.toFixed(2)} ${String(latest.currency || '')} at ${String(latest.fxSource || 'event time')}`
      : `Frozen at ${latest.fxRateUsd} ${String(latest.currency || '')}/USD`;
  })();

  const detailRows: { label: string; value: React.ReactNode }[] = [];

  switch (eventType) {
    case 'document.paid': {
      detailRows.push(
        { label: 'Account', value: entry.account },
        { label: 'Document type', value: fmt(payload.doc_type) },
        { label: 'Paid amount', value: `${fmt(payload.paid_amount)} ${fmt(payload.payment_token)}` },
        { label: 'Chain', value: fmt(payload.payment_chain) },
        { label: 'Payer', value: payload.payer_address ? <CopyValue value={String(payload.payer_address)} /> : '—' },
      );
      if (payload.paid_via) detailRows.push({ label: 'Paid via', value: fmt(payload.paid_via) });
      if (payload.payment_reference) detailRows.push({ label: 'Reference', value: fmt(payload.payment_reference) });
      break;
    }
    case 'expense.created':
    case 'expense.updated':
    case 'expense.deleted': {
      detailRows.push(
        { label: 'Account', value: entry.account },
        { label: 'Category', value: fmt(payload.category ?? entry.category) },
        { label: 'Note', value: fmt(payload.note ?? entry.description) },
      );
      if (payload.client_id) detailRows.push({ label: 'Client', value: fmt(payload.client_id) });
      if (payload.project_id) detailRows.push({ label: 'Project', value: fmt(payload.project_id) });
      if (payload.source_type) detailRows.push({ label: 'Source', value: fmt(payload.source_type) });
      break;
    }
    case 'imported_transaction.created':
    case 'imported_transaction.updated': {
      const status = String(payload.status || '');
      detailRows.push(
        { label: 'Account', value: entry.account },
        { label: 'Type', value: String(payload.type || (entry.debit > 0 ? 'debit' : 'credit')) },
        { label: 'Category', value: fmt(payload.category ?? entry.category) },
        { label: 'Status', value: <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass[kindMeta.tone]}`}>{kindMeta.label}</span> },
      );
      if (status) {
        if (payload.matched_invoice_id) detailRows.push({ label: 'Matched invoice', value: fmt(payload.matched_invoice_id) });
        if (payload.matched_expense_id) detailRows.push({ label: 'Matched expense', value: fmt(payload.matched_expense_id) });
        if (payload.matched_client_id) detailRows.push({ label: 'Matched client', value: fmt(payload.matched_client_id) });
        if (payload.match_method) detailRows.push({ label: 'Match method', value: fmt(payload.match_method) });
      }
      if (payload.statement_id) detailRows.push({ label: 'Statement', value: fmt(payload.statement_id) });
      break;
    }
    case 'offramp.settled':
    case 'offramp.refunded': {
      detailRows.push(
        { label: 'Account', value: entry.account },
        { label: 'Bank', value: fmt(payload.bank_name) },
        { label: 'Account number', value: fmt(payload.account_number) },
        { label: 'Fiat amount', value: payload.fiat_amount ? `${fmt(payload.fiat_amount)} ${fmt(payload.fiat_currency)}` : '—' },
        { label: 'Source', value: fmt(payload.offramp_source) },
      );
      if (payload.reason) detailRows.push({ label: 'Reason', value: fmt(payload.reason) });
      if (payload.tx_hash) detailRows.push({ label: 'Transaction', value: <CopyValue value={String(payload.tx_hash)} /> });
      if (payload.paycrest_order_id) detailRows.push({ label: 'Paycrest order', value: <CopyValue value={String(payload.paycrest_order_id)} /> });
      break;
    }
    case 'wallet.deposit.received': {
      detailRows.push(
        { label: 'Account', value: entry.account },
        { label: 'Chain', value: fmt(payload.chain ?? payload.network) },
        { label: 'Label', value: fmt(payload.label) },
        { label: 'From', value: payload.from_address ? <CopyValue value={String(payload.from_address)} /> : '—' },
        { label: 'To', value: payload.to_address ? <CopyValue value={String(payload.to_address)} /> : '—' },
      );
      if (payload.tx_hash) detailRows.push({ label: 'Transaction', value: <CopyValue value={String(payload.tx_hash)} /> });
      break;
    }
    default: {
      detailRows.push(
        { label: 'Account', value: entry.account },
        { label: 'Category', value: fmt(entry.category) },
      );
      if (latest?.correlationId) detailRows.push({ label: 'Correlation', value: <CopyValue value={String(latest.correlationId)} /> });
      break;
    }
  }

  if (entry.referenceId) {
    detailRows.push({ label: 'Reference', value: <CopyValue value={entry.referenceId} /> });
  }
  if (latest?.source) {
    detailRows.push({ label: 'Source rail', value: String(latest.source) });
  }
  if (latest?.recordedAt) {
    detailRows.push({ label: 'Recorded', value: formatShortDate(latest.recordedAt) });
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${iconWrapClass}`}>
          {kindIcon(eventType ?? '', direction)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-snug text-[var(--color-foreground)]">{entry.description}</p>
          <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
            {kindMeta.label} · {formatShortDate(entry.date)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClass[kindMeta.tone]}`}>
          {kindMeta.label}
        </span>
      </div>

      {/* Amount hero */}
      <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-5 py-4">
        <p className={`text-[26px] font-semibold tabular-nums leading-none ${isIn ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
          {isIn ? '+' : '−'}{formatAmount(amount)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {showNative && (
            <p className="text-[12px] text-[var(--color-text-muted)]">
              {formatNative(native as number, nativeCurrency as string)} {String(nativeCurrency)}
            </p>
          )}
          {frozenNote && (
            <p className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
              <ShieldCheck className="h-3.5 w-3.5" weight="bold" />
              USD reference frozen at event time — {frozenNote}
            </p>
          )}
        </div>
      </div>

      {/* Adaptive detail grid */}
      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
        {detailRows.map((row) => (
          <DetailRow key={row.label} label={row.label}>{row.value}</DetailRow>
        ))}
      </div>

      {/* Event history */}
      {events.length > 1 && (
        <div className="mt-6">
          <p className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Event history</p>
          <div className="mt-2 space-y-0 border-l border-[var(--color-border)] pl-4">
            {[...events].reverse().map((ev, idx) => {
              const meta = eventKindMeta(ev.eventType, ev.payload || {});
              return (
                <div key={ev.id} className="relative pb-4 last:pb-0">
                  <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${idx === 0 ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-input)]'}`} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-[12px] font-semibold text-[var(--color-text-secondary)]">{meta.label}</p>
                    <p className="text-[11px] text-[var(--color-text-tertiary)]">{formatShortDate(ev.occurredAt)}</p>
                    {ev.amountUsd !== null && ev.amountUsd !== undefined && (
                      <p className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
                        {ev.amountUsd >= 0 ? '+' : ''}{formatAmount(ev.amountUsd)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
