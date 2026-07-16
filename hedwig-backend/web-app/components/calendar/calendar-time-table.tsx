'use client';

import { useEffect, useMemo, useState } from 'react';
import { Play, Square, PencilSimple, Trash, ClockCountdown } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { hedwigApi } from '@/lib/api/client';
import type { TimeEntry } from '@/components/time/types';

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function CalendarTimeTable({
  entries,
  activeTimers,
  projects,
  accessToken,
  selectedDate,
  onStart,
  onStop,
  onEdit,
  onDelete,
  elapsed,
  workspaceMembers,
}: {
  entries: TimeEntry[];
  activeTimers: TimeEntry[];
  projects: { id: string; name: string; client?: { id: string; name: string } }[];
  accessToken: string | null;
  selectedDate: Date | null;
  onStart: (projectId?: string) => void;
  onStop: (entryId: string) => void;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
  elapsed: Record<string, number>;
  workspaceMembers?: { id: string; name: string; email: string }[];
}) {
  const [today, setToday] = useState(new Date());
  useEffect(() => { setToday(new Date()); }, []);

  const dateStr = selectedDate
    ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const isToday = selectedDate
    ? selectedDate.toDateString() === today.toDateString()
    : true;

  const activeTimerMap = useMemo(() => {
    const map = new Map<string, TimeEntry>();
    for (const t of activeTimers) {
      map.set(t.projectId ?? '__no_project__', t);
    }
    return map;
  }, [activeTimers]);

  const dayTotalSeconds = useMemo(() => {
    return entries.reduce((sum, e) => sum + (e.durationSeconds || 0), 0);
  }, [entries]);

  const projectMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; client?: { id: string; name: string } }>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  const rows = useMemo(() => {
    const projectRows = new Map<string, { projectId: string | null; projectName: string; clientName: string; entries: TimeEntry[]; totalSeconds: number; totalAmount: number }>();

    for (const entry of entries) {
      const key = entry.projectId ?? '__no_project__';
      if (!projectRows.has(key)) {
        const project = entry.projectId ? projectMap.get(entry.projectId) : undefined;
        projectRows.set(key, {
          projectId: entry.projectId,
          projectName: project?.name ?? (entry.projectId ? 'Unknown project' : 'No project'),
          clientName: project?.client?.name ?? '',
          entries: [],
          totalSeconds: 0,
          totalAmount: 0,
        });
      }
      const row = projectRows.get(key)!;
      row.entries.push(entry);
      row.totalSeconds += entry.durationSeconds || 0;
      row.totalAmount += entry.billableAmount ? Number(entry.billableAmount) : 0;
    }

    return Array.from(projectRows.values()).sort((a, b) => b.totalSeconds - a.totalSeconds);
  }, [entries, projectMap]);

  const isRunning = (projectId: string | null) => activeTimerMap.has(projectId ?? '__no_project__');

  const getActiveEntry = (projectId: string | null) => activeTimerMap.get(projectId ?? '__no_project__');

  const canStartAny = activeTimers.length === 0;

  const memberMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string }>();
    if (workspaceMembers) for (const m of workspaceMembers) map.set(m.id, m);
    return map;
  }, [workspaceMembers]);

  const getMemberName = (assignedTo: string | null) => {
    if (!assignedTo) return null;
    return memberMap.get(assignedTo)?.name ?? null;
  };

  return (
    <div className="rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <h3 className="text-[15px] font-bold text-[var(--color-foreground)]">Time</h3>
          <p className="text-[12px] text-[var(--color-text-muted)]">
            {dateStr}{isToday ? ' · Today' : ''}
          </p>
        </div>
        {dayTotalSeconds > 0 && (
          <span className="text-[13px] font-semibold tabular-nums text-[var(--color-text-secondary)]">
            {fmtElapsed(dayTotalSeconds)} tracked
          </span>
        )}
      </div>

      {rows.length === 0 && activeTimers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
          <ClockCountdown className="h-8 w-8 text-[var(--color-border-input)]" weight="duotone" />
          <div>
            <p className="text-[14px] font-semibold text-[var(--color-foreground)]">No time tracked</p>
            <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">
              Start a timer or log time for this day.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-[var(--color-surface-secondary)]">
          {rows.map((row) => {
            const running = isRunning(row.projectId);
            const activeEntry = getActiveEntry(row.projectId);
            const rowElapsed = activeEntry ? (elapsed[activeEntry.id] ?? 0) : 0;

            return (
              <div key={row.projectId ?? '__no_project__'} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--color-background)]">
                <div className="flex shrink-0">
                  {running ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onStop(activeEntry!.id)}
                      className="h-8 w-8 rounded-full p-0"
                      title="Stop timer"
                    >
                      <Square className="h-3.5 w-3.5" weight="bold" />
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onStart(row.projectId ?? undefined)}
                      disabled={!canStartAny}
                      className="h-8 w-8 rounded-full p-0"
                      title={canStartAny ? 'Start timer' : 'Already running elsewhere'}
                    >
                      <Play className="h-3.5 w-3.5" weight="bold" />
                    </Button>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
                      {row.projectName}
                    </span>
                    {row.clientName && (
                      <span className="text-[11px] text-[var(--color-text-muted)]">· {row.clientName}</span>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-[12px] text-[var(--color-text-muted)]">
                    {row.entries.length} entr{row.entries.length !== 1 ? 'ies' : 'y'}
                    {running && (
                      <span className="font-semibold text-[var(--color-primary)]">
                        · {fmtDuration(rowElapsed)}
                      </span>
                    )}
                    {(() => {
                      const members = [...new Set(row.entries.map(e => e.assignedTo).filter(Boolean))];
                      if (members.length === 0) return null;
                      const names = members.map(id => getMemberName(id)).filter(Boolean);
                      if (names.length === 0) return null;
                      return <span>· {names.join(', ')}</span>;
                    })()}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">
                      {fmtElapsed(row.totalSeconds + (running ? rowElapsed : 0))}
                    </p>
                    {row.totalAmount > 0 && (
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        ${row.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEdit(row.entries[0]); }}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
                      aria-label="Edit entry"
                    >
                      <PencilSimple className="h-3.5 w-3.5" weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(row.entries[0].id); }}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                      aria-label="Delete entry"
                    >
                      <Trash className="h-3.5 w-3.5" weight="bold" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {activeTimers.length > 0 && (
            <>
              {activeTimers.map((at) => {
                if (rows.some(r => r.projectId === at.projectId)) return null;
                const elapsedSec = elapsed[at.id] ?? 0;
                return (
                  <div key={at.id} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--color-background)]">
                    <div className="flex shrink-0">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onStop(at.id)}
                        className="h-8 w-8 rounded-full p-0"
                        title="Stop timer"
                      >
                        <Square className="h-3.5 w-3.5" weight="bold" />
                      </Button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
                          {at.project?.name || 'No project'}
                        </span>
                        {at.project?.client && (
                          <span className="text-[11px] text-[var(--color-text-muted)]">· {at.project.client.name}</span>
                        )}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-[12px] text-[var(--color-text-muted)]">
                        {at.description || 'Running'}
                        <span className="font-semibold text-[var(--color-primary)]">
                          · {fmtDuration(elapsedSec)}
                        </span>
                        {at.assignedTo && (() => {
                          const name = getMemberName(at.assignedTo);
                          return name ? <span>· {name}</span> : null;
                        })()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => onEdit(at)}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-secondary)]"
                          aria-label="Edit entry"
                        >
                          <PencilSimple className="h-3.5 w-3.5" weight="bold" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(at.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                          aria-label="Delete entry"
                        >
                          <Trash className="h-3.5 w-3.5" weight="bold" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      <div className="border-t border-[var(--color-border)] px-5 py-3">
        <p className="text-[11px] text-[var(--color-text-muted)]">
          {rows.length} project{rows.length !== 1 ? 's' : ''} tracked
          {activeTimers.length > 0 && ` · ${activeTimers.length} timer${activeTimers.length !== 1 ? 's' : ''} running`}
        </p>
      </div>
    </div>
  );
}
