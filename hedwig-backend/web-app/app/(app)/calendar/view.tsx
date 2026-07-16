'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  ClockCountdown,
  FlagPennant,
  FolderSimple,
  NotePencil,
  Plus,
  Receipt,
  X,
} from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/providers/toast-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { hedwigApi } from '@/lib/api/client';
import { cn, formatShortDate } from '@/lib/utils';
import type { Invoice, Milestone, Project, Reminder } from '@/lib/models/entities';
import type { TimeEntry } from '@/components/time/types';
import { CalendarTimeTable } from '@/components/calendar/calendar-time-table';
import { DayDetailDialog } from '@/components/calendar/day-detail-dialog';
import { TimeEntryDialog } from '@/components/calendar/time-entry-dialog';

import type { FilterValue, PlannerItem } from '@/components/calendar/types';

type CalendarView = 'day' | 'week' | 'month';

type CalendarData = {
  reminders: Reminder[];
  milestones: Milestone[];
  invoices: Invoice[];
  projects: Project[];
};


const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'reminder', label: 'Reminders' },
  { value: 'milestone', label: 'Milestones' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'project', label: 'Projects' },
  { value: 'time_entry', label: 'Time' },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const weekStart = (d: Date): Date => {
  const r = sod(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
};

const buildMonthGrid = (year: number, month: number): Array<{ date: Date; inMonth: boolean }> => {
  const first = new Date(year, month, 1);
  const total = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = first.getDay() - 1; i >= 0; i--)
    cells.push({ date: new Date(year, month, -i), inMonth: false });
  for (let i = 1; i <= total; i++)
    cells.push({ date: new Date(year, month, i), inMonth: true });
  let fill = 1;
  while (cells.length < 42)
    cells.push({ date: new Date(year, month + 1, fill++), inMonth: false });
  return cells;
};

// ─── Visual helpers ───────────────────────────────────────────────────────────

const iconByKind = {
  reminder: ClockCountdown,
  milestone: FlagPennant,
  invoice: Receipt,
  project: FolderSimple,
  time_entry: ClockCountdown,
} satisfies Record<PlannerItem['kind'], typeof ClockCountdown>;

const badgeToneByKind: Record<PlannerItem['kind'], string> = {
  reminder: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]',
  milestone: 'bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]',
  invoice: 'bg-[var(--color-warning-soft)] text-[var(--color-text-tertiary)]',
  project: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]',
  time_entry: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]',
};

const dotColorByKind: Record<PlannerItem['kind'], string> = {
  reminder: 'bg-[var(--color-primary)]',
  milestone: 'bg-[var(--color-success)]',
  invoice: 'bg-[var(--color-warning)]',
  project: 'bg-[var(--color-accent)]',
  time_entry: 'bg-[var(--color-primary)]',
};

// ─── Main client ──────────────────────────────────────────────────────────────

export function CalendarClient({
  data,
  accessToken,
  selectedReminderId,
}: {
  data: CalendarData;
  accessToken: string | null;
  selectedReminderId?: string | null;
}) {
  const router = useRouter();
  const today = useMemo(() => sod(new Date()), []);
  const { activeWorkspace } = useWorkspaceContext();
  const { toast } = useToast();

  useAssistantPageContext('Calendar', {
    remindersCount: data.reminders.length,
    milestonesCount: data.milestones.length,
    invoicesCount: data.invoices.length,
    projectsCount: data.projects.length,
  });

  const [gcalConnected, setGcalConnected] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [view, setView] = useState<CalendarView>('week');
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');
  const [anchor, setAnchor] = useState<Date>(today);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogState, setDialogState] = useState<{ items: PlannerItem[]; index: number } | null>(null);
  const [editableReminders, setEditableReminders] = useState(data.reminders);
  const [isEditingReminder, setIsEditingReminder] = useState(false);
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [reminderFeedback, setReminderFeedback] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDueDate, setDraftDueDate] = useState('');

  // Time entry state
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [activeTimers, setActiveTimers] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; client?: { id: string; name: string } }[]>([]);
  const [elapsedMap, setElapsedMap] = useState<Record<string, number>>({});
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false);
  const [editingTimeEntry, setEditingTimeEntry] = useState<TimeEntry | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<{ id: string; name: string; email: string }[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    fetch('/api/integrations/composio/status', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d: { success: boolean; data: Array<{ provider: string; status: string }> }) => {
        const gcal = d.data?.find((i) => i.provider === 'google_calendar');
        setGcalConnected(!!gcal && gcal.status === 'connected');
      })
      .catch(() => setGcalConnected(false));
  }, [accessToken]);

  // Fetch time data on mount
  const opts = { accessToken, workspaceId: activeWorkspace?.id, disableMockFallback: true } as any;
  const todayDate = today.toISOString().slice(0, 10);

  useEffect(() => {
    if (!accessToken) return;
    const workspaceId = activeWorkspace?.id;
    Promise.all([
      hedwigApi.timeEntries({ from: todayDate, to: todayDate }, opts).catch(() => ({ entries: [] })),
      hedwigApi.timeEntryActiveAll(opts).catch(() => ({ entries: [] })),
      hedwigApi.projects(opts).catch(() => []),
      workspaceId ? hedwigApi.workspaceMembers(workspaceId, opts).catch(() => ({ members: [] })) : Promise.resolve({ members: [] }),
    ]).then(([entriesRes, activeRes, projList, membersRes]) => {
      setTimeEntries(entriesRes.entries || []);
      setActiveTimers(activeRes.entries || []);
      setProjects(projList as any[]);
      setWorkspaceMembers((membersRes as any)?.members || []);
    });
  }, [accessToken, activeWorkspace?.id]);

  // Live elapsed timer for all active timers
  useEffect(() => {
    if (activeTimers.length === 0) { setElapsedMap({}); return; }
    const tick = () => {
      const next: Record<string, number> = {};
      for (const t of activeTimers) {
        const start = new Date(t.startTime).getTime();
        next[t.id] = Math.max(0, Math.floor((Date.now() - start) / 1000));
      }
      setElapsedMap(next);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeTimers]);

  const refreshTimeData = useCallback(async () => {
    if (!accessToken) return;
    const workspaceId = activeWorkspace?.id;
    const [entriesRes, activeRes, projList, membersRes] = await Promise.all([
      hedwigApi.timeEntries({ from: todayDate, to: todayDate }, opts).catch(() => ({ entries: [] })),
      hedwigApi.timeEntryActiveAll(opts).catch(() => ({ entries: [] })),
      hedwigApi.projects(opts).catch(() => []),
      workspaceId ? hedwigApi.workspaceMembers(workspaceId, opts).catch(() => ({ members: [] })) : Promise.resolve({ members: [] }),
    ]);
    setTimeEntries(entriesRes.entries || []);
    setActiveTimers(activeRes.entries || []);
    setProjects(projList as any[]);
    setWorkspaceMembers((membersRes as any)?.members || []);
  }, [accessToken, activeWorkspace?.id]);

  const handleTimeStart = async (projectId?: string, assignedTo?: string) => {
    if (!accessToken) return;
    try {
      const res = await hedwigApi.createTimeEntry({ projectId, status: 'running', assignedTo: assignedTo || null }, opts);
      setActiveTimers(prev => [res.entry, ...prev]);
      refreshTimeData();
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed to start timer', message: e?.message || 'Please try again.' });
    }
  };

  const handleTimeStop = async (entryId: string) => {
    if (!accessToken) return;
    try {
      const res = await hedwigApi.updateTimeEntry(entryId, { action: 'stop' }, opts);
      setActiveTimers(prev => prev.filter(t => t.id !== entryId));
      setElapsedMap(prev => { const next = { ...prev }; delete next[entryId]; return next; });
      refreshTimeData();
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed to stop timer', message: e?.message || 'Please try again.' });
    }
  };

  const handleTimeCreate = async (data: any) => {
    if (!accessToken) return;
    try {
      await hedwigApi.createTimeEntry({ ...data, status: 'manual' }, opts);
      setShowTimeEntryForm(false);
      setEditingTimeEntry(null);
      refreshTimeData();
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed to save time entry', message: e?.message || 'Please try again.' });
    }
  };

  const handleTimeUpdate = async (data: any) => {
    if (!editingTimeEntry || !accessToken) return;
    try {
      await hedwigApi.updateTimeEntry(editingTimeEntry.id, data, opts);
      setShowTimeEntryForm(false);
      setEditingTimeEntry(null);
      refreshTimeData();
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed to update time entry', message: e?.message || 'Please try again.' });
    }
  };

  const handleTimeDelete = async (id: string) => {
    if (!accessToken) return;
    try {
      await hedwigApi.deleteTimeEntry(id, opts);
      refreshTimeData();
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed to delete time entry', message: e?.message || 'Please try again.' });
    }
  };

  const allItems = useMemo<PlannerItem[]>(
    () =>
      [
        ...editableReminders.map((i) => ({
          id: i.id,
          kind: 'reminder' as const,
          title: i.title,
          subtitle: i.kind.replace('_', ' '),
          meta: 'Reminder',
          date: i.dueAt,
          href: `/calendar?reminder=${i.id}`,
        })),
        ...data.milestones.map((i) => ({
          id: i.id,
          kind: 'milestone' as const,
          title: i.name,
          subtitle: i.status.replace('_', ' '),
          meta: 'Milestone',
          date: i.dueAt,
          href: `/projects/${i.projectId}?milestone=${i.id}`,
        })),
        ...data.invoices.map((i) => ({
          id: i.id,
          kind: 'invoice' as const,
          title: i.number,
          subtitle: i.status,
          meta: 'Invoice due',
          date: i.dueAt,
          href: `/payments?invoice=${i.id}`,
        })),
        ...data.projects.map((i) => ({
          id: i.id,
          kind: 'project' as const,
          title: i.name,
          subtitle: i.status,
          meta: 'Project deadline',
          date: i.nextDeadlineAt,
          href: `/projects/${i.id}`,
        })),
        ...timeEntries.map((i) => ({
          id: i.id,
          kind: 'time_entry' as const,
          title: i.project?.name || i.description || 'Time entry',
          subtitle: i.description || (i.project?.name ? 'Time tracked' : 'No description'),
          meta: 'Time entry',
          date: i.startTime,
          timeEntry: i,
        })),
        ...activeTimers.map((i) => ({
          id: i.id,
          kind: 'time_entry' as const,
          title: i.project?.name || i.description || 'Running timer',
          subtitle: i.description ? `Running · ${i.description}` : 'Running',
          meta: 'Time entry',
          date: i.startTime,
          timeEntry: i,
        })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [editableReminders, data.milestones, data.invoices, data.projects, timeEntries, activeTimers]
  );

  const filteredItems = useMemo(
    () => (activeFilter === 'all' ? allItems : allItems.filter((i) => i.kind === activeFilter)),
    [allItems, activeFilter]
  );

  const itemsForDate = (d: Date) => filteredItems.filter((i) => sameDay(new Date(i.date), d));
  const hasEvents = (d: Date) => itemsForDate(d).length > 0;

  const handleSelectItem = (item: PlannerItem) => {
    const date = sod(new Date(item.date));
    const dayItems = allItems.filter((i) => sameDay(new Date(i.date), date));
    const index = dayItems.findIndex((i) => i.id === item.id);
    setDialogState({ items: dayItems, index: Math.max(0, index) });
  };

  const selectedReminder = useMemo(
    () =>
      selectedReminderId
        ? allItems.find((i) => i.kind === 'reminder' && i.id === selectedReminderId) ?? null
        : null,
    [allItems, selectedReminderId]
  );

  useEffect(() => {
    if (!selectedReminder) {
      setIsEditingReminder(false);
      setReminderFeedback(null);
      setDraftTitle('');
      setDraftDueDate('');
      return;
    }
    setDraftTitle(selectedReminder.title);
    setDraftDueDate(selectedReminder.date.slice(0, 10));
  }, [selectedReminder]);

  const saveReminderEdit = async () => {
    if (!selectedReminder || !draftTitle.trim() || !draftDueDate || !accessToken) return;
    const orig = editableReminders.find((r) => r.id === selectedReminder.id);
    const nextDueAt = orig?.dueAt?.includes('T')
      ? `${draftDueDate}${orig.dueAt.slice(orig.dueAt.indexOf('T'))}`
      : `${draftDueDate}T09:00:00.000Z`;
    setIsSavingReminder(true);
    setReminderFeedback(null);
    try {
      const updated = await hedwigApi.updateCalendarEvent(
        selectedReminder.id,
        { title: draftTitle.trim(), eventDate: nextDueAt },
        { accessToken, disableMockFallback: true }
      );
      setEditableReminders((curr) => curr.map((r) => (r.id === updated.id ? updated : r)));
      setIsEditingReminder(false);
      setReminderFeedback('Reminder updated.');
    } catch (err: any) {
      setReminderFeedback(err?.message || 'Failed to update reminder.');
    } finally {
      setIsSavingReminder(false);
    }
  };

  const syncCalendar = async () => {
    if (isSyncing || !accessToken) return;
    setIsSyncing(true);
    try {
      await fetch('/api/integrations/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ provider: 'google_calendar' }),
      });
    } catch {
      // non-fatal
    } finally {
      setIsSyncing(false);
    }
  };

  const connectCalendar = async () => {
    if (!accessToken) return;
    try {
      const resp = await fetch('/api/integrations/composio/connect/google_calendar', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      const payload = await resp.json();
      if (resp.ok && payload.success && payload.data?.redirectUrl) {
        window.location.assign(payload.data.redirectUrl);
      }
    } catch {
      // non-fatal
    }
  };

  const navigate = (delta: number) => {
    setAnchor((prev) => {
      const next = new Date(prev);
      if (view === 'day') next.setDate(next.getDate() + delta);
      else if (view === 'week') next.setDate(next.getDate() + delta * 7);
      else next.setMonth(next.getMonth() + delta);
      return sod(next);
    });
  };

  const goToday = () => {
    setAnchor(today);
    setSelectedDate(null);
  };

  const handleSelectDate = (d: Date) => {
    const ds = sod(d);
    if (selectedDate && sameDay(ds, selectedDate)) {
      setSelectedDate(null);
    } else {
      setSelectedDate(ds);
      if (view === 'day') setAnchor(ds);
      if (
        view === 'month' &&
        (d.getMonth() !== anchor.getMonth() || d.getFullYear() !== anchor.getFullYear())
      ) {
        setAnchor(ds);
      }
    }
  };

  const headingText = useMemo(() => {
    if (view === 'day')
      return anchor.toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    if (view === 'week') {
      const ws = weekStart(anchor);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      if (ws.getMonth() === we.getMonth())
        return `${ws.toLocaleString('en-US', { month: 'long' })} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`;
      return `${ws.toLocaleString('en-US', { month: 'short' })} ${ws.getDate()} – ${we.toLocaleString('en-US', { month: 'short' })} ${we.getDate()}, ${we.getFullYear()}`;
    }
    return anchor.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }, [view, anchor]);

  const weekDays = useMemo(() => {
    const ws = weekStart(anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      return sod(d);
    });
  }, [anchor]);

  const grid = useMemo(
    () => buildMonthGrid(anchor.getFullYear(), anchor.getMonth()),
    [anchor]
  );

  const weekGroups = useMemo(() => {
    const ws = weekStart(anchor);
    const we = new Date(ws);
    we.setDate(we.getDate() + 7);
    const overdue = filteredItems.filter((i) => sod(new Date(i.date)) < ws);
    const inWeek = filteredItems.filter((i) => {
      const d = sod(new Date(i.date));
      return d >= ws && d < we;
    });
    const visible =
      selectedDate && weekDays.some((d) => sameDay(d, selectedDate))
        ? inWeek.filter((i) => sameDay(new Date(i.date), selectedDate))
        : inWeek;
    const map = new Map<string, { date: Date; items: PlannerItem[] }>();
    visible.forEach((i) => {
      const k = sod(new Date(i.date)).toISOString();
      if (!map.has(k)) map.set(k, { date: new Date(k), items: [] });
      map.get(k)!.items.push(i);
    });
    return { overdue, groups: Array.from(map.values()) };
  }, [filteredItems, anchor, selectedDate, weekDays]);

  const dayItems = filteredItems.filter((i) =>
    sameDay(new Date(i.date), selectedDate ?? anchor)
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-[var(--color-foreground)]">Calendar</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">
            Reminders, milestones, invoice due dates, and project deadlines.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5">
          {gcalConnected !== null &&
            (gcalConnected ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-success-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-success)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
                  Google Calendar connected
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={syncCalendar}
                  disabled={isSyncing}
                  title="Sync Google Calendar"
                  className="h-8 w-8 rounded-full"
                >
                  <ArrowsClockwise className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={connectCalendar}
                className="rounded-full px-3 text-[13px] font-medium"
              >
                Connect Google Calendar
              </Button>
            ))}
          {/* View switcher */}
          <div className="flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-0.5">
            {(['day', 'week', 'month'] as CalendarView[]).map((v) => (
              <Button
                key={v}
                variant="ghost"
                size="sm"
                onClick={() => {
                  setView(v);
                  setSelectedDate(null);
                }}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[12px] font-semibold capitalize',
                  view === v
                    ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-xs'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                )}
              >
                {v}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 border-b border-[var(--color-surface-tertiary)] px-6 py-3.5">
          <div className="flex items-center gap-1 overflow-x-auto">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                variant="ghost"
                size="sm"
                onClick={() => setActiveFilter(f.value)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold',
                  activeFilter === f.value
                    ? 'bg-[var(--color-border-light)] text-[var(--color-foreground)]'
                    : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]'
                )}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="h-8 w-8 rounded-full text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]"
            >
              <CaretLeft className="h-4 w-4" weight="bold" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={goToday}
              className="h-8 rounded-full px-3 text-[12px] font-semibold"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(1)}
              className="h-8 w-8 rounded-full text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]"
            >
              <CaretRight className="h-4 w-4" weight="bold" />
            </Button>
            <span className="ml-2 text-[13px] font-semibold text-[var(--color-foreground)]">{headingText}</span>
          </div>
        </div>

        {/* View content */}
        <div className="p-6">
          {view === 'week' && (
            <WeekView
              weekDays={weekDays}
              today={today}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              hasEvents={hasEvents}
              weekGroups={weekGroups}
              selectedReminder={selectedReminder}
              onSelectItem={handleSelectItem}
              onClearDate={() => setSelectedDate(null)}
              onClearReminder={() => router.push('/calendar')}
              isEditingReminder={isEditingReminder}
              isSavingReminder={isSavingReminder}
              reminderFeedback={reminderFeedback}
              draftTitle={draftTitle}
              draftDueDate={draftDueDate}
              setDraftTitle={setDraftTitle}
              setDraftDueDate={setDraftDueDate}
              setIsEditingReminder={setIsEditingReminder}
              setReminderFeedback={setReminderFeedback}
              saveReminderEdit={saveReminderEdit}
            />
          )}
          {view === 'month' && (
            <MonthView
              grid={grid}
              today={today}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              itemsForDate={itemsForDate}
              onSelectItem={handleSelectItem}
            />
          )}
          {view === 'day' && (
            <DayView
              anchor={anchor}
              today={today}
              grid={grid}
              selectedDate={selectedDate ?? anchor}
              onSelectDate={(d) => {
                handleSelectDate(d);
                setAnchor(sod(d));
              }}
              hasEvents={hasEvents}
              dayItems={dayItems}
              onSelectItem={handleSelectItem}
            />
          )}
        </div>

        {/* Unified day detail dialog */}
        {dialogState && (
          <DayDetailDialog
            items={dialogState.items}
            currentIndex={dialogState.index}
            onIndexChange={(idx) => setDialogState((prev) => prev ? { ...prev, index: idx } : null)}
            editableReminders={editableReminders}
            setEditableReminders={setEditableReminders}
            accessToken={accessToken}
            workspaceMembers={workspaceMembers}
            onNavigate={(href) => {
              setDialogState(null);
              router.push(href);
            }}
            onClose={() => setDialogState(null)}
          />
        )}
      </section>

      {/* Time table */}
      {accessToken && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--color-foreground)]">Time tracking</h2>
              <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">
                Per-project timers for {selectedDate ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'today'}.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => { setEditingTimeEntry(null); setShowTimeEntryForm(true); }}>
              <Plus className="h-3.5 w-3.5" weight="bold" /> Log time
            </Button>
          </div>
          <CalendarTimeTable
            entries={timeEntries}
            activeTimers={activeTimers}
            projects={projects}
            accessToken={accessToken}
            selectedDate={selectedDate}
            onStart={handleTimeStart}
            onStop={handleTimeStop}
            onEdit={(entry) => { setEditingTimeEntry(entry); setShowTimeEntryForm(true); }}
            onDelete={handleTimeDelete}
            elapsed={elapsedMap}
            workspaceMembers={workspaceMembers}
          />
        </>
      )}

      {/* Time entry dialogs */}
      {showTimeEntryForm && (
        <TimeEntryDialog
          initial={editingTimeEntry}
          selectedDate={selectedDate}
          accessToken={accessToken}
          workspaceMembers={workspaceMembers}
          onSave={editingTimeEntry ? handleTimeUpdate : handleTimeCreate}
          onClose={() => { setShowTimeEntryForm(false); setEditingTimeEntry(null); }}
        />
      )}
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({
  weekDays,
  today,
  selectedDate,
  onSelectDate,
  hasEvents,
  weekGroups,
  selectedReminder,
  onSelectItem,
  onClearDate,
  onClearReminder,
  isEditingReminder,
  isSavingReminder,
  reminderFeedback,
  draftTitle,
  draftDueDate,
  setDraftTitle,
  setDraftDueDate,
  setIsEditingReminder,
  setReminderFeedback,
  saveReminderEdit,
}: {
  weekDays: Date[];
  today: Date;
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
  hasEvents: (d: Date) => boolean;
  weekGroups: { overdue: PlannerItem[]; groups: { date: Date; items: PlannerItem[] }[] };
  selectedReminder: PlannerItem | null;
  onSelectItem: (item: PlannerItem) => void;
  onClearDate: () => void;
  onClearReminder: () => void;
  isEditingReminder: boolean;
  isSavingReminder: boolean;
  reminderFeedback: string | null;
  draftTitle: string;
  draftDueDate: string;
  setDraftTitle: (v: string) => void;
  setDraftDueDate: (v: string) => void;
  setIsEditingReminder: (v: boolean) => void;
  setReminderFeedback: (v: string | null) => void;
  saveReminderEdit: () => void;
}) {
  return (
    <div className={cn('grid gap-6', selectedReminder ? 'xl:grid-cols-[minmax(0,1fr)_300px]' : '')}>
      <div>
        {/* 7-day strip */}

        <div className="grid grid-cols-7 gap-1 rounded-2xl border border-[var(--color-surface-tertiary)] bg-[var(--color-background)] p-1.5">
          {weekDays.map((day) => {
            const isToday = sameDay(day, today);
            const isSelected = selectedDate ? sameDay(day, selectedDate) : false;
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onSelectDate(day)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl py-3 transition',
                  isSelected
                    ? 'bg-[var(--color-primary)]'
                    : isToday
                      ? 'bg-[var(--color-foreground)]'
                      : 'hover:bg-[var(--color-surface)] hover:shadow-xs'
                )}
              >
                <span
                  className={cn(
                    'text-[11px] font-medium',
                    isSelected ? 'text-white/70' : isToday ? 'text-[var(--color-background)]/70' : 'text-[var(--color-text-muted)]'
                  )}
                >
                  {day.toLocaleString('en-US', { weekday: 'short' })}
                </span>
                <span
                  className={cn(
                    'text-[16px] font-semibold leading-none',
                    isSelected ? 'text-white' : isToday ? 'text-[var(--color-background)]' : 'text-[var(--color-foreground)]'
                  )}
                >
                  {day.getDate()}
                </span>
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    hasEvents(day)
                      ? isSelected || isToday
                        ? 'bg-[var(--color-surface)]/50'
                        : 'bg-[var(--color-primary)]'
                      : 'bg-transparent'
                  )}
                />
              </button>
            );
          })}
        </div>

        {/* Selected date label */}
        {selectedDate && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[var(--color-foreground)]">
              {selectedDate.toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearDate}
              className="text-[12px] font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            >
              Show week
            </Button>
          </div>
        )}

        {/* Event list */}
        <div className="mt-5 space-y-6">
          {!selectedDate && weekGroups.overdue.length > 0 && (
            <div>
              <SectionHeading label="Overdue" accent="text-[var(--color-danger)]" />
              <div className="mt-2 space-y-0.5">
                {weekGroups.overdue.map((item) => (
                  <EventRow key={item.id} item={item} onSelectItem={onSelectItem} />
                ))}
              </div>
            </div>
          )}

          {weekGroups.groups.length === 0 ? (
            <EmptyState
              message={selectedDate ? 'Nothing scheduled for this day.' : 'Nothing scheduled this week.'}
            />
          ) : (
            weekGroups.groups.map((group) => (
              <div key={group.date.toISOString()}>
                <SectionHeading
                  label={group.date.toLocaleString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                  suffix={sameDay(group.date, today) ? 'Today' : undefined}
                />
                <div className="mt-2 space-y-0.5">
                  {group.items.map((item) => (
                    <EventRow key={item.id} item={item} onSelectItem={onSelectItem} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedReminder && (
        <ReminderPanel
          reminder={selectedReminder}
          isEditing={isEditingReminder}
          isSaving={isSavingReminder}
          feedback={reminderFeedback}
          draftTitle={draftTitle}
          draftDueDate={draftDueDate}
          setDraftTitle={setDraftTitle}
          setDraftDueDate={setDraftDueDate}
          setIsEditing={setIsEditingReminder}
          setFeedback={setReminderFeedback}
          onSave={saveReminderEdit}
          onClear={onClearReminder}
        />
      )}
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({
  grid,
  today,
  selectedDate,
  onSelectDate,
  itemsForDate,
  onSelectItem,
}: {
  grid: Array<{ date: Date; inMonth: boolean }>;
  today: Date;
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
  itemsForDate: (d: Date) => PlannerItem[];
  onSelectItem: (item: PlannerItem) => void;
}) {
  const selectedItems = selectedDate ? itemsForDate(selectedDate) : [];

  return (
    <div className="space-y-4">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 text-center">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div
            key={d}
            className="py-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl bg-[var(--color-surface-tertiary)]">
        {grid.map(({ date, inMonth }) => {
          const isToday = sameDay(date, today);
          const isSelected = selectedDate ? sameDay(date, selectedDate) : false;
          const items = itemsForDate(date);

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelectDate(date)}
              className={cn(
                'group flex min-h-[76px] flex-col bg-[var(--color-surface)] px-2 py-2 text-left transition hover:bg-[var(--color-background)]',
                isSelected && 'bg-[var(--color-accent-soft)] hover:bg-[var(--color-accent-soft)]',
                !inMonth && 'opacity-40'
              )}
            >
              <span
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold',
                  isSelected
                    ? 'bg-[var(--color-primary)] text-white'
                    : isToday
                      ? 'bg-[var(--color-foreground)] text-[var(--color-background)]'
                      : 'text-[var(--color-foreground)] group-hover:bg-[var(--color-surface-tertiary)]'
                )}
              >
                {date.getDate()}
              </span>
              {items.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-0.5 px-0.5">
                  {items.slice(0, 3).map((item, idx) => (
                    <span
                      key={idx}
                      className={cn('h-1.5 w-1.5 rounded-full', dotColorByKind[item.kind])}
                    />
                  ))}
                  {items.length > 3 && (
                    <span className="text-[9px] font-bold text-[var(--color-text-muted)]">+{items.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day event list */}
      {selectedDate && (
        <div className="rounded-2xl border border-[var(--color-border)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">
              {selectedDate.toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
              {sameDay(selectedDate, today) && (
                <span className="ml-2 text-[13px] font-normal text-[var(--color-text-muted)]">Today</span>
              )}
            </h3>
            <span className="text-[12px] text-[var(--color-text-muted)]">
              {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''}
            </span>
          </div>
          {selectedItems.length === 0 ? (
            <EmptyState message="Nothing scheduled for this day." />
          ) : (
            <div className="space-y-0.5">
              {selectedItems.map((item) => (
                <EventRow key={item.id} item={item} onSelectItem={onSelectItem} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Day view ─────────────────────────────────────────────────────────────────

function DayView({
  anchor,
  today,
  grid,
  selectedDate,
  onSelectDate,
  hasEvents,
  dayItems,
  onSelectItem,
}: {
  anchor: Date;
  today: Date;
  grid: Array<{ date: Date; inMonth: boolean }>;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  hasEvents: (d: Date) => boolean;
  dayItems: PlannerItem[];
  onSelectItem: (item: PlannerItem) => void;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Mini month calendar */}
      <div>
        <p className="mb-3 text-[12px] font-semibold text-[var(--color-foreground)]">
          {anchor.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
        </p>
        <div className="grid grid-cols-7 text-center">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div
              key={i}
              className="py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-y-0.5">
          {grid.map(({ date, inMonth }) => {
            const isToday = sameDay(date, today);
            const isSelected = sameDay(date, selectedDate);
            return (
              <button
                key={date.toISOString()}
                type="button"
                onClick={() => onSelectDate(date)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-lg py-1 transition',
                  isSelected
                    ? 'bg-[var(--color-primary)]'
                    : isToday
                      ? 'bg-[var(--color-foreground)]'
                      : 'hover:bg-[var(--color-surface-tertiary)]',
                  !inMonth && 'opacity-30'
                )}
              >
                <span
                  className={cn(
                    'text-[12px] font-semibold leading-none',
                    isSelected ? 'text-white' : isToday ? 'text-[var(--color-background)]' : 'text-[var(--color-foreground)]'
                  )}
                >
                    {date.getDate()}
                </span>
                <span
                  className={cn(
                    'h-1 w-1 rounded-full',
                    hasEvents(date)
                      ? isSelected || isToday
                        ? 'bg-[var(--color-surface)]/50'
                        : 'bg-[var(--color-primary)]'
                      : 'bg-transparent'
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Day events */}
      <div>
        <div className="mb-4 border-b border-[var(--color-surface-tertiary)] pb-3">
          <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">
            {selectedDate.toLocaleString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
            {sameDay(selectedDate, today) && (
              <span className="ml-2 text-[14px] font-normal text-[var(--color-text-muted)]">· Today</span>
            )}
          </h2>
        </div>
        {dayItems.length === 0 ? (
          <EmptyState message="Nothing scheduled for this day." />
        ) : (
          <div className="space-y-0.5">
            {dayItems.map((item) => (
              <EventRow key={item.id} item={item} onSelectItem={onSelectItem} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reminder panel ───────────────────────────────────────────────────────────

function ReminderPanel({
  reminder,
  isEditing,
  isSaving,
  feedback,
  draftTitle,
  draftDueDate,
  setDraftTitle,
  setDraftDueDate,
  setIsEditing,
  setFeedback,
  onSave,
  onClear,
}: {
  reminder: PlannerItem;
  isEditing: boolean;
  isSaving: boolean;
  feedback: string | null;
  draftTitle: string;
  draftDueDate: string;
  setDraftTitle: (v: string) => void;
  setDraftDueDate: (v: string) => void;
  setIsEditing: (v: boolean) => void;
  setFeedback: (v: string | null) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  return (
    <aside className="h-fit rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
            Reminder
          </p>
          <h3 className="mt-1.5 text-[15px] font-semibold text-[var(--color-foreground)]">{reminder.title}</h3>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onClear}
          className="h-7 rounded-full px-2.5 text-[11px] font-semibold"
        >
          Clear
        </Button>
      </div>

      <div className="mt-4 space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
        {feedback && (
          <div className="rounded-xl border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-text-secondary)]">
            {feedback}
          </div>
        )}
        {isEditing ? (
          <>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                Title
              </p>
              <Input
                className="mt-1.5 bg-[var(--color-surface)]"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                Due date
              </p>
              <Input
                className="mt-1.5 bg-[var(--color-surface)]"
                type="date"
                value={draftDueDate}
                onChange={(e) => setDraftDueDate(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                Category
              </p>
              <p className="mt-1 text-[13px] font-medium text-[var(--color-foreground)]">{reminder.subtitle}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                Due date
              </p>
              <p className="mt-1 text-[13px] font-medium text-[var(--color-foreground)]">
                {formatShortDate(reminder.date)}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isEditing ? (
          <>
            <Button disabled={isSaving} size="sm" type="button" onClick={onSave}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
            <Button
              disabled={isSaving}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => {
                setIsEditing(false);
                setFeedback(null);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => setIsEditing(true)}
          >
            <NotePencil className="h-4 w-4" weight="bold" />
            Edit
          </Button>
        )}
      </div>
    </aside>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function SectionHeading({
  label,
  suffix,
  accent,
}: {
  label: string;
  suffix?: string;
  accent?: string;
}) {
  return (
    <div className="border-b border-[var(--color-surface-tertiary)] pb-2">
      <h3 className={cn('text-[13px] font-semibold text-[var(--color-foreground)]', accent)}>
        {label}
        {suffix && <span className="ml-2 font-normal text-[var(--color-text-muted)]">· {suffix}</span>}
      </h3>
    </div>
  );
}

function EventRow({
  item,
  onSelectItem,
}: {
  item: PlannerItem;
  onSelectItem: (item: PlannerItem) => void;
}) {
  const Icon = iconByKind[item.kind];

  return (
    <div
      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[var(--color-surface-secondary)]"
      onClick={() => onSelectItem(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectItem(item); }
      }}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dotColorByKind[item.kind])} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--color-foreground)]">{item.title}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              badgeToneByKind[item.kind]
            )}
          >
            <Icon className="h-3 w-3" weight="bold" />
            {item.meta}
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)]">{item.subtitle}</span>
        </div>
      </div>
      <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">{formatShortDate(item.date)}</span>
    </div>
  );
}

// ─── Item detail dialog ───────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border-input)] px-4 py-10 text-center text-[13px] text-[var(--color-text-muted)]">
      {message}
    </div>
  );
}
