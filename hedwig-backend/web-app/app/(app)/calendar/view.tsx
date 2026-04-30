'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowSquareOut,
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  ClockCountdown,
  FlagPennant,
  FolderSimple,
  NotePencil,
  Receipt,
  X,
} from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { hedwigApi } from '@/lib/api/client';
import { cn, formatShortDate } from '@/lib/utils';
import type { Invoice, Milestone, Project, Reminder } from '@/lib/models/entities';

type CalendarView = 'day' | 'week' | 'month';
type FilterValue = 'all' | 'reminder' | 'milestone' | 'invoice' | 'project';

type CalendarData = {
  reminders: Reminder[];
  milestones: Milestone[];
  invoices: Invoice[];
  projects: Project[];
};

type PlannerItem = {
  id: string;
  kind: 'reminder' | 'milestone' | 'invoice' | 'project';
  title: string;
  subtitle: string;
  meta: string;
  date: string;
  href?: string;
};

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'reminder', label: 'Reminders' },
  { value: 'milestone', label: 'Milestones' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'project', label: 'Projects' },
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
} satisfies Record<PlannerItem['kind'], typeof ClockCountdown>;

const badgeToneByKind: Record<PlannerItem['kind'], string> = {
  reminder: 'bg-[#eff4ff] text-[#717680]',
  milestone: 'bg-[#ecfdf3] text-[#717680]',
  invoice: 'bg-[#fffaeb] text-[#717680]',
  project: 'bg-[#f4f3ff] text-[#717680]',
};

const dotColorByKind: Record<PlannerItem['kind'], string> = {
  reminder: 'bg-[#2563eb]',
  milestone: 'bg-[#12b76a]',
  invoice: 'bg-[#f79009]',
  project: 'bg-[#7c3aed]',
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

  const [gcalConnected, setGcalConnected] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [view, setView] = useState<CalendarView>('week');
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');
  const [anchor, setAnchor] = useState<Date>(today);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [activeItem, setActiveItem] = useState<PlannerItem | null>(null);
  const [editableReminders, setEditableReminders] = useState(data.reminders);
  const [isEditingReminder, setIsEditingReminder] = useState(false);
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [reminderFeedback, setReminderFeedback] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDueDate, setDraftDueDate] = useState('');

  useEffect(() => {
    fetch('/api/integrations/status')
      .then((r) => r.json())
      .then((d: { success: boolean; data: Array<{ provider: string; status: string }> }) => {
        const gcal = d.data?.find((i) => i.provider === 'google_calendar');
        setGcalConnected(!!gcal && gcal.status === 'connected');
      })
      .catch(() => setGcalConnected(false));
  }, []);

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
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [editableReminders, data.milestones, data.invoices, data.projects]
  );

  const filteredItems = useMemo(
    () => (activeFilter === 'all' ? allItems : allItems.filter((i) => i.kind === activeFilter)),
    [allItems, activeFilter]
  );

  const itemsForDate = (d: Date) => filteredItems.filter((i) => sameDay(new Date(i.date), d));
  const hasEvents = (d: Date) => itemsForDate(d).length > 0;

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google_calendar' }),
      });
    } catch {
      // non-fatal
    } finally {
      setIsSyncing(false);
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
          <h1 className="text-[15px] font-semibold text-[#181d27]">Calendar</h1>
          <p className="mt-0.5 text-[13px] text-[#a4a7ae]">
            Reminders, milestones, invoice due dates, and project deadlines.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5">
          {gcalConnected !== null &&
            (gcalConnected ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf3] px-3 py-1.5 text-[12px] font-semibold text-[#12b76a]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#12b76a]" />
                  Google Calendar connected
                </span>
                <button
                  type="button"
                  onClick={syncCalendar}
                  disabled={isSyncing}
                  title="Sync Google Calendar"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e9eaeb] bg-white text-[#717680] shadow-xs transition hover:bg-[#f9fafb] disabled:opacity-50"
                >
                  <ArrowsClockwise className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                </button>
              </>
            ) : (
              <a
                href="/api/integrations/composio/connect/google_calendar"
                className="inline-flex h-8 items-center gap-2 rounded-full border border-[#d5d7da] bg-white px-3 text-[13px] font-medium text-[#414651] shadow-xs transition hover:bg-[#fafafa]"
              >
                Connect Google Calendar
              </a>
            ))}
          {/* View switcher */}
          <div className="flex rounded-full border border-[#e9eaeb] bg-[#f9fafb] p-0.5">
            {(['day', 'week', 'month'] as CalendarView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setView(v);
                  setSelectedDate(null);
                }}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[12px] font-semibold capitalize transition',
                  view === v
                    ? 'bg-white text-[#181d27] shadow-xs'
                    : 'text-[#717680] hover:text-[#414651]'
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 border-b border-[#f2f4f7] px-6 py-3.5">
          <div className="flex items-center gap-1 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setActiveFilter(f.value)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition',
                  activeFilter === f.value
                    ? 'bg-[#ececec] text-[#181d27]'
                    : 'text-[#717680] hover:bg-[#f4f4f5]'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#717680] transition hover:bg-[#f4f4f5]"
            >
              <CaretLeft className="h-4 w-4" weight="bold" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="h-8 rounded-full border border-[#e9eaeb] px-3 text-[12px] font-semibold text-[#414651] transition hover:bg-[#f9fafb]"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => navigate(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#717680] transition hover:bg-[#f4f4f5]"
            >
              <CaretRight className="h-4 w-4" weight="bold" />
            </button>
            <span className="ml-2 text-[13px] font-semibold text-[#181d27]">{headingText}</span>
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
              onSelectItem={setActiveItem}
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
              onSelectItem={setActiveItem}
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
              onSelectItem={setActiveItem}
            />
          )}
        </div>

        {/* Item detail dialog */}
        {activeItem && (
          <ItemDetailDialog
            item={activeItem}
            editableReminders={editableReminders}
            setEditableReminders={setEditableReminders}
            accessToken={accessToken}
            onNavigate={(href) => { setActiveItem(null); router.push(href); }}
            onClose={() => setActiveItem(null)}
          />
        )}
      </section>
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

        <div className="grid grid-cols-7 gap-1 rounded-2xl border border-[#f2f4f7] bg-[#fafafa] p-1.5">
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
                    ? 'bg-[#2563eb]'
                    : isToday
                      ? 'bg-[#181d27]'
                      : 'hover:bg-white hover:shadow-xs'
                )}
              >
                <span
                  className={cn(
                    'text-[11px] font-medium',
                    isSelected || isToday ? 'text-white/70' : 'text-[#a4a7ae]'
                  )}
                >
                  {day.toLocaleString('en-US', { weekday: 'short' })}
                </span>
                <span
                  className={cn(
                    'text-[16px] font-semibold leading-none',
                    isSelected || isToday ? 'text-white' : 'text-[#181d27]'
                  )}
                >
                  {day.getDate()}
                </span>
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    hasEvents(day)
                      ? isSelected || isToday
                        ? 'bg-white/50'
                        : 'bg-[#2563eb]'
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
            <p className="text-[13px] font-semibold text-[#181d27]">
              {selectedDate.toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            <button
              type="button"
              onClick={onClearDate}
              className="text-[12px] font-semibold text-[#717680] transition hover:text-[#414651]"
            >
              Show week
            </button>
          </div>
        )}

        {/* Event list */}
        <div className="mt-5 space-y-6">
          {!selectedDate && weekGroups.overdue.length > 0 && (
            <div>
              <SectionHeading label="Overdue" accent="text-[#f04438]" />
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
            className="py-2 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl bg-[#f2f4f7]">
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
                'group flex min-h-[76px] flex-col bg-white px-2 py-2 text-left transition hover:bg-[#fafafa]',
                isSelected && 'bg-[#eff4ff] hover:bg-[#eff4ff]',
                !inMonth && 'opacity-40'
              )}
            >
              <span
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold',
                  isSelected
                    ? 'bg-[#2563eb] text-white'
                    : isToday
                      ? 'bg-[#181d27] text-white'
                      : 'text-[#181d27] group-hover:bg-[#f0f0f0]'
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
                    <span className="text-[9px] font-bold text-[#a4a7ae]">+{items.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day event list */}
      {selectedDate && (
        <div className="rounded-2xl border border-[#e9eaeb] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-[#181d27]">
              {selectedDate.toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
              {sameDay(selectedDate, today) && (
                <span className="ml-2 text-[13px] font-normal text-[#a4a7ae]">Today</span>
              )}
            </h3>
            <span className="text-[12px] text-[#a4a7ae]">
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
        <p className="mb-3 text-[12px] font-semibold text-[#181d27]">
          {anchor.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
        </p>
        <div className="grid grid-cols-7 text-center">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div
              key={i}
              className="py-1 text-[10px] font-semibold uppercase tracking-wider text-[#a4a7ae]"
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
                    ? 'bg-[#2563eb]'
                    : isToday
                      ? 'bg-[#181d27]'
                      : 'hover:bg-[#f4f4f5]',
                  !inMonth && 'opacity-30'
                )}
              >
                <span
                  className={cn(
                    'text-[12px] font-semibold leading-none',
                    isSelected || isToday ? 'text-white' : 'text-[#181d27]'
                  )}
                >
                  {date.getDate()}
                </span>
                <span
                  className={cn(
                    'h-1 w-1 rounded-full',
                    hasEvents(date)
                      ? isSelected || isToday
                        ? 'bg-white/50'
                        : 'bg-[#2563eb]'
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
        <div className="mb-4 border-b border-[#f2f4f7] pb-3">
          <h2 className="text-[16px] font-semibold text-[#181d27]">
            {selectedDate.toLocaleString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
            {sameDay(selectedDate, today) && (
              <span className="ml-2 text-[14px] font-normal text-[#a4a7ae]">· Today</span>
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
    <aside className="h-fit rounded-2xl border border-[#e9eaeb] bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
            Reminder
          </p>
          <h3 className="mt-1.5 text-[15px] font-semibold text-[#181d27]">{reminder.title}</h3>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-7 items-center rounded-full border border-[#d5d7da] bg-white px-2.5 text-[11px] font-semibold text-[#414651] shadow-xs transition hover:bg-[#fafafa]"
        >
          Clear
        </button>
      </div>

      <div className="mt-4 space-y-3 rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] p-4">
        {feedback && (
          <div className="rounded-xl border border-[#d5d7da] bg-white px-3 py-2 text-[13px] text-[#414651]">
            {feedback}
          </div>
        )}
        {isEditing ? (
          <>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                Title
              </p>
              <Input
                className="mt-1.5 bg-white"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                Due date
              </p>
              <Input
                className="mt-1.5 bg-white"
                type="date"
                value={draftDueDate}
                onChange={(e) => setDraftDueDate(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                Category
              </p>
              <p className="mt-1 text-[13px] font-medium text-[#181d27]">{reminder.subtitle}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                Due date
              </p>
              <p className="mt-1 text-[13px] font-medium text-[#181d27]">
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
    <div className="border-b border-[#f2f4f7] pb-2">
      <h3 className={cn('text-[13px] font-semibold text-[#181d27]', accent)}>
        {label}
        {suffix && <span className="ml-2 font-normal text-[#a4a7ae]">· {suffix}</span>}
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
      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[#f9fafb]"
      onClick={() => onSelectItem(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectItem(item); }
      }}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dotColorByKind[item.kind])} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[#181d27]">{item.title}</p>
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
          <span className="text-[11px] text-[#a4a7ae]">{item.subtitle}</span>
        </div>
      </div>
      <span className="shrink-0 text-[11px] text-[#a4a7ae]">{formatShortDate(item.date)}</span>
    </div>
  );
}

// ─── Item detail dialog ───────────────────────────────────────────────────────

function ItemDetailDialog({
  item,
  editableReminders,
  setEditableReminders,
  accessToken,
  onNavigate,
  onClose,
}: {
  item: PlannerItem;
  editableReminders: Reminder[];
  setEditableReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
  accessToken: string | null;
  onNavigate: (href: string) => void;
  onClose: () => void;
}) {
  const Icon = iconByKind[item.kind];
  const isReminder = item.kind === 'reminder';

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftDueDate, setDraftDueDate] = useState(item.date.slice(0, 10));

  const saveEdit = async () => {
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
      setIsEditing(false);
      setFeedback('Reminder updated.');
    } catch (err: any) {
      setFeedback(err?.message || 'Failed to update.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-[#e9eaeb]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#f2f4f7] px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                badgeToneByKind[item.kind]
              )}
            >
              <Icon className="h-4.5 w-4.5" weight="bold" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                {item.meta}
              </p>
              <p className="mt-0.5 text-[15px] font-semibold text-[#181d27] leading-tight">
                {isEditing ? draftTitle : item.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#a4a7ae] transition hover:bg-[#f4f4f5] hover:text-[#717680]"
          >
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3 px-5 py-4">
          {feedback && (
            <div className="rounded-xl border border-[#d5d7da] bg-[#f9fafb] px-3 py-2 text-[12px] text-[#414651]">
              {feedback}
            </div>
          )}

          {isEditing ? (
            <>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                  Title
                </p>
                <Input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="bg-white"
                />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                  Due date
                </p>
                <Input
                  type="date"
                  value={draftDueDate}
                  onChange={(e) => setDraftDueDate(e.target.value)}
                  className="bg-white"
                />
              </div>
            </>
          ) : (
            <dl className="space-y-3">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                  Date
                </dt>
                <dd className="mt-0.5 text-[13px] font-medium text-[#181d27]">
                  {new Date(item.date).toLocaleString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                  Status
                </dt>
                <dd className="mt-0.5 text-[13px] font-medium text-[#181d27] capitalize">
                  {item.subtitle}
                </dd>
              </div>
            </dl>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-[#f2f4f7] px-5 py-4">
          {isEditing ? (
            <div className="flex gap-2">
              <Button size="sm" type="button" disabled={isSaving} onClick={saveEdit}>
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                size="sm"
                type="button"
                variant="secondary"
                disabled={isSaving}
                onClick={() => { setIsEditing(false); setFeedback(null); setDraftTitle(item.title); setDraftDueDate(item.date.slice(0, 10)); }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {isReminder && (
                <Button size="sm" type="button" variant="secondary" onClick={() => setIsEditing(true)}>
                  <NotePencil className="h-3.5 w-3.5" weight="bold" />
                  Edit
                </Button>
              )}
              {item.href && (
                <Button size="sm" type="button" variant="secondary" onClick={() => onNavigate(item.href!)}>
                  <ArrowSquareOut className="h-3.5 w-3.5" weight="bold" />
                  Open
                </Button>
              )}
            </div>
          )}
          {!isEditing && isReminder && (
            <button
              type="button"
              onClick={onClose}
              className="text-[12px] font-semibold text-[#717680] transition hover:text-[#414651]"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d5d7da] px-4 py-10 text-center text-[13px] text-[#a4a7ae]">
      {message}
    </div>
  );
}
