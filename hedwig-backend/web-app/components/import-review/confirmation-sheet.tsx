'use client';

import { CheckCircle, WarningCircle, X } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';

export function ConfirmationSheet({
  open,
  actions,
  onBack,
  onConfirm,
  isSubmitting,
}: {
  open: boolean;
  actions: Array<{ id: string; kind: 'create' | 'link' | 'defer' | 'ignore'; label: string; explanation: string }>;
  onBack: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}) {
  if (!open) return null;

  const executable = actions.filter((action) => action.kind === 'create' || action.kind === 'link');

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/25 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[32px] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#98a2b3]">Final confirmation</p>
            <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-[#181d27]">Review exactly what will happen</h3>
            <p className="mt-2 text-[14px] leading-6 text-[#667085]">
              Nothing will be created or linked until you confirm these actions.
            </p>
          </div>
          <button type="button" onClick={onBack} className="rounded-full p-2 text-[#98a2b3] hover:bg-[#f2f4f7]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {actions.map((action) => (
            <div key={action.id} className="rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] p-4">
              <div className="flex items-center gap-2">
                {action.kind === 'create' || action.kind === 'link' ? (
                  <CheckCircle className="h-4 w-4 text-[#12b76a]" />
                ) : (
                  <WarningCircle className="h-4 w-4 text-[#f79009]" />
                )}
                <p className="text-[13px] font-semibold text-[#181d27]">{action.label}</p>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-[#667085]">{action.explanation}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl bg-[#f9fafb] px-4 py-3 text-[12px] text-[#667085]">
          {executable.length
            ? `${executable.length} approved action${executable.length !== 1 ? 's' : ''} will execute after confirmation. Deferred and rejected items will be left untouched.`
            : 'No executable actions are selected. You can go back and approve items, or keep everything deferred.'}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={onConfirm} disabled={isSubmitting || executable.length === 0}>
            {isSubmitting ? 'Applying approved actions…' : 'Confirm approved actions'}
          </Button>
        </div>
      </div>
    </div>
  );
}
