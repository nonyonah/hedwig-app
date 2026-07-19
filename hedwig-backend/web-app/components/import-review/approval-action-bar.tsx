'use client';

import { Button } from '@/components/ui/button';

export function ApprovalActionBar({
 total,
 resolved,
 approved,
 deferred,
 rejected,
 onApproveAll,
 onContinue,
 continueDisabled,
}: {
 total: number;
 resolved: number;
 approved: number;
 deferred: number;
 rejected: number;
 onApproveAll: () => void;
 onContinue: () => void;
 continueDisabled: boolean;
}) {
 return (
 <div className="sticky bottom-0 z-10 mt-6 rounded-[28px] border border-[var(--color-border-input)] bg-[var(--color-surface)]/95 p-4 shadow-xl backdrop-blur">
 <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
 <div>
 <p className="text-[11px] font-semibold text-[var(--color-text-placeholder)]">Approval progress</p>
 <p className="mt-1 text-[14px] font-semibold text-[var(--color-foreground)]">
 {resolved} of {total} suggestions resolved
 </p>
 <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
 {approved} approved · {deferred} deferred · {rejected} rejected
 </p>
 </div>

 <div className="flex flex-wrap items-center gap-2">
 <Button variant="outline" onClick={onApproveAll}>Approve all create/link suggestions</Button>
 <Button onClick={onContinue} disabled={continueDisabled}>
 Continue to confirmation
 </Button>
 </div>
 </div>
 </div>
 );
}
