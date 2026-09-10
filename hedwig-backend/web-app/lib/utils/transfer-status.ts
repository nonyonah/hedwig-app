/**
 * Canonical 4-state money-movement status used across every rail:
 * stablecoin, onramp/offramp, invoice + payment-link payments, and virtual
 * account transactions (USD, NGN, GBP, EUR).
 *
 * Document lifecycle states (draft/sent/viewed/overdue/active/expired) are
 * intentionally NOT part of this set — they describe a document, not a
 * payment outcome. Where a payment outcome is shown, normalize here.
 */
export type TransferStatus = 'successful' | 'pending' | 'failed' | 'reversed';

export const TRANSFER_STATUS_META: Record<TransferStatus, { label: string; dot: string; pill: string }> = {
  successful: {
    label: 'Successful',
    dot: 'bg-[var(--color-success)]',
    pill: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  },
  pending: {
    label: 'Pending',
    dot: 'bg-[var(--color-warning)]',
    pill: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  },
  failed: {
    label: 'Failed',
    dot: 'bg-[var(--color-danger)]',
    pill: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  },
  reversed: {
    label: 'Reversed',
    dot: 'bg-[var(--color-text-tertiary)]',
    pill: 'bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]',
  },
};

export function normalizeTransferStatus(raw: unknown): TransferStatus {
  const s = String(raw ?? 'pending').toLowerCase().trim();
  if (['successful', 'success', 'completed', 'complete', 'settled', 'paid'].includes(s)) return 'successful';
  if (['failed', 'failure', 'error', 'expired'].includes(s)) return 'failed';
  if (['reversed', 'reversal', 'refunded', 'refund', 'cancelled', 'canceled'].includes(s)) return 'reversed';
  // pending, processing, pending_convert, initiated, queued, in_progress,
  // sent, viewed, draft, active, partial, and anything unknown → in flight.
  return 'pending';
}
