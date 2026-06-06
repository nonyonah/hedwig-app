'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClockCountdown, Plus } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { hedwigApi } from '@/lib/api/client';
import { useToast } from '@/components/providers/toast-provider';
import { TimeTracker } from '@/components/time/time-tracker';
import { TimeEntryForm } from '@/components/time/time-entry-form';
import { TimeEntriesList } from '@/components/time/time-entries-list';
import { TimeSummaryCards } from '@/components/time/time-summary-cards';

interface TimeEntry {
  id: string;
  projectId: string | null;
  description: string | null;
  startTime: string;
  endTime: string | null;
  durationSeconds: number | null;
  hourlyRate: number | null;
  billableAmount: number | null;
  status: string;
  createdAt: string;
  project?: { id: string; name: string; client?: { id: string; name: string } };
}

interface TimeSummary {
  hoursToday: number;
  hoursThisWeek: number;
  hoursThisMonth: number;
  billableAmount: number;
  topClient: { id: string; name: string; hours: number } | null;
  topProject: { id: string; name: string; hours: number } | null;
}

export function TimeView({
  accessToken,
  initialEntries,
  initialActiveEntry,
  initialSummary,
}: {
  accessToken: string | null;
  initialEntries: TimeEntry[];
  initialActiveEntry: TimeEntry | null;
  initialSummary: TimeSummary;
}) {
  const { activeWorkspace } = useWorkspaceContext();
  const { toast } = useToast();
  const isPersonal = activeWorkspace?.type === 'personal';

  const [entries, setEntries] = useState<TimeEntry[]>(initialEntries);
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(initialActiveEntry);
  const [summary, setSummary] = useState<TimeSummary>(initialSummary);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const opts = { accessToken, disableMockFallback: true } as any;

  // Live elapsed timer
  useEffect(() => {
    if (!activeEntry) { setElapsed(0); return; }
    const start = new Date(activeEntry.startTime).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeEntry]);

  const refresh = useCallback(async () => {
    try {
      const [e, a, s] = await Promise.all([
        hedwigApi.timeEntries(undefined, opts).catch(() => ({ entries: [] })),
        hedwigApi.timeEntryActive(opts).catch(() => ({ entry: null })),
        hedwigApi.timeSummary(opts).catch(() => ({
          summary: initialSummary,
        })),
      ]);
      setEntries(e.entries || []);
      setActiveEntry(a.entry || null);
      setSummary(s.summary);
    } catch {}
  }, []);

  const handleStart = async (projectId?: string, description?: string) => {
    try {
      const res = await hedwigApi.createTimeEntry({ projectId, description, status: 'running' }, opts);
      setActiveEntry(res.entry);
      toast({ type: 'success', title: 'Timer started' });
    } catch (err: any) { toast({ type: 'error', title: err.message }); }
  };

  const handleStop = async () => {
    if (!activeEntry) return;
    try {
      const res = await hedwigApi.updateTimeEntry(activeEntry.id, { action: 'stop' }, opts);
      setActiveEntry(null);
      setElapsed(0);
      setEntries(prev => [res.entry, ...prev]);
      toast({ type: 'success', title: 'Timer stopped' });
      refresh();
    } catch (err: any) { toast({ type: 'error', title: err.message }); }
  };

  const handleSaveManual = async (data: any) => {
    try {
      const res = await hedwigApi.createTimeEntry({ ...data, status: 'manual' }, opts);
      setShowEntryForm(false);
      setEditingEntry(null);
      setEntries(prev => [res.entry, ...prev]);
      toast({ type: 'success', title: 'Time entry saved' });
      refresh();
    } catch (err: any) { toast({ type: 'error', title: err.message }); }
  };

  const handleEdit = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setShowEntryForm(true);
  };

  const handleUpdateEntry = async (data: any) => {
    if (!editingEntry) return;
    try {
      const res = await hedwigApi.updateTimeEntry(editingEntry.id, data, opts);
      setShowEntryForm(false);
      setEditingEntry(null);
      setEntries(prev => prev.map(e => e.id === editingEntry.id ? res.entry : e));
      toast({ type: 'success', title: 'Entry updated' });
      refresh();
    } catch (err: any) { toast({ type: 'error', title: err.message }); }
  };

  const handleDelete = async (id: string) => {
    try {
      await hedwigApi.deleteTimeEntry(id, opts);
      setEntries(prev => prev.filter(e => e.id !== id));
      toast({ type: 'success', title: 'Entry deleted' });
      refresh();
    } catch (err: any) { toast({ type: 'error', title: err.message }); }
  };

  // Group entries by date
  const grouped = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const entry of entries) {
      const date = new Date(entry.startTime).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      });
      const group = map.get(date) || [];
      group.push(entry);
      map.set(date, group);
    }
    return map;
  }, [entries]);

  if (!isPersonal) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <ClockCountdown className="mx-auto h-10 w-10 text-[var(--color-text-muted)]" weight="duotone" />
          <p className="mt-3 text-[15px] font-semibold text-[var(--color-foreground)]">Time tracking</p>
          <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
            Time tracking is available for personal workspaces.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-[var(--color-foreground)]">Time tracking</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">
            Track hours, monitor projects, and bill clients.
          </p>
        </div>
        <Button variant="default" size="sm" onClick={() => { setEditingEntry(null); setShowEntryForm(true); }}>
          <Plus className="h-3.5 w-3.5" weight="bold" /> Log time
        </Button>
      </div>

      <TimeSummaryCards summary={summary} />

      <TimeTracker
        activeEntry={activeEntry}
        elapsed={elapsed}
        onStart={handleStart}
        onStop={handleStop}
      />

      {grouped.size > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <h3 className="text-[15px] font-bold text-[var(--color-foreground)]">Time entries</h3>
              <p className="text-[12px] text-[var(--color-text-muted)]">
                {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
              </p>
            </div>
          </div>
          <TimeEntriesList grouped={grouped} onEdit={handleEdit} onDelete={handleDelete} />
        </div>
      ) : !activeEntry ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClockCountdown className="h-10 w-10 text-[var(--color-border-input)]" weight="duotone" />
          <p className="mt-3 text-[15px] font-semibold text-[var(--color-foreground)]">No time entries yet</p>
          <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
            Start a timer or manually log your first time entry.
          </p>
        </div>
      ) : null}

      {showEntryForm && (
        <TimeEntryForm
          initial={editingEntry}
          onSave={editingEntry ? handleUpdateEntry : handleSaveManual}
          onClose={() => { setShowEntryForm(false); setEditingEntry(null); }}
          accessToken={accessToken}
          workspaceId={activeWorkspace?.id}
        />
      )}
    </div>
  );
}
