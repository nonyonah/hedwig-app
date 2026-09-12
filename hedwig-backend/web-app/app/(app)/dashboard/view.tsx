'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { hedwigApi } from '@/lib/api/client';
import {
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
  UsersThree,
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
import { DashboardHome } from '@/components/dashboard/dashboard-home';
import type { Contract, Invoice, Milestone, PaymentLink } from '@/lib/models/entities';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { MemberWelcomeBanner } from '@/components/workspace/member-welcome-banner';
import { PendingInvitationBanner } from '@/components/workspace/pending-invitation-banner';
import { AssistantPanel } from '@/components/assistant/assistant-panel';
import { WelcomeDemoModal } from '@/components/demo/welcome-demo-modal';
import { DemoBanner } from '@/components/demo/demo-banner';
import { DEMO_BOOKED_LOCALSTORAGE_KEY, NEW_USER_WELCOME_FLAG_KEY, WELCOME_DEMO_MODAL_DISMISSED_KEY } from '@/lib/demo';


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
  userKey,
}: {
  greetingName: string;
  data: DashboardData;
  billing: BillingStatusSummary | null;
  isDemo?: boolean;
  userKey?: string;
}) {
  const { currency, formatAmount } = useCurrency();
  const posthog = usePostHog();
  const { activeWorkspace, accessToken } = useWorkspaceContext();
  useAssistantPageContext('Dashboard', {
    inflow: data?.totals?.inflowUsd,
    outstanding: data?.totals?.outstandingUsd,
    projectCount: data?.projects?.length,
    invoiceCount: data?.invoices?.length,
  });
  const [hour, setHour] = useState(() => new Date().getHours());
  const [showCoreIntro, setShowCoreIntro] = useState(false);
  const [coreIntroStep, setCoreIntroStep] = useState(0);
  const [showWelcomeDemo, setShowWelcomeDemo] = useState(false);
  const canUseAssistantSummary = canUseFeature('assistant_summary_advanced', billing);
  const coreIntroStorageKey = useMemo(
  () => `${CORE_INTRO_STORAGE_KEY}:${userKey || 'anonymous'}`,
  [userKey]
  );

  // One-time welcome demo modal — only for brand-new users right after signup.
  useEffect(() => {
    if (isDemo || typeof window === 'undefined') return;
    try {
      const isNewUser = window.localStorage.getItem(NEW_USER_WELCOME_FLAG_KEY) === '1';
      const dismissed = window.localStorage.getItem(WELCOME_DEMO_MODAL_DISMISSED_KEY) === '1';
      const booked = window.localStorage.getItem(DEMO_BOOKED_LOCALSTORAGE_KEY) === '1';
      setShowWelcomeDemo(isNewUser && !dismissed && !booked);
    } catch { /* noop */ }
  }, [isDemo]);

  const closeWelcomeDemo = useCallback(() => {
    setShowWelcomeDemo(false);
    try { window.localStorage.removeItem(NEW_USER_WELCOME_FLAG_KEY); } catch { /* noop */ }
  }, []);

  // Fetch client count separately (DashboardData doesn't include clients)
  const [clientCount, setClientCount] = useState(0);
  useEffect(() => {
    if (!accessToken) return;
    hedwigApi.clients({ accessToken, disableMockFallback: true })
      .then((clients) => setClientCount(clients.length))
      .catch(() => {});
  }, [accessToken]);

  // Re-fetch on visibility change (user returns after creating a client)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !accessToken) return;
      hedwigApi.clients({ accessToken, disableMockFallback: true })
        .then((clients) => setClientCount(clients.length))
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [accessToken]);

  // Also listen for client-created event
  useEffect(() => {
    const handler = () => setClientCount((c) => c + 1);
    window.addEventListener('hedwig:client-created', handler);
    return () => window.removeEventListener('hedwig:client-created', handler);
  }, []);

  useEffect(() => {
  const interval = window.setInterval(() => {
  setHour(new Date().getHours());
  }, 60_000);

  return () => window.clearInterval(interval);
  }, []);


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

  useEffect(() => {
    if (isDemo) return;
    posthog?.capture?.('dashboard_viewed', {
      has_invoice: data.invoices.length > 0,
      has_payment_link: data.paymentLinks.length > 0,
      has_payment: hasReceivedPayment,
      has_project: data.projects.length > 0,
      workspace_type: activeWorkspace?.type ?? 'unknown',
    });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <MemberWelcomeBanner />
      <PendingInvitationBanner />
      <DemoBanner suppressed={showWelcomeDemo || isDemo} />
      <WelcomeDemoModal open={showWelcomeDemo} onClose={closeWelcomeDemo} />
      {!isDemo && !showWelcomeDemo && showCoreIntro ? (
        <CoreFeaturesIntro
          activeStep={coreIntroStep}
          onStepChange={setCoreIntroStep}
          onDismiss={dismissCoreIntro}
          onStart={startFirstInvoiceFromIntro}
        />
      ) : null}
      {/* Page header */}
      <div>
 <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">
 {getTimeOfDayGreeting(hour)}, {greetingName}
 </h1>
 <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Here&rsquo;s what&rsquo;s happening today.</p>
 </div>

  <DashboardHome
  accessToken={accessToken}
  formatAmount={formatAmount}
  walletUsd={data.totals.walletUsd}
  usdAccountUsd={data.totals.usdAccountUsd}
  />
  </div>
  );
}


const CORE_INTRO_STEPS = [
 {
 title: 'Receive payments in USDC',
 description: 'Send branded payment links or invoices. Clients pay from anywhere — funds land in your account in minutes, not days.',
 label: 'Payments',
 Icon: CurrencyDollar,
 accent: 'bg-[var(--color-accent-soft)] text-[var(--color-primary)]',
 },
 {
 title: 'Track clients and projects',
 description: 'Keep client records, project scopes, contracts, and time tracking tied together from day one.',
 label: 'Clients',
 Icon: IdentificationCard,
 accent: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
 },
 {
 title: 'Import and reconcile automatically',
 description: 'Import bank statements and receipts. Hedwig auto-matches payments to clients and tags expenses — no manual entry.',
 label: 'Bookkeeping',
 Icon: FileText,
 accent: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
 },
 {
 title: 'Run payroll and manage your team',
 description: 'Pay your team on any schedule, assign projects to members, and manage roles and permissions from one workspace.',
 label: 'Team',
 Icon: UsersThree,
 accent: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
 },
 {
 title: 'Your assistant handles the routine',
 description: 'Hedwig surfaces daily summaries, flags overdue items and unlogged time, and suggests next steps so nothing slips.',
 label: 'Assistant',
 Icon: Sparkle,
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
 className="absolute right-4 top-4 z-10 h-8 w-8 rounded-full bg-[var(--color-surface)]/75 text-[var(--color-text-muted)] shadow-sm hover:bg-[var(--color-surface)] hover:text-[var(--color-text-secondary)]"
 >
 <X className="h-3.5 w-3.5" weight="bold" />
 </Button>

 <div className="relative flex h-[244px] items-center justify-center overflow-hidden bg-[var(--color-surface-secondary)]">
 <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(37,99,235,0.16),transparent_34%),radial-gradient(circle_at_78%_12%,rgba(22,163,74,0.12),transparent_28%)]" />
 <div className="absolute left-8 top-8 h-16 w-24 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/75 shadow-sm" />
 <div className="absolute bottom-8 right-8 h-16 w-28 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/70 shadow-sm" />
 <div className="relative w-[260px] rounded-[22px] bg-[var(--color-surface)] p-5 shadow-[0_18px_50px_rgba(24,29,39,0.15)]">
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
 className="create-btn mt-7 w-full rounded-xl"
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
 <p className="text-[12px] font-semibold text-[var(--color-accent-soft)]">First session goal</p>
 <h2 className="mt-2 max-w-2xl text-[24px] font-bold tracking-[-0.035em]">
 Set up your first payment in 60 seconds.
 </h2>
 <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--color-text-placeholder)]">
 Start with one client, an amount, and a due date. Hedwig handles the rest — invoices, reminders, and bookkeeping are all connected.
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
 <p className="text-[13px] font-semibold text-white">Then you can</p>
 <div className="mt-4 space-y-3">
 {['Import bank statements and auto-categorize expenses', 'Track time against projects and contracts', 'Run payroll and manage your team'].map((item, index) => (
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
 { label: 'Create your first payment request', complete: hasCreated },
 { label: 'Payment request is shared with the client', complete: hasShared },
 { label: 'Receive your first payment into Hedwig', complete: hasReceived },
 ];

 return (
 <article className="rounded-2xl bg-[var(--color-surface)] p-5 shadow-xs">
 <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
 <div>
 <p className="text-[12px] font-semibold text-[var(--color-primary)]">First payment checklist</p>
 <h2 className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-[var(--color-foreground)]">
 Get your first payment lined up.
 </h2>
 <p className="mt-1 text-[13px] leading-5 text-[var(--color-text-tertiary)]">
 Once your first payment lands, you can set a monthly earnings goal from Insights and explore time tracking, payroll, and integrations.
 </p>
 </div>
 <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
 <Button
 variant="default"
 size="sm"
 className="create-btn"
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
 <div className="mt-4 grid gap-px overflow-hidden rounded-xl bg-[var(--color-border)] md:grid-cols-3">
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
