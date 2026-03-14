'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CalendarBlank,
  CalendarDots,
  CalendarPlus,
  CaretDown,
  CaretLeft,
  CaretRight,
  ClockCountdown,
  DotsThreeOutline,
  Eye,
  FlagPennant,
  FolderSimple,
  NotePencil,
  Receipt
} from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { hedwigApi } from '@/lib/api/client';
import { PageHeader } from '@/components/data/page-header';
import { cn, formatShortDate } from '@/lib/utils';
import type { Invoice, Milestone, Project, Reminder } from '@/lib/models/entities';

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

const filters = [
  { value: 'all', label: 'All' },
  { value: 'reminder', label: 'Reminders' },
  { value: 'milestone', label: 'Milestones' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'project', label: 'Projects' }
] as const;

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const formatMonthHeading = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric'
  }).format(date);

const formatDayHeading = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'long'
  }).format(date);

const formatWeekdayShort = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short'
  }).format(date);

const iconByKind = {
  reminder: ClockCountdown,
  milestone: FlagPennant,
  invoice: Receipt,
  project: FolderSimple
} satisfies Record<PlannerItem['kind'], typeof ClockCountdown>;

const badgeToneByKind: Record<PlannerItem['kind'], string> = {
  reminder: 'bg-[#eff4ff] text-[#2563eb]',
  milestone: 'bg-[#ecfdf3] text-[#067647]',
  invoice: 'bg-[#fffaeb] text-[#b54708]',
  project: 'bg-[#f4f3ff] text-[#6941c6]'
};

export function CalendarClient({
  data,
  accessToken,
  selectedReminderId
}: {
  data: CalendarData;
  accessToken: string | null;
  selectedReminderId?: string | null;
}) {
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]['value']>('all');
  const [editableReminders, setEditableReminders] = useState<Reminder[]>(data.reminders);
  const [isEditingReminder, setIsEditingReminder] = useState(false);
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [reminderFeedback, setReminderFeedback] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDueDate, setDraftDueDate] = useState('');
  const router = useRouter();

  const calendarState = useMemo(() => {
    const mergedItems: PlannerItem[] = [
      ...editableReminders.map((item) => ({
        id: item.id,
        kind: 'reminder' as const,
        title: item.title,
        subtitle: item.kind.replace('_', ' '),
        meta: 'Reminder',
        date: item.dueAt,
        href: `/calendar?reminder=${item.id}`
      })),
      ...data.milestones.map((item) => ({
        id: item.id,
        kind: 'milestone' as const,
        title: item.name,
        subtitle: item.status.replace('_', ' '),
        meta: 'Milestone',
        date: item.dueAt,
        href: `/projects/${item.projectId}?milestone=${item.id}`
      })),
      ...data.invoices.map((item) => ({
        id: item.id,
        kind: 'invoice' as const,
        title: item.number,
        subtitle: item.status,
        meta: 'Invoice due',
        date: item.dueAt,
        href: `/payments?invoice=${item.id}`
      })),
      ...data.projects.map((item) => ({
        id: item.id,
        kind: 'project' as const,
        title: item.name,
        subtitle: item.status,
        meta: 'Project deadline',
        date: item.nextDeadlineAt,
        href: `/projects/${item.id}`
      }))
    ].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

    const filteredItems =
      activeFilter === 'all' ? mergedItems : mergedItems.filter((item) => item.kind === activeFilter);

    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const nextSevenDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      const entries = filteredItems.filter((item) => isSameDay(new Date(item.date), date));

      return {
        date,
        entries,
        isToday: isSameDay(date, today)
      };
    });

    const overdue = filteredItems.filter((item) => startOfDay(new Date(item.date)) < today);
    const todayItems = filteredItems.filter((item) => isSameDay(new Date(item.date), today));
    const tomorrowItems = filteredItems.filter((item) => isSameDay(new Date(item.date), tomorrow));

    const futureGroups = new Map<string, PlannerItem[]>();
    filteredItems
      .filter((item) => startOfDay(new Date(item.date)) > tomorrow)
      .forEach((item) => {
        const key = startOfDay(new Date(item.date)).toISOString();
        const current = futureGroups.get(key) || [];
        current.push(item);
        futureGroups.set(key, current);
      });

    return {
      monthLabel: formatMonthHeading(today),
      stats: {
        total: filteredItems.length,
        overdue: overdue.length,
        today: todayItems.length,
        upcoming: filteredItems.filter((item) => startOfDay(new Date(item.date)) > today).length
      },
      filteredItems,
      overdue,
      todayItems,
      tomorrowItems,
      nextSevenDays,
      futureGroups: Array.from(futureGroups.entries()).map(([key, items]) => ({
        key,
        date: new Date(key),
        items
      })),
      selectedReminder:
        selectedReminderId
          ? mergedItems.find((item) => item.kind === 'reminder' && item.id === selectedReminderId) ?? null
          : null
    };
  }, [activeFilter, data.invoices, data.milestones, data.projects, editableReminders, selectedReminderId]);

  useEffect(() => {
    if (!calendarState.selectedReminder) {
      setIsEditingReminder(false);
      setReminderFeedback(null);
      setDraftTitle('');
      setDraftDueDate('');
      return;
    }

    setDraftTitle(calendarState.selectedReminder.title);
    setDraftDueDate(calendarState.selectedReminder.date.slice(0, 10));
  }, [calendarState.selectedReminder]);

  const saveReminderEdit = async () => {
    if (!calendarState.selectedReminder || !draftTitle.trim() || !draftDueDate) return;
    if (!accessToken) {
      setReminderFeedback('Missing session token. Please sign in again.');
      return;
    }

    const originalReminder = editableReminders.find((item) => item.id === calendarState.selectedReminder?.id);
    const nextDueAt = originalReminder?.dueAt?.includes('T')
      ? `${draftDueDate}${originalReminder.dueAt.slice(originalReminder.dueAt.indexOf('T'))}`
      : `${draftDueDate}T09:00:00.000Z`;

    setIsSavingReminder(true);
    setReminderFeedback(null);

    try {
      const updatedReminder = await hedwigApi.updateCalendarEvent(
        calendarState.selectedReminder.id,
        {
          title: draftTitle.trim(),
          eventDate: nextDueAt
        },
        { accessToken, disableMockFallback: true }
      );

      setEditableReminders((current) =>
        current.map((reminder) => (reminder.id === updatedReminder.id ? updatedReminder : reminder))
      );
      setIsEditingReminder(false);
      setReminderFeedback('Reminder updated.');
    } catch (error: any) {
      setReminderFeedback(error?.message || 'Failed to update reminder.');
    } finally {
      setIsSavingReminder(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calendar"
        title="Upcoming"
        description="See reminders, milestones, invoice due dates, and project deadlines in one clean planning view."
        actions={
          <>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d5d7da] bg-white px-3.5 text-[13px] font-semibold text-[#414651] shadow-xs transition hover:bg-[#fafafa]"
              type="button"
            >
              <CalendarPlus className="h-4 w-4 text-[#8d9096]" weight="bold" />
              Connect calendar
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#d5d7da] bg-white px-3.5 text-[13px] font-semibold text-[#414651] shadow-xs transition hover:bg-[#fafafa]"
              type="button"
            >
              <Eye className="h-4 w-4 text-[#8d9096]" weight="bold" />
              Display
            </button>
          </>
        }
      />

      <section className="rounded-xl bg-white px-6 py-5 shadow-xs ring-1 ring-[#e9eaeb]">
        <div className="flex flex-col gap-4 border-b border-[#f2f4f7] pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            {filters.map((filter) => (
              <button
                key={filter.value}
                className={cn(
                  'rounded-lg px-3 py-2 text-[13px] font-semibold transition',
                  activeFilter === filter.value
                    ? 'bg-[#ececec] text-[#181d27]'
                    : 'text-[#717680] hover:bg-[#fafafa] hover:text-[#414651]'
                )}
                onClick={() => setActiveFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#d5d7da] bg-white text-[#8d9096] shadow-xs transition hover:bg-[#fafafa]"
              type="button"
            >
              <CaretLeft className="h-4 w-4" weight="bold" />
            </button>
            <button
              className="inline-flex h-9 items-center rounded-lg border border-[#d5d7da] bg-white px-3.5 text-[13px] font-semibold text-[#414651] shadow-xs transition hover:bg-[#fafafa]"
              type="button"
            >
              Today
            </button>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#d5d7da] bg-white text-[#8d9096] shadow-xs transition hover:bg-[#fafafa]"
              type="button"
            >
              <CaretRight className="h-4 w-4" weight="bold" />
            </button>
          </div>
        </div>

              <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[18px] font-semibold text-[#181d27]">{calendarState.monthLabel}</h2>
              <CaretDown className="h-4 w-4 text-[#8d9096]" weight="bold" />
            </div>
            <p className="mt-1 text-[14px] text-[#717680]">
              {calendarState.stats.overdue} overdue, {calendarState.stats.today} due today, {calendarState.stats.upcoming} upcoming
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-[#fcfcfd] px-3 py-2 ring-1 ring-[#eaecf0]">
            <CalendarBlank className="h-4.5 w-4.5 text-[#8d9096]" weight="bold" />
            <span className="text-[13px] font-medium text-[#535862]">
              {calendarState.stats.total} scheduled item{calendarState.stats.total === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className={cn('mt-5 grid gap-6', calendarState.selectedReminder ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : '')}>
          <div>
            <div className="grid grid-cols-7 gap-3 border-b border-[#f2f4f7] pb-4">
              {calendarState.nextSevenDays.map((day) => (
                <div key={day.date.toISOString()} className="text-center">
                  <p className="text-[12px] font-medium text-[#a4a7ae]">{formatWeekdayShort(day.date)}</p>
                  <div
                    className={cn(
                      'mx-auto mt-2 flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-semibold',
                      day.isToday ? 'bg-[#181d27] text-white' : 'text-[#535862]'
                    )}
                  >
                    {day.date.getDate()}
                  </div>
                  <div className="mt-2 flex justify-center">
                    {day.entries.length > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-[#2563eb]" /> : <span className="h-1.5 w-1.5 rounded-full bg-transparent" />}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-7">
              <TaskGroup
                items={calendarState.overdue}
                onNavigate={(href) => router.push(href)}
                title="Overdue"
                titleAction={calendarState.overdue.length > 0 ? 'Reschedule' : undefined}
                tone="overdue"
              />

              <DateGroup date={new Date()} items={calendarState.todayItems} labelPrefix="Today" onNavigate={(href) => router.push(href)} />

              <DateGroup
                date={(() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  return tomorrow;
                })()}
                items={calendarState.tomorrowItems}
                labelPrefix="Tomorrow"
                onNavigate={(href) => router.push(href)}
              />

              {calendarState.futureGroups.map((group) => (
                <DateGroup date={group.date} items={group.items} key={group.key} onNavigate={(href) => router.push(href)} />
              ))}

              {calendarState.filteredItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#d5d7da] px-4 py-10 text-center text-[14px] text-[#717680]">
                  No calendar items match this filter right now.
                </div>
              ) : null}
            </div>
          </div>

          {calendarState.selectedReminder ? (
            <aside className="h-fit rounded-xl border border-[#e9eaeb] bg-white p-5 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">Reminder detail</p>
                  <h3 className="mt-2 text-[18px] font-semibold text-[#181d27]">{calendarState.selectedReminder.title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[#717680]">
                    This reminder is part of your active operating queue. Use it to stay on top of deadlines,
                    invoice follow-ups, and delivery checkpoints without leaving the calendar.
                  </p>
                </div>
                <button
                  className="inline-flex h-8 items-center rounded-lg border border-[#d5d7da] bg-white px-3 text-[13px] font-semibold text-[#414651] shadow-xs transition hover:bg-[#fafafa]"
                  onClick={() => router.push('/calendar')}
                  type="button"
                >
                  Clear
                </button>
              </div>

              <div className="mt-5 space-y-3 rounded-[15px] border border-[#e9eaeb] bg-[#fcfcfd] p-4">
                {reminderFeedback ? (
                  <div className="rounded-[12px] border border-[#d5d7da] bg-white px-3 py-2 text-sm text-[#414651]">
                    {reminderFeedback}
                  </div>
                ) : null}
                {isEditingReminder ? (
                  <>
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">Reminder title</p>
                      <Input
                        className="mt-2 bg-white"
                        onChange={(event) => setDraftTitle(event.target.value)}
                        value={draftTitle}
                      />
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">Due date</p>
                      <Input
                        className="mt-2 bg-white"
                        onChange={(event) => setDraftDueDate(event.target.value)}
                        type="date"
                        value={draftDueDate}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">Category</p>
                      <p className="mt-1 text-[14px] font-medium text-[#181d27]">{calendarState.selectedReminder.subtitle}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">Due date</p>
                      <p className="mt-1 text-[14px] font-medium text-[#181d27]">{formatShortDate(calendarState.selectedReminder.date)}</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">Source</p>
                      <p className="mt-1 text-[14px] font-medium text-[#181d27]">{calendarState.selectedReminder.meta}</p>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {isEditingReminder ? (
                  <>
                    <Button disabled={isSavingReminder} size="sm" type="button" onClick={saveReminderEdit}>
                      {isSavingReminder ? 'Saving...' : 'Save changes'}
                    </Button>
                    <Button
                      disabled={isSavingReminder}
                      size="sm"
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setIsEditingReminder(false);
                        setReminderFeedback(null);
                        setDraftTitle(calendarState.selectedReminder?.title ?? '');
                        setDraftDueDate(calendarState.selectedReminder?.date.slice(0, 10) ?? '');
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" type="button" variant="secondary" onClick={() => setIsEditingReminder(true)}>
                      <NotePencil className="h-4 w-4" weight="bold" />
                      Edit reminder
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant="default"
                      onClick={() => router.push('/calendar')}
                    >
                      Back to planner
                    </Button>
                  </>
                )}
              </div>
            </aside>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function TaskGroup({
  title,
  items,
  onNavigate,
  titleAction,
  tone = 'default'
}: {
  title: string;
  items: PlannerItem[];
  onNavigate: (href: string) => void;
  titleAction?: string;
  tone?: 'default' | 'overdue';
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-[#f2f4f7] pb-3">
        <div className="flex items-center gap-2">
          <CaretDown className="h-4 w-4 text-[#8d9096]" weight="bold" />
          <h3 className="text-[16px] font-semibold text-[#181d27]">{title}</h3>
        </div>
        {titleAction ? (
          <button className={cn('text-[13px] font-semibold', tone === 'overdue' ? 'text-[#d92d20]' : 'text-[#2563eb]')} type="button">
            {titleAction}
          </button>
        ) : null}
      </div>
      <div className="divide-y divide-[#f2f4f7]">
        {items.map((item) => (
          <TaskRow item={item} key={item.id} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

function DateGroup({
  date,
  items,
  labelPrefix,
  onNavigate
}: {
  date: Date;
  items: PlannerItem[];
  labelPrefix?: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <div>
      <div className="border-b border-[#f2f4f7] pb-3">
        <h3 className="text-[16px] font-semibold text-[#181d27]">
          {formatDayHeading(date)}
          {labelPrefix ? <span className="text-[#717680]"> · {labelPrefix}</span> : null}
        </h3>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-3 py-5 text-[#a4a7ae]">
          <span className="text-[22px] leading-none">+</span>
          <span className="text-[14px]">No scheduled items</span>
        </div>
      ) : (
        <div className="divide-y divide-[#f2f4f7]">
          {items.map((item) => (
            <TaskRow item={item} key={item.id} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ item, onNavigate }: { item: PlannerItem; onNavigate: (href: string) => void }) {
  const Icon = iconByKind[item.kind];
  const isClickable = Boolean(item.href);

  return (
    <div
      className={cn(
        'grid gap-3 rounded-lg py-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center',
        isClickable ? 'cursor-pointer transition hover:bg-[#fafafa]' : ''
      )}
      onClick={() => {
        if (item.href) onNavigate(item.href);
      }}
      onKeyDown={(event) => {
        if (item.href && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onNavigate(item.href);
        }
      }}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <div className="flex min-w-0 items-start gap-3">
        <button
          aria-label={`Open ${item.meta}`}
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#d0d5dd] bg-white text-[#ffffff] transition hover:border-[#98a2b3]"
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <span className="h-2.5 w-2.5 rounded-full border border-[#d0d5dd]" />
        </button>

        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-[#181d27]">{item.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', badgeToneByKind[item.kind])}>
              <Icon className="h-3.5 w-3.5" weight="bold" />
              {item.meta}
            </span>
            <span className="text-[13px] text-[#717680]">{item.subtitle}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-[13px] text-[#717680] lg:justify-end">
        <span>{formatShortDate(item.date)}</span>
        <div className="flex items-center gap-3">
          <span className="truncate">{item.kind}</span>
          {item.href ? (
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#d5d7da] bg-white px-2.5 text-[12px] font-semibold text-[#414651] shadow-xs transition hover:bg-[#fafafa]"
              onClick={(event) => {
                event.stopPropagation();
                onNavigate(item.href!);
              }}
              type="button"
            >
              Open
              <ArrowRight className="h-3.5 w-3.5" weight="bold" />
            </button>
          ) : null}
          <button
            aria-label="More"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#98a2b3] transition hover:bg-[#f9fafb] hover:text-[#667085]"
            onClick={(event) => event.stopPropagation()}
            type="button"
          >
            <DotsThreeOutline className="h-4 w-4" weight="fill" />
          </button>
        </div>
      </div>
    </div>
  );
}
