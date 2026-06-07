'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClockCountdown, Plus, Receipt, X } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { ClientPortal } from '@/components/ui/client-portal';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { hedwigApi } from '@/lib/api/client';
import { useToast } from '@/components/providers/toast-provider';
import { TimeTracker } from '@/components/time/time-tracker';
import { TimeEntryForm } from '@/components/time/time-entry-form';
import { TimeEntriesList } from '@/components/time/time-entries-list';
import { TimeSummaryCards } from '@/components/time/time-summary-cards';
import { InvoiceFromTimeDialog } from '@/components/time/invoice-from-time-dialog';
import type { TimeEntry, TimeSummary } from '@/components/time/types';

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
  const [viewedEntry, setViewedEntry] = useState<TimeEntry | null>(null);
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

  const handleStart = async (projectId?: string, description?: string, rate?: number) => {
    try {
      const res = await hedwigApi.createTimeEntry({ projectId, description, hourlyRate: rate, status: 'running' }, opts);
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

  const unbilledEntries = useMemo(() =>
    entries.filter(e => e.status === 'stopped' && (e.durationSeconds || 0) > 0),
  [entries]);

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
          <TimeEntriesList grouped={grouped} onEdit={handleEdit} onDelete={handleDelete} onView={setViewedEntry} />
          {unbilledEntries.length > 0 && (
            <div className="border-t border-[var(--color-border)] px-5 py-3">
              <Button variant="default" onClick={() => setShowInvoiceDialog(true)}>
                <Receipt className="h-3.5 w-3.5" weight="bold" /> Generate invoice ({unbilledEntries.length})
              </Button>
            </div>
          )}
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

      {showInvoiceDialog && (
        <InvoiceFromTimeDialog
          entries={unbilledEntries}
          accessToken={accessToken}
          onClose={() => setShowInvoiceDialog(false)}
        />
      )}

      {viewedEntry && (
        <ClientPortal>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={() => setViewedEntry(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)] animate-in fade-in-0 zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
                <div>
                  <p className="text-[15px] font-bold text-[var(--color-foreground)]">Time entry</p>
                  <p className="text-[12px] text-[var(--color-text-muted)]">
                    {viewedEntry.durationSeconds ? `${Math.floor(viewedEntry.durationSeconds / 3600)}h ${Math.floor((viewedEntry.durationSeconds % 3600) / 60)}m` : '—'}
                  </p>
                </div>
                <button type="button" onClick={() => setViewedEntry(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-secondary)]">
                  <X className="h-4 w-4" weight="bold" />
                </button>
              </div>
              <div className="divide-y divide-[var(--color-surface-secondary)] px-5">
                <div className="flex items-start justify-between py-3.5 text-[13px]">
                  <span className="text-[var(--color-text-tertiary)]">Project</span>
                  <span className="font-semibold text-[var(--color-foreground)]">{viewedEntry.project?.name || '—'}</span>
                </div>
                <div className="flex items-start justify-between py-3.5 text-[13px]">
                  <span className="text-[var(--color-text-tertiary)]">Client</span>
                  <span className="font-semibold text-[var(--color-foreground)]">{viewedEntry.project?.client?.name || '—'}</span>
                </div>
                <div className="flex items-start justify-between py-3.5 text-[13px]">
                  <span className="text-[var(--color-text-tertiary)]">Description</span>
                  <span className="font-semibold text-[var(--color-foreground)] text-right max-w-[200px]">{viewedEntry.description || '—'}</span>
                </div>
                <div className="flex items-center justify-between py-3.5 text-[13px]">
                  <span className="text-[var(--color-text-tertiary)]">Duration</span>
                  <span className="font-semibold text-[var(--color-foreground)]">
                    {viewedEntry.durationSeconds ? `${Math.floor(viewedEntry.durationSeconds / 3600)}h ${Math.floor((viewedEntry.durationSeconds % 3600) / 60)}m` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3.5 text-[13px]">
                  <span className="text-[var(--color-text-tertiary)]">Rate</span>
                  <span className="font-semibold text-[var(--color-foreground)]">
                    {viewedEntry.hourlyRate ? `$${Number(viewedEntry.hourlyRate).toFixed(2)}/hr` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3.5 text-[13px]">
                  <span className="text-[var(--color-text-tertiary)]">Billable</span>
                  <span className="font-semibold text-[var(--color-foreground)]">
                    {viewedEntry.billableAmount ? `$${Number(viewedEntry.billableAmount).toFixed(2)}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3.5 text-[13px]">
                  <span className="text-[var(--color-text-tertiary)]">Date</span>
                  <span className="font-semibold text-[var(--color-foreground)]">
                    {new Date(viewedEntry.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              <div className="border-t border-[var(--color-border)] px-5 py-4">
                <Button variant="ghost" onClick={() => setViewedEntry(null)} className="w-full">Close</Button>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}
    </div>
  );
}
