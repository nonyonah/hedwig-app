'use client';

import { TRANSFER_STATUS_META, normalizeTransferStatus } from '@/lib/utils/transfer-status';

/** Small status pill + dot used for every money-movement row (all rails, all currencies). */
export function TransferStatusPill({ status, className = '' }: { status: unknown; className?: string }) {
  const normalized = normalizeTransferStatus(status);
  const meta = TRANSFER_STATUS_META[normalized];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.pill} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
