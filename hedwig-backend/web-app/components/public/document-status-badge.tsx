import { cn } from '@/lib/utils';

export function DocumentStatusBadge({ status }: { status: string }) {
  const normalized = String(status || 'draft').toLowerCase();

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize',
        normalized === 'paid' || normalized === 'approved' || normalized === 'signed'
          ? 'border-[var(--color-success-soft)] bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]'
          : normalized === 'overdue'
            ? 'border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] text-[var(--color-text-tertiary)]'
            : 'border-[var(--color-border-input)] bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]'
      )}
    >
      {normalized.replace('_', ' ')}
    </span>
  );
}
