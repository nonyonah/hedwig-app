'use client';

import { useEffect, useMemo, useState } from 'react';
import { Table } from '@heroui/react';
import { Play, Square, ClockCountdown } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
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

  const canStartAny = activeTimers.length === 0;

  const memberMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string }>();
    if (workspaceMembers) for (const m of workspaceMembers) map.set(m.id, m);
    return map;
  }, [workspaceMembers]);

  const tableRows = useMemo(() => {
    const activeTimerMap = new Map<string, TimeEntry>();
    for (const t of activeTimers) {
      activeTimerMap.set(t.projectId ?? '__no_project__', t);
    }

    interface TableRowData {
      key: string;
      projectName: string;
      clientName: string;
      descriptionBase: string;
      totalSeconds: number;
      billableAmount: number;
      isRunning: boolean;
      activeEntryId: string | undefined;
      entry: TimeEntry;
      memberNames: string[];
    }

    const result: TableRowData[] = [];

    for (const row of rows) {
      const running = activeTimerMap.has(row.projectId ?? '__no_project__');
      const activeEntry = running ? activeTimerMap.get(row.projectId ?? '__no_project__') : undefined;
      const members = [...new Set(row.entries.map(e => e.assignedTo).filter((v): v is string => !!v))];
      const memberNames = members.map(id => memberMap.get(id)?.name).filter((v): v is string => !!v);

      result.push({
        key: row.projectId ?? '__no_project__',
        projectName: row.projectName,
        clientName: row.clientName,
        descriptionBase: `${row.entries.length} entr${row.entries.length !== 1 ? 'ies' : 'y'}`,
        totalSeconds: row.totalSeconds,
        billableAmount: row.totalAmount,
        isRunning: running,
        activeEntryId: activeEntry?.id,
        entry: row.entries[0],
        memberNames,
      });
    }

    for (const at of activeTimers) {
      if (rows.some(r => r.projectId === at.projectId)) continue;
      const name = at.assignedTo ? memberMap.get(at.assignedTo)?.name : null;

      result.push({
        key: at.id,
        projectName: at.project?.name || 'No project',
        clientName: at.project?.client?.name || '',
        descriptionBase: at.description || 'Running',
        totalSeconds: 0,
        billableAmount: at.billableAmount ? Number(at.billableAmount) : 0,
        isRunning: true,
        activeEntryId: at.id,
        entry: at,
        memberNames: name ? [name] : [],
      });
    }

    return result;
  }, [rows, activeTimers, memberMap]);

  return (
    <div className="rounded-2xl bg-[var(--color-surface)] shadow-xs">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <div>
          <h3 className="text-[15px] font-bold text-[var(--color-foreground)]">Time</h3>
          <p className="text-[12px] text-[var(--color-text-tertiary)]">
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
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label="Time entries">
              <Table.Header>
                <Table.Column isRowHeader className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Project</Table.Column>
                <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Task</Table.Column>
                <Table.Column className="text-right text-[11px] font-medium text-[var(--color-text-tertiary)]">Duration</Table.Column>
                <Table.Column className="text-right text-[11px] font-medium text-[var(--color-text-tertiary)]">Billable</Table.Column>
                <Table.Column />
              </Table.Header>
              <Table.Body>
                {tableRows.map((row) => {
                  const runningElapsed = row.isRunning && row.activeEntryId ? (elapsed[row.activeEntryId] ?? 0) : 0;

                  return (
                    <Table.Row key={row.key}>
                      <Table.Cell>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
                            {row.projectName}
                          </span>
                          {row.clientName && (
                            <span className="text-[11px] text-[var(--color-text-muted)]">· {row.clientName}</span>
                          )}
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[12px] text-[var(--color-text-muted)]">{row.descriptionBase}</span>
                          {row.isRunning && (
                            <span className="text-[12px] font-semibold text-[var(--color-primary)]">
                              · {fmtDuration(runningElapsed)}
                            </span>
                          )}
                          {row.memberNames.length > 0 && (
                            <span className="text-[12px] text-[var(--color-text-muted)]">· {row.memberNames.join(', ')}</span>
                          )}
                        </div>
                      </Table.Cell>
                      <Table.Cell className="text-right text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">
                        {fmtElapsed(row.totalSeconds + runningElapsed)}
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {row.billableAmount > 0 && (
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            ${row.billableAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex items-center gap-1 justify-end">
                          {row.isRunning ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => onStop(row.activeEntryId!)}
                              className="h-8 w-8 rounded-full p-0"
                              title="Stop timer"
                            >
                              <Square className="h-3.5 w-3.5" weight="bold" />
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onStart(row.entry.projectId ?? undefined)}
                              disabled={!canStartAny}
                              className="h-8 w-8 rounded-full p-0"
                              title={canStartAny ? 'Start timer' : 'Already running elsewhere'}
                            >
                              <Play className="h-3.5 w-3.5" weight="bold" />
                            </Button>
                          )}
                          <RowActionsMenu
                            items={[
                              { label: 'Edit', onClick: () => onEdit(row.entry) },
                              { label: 'Delete', onClick: () => onDelete(row.entry.id), destructive: true },
                            ]}
                          />
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
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
