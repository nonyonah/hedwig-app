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
  Sparkle,
  X
} from '@/components/ui/lucide-icons';
import { useCurrency } from '@/components/providers/currency-provider';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { Button } from '@/components/ui/button';
import { formatShortDate } from '@/lib/utils';
import type { BillingStatusSummary } from '@/lib/api/client';
import { canUseFeature } from '@/lib/billing/feature-gates';
import { ProLockCard } from '@/components/billing/pro-lock-card';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import type { Contract, Invoice, Milestone, PaymentLink } from '@/lib/models/entities';
import { MemberWelcomeBanner } from '@/components/workspace/member-welcome-banner';
import { PendingInvitationBanner } from '@/components/workspace/pending-invitation-banner';

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
  userKey,
  data,
  billing,
  isDemo = false,
}: {
  greetingName: string;
  userKey: string;
  data: DashboardData;
  billing: BillingStatusSummary | null;
  isDemo?: boolean;
}) {
  const { currency, formatAmount } = useCurrency();
  useAssistantPageContext('Dashboard', {
    inflow: data?.totals?.inflowUsd,
    outstanding: data?.totals?.outstandingUsd,
    projectCount: data?.projects?.length,
    invoiceCount: data?.invoices?.length,
  });
  const [hour, setHour] = useState(() => new Date().getHours());
  const [showCoreIntro, setShowCoreIntro] = useState(false);
  const [coreIntroStep, setCoreIntroStep] = useState(0);
  const canUseAssistantSummary = canUseFeature('assistant_summary_advanced', billing);
  const coreIntroStorageKey = useMemo(
    () => `${CORE_INTRO_STORAGE_KEY}:${userKey || 'anonymous'}`,
    [userKey]
  );

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

    setShowCoreIntro(window.localStorage.getItem(coreIntroStorageKey) !== 'true');
  }, [coreIntroStorageKey, hasCreatedPaymentWorkflow, isDemo]);

  const dismissCoreIntro = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(coreIntroStorageKey, 'true');
    }
    setShowCoreIntro(false);
  }, [coreIntroStorageKey]);

  const startFirstInvoiceFromIntro = useCallback(() => {
    dismissCoreIntro();
    openCreateFlow('invoice');
  }, [dismissCoreIntro, openCreateFlow]);

  return (
    <div className="flex flex-col gap-6">
      <MemberWelcomeBanner />
      <PendingInvitationBanner />
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
        <h1 className="text-[15px] font-semibold text-[var(--color-foreground)]">
          {getTimeOfDayGreeting(hour)}, {greetingName}
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">Here&rsquo;s what&rsquo;s happening today.</p>
      </div>

      {/* Financial snapshot — gap-px stats bar */}
      <div
        className="grid gap-px overflow-hidden rounded-2xl bg-[var(--color-border)] ring-1 ring-[var(--color-border)]"
        style={{ gridTemplateColumns: `repeat(${dashboardState.summaryCards.length}, minmax(0, 1fr))` }}
      >
        {dashboardState.summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.id}
              href={card.href}
              className="group flex flex-col bg-[var(--color-surface)] px-5 py-4 transition duration-100 ease-linear hover:bg-[var(--color-background)]"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-medium text-[var(--color-text-tertiary)]">{card.title}</p>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-surface-secondary)]">
                  <Icon className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" weight="regular" />
                </div>
              </div>
              <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[var(--color-foreground)]">{card.value}</p>
              <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">{card.helper}</p>
            </Link>
          );
        })}
      </div>

      {/* Main two-column: action items + workstream stats */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Action items card */}
        <article className="flex flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
          <div className="flex items-center justify-between border-b border-[var(--color-surface-secondary)] px-5 py-4">
            <div>
              {/* UUI: text-md (16px) font-semibold text-primary */}
              <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">Action items</h2>
              <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">Next moves across billing, deadlines, and earnings.</p>
            </div>
            {dashboardState.actionItems.filter((item) => !item.complete).length > 0 ? (
              /* UUI badge: error color, pill */
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-danger-soft)] px-1.5 text-[11px] font-semibold text-[var(--color-text-tertiary)]">
                {dashboardState.actionItems.filter((item) => !item.complete).length}
              </span>
            ) : null}
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {dashboardState.actionItems.map((item) => (
              <Link
                key={item.id}
                className="group flex items-start gap-3 px-5 py-4 transition duration-100 ease-linear hover:bg-[var(--color-background)]"
                href={item.href}
              >
                {/* UUI checkbox-style indicator */}
                <div
                  className={`mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    item.complete
                      ? 'border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]'
                      : 'border-[var(--color-border-input)] bg-[var(--color-surface)] text-transparent'
                  }`}
                >
                  <CheckCircle className="h-3 w-3" weight={item.complete ? 'fill' : 'regular'} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[14px] font-semibold ${item.complete ? 'text-[var(--color-text-muted)] line-through' : 'text-[var(--color-foreground)]'}`}>
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">{item.meta}</p>
                </div>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-border-input)] group-hover:text-[var(--color-text-muted)]" />
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
          <article className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-xs ring-1 ring-[var(--color-border)]">
            <div className="mb-3 flex items-center gap-2.5">
              {/* UUI featured icon: brand color */}
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-soft)]">
                <Sparkle className="h-4 w-4 text-[var(--color-text-tertiary)]" weight="fill" />
              </div>
              <p className="text-[16px] font-semibold text-[var(--color-foreground)]">Assistant summary</p>
            </div>
            <p className="text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
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

        <article className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-xs ring-1 ring-[var(--color-border)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[16px] font-semibold text-[var(--color-foreground)]">Next reminder</p>
            <CalendarDots className="h-4 w-4 text-[var(--color-text-muted)]" weight="regular" />
          </div>
          {dashboardState.latestReminder ? (
            <>
              <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{dashboardState.latestReminder.title}</p>
              <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Due {formatShortDate(dashboardState.latestReminder.dueAt)}</p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-[var(--color-text-secondary)]">No pending reminders</p>
              <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">You are caught up for now.</p>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="mt-4 rounded-lg"
            asChild
          >
            <Link href="/calendar">View calendar</Link>
          </Button>
        </article>
      </div>
    </div>
  );
}

const CORE_INTRO_STEPS = [
  {
    title: 'Create client-ready invoices',
    description: 'Start with one client, amount, and due date. If the client email is included, Hedwig sends the invoice automatically.',
    label: 'Invoice',
    Icon: FileText,
    accent: 'bg-[var(--color-accent-soft)] text-[var(--color-primary)]',
  },
  {
    title: 'Track clients and projects',
    description: 'Keep client details, project work, documents, and payment history tied together from the first invoice.',
    label: 'Clients',
    Icon: IdentificationCard,
    accent: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  },
  {
    title: 'Automatic payment reminders',
    description: 'Hedwig can remind clients before and after due dates so you spend less time chasing payments manually.',
    label: 'Reminders',
    Icon: Bell,
    accent: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  },
  {
    title: 'Hedwig assistant keeps watch',
    description: 'The assistant summarizes payment activity, highlights next steps, and helps draft client follow-ups when needed.',
    label: 'Assistant',
    Icon: Sparkle,
    accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
  },
  {
    title: 'Track payment until it lands',
    description: 'See what is paid, pending, or overdue without checking every message thread manually.',
    label: 'Track',
    Icon: CurrencyDollar,
    accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--color-foreground)]/30 px-4 backdrop-blur-[2px]">
      <div className="relative w-full max-w-[440px] overflow-hidden rounded-[28px] bg-[var(--color-surface)] shadow-[0_28px_100px_rgba(24,29,39,0.24)] ring-1 ring-black/5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            aria-label="Close intro"
            className="absolute right-4 top-4 z-10 h-8 w-8 rounded-full bg-[var(--color-surface)]/75 text-[var(--color-text-muted)] shadow-sm ring-1 ring-[var(--color-border)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-secondary)]"
          >
            <X className="h-3.5 w-3.5" weight="bold" />
          </Button>

        <div className="relative flex h-[244px] items-center justify-center overflow-hidden bg-[var(--color-surface-secondary)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(37,99,235,0.16),transparent_34%),radial-gradient(circle_at_78%_12%,rgba(22,163,74,0.12),transparent_28%)]" />
          <div className="absolute left-8 top-8 h-16 w-24 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/75 shadow-sm" />
          <div className="absolute bottom-8 right-8 h-16 w-28 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/70 shadow-sm" />
          <div className="relative w-[260px] rounded-[22px] bg-[var(--color-surface)] p-5 shadow-[0_18px_50px_rgba(24,29,39,0.15)] ring-1 ring-[var(--color-border)]">
            <div className="mb-4 flex items-center justify-between">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${step.accent}`}>
                <Icon className="h-3.5 w-3.5" weight="bold" />
                {step.label}
              </span>
              <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-36 rounded-full bg-[var(--color-foreground)]" />
              <div className="h-2 w-48 rounded-full bg-[var(--color-border-input)]" />
              <div className="h-2 w-40 rounded-full bg-[var(--color-border)]" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
                <div className="h-2 w-12 rounded-full bg-[var(--color-text-muted)]" />
                <div className="mt-2 h-4 w-16 rounded-full bg-[var(--color-foreground)]" />
              </div>
              <div className="rounded-xl bg-[var(--color-accent-soft)] p-3">
                <div className="h-2 w-10 rounded-full bg-[var(--color-accent-soft)]" />
                <div className="mt-2 h-4 w-14 rounded-full bg-[var(--color-primary)]" />
              </div>
            </div>
          </div>
        </div>

        <div className="px-7 pb-6 pt-7 text-center">
          <h2 className="text-[22px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">{step.title}</h2>
          <p className="mx-auto mt-2 max-w-[330px] text-[15px] leading-6 text-[var(--color-text-tertiary)]">{step.description}</p>

          <div className="mt-6 flex items-center justify-center gap-2">
            {CORE_INTRO_STEPS.map((item, index) => (
              <button
                key={item.title}
                type="button"
                aria-label={`Go to intro step ${index + 1}`}
                onClick={() => onStepChange(index)}
                className={`h-2.5 rounded-full transition-all ${index === activeStep ? 'w-6 bg-[var(--color-text-tertiary)]' : 'w-2.5 bg-[var(--color-border-input)]'}`}
              />
            ))}
          </div>

          <Button
            variant="default"
            size="lg"
            onClick={() => {
              if (isLast) {
                onStart();
                return;
              }
              onStepChange(activeStep + 1);
            }}
            className="mt-7 w-full rounded-xl"
          >
            {isLast ? 'Create first invoice' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FirstInvoiceCard({ onStart }: { onStart: () => void }) {
  return (
    <article className="overflow-hidden rounded-2xl bg-[var(--color-foreground)] text-[var(--color-background)] shadow-[0_18px_60px_rgba(24,29,39,0.16)]">
      <div className="grid gap-px bg-[var(--color-surface)]/10 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="bg-[var(--color-foreground)] p-6">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-accent-soft)]">First session goal</p>
          <h2 className="mt-2 max-w-2xl text-[24px] font-bold tracking-[-0.035em]">
            Create your first invoice in 60 seconds.
          </h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--color-text-placeholder)]">
            Start with one client, an amount, and a due date. Hedwig will turn it into a client-ready invoice you can share.
          </p>
          <Button
            variant="secondary"
            size="lg"
            onClick={onStart}
            className="mt-5 bg-[var(--color-surface)] text-[var(--color-foreground)] hover:bg-[var(--color-accent-soft)]"
          >
            Create your first invoice →
          </Button>
        </div>
        <div className="bg-[var(--color-foreground)] p-6">
          <p className="text-[13px] font-semibold text-white">What happens next</p>
          <div className="mt-4 space-y-3">
            {['Create the invoice', 'Invoice is sent automatically to the client', 'Track payment when it lands'].map((item, index) => (
              <div key={item} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)]/10 text-[12px] font-semibold text-white">
                  {index + 1}
                </span>
                <span className="text-[13px] text-[var(--color-primary-light)]">{item}</span>
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
    { label: 'Invoice is sent automatically to the client', complete: hasShared },
    { label: 'Receive your first payment', complete: hasReceived },
  ];

  return (
    <article className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-xs ring-1 ring-[var(--color-border)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-primary)]">Getting paid checklist</p>
          <h2 className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-[var(--color-foreground)]">
            Keep going until the first payment lands.
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-[var(--color-text-tertiary)]">
            Once your first request is sent, you can set a monthly earnings goal from Insights.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button
            variant="default"
            size="sm"
            onClick={onCreatePaymentLink}
          >
            New payment link
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCreateInvoice}
          >
            New invoice
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-px overflow-hidden rounded-xl bg-[var(--color-border)] ring-1 ring-[var(--color-border)] md:grid-cols-3">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-3 bg-[var(--color-surface)] px-4 py-3">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
              step.complete ? 'border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'border-[var(--color-border-input)] text-transparent'
            }`}>
              <CheckCircle className="h-3.5 w-3.5" weight="fill" />
            </span>
            <span className={`text-[13px] font-medium ${step.complete ? 'text-[var(--color-text-tertiary)] line-through' : 'text-[var(--color-foreground)]'}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}
