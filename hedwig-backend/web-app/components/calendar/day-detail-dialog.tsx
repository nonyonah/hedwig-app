'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ClockCountdown,
  FlagPennant,
  FolderSimple,
  NotePencil,
  Receipt,
  X,
} from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { hedwigApi } from '@/lib/api/client';
import type { Reminder } from '@/lib/models/entities';
import { openPaymentDetail } from '@/lib/payments/open-detail';
import type { PlannerItem } from '@/components/calendar/types';

function fmtDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const iconByKind: Record<PlannerItem['kind'], typeof ClockCountdown> = {
  reminder: ClockCountdown,
  milestone: FlagPennant,
  invoice: Receipt,
  project: FolderSimple,
  time_entry: ClockCountdown,
};

const badgeToneByKind: Record<PlannerItem['kind'], string> = {
  reminder: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]',
  milestone: 'bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]',
  invoice: 'bg-[var(--color-warning-soft)] text-[var(--color-text-tertiary)]',
  project: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]',
  time_entry: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]',
};

export function DayDetailDialog({
  items,
  currentIndex,
  onIndexChange,
  editableReminders,
  setEditableReminders,
  accessToken,
  onNavigate,
  onClose,
  workspaceMembers,
}: {
  items: PlannerItem[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  editableReminders: Reminder[];
  setEditableReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
  accessToken: string | null;
  onNavigate: (href: string) => void;
  onClose: () => void;
  workspaceMembers?: { id: string; name: string; email: string }[];
}) {
  const item = items[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;
  const isTimeEntry = item.kind === 'time_entry';
  const isReminder = item.kind === 'reminder';
  const Icon = iconByKind[item.kind];

  const [editing, setEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftDueDate, setDraftDueDate] = useState(item.date.slice(0, 10));

  const goPrev = () => {
    if (!hasPrev) return;
    setEditing(false);
    setFeedback(null);
    setIsSaving(false);
    onIndexChange(currentIndex - 1);
  };

  const goNext = () => {
    if (!hasNext) return;
    setEditing(false);
    setFeedback(null);
    setIsSaving(false);
    onIndexChange(currentIndex + 1);
  };

  const saveReminderEdit = async () => {
    if (!draftTitle.trim() || !draftDueDate || !accessToken) return;
    const orig = editableReminders.find((r) => r.id === item.id);
    const nextDueAt = orig?.dueAt?.includes('T')
      ? `${draftDueDate}${orig.dueAt.slice(orig.dueAt.indexOf('T'))}`
      : `${draftDueDate}T09:00:00.000Z`;
    setIsSaving(true);
    setFeedback(null);
    try {
      const updated = await hedwigApi.updateCalendarEvent(
        item.id,
        { title: draftTitle.trim(), eventDate: nextDueAt },
        { accessToken, disableMockFallback: true }
      );
      setEditableReminders((curr) => curr.map((r) => (r.id === updated.id ? updated : r)));
      setEditing(false);
      setFeedback('Reminder updated.');
    } catch (err: any) {
      setFeedback(err?.message || 'Failed to update.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpen = () => {
    const invoiceMatch = item.href?.match(/^\/payments\?invoice=([^&]+)/);
    if (invoiceMatch?.[1]) {
      onClose();
      openPaymentDetail('invoice', decodeURIComponent(invoiceMatch[1]));
      return;
    }
    if (item.href) onNavigate(item.href);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-surface-tertiary)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', badgeToneByKind[item.kind])}>
              <Icon className="h-4.5 w-4.5" weight="bold" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                {item.meta}
                <span className="ml-2 font-normal normal-case">
                  {currentIndex + 1}/{items.length}
                </span>
              </p>
              <p className="mt-0.5 text-[15px] font-semibold text-[var(--color-foreground)] leading-tight">
                {editing ? draftTitle : item.title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {hasPrev && (
              <button
                type="button"
                onClick={goPrev}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-tertiary)]"
                title="Previous item"
              >
                <ArrowLeft className="h-4 w-4" weight="bold" />
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={goNext}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-tertiary)]"
                title="Next item"
              >
                <ArrowRight className="h-4 w-4" weight="bold" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-tertiary)]"
            >
              <X className="h-4 w-4" weight="bold" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-3 px-5 py-4">
          {feedback && (
            <div className="rounded-xl border border-[var(--color-border-input)] bg-[var(--color-surface-secondary)] px-3 py-2 text-[12px] text-[var(--color-text-secondary)]">
              {feedback}
            </div>
          )}

          {isTimeEntry ? (
            <TimeEntryDetailContent entry={item.timeEntry!} workspaceMembers={workspaceMembers} />
          ) : editing ? (
            <>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Title</p>
                <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className="bg-[var(--color-surface)]" />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Due date</p>
                <Input type="date" value={draftDueDate} onChange={(e) => setDraftDueDate(e.target.value)} className="bg-[var(--color-surface)]" />
              </div>
            </>
          ) : (
            <dl className="space-y-3">
              {isReminder && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Category</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-[var(--color-foreground)]">{item.subtitle}</dd>
                </div>
              )}
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Date</dt>
                <dd className="mt-0.5 text-[13px] font-medium text-[var(--color-foreground)]">
                  {new Date(item.date).toLocaleString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </dd>
              </div>
              {!isReminder && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Status</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-[var(--color-foreground)] capitalize">{item.subtitle}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-surface-tertiary)] px-5 py-4">
          {editing ? (
            <div className="flex gap-2">
              <Button size="sm" type="button" disabled={isSaving} onClick={saveReminderEdit}>
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
              <Button size="sm" type="button" variant="secondary" disabled={isSaving} onClick={() => { setEditing(false); setFeedback(null); }}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {isReminder && !isTimeEntry && (
                <Button size="sm" type="button" variant="secondary" onClick={() => { setEditing(true); setDraftTitle(item.title); setDraftDueDate(item.date.slice(0, 10)); }}>
                  <NotePencil className="h-3.5 w-3.5" weight="bold" />
                  Edit
                </Button>
              )}
              {item.href && (
                <Button size="sm" type="button" variant="secondary" onClick={handleOpen}>
                  <ArrowSquareOut className="h-3.5 w-3.5" weight="bold" />
                  Open
                </Button>
              )}
            </div>
          )}
          {!editing && isReminder && (
            <Button variant="ghost" size="sm" onClick={onClose} className="text-[12px] font-semibold text-[var(--color-text-tertiary)]">
              Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function TimeEntryDetailContent({ entry, workspaceMembers }: { entry: NonNullable<PlannerItem['timeEntry']>; workspaceMembers?: { id: string; name: string; email: string }[] }) {
  const isRunning = entry.status === 'running';
  const assignedName = entry.assignedTo
    ? workspaceMembers?.find(m => m.id === entry.assignedTo)?.name ?? null
    : null;
  return (
    <div className="divide-y divide-[var(--color-surface-secondary)]">
      <DetailRow label="Project" value={entry.project?.name || '—'} />
      <DetailRow label="Client" value={entry.project?.client?.name || '—'} />
      <DetailRow label="Description" value={entry.description || '—'} />
      {assignedName && <DetailRow label="Assigned to" value={assignedName} />}
      <DetailRow label="Duration" value={isRunning ? 'Running…' : fmtDuration(entry.durationSeconds)} />
      <DetailRow label="Start" value={fmtTime(entry.startTime)} />
      <DetailRow label="End" value={entry.endTime ? fmtTime(entry.endTime) : '—'} />
      <DetailRow label="Rate" value={entry.hourlyRate ? `$${Number(entry.hourlyRate).toFixed(2)}/hr` : '—'} />
      <DetailRow label="Billable" value={entry.billableAmount ? `$${Number(entry.billableAmount).toFixed(2)}` : '—'} />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-3.5 text-[13px]">
      <span className="text-[var(--color-text-tertiary)]">{label}</span>
      <span className="font-semibold text-[var(--color-foreground)] text-right max-w-[200px]">{value}</span>
    </div>
  );
}
