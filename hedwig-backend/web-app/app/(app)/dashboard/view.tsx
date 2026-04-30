'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CalendarDots,
  ChartBar,
  CheckCircle,
  CurrencyDollar,
  FileText,
  IdentificationCard,
  Link as LinkIcon,
  Repeat,
  Sparkle
} from '@/components/ui/lucide-icons';
import { useCurrency } from '@/components/providers/currency-provider';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { formatShortDate } from '@/lib/utils';
import type { BillingStatusSummary } from '@/lib/api/client';
import { canUseFeature } from '@/lib/billing/feature-gates';
import { ProLockCard } from '@/components/billing/pro-lock-card';
import type { Contract, Invoice, Milestone, PaymentLink } from '@/lib/models/entities';

type DashboardData = {
  totals: {
    inflowUsd: number;
    outstandingUsd: number;
    walletUsd: number;
    usdAccountUsd: number;
  };
  assistantSummary?: string | null;
  reminders: Array<{ id: string; title: string; dueAt: string }>;
  notifications: Array<{ id: string; title: string; body: string; createdAt: string }>;
  activities: Array<{ id: string; summary: string; actor: string; createdAt: string }>;
  projects: Array<{ id: string; name: string; progress: number; nextDeadlineAt: string }>;
  contracts: Contract[];
  invoices: Invoice[];
  paymentLinks: PaymentLink[];
  milestones: Milestone[];
  recurringCount: number;
};

type ActionItem = {
  id: string;
  title: string;
  meta: string;
  href: string;
  complete?: boolean;
};

type MetricCard = {
  id: string;
  title: string;
  value: string;
  helper: string;
  href: string;
  icon: typeof FileText;
};

function getTimeOfDayGreeting(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good night';
}

export function DashboardClient({
  greetingName,
  data,
  billing,
}: {
  greetingName: string;
  data: DashboardData;
  billing: BillingStatusSummary | null;
}) {
  const { currency, formatAmount } = useCurrency();
  const [hour, setHour] = useState(() => new Date().getHours());
  const canUseAssistantSummary = canUseFeature('assistant_summary_advanced', billing);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHour(new Date().getHours());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  const dashboardState = useMemo(() => {
    const overdueInvoices = data.invoices.filter((invoice) => invoice.status === 'overdue');
    const draftInvoices = data.invoices.filter((invoice) => invoice.status === 'draft');
    const activeLinks = data.paymentLinks.filter((link) => link.status === 'active');
    const paidLinks = data.paymentLinks.filter((link) => link.status === 'paid');
    const signedContracts = data.contracts.filter((contract) => contract.status === 'signed');
    const reviewContracts = data.contracts.filter((contract) => contract.status === 'review' || contract.status === 'draft');
    const dueSoonMilestones = data.milestones.filter(
      (milestone) => milestone.status === 'due_soon' || milestone.status === 'late'
    );
    const completedMilestones = data.milestones.filter((milestone) => milestone.status === 'done');
    const activeProjects = data.projects.filter((project) => project.progress < 100);
    const completedProjects = data.projects.filter((project) => project.progress >= 100);
    const latestNotification = data.notifications[0] || null;
    const latestReminder = data.reminders[0] || null;
    const latestActivity = data.activities[0] || null;

    const actionItems: ActionItem[] = [
      {
        id: 'overdue-invoices',
        title: overdueInvoices.length > 0 ? 'Follow up on overdue invoices' : 'Overdue invoices are under control',
        meta:
          overdueInvoices.length > 0
            ? `${overdueInvoices.length} invoice${overdueInvoices.length > 1 ? 's' : ''} need attention`
            : 'No overdue invoice requires action right now',
        href: '/payments',
        complete: overdueInvoices.length === 0
      },
      {
        id: 'payment-links',
        title: activeLinks.length > 0 ? 'Review active payment links' : 'Create your next payment link',
        meta:
          activeLinks.length > 0
            ? `${activeLinks.length} live link${activeLinks.length > 1 ? 's' : ''} collecting payments`
            : 'Set up a quick checkout for a client without extra checkout friction',
        href: '/payments',
        complete: false
      },
      {
        id: 'deadlines',
        title: dueSoonMilestones.length > 0 ? 'Upcoming deadlines need attention' : 'Project delivery is on track',
        meta:
          dueSoonMilestones.length > 0
            ? `${dueSoonMilestones.length} milestone${dueSoonMilestones.length > 1 ? 's are' : ' is'} due soon`
            : `${completedProjects.length} project${completedProjects.length > 1 ? 's are' : ' is'} already wrapped up`,
        href: '/projects',
        complete: dueSoonMilestones.length === 0
      }
    ];

    const summaryCards: MetricCard[] = [
      {
        id: 'invoices',
        title: 'Invoices',
        value: `${data.invoices.length}`,
        helper: `${draftInvoices.length} drafts, ${overdueInvoices.length} overdue`,
        href: '/payments',
        icon: FileText
      },
      {
        id: 'earnings',
        title: 'Earnings',
        value: formatAmount(data.totals.inflowUsd),
        helper: 'Paid invoices and payment links',
        href: '/insights',
        icon: CurrencyDollar
      },
      {
        id: 'notifications',
        title: 'Notifications',
        value: `${data.notifications.length}`,
        helper: latestNotification ? latestNotification.title : 'No unread alerts',
        href: '/settings',
        icon: Bell
      }
    ];

    const workstreamCards: MetricCard[] = [
      {
        id: 'payment-links',
        title: 'Payment links',
        value: `${data.paymentLinks.length}`,
        helper: `${activeLinks.length} active, ${paidLinks.length} paid`,
        href: '/payments',
        icon: LinkIcon
      },
      {
        id: 'projects',
        title: 'Projects',
        value: `${data.projects.length}`,
        helper: `${activeProjects.length} active, ${completedProjects.length} completed`,
        href: '/projects',
        icon: CheckCircle
      },
      {
        id: 'contracts',
        title: 'Contracts',
        value: `${data.contracts.length}`,
        helper: `${reviewContracts.length} in review, ${signedContracts.length} signed`,
        href: '/contracts',
        icon: IdentificationCard
      },
      {
        id: 'milestones',
        title: 'Milestones',
        value: `${data.milestones.length}`,
        helper: `${dueSoonMilestones.length} due soon, ${completedMilestones.length} completed`,
        href: '/calendar',
        icon: CalendarDots
      },
      {
        id: 'recurring',
        title: 'Recurring invoices',
        value: `${data.recurringCount}`,
        helper: data.recurringCount === 1 ? '1 active schedule' : `${data.recurringCount} active schedules`,
        href: '/payments',
        icon: Repeat
      },
      {
        id: 'Outstanding',
        title: 'Outstanding',
        value: formatAmount(data.totals.outstandingUsd),
        helper: 'Expected across unpaid work',
        href: '/payments',
        icon: ChartBar
      }
    ];

    return {
      latestNotification,
      latestReminder,
      latestActivity,
      actionItems,
      summaryCards,
      workstreamCards
    };
  }, [currency, data]);

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h1 className="text-[15px] font-semibold text-[#181d27]">
          {getTimeOfDayGreeting(hour)}, {greetingName}
        </h1>
        <p className="mt-0.5 text-[13px] text-[#a4a7ae]">Here&rsquo;s what&rsquo;s happening today.</p>
      </div>

      {/* Financial snapshot — gap-px stats bar */}
      <div
        className="grid gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]"
        style={{ gridTemplateColumns: `repeat(${dashboardState.summaryCards.length}, minmax(0, 1fr))` }}
      >
        {dashboardState.summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.id}
              href={card.href}
              className="group flex flex-col bg-white px-5 py-4 transition duration-100 ease-linear hover:bg-[#fafafa]"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-medium text-[#717680]">{card.title}</p>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]">
                  <Icon className="h-3.5 w-3.5 text-[#717680]" weight="regular" />
                </div>
              </div>
              <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">{card.value}</p>
              <p className="mt-1.5 text-[11px] text-[#a4a7ae]">{card.helper}</p>
            </Link>
          );
        })}
      </div>

      {/* Main two-column: action items + workstream stats */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Action items card */}
        <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
          <div className="flex items-center justify-between border-b border-[#f5f5f5] px-5 py-4">
            <div>
              {/* UUI: text-md (16px) font-semibold text-primary */}
              <h2 className="text-[16px] font-semibold text-[#181d27]">Action items</h2>
              <p className="mt-0.5 text-[13px] text-[#717680]">Next moves across billing, deadlines, and earnings.</p>
            </div>
            {dashboardState.actionItems.filter((item) => !item.complete).length > 0 ? (
              /* UUI badge: error color, pill */
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#fef3f2] px-1.5 text-[11px] font-semibold text-[#717680]">
                {dashboardState.actionItems.filter((item) => !item.complete).length}
              </span>
            ) : null}
          </div>
          <div className="divide-y divide-[#f5f5f5]">
            {dashboardState.actionItems.map((item) => (
              <Link
                key={item.id}
                className="group flex items-start gap-3 px-5 py-4 transition duration-100 ease-linear hover:bg-[#fafafa]"
                href={item.href}
              >
                {/* UUI checkbox-style indicator */}
                <div
                  className={`mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    item.complete
                      ? 'border-[#17b26a] bg-[#ecfdf3] text-[#717680]'
                      : 'border-[#d5d7da] bg-white text-transparent'
                  }`}
                >
                  <CheckCircle className="h-3 w-3" weight={item.complete ? 'fill' : 'regular'} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[14px] font-semibold ${item.complete ? 'text-[#a4a7ae] line-through' : 'text-[#181d27]'}`}>
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[13px] text-[#717680]">{item.meta}</p>
                </div>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#d5d7da] group-hover:text-[#a4a7ae]" />
              </Link>
            ))}
          </div>
        </article>

        {/* Right: workstream stat mini-cards */}
        <AttachedStatGrid
          items={dashboardState.workstreamCards.map((card) => ({
            id: card.id,
            title: card.title,
            value: card.value,
            helper: card.helper,
            icon: card.icon,
            href: card.href,
          }))}
          className="grid-cols-2"
        />
      </div>

      {/* Bottom row: assistant summary + next reminder */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        {canUseAssistantSummary ? (
          <article className="rounded-2xl bg-white p-5 shadow-xs ring-1 ring-[#e9eaeb]">
            <div className="mb-3 flex items-center gap-2.5">
              {/* UUI featured icon: brand color */}
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eff4ff]">
                <Sparkle className="h-4 w-4 text-[#717680]" weight="fill" />
              </div>
              <p className="text-[16px] font-semibold text-[#181d27]">Assistant summary</p>
            </div>
            <p className="text-[14px] leading-relaxed text-[#535862]">
              {data.assistantSummary ||
                dashboardState.latestNotification?.body ||
                dashboardState.latestActivity?.summary ||
                'Payment activity, reminders, contracts, and project updates are summarized here.'}
            </p>
          </article>
        ) : (
          <ProLockCard
            title="Assistant summary is on Pro"
            description="Unlock proactive summaries for payments, reminders, and project updates."
            compact
          />
        )}

        <article className="rounded-2xl bg-white p-5 shadow-xs ring-1 ring-[#e9eaeb]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[16px] font-semibold text-[#181d27]">Next reminder</p>
            <CalendarDots className="h-4 w-4 text-[#a4a7ae]" weight="regular" />
          </div>
          {dashboardState.latestReminder ? (
            <>
              <p className="text-[14px] font-semibold text-[#181d27]">{dashboardState.latestReminder.title}</p>
              <p className="mt-1 text-[13px] text-[#717680]">Due {formatShortDate(dashboardState.latestReminder.dueAt)}</p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-[#414651]">No pending reminders</p>
              <p className="mt-1 text-[13px] text-[#a4a7ae]">You are caught up for now.</p>
            </>
          )}
          {/* UUI secondary button */}
          <Link
            className="mt-4 inline-flex h-8 select-none items-center rounded-lg border border-[#d5d7da] bg-white px-3 text-[13px] font-semibold text-[#414651] shadow-xs transition duration-100 ease-linear hover:bg-[#fafafa]"
            href="/calendar"
          >
            View calendar
          </Link>
        </article>
      </div>
    </div>
  );
}
