'use client';

import { useState } from 'react';
import { Check, ArrowsClockwise } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ProjectStatus = 'active' | 'ongoing' | 'review' | 'approved' | 'changes_requested' | 'completed' | 'paused';

interface ProjectStatusActionsProps {
  status: ProjectStatus;
  role: 'owner' | 'admin' | 'member' | null;
  onStatusChange: (newStatus: string) => Promise<void>;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-[var(--color-accent-soft)] text-[var(--color-primary-dark)]' },
  ongoing: { label: 'Ongoing', className: 'bg-[var(--color-accent-soft)] text-[var(--color-primary-dark)]' },
  review: { label: 'In review', className: 'bg-[var(--color-warning-soft)] text-[var(--color-warning-dark)]' },
  approved: { label: 'Approved', className: 'bg-green-50 text-green-700' },
  changes_requested: { label: 'Changes requested', className: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' },
  completed: { label: 'Completed', className: 'bg-green-50 text-green-700' },
  paused: { label: 'Paused', className: 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]' },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const config = STATUS_LABELS[status] || STATUS_LABELS.active;
  return (
    <span className={cn('inline-flex items-center rounded-md px-2.5 py-0.5 text-[12px] font-semibold', config.className)}>
      {config.label}
    </span>
  );
}

export function ProjectStatusActions({ status, role, onStatusChange }: ProjectStatusActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (newStatus: string) => {
    setLoading(newStatus);
    try {
      await onStatusChange(newStatus);
    } finally {
      setLoading(null);
    }
  };

  const normalizedStatus = status?.toLowerCase() as ProjectStatus;
  const canReview = ['active', 'ongoing', 'changes_requested'].includes(normalizedStatus);
  const canApprove = normalizedStatus === 'review';

  return (
    <div className="flex items-center gap-2">
      <ProjectStatusBadge status={normalizedStatus} />

      {/* Member: can mark as complete/review */}
      {role === 'member' && canReview && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleAction('REVIEW')}
          disabled={loading === 'REVIEW'}
          className="text-[12px] text-[var(--color-primary)] hover:bg-[var(--color-accent-soft)]"
        >
          <Check className="h-3.5 w-3.5" weight="bold" />
          {loading === 'REVIEW' ? 'Submitting...' : 'Mark as complete'}
        </Button>
      )}

      {/* Admin/Owner: can approve or request changes */}
      {(role === 'admin' || role === 'owner') && canApprove && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAction('APPROVED')}
            disabled={loading === 'APPROVED'}
            className="text-[12px] text-green-600 hover:bg-green-50"
          >
            <Check className="h-3.5 w-3.5" weight="bold" />
            {loading === 'APPROVED' ? 'Approving...' : 'Approve'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAction('CHANGES_REQUESTED')}
            disabled={loading === 'CHANGES_REQUESTED'}
            className="text-[12px] text-[var(--color-warning)] hover:bg-[var(--color-warning-soft)]"
          >
            <ArrowsClockwise className="h-3.5 w-3.5" weight="bold" />
            {loading === 'CHANGES_REQUESTED' ? 'Requesting...' : 'Request changes'}
          </Button>
        </>
      )}
    </div>
  );
}
