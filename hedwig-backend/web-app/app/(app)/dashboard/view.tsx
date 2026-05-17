'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  ShareNetwork,
  Sparkle,
  X
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

const CORE_INTRO_STORAGE_KEY = 'hedwig_core_features_intro_dismissed_v1';

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
  isDemo = false,
}: {
  greetingName: string;
  data: DashboardData;
  billing: BillingStatusSummary | null;
  isDemo?: boolean;
}) {
  const { currency, formatAmount } = useCurrency();
  const [hour, setHour] = useState(() => new Date().getHours());
  const [showCoreIntro, setShowCoreIntro] = useState(false);
  const [coreIntroStep, setCoreIntroStep] = useState(0);
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

  const hasCreatedPaymentWorkflow = data.invoices.length > 0 || data.paymentLinks.length > 0;
  const hasSharedPaymentWorkflow = data.invoices.some((invoice) =>
    invoice.status === 'sent' ||
    invoice.status === 'viewed' ||
    invoice.status === 'paid' ||
    invoice.status === 'overdue' ||
    Boolean(invoice.clientEmail)
  ) || data.paymentLinks.some((link) => link.status === 'paid' || Boolean(link.clientEmail));
  const hasReceivedPayment =
    data.totals.inflowUsd > 0 ||
    data.invoices.some((invoice) => invoice.status === 'paid') ||
    data.paymentLinks.some((link) => link.status === 'paid');
  const onboardingComplete = hasCreatedPaymentWorkflow && hasSharedPaymentWorkflow && hasReceivedPayment;

  const openCreateFlow = useCallback((flow: 'invoice' | 'payment-link') => {
    window.dispatchEvent(new CustomEvent('hedwig:open-create-menu', { detail: { flow } }));
  }, []);

  useEffect(() => {
    if (isDemo || hasCreatedPaymentWorkflow || typeof window === 'undefined') {
      setShowCoreIntro(false);
      return;
    }

    setShowCoreIntro(window.localStorage.getItem(CORE_INTRO_STORAGE_KEY) !== 'true');
  }, [hasCreatedPaymentWorkflow, isDemo]);

  const dismissCoreIntro = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CORE_INTRO_STORAGE_KEY, 'true');
    }
    setShowCoreIntro(false);
  }, []);

  const startFirstInvoiceFromIntro = useCallback(() => {
    dismissCoreIntro();
    openCreateFlow('invoice');
  }, [dismissCoreIntro, openCreateFlow]);

  return (
    <div className="flex flex-col gap-6">
      {!isDemo && showCoreIntro ? (
        <CoreFeaturesIntro
          activeStep={coreIntroStep}
          onStepChange={setCoreIntroStep}
          onDismiss={dismissCoreIntro}
          onStart={startFirstInvoiceFromIntro}
        />
      ) : null}
      {!isDemo && !hasCreatedPaymentWorkflow ? (
        <FirstInvoiceCard onStart={() => openCreateFlow('invoice')} />
      ) : null}
      {!isDemo && hasCreatedPaymentWorkflow && !onboardingComplete ? (
        <OnboardingChecklist
          hasCreated={hasCreatedPaymentWorkflow}
          hasShared={hasSharedPaymentWorkflow}
          hasReceived={hasReceivedPayment}
          onCreateInvoice={() => openCreateFlow('invoice')}
          onCreatePaymentLink={() => openCreateFlow('payment-link')}
        />
      ) : null}

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

const CORE_INTRO_STEPS = [
  {
    title: 'Create client-ready invoices',
    description: 'Start with one client, amount, and due date. Hedwig keeps the invoice polished and easy to act on.',
    label: 'Invoice',
    Icon: FileText,
    accent: 'bg-[#eff4ff] text-[#2563eb]',
  },
  {
    title: 'Share a clean payment link',
    description: 'Send the invoice or payment link from your workspace so clients have one clear place to pay.',
    label: 'Share',
    Icon: ShareNetwork,
    accent: 'bg-[#ecfdf3] text-[#067647]',
  },
  {
    title: 'Track payment until it lands',
    description: 'See what is paid, pending, or overdue without checking every message thread manually.',
    label: 'Track',
    Icon: CurrencyDollar,
    accent: 'bg-[#fffaeb] text-[#b54708]',
  },
];

function CoreFeaturesIntro({
  activeStep,
  onStepChange,
  onDismiss,
  onStart,
}: {
  activeStep: number;
  onStepChange: (step: number) => void;
  onDismiss: () => void;
  onStart: () => void;
}) {
  const step = CORE_INTRO_STEPS[activeStep] ?? CORE_INTRO_STEPS[0];
  const isLast = activeStep >= CORE_INTRO_STEPS.length - 1;
  const Icon = step.Icon;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#181d27]/30 px-4 backdrop-blur-[2px]">
      <div className="relative w-full max-w-[440px] overflow-hidden rounded-[28px] bg-white shadow-[0_28px_100px_rgba(24,29,39,0.24)] ring-1 ring-black/5">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close intro"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/75 text-[#a4a7ae] shadow-sm ring-1 ring-[#e9eaeb] transition hover:bg-white hover:text-[#414651]"
        >
          <X className="h-3.5 w-3.5" weight="bold" />
        </button>

        <div className="relative flex h-[244px] items-center justify-center overflow-hidden bg-[#f4f7fb]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(37,99,235,0.16),transparent_34%),radial-gradient(circle_at_78%_12%,rgba(22,163,74,0.12),transparent_28%)]" />
          <div className="absolute left-8 top-8 h-16 w-24 rounded-2xl border border-[#e9eaeb] bg-white/75 shadow-sm" />
          <div className="absolute bottom-8 right-8 h-16 w-28 rounded-2xl border border-[#e9eaeb] bg-white/70 shadow-sm" />
          <div className="relative w-[260px] rounded-[22px] bg-white p-5 shadow-[0_18px_50px_rgba(24,29,39,0.15)] ring-1 ring-[#e9eaeb]">
            <div className="mb-4 flex items-center justify-between">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${step.accent}`}>
                <Icon className="h-3.5 w-3.5" weight="bold" />
                {step.label}
              </span>
              <span className="h-2 w-2 rounded-full bg-[#17b26a]" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-36 rounded-full bg-[#181d27]" />
              <div className="h-2 w-48 rounded-full bg-[#d5d7da]" />
              <div className="h-2 w-40 rounded-full bg-[#e9eaeb]" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[#f8f9fb] p-3">
                <div className="h-2 w-12 rounded-full bg-[#a4a7ae]" />
                <div className="mt-2 h-4 w-16 rounded-full bg-[#181d27]" />
              </div>
              <div className="rounded-xl bg-[#eff4ff] p-3">
                <div className="h-2 w-10 rounded-full bg-[#93c5fd]" />
                <div className="mt-2 h-4 w-14 rounded-full bg-[#2563eb]" />
              </div>
            </div>
          </div>
        </div>

        <div className="px-7 pb-6 pt-7 text-center">
          <h2 className="text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">{step.title}</h2>
          <p className="mx-auto mt-2 max-w-[330px] text-[15px] leading-6 text-[#8d9096]">{step.description}</p>

          <div className="mt-6 flex items-center justify-center gap-2">
            {CORE_INTRO_STEPS.map((item, index) => (
              <button
                key={item.title}
                type="button"
                aria-label={`Go to intro step ${index + 1}`}
                onClick={() => onStepChange(index)}
                className={`h-2.5 rounded-full transition-all ${index === activeStep ? 'w-6 bg-[#717680]' : 'w-2.5 bg-[#d5d7da]'}`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              if (isLast) {
                onStart();
                return;
              }
              onStepChange(activeStep + 1);
            }}
            className="mt-7 flex h-11 w-full items-center justify-center rounded-xl bg-[#2563eb] text-[14px] font-semibold text-white transition hover:bg-[#1d4ed8]"
          >
            {isLast ? 'Create first invoice' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FirstInvoiceCard({ onStart }: { onStart: () => void }) {
  return (
    <article className="overflow-hidden rounded-2xl bg-[#181d27] text-white shadow-[0_18px_60px_rgba(24,29,39,0.16)]">
      <div className="grid gap-px bg-white/10 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="bg-[#181d27] p-6">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-[#93c5fd]">First session goal</p>
          <h2 className="mt-2 max-w-2xl text-[24px] font-bold tracking-[-0.035em]">
            Create your first invoice in 60 seconds.
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#cbd5e1]">
            Start with one client, an amount, and a due date. Hedwig will turn it into a client-ready invoice you can share.
          </p>
          <button
            type="button"
            onClick={onStart}
            className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-[14px] font-semibold text-[#181d27] transition hover:bg-[#f1f5ff]"
          >
            Create your first invoice →
          </button>
        </div>
        <div className="bg-[#202636] p-6">
          <p className="text-[13px] font-semibold text-white">What happens next</p>
          <div className="mt-4 space-y-3">
            {['Create the invoice', 'Share it with a client', 'Track payment when it lands'].map((item, index) => (
              <div key={item} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold text-white">
                  {index + 1}
                </span>
                <span className="text-[13px] text-[#dbeafe]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function OnboardingChecklist({
  hasCreated,
  hasShared,
  hasReceived,
  onCreateInvoice,
  onCreatePaymentLink,
}: {
  hasCreated: boolean;
  hasShared: boolean;
  hasReceived: boolean;
  onCreateInvoice: () => void;
  onCreatePaymentLink: () => void;
}) {
  const steps = [
    { label: 'Create your first invoice or payment link', complete: hasCreated },
    { label: 'Share it with a client', complete: hasShared },
    { label: 'Receive your first payment', complete: hasReceived },
  ];

  return (
    <article className="rounded-2xl bg-white p-5 shadow-xs ring-1 ring-[#e9eaeb]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-[#2563eb]">Getting paid checklist</p>
          <h2 className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-[#181d27]">
            Keep going until the first payment lands.
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-[#717680]">
            Once your first request is sent, you can set a monthly earnings goal from Insights.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onCreatePaymentLink}
            className="inline-flex h-9 items-center justify-center rounded-full bg-[#2563eb] px-4 text-[13px] font-semibold text-white transition hover:bg-[#1d4ed8]"
          >
            New payment link
          </button>
          <button
            type="button"
            onClick={onCreateInvoice}
            className="inline-flex h-9 items-center justify-center rounded-full border border-[#d5d7da] px-4 text-[13px] font-semibold text-[#414651] transition hover:bg-[#fafafa]"
          >
            New invoice
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-px overflow-hidden rounded-xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb] md:grid-cols-3">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-3 bg-white px-4 py-3">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
              step.complete ? 'border-[#17b26a] bg-[#ecfdf3] text-[#067647]' : 'border-[#d5d7da] text-transparent'
            }`}>
              <CheckCircle className="h-3.5 w-3.5" weight="fill" />
            </span>
            <span className={`text-[13px] font-medium ${step.complete ? 'text-[#717680] line-through' : 'text-[#181d27]'}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}
