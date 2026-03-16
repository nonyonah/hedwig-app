import { cn } from '@/lib/utils';

export function DocumentStatusBadge({ status }: { status: string }) {
  const normalized = String(status || 'draft').toLowerCase();

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize',
        normalized === 'paid' || normalized === 'approved' || normalized === 'signed'
          ? 'border-[#abefc6] bg-[#ecfdf3] text-[#067647]'
          : normalized === 'overdue'
            ? 'border-[#fecdca] bg-[#fef3f2] text-[#b42318]'
            : 'border-[#d5d7da] bg-[#f8f9fc] text-[#414651]'
      )}
    >
      {normalized.replace('_', ' ')}
    </span>
  );
}
