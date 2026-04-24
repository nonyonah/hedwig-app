'use client';

import { X } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';

export function ReviewDecisionModal({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-[#181d27]">{title}</h3>
            <p className="mt-2 text-[14px] leading-6 text-[#667085]">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[#98a2b3] hover:bg-[#f2f4f7]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
