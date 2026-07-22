'use client';

import Link from 'next/link';
import { usePostHog } from 'posthog-js/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle, UsersThree, CurrencyDollar, FileText, FolderSimple, IdentificationCard } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

const STORAGE_KEY_PREFIX = 'hedwig_onboarding_v1';

type OnboardingAction = {
  id: string;
  title: string;
  description: string;
  href?: string;
  actionLabel: string;
  icon: typeof ArrowRight;
  trackingName: string;
  scope: 'personal' | 'organization' | 'shared';
  deps?: string[];
};

const ACTIONS: OnboardingAction[] = [
  {
    id: 'first-invoice',
    title: 'Send your first invoice',
    description: 'Get paid in USDC, no bank delays.',
    href: '/payments',
    actionLabel: 'Create invoice',
    icon: CurrencyDollar,
    trackingName: 'onboarding_first_invoice',
    scope: 'personal',
  },
  {
    id: 'first-client',
    title: 'Add your first client',
    description: 'Keep track of who you\'re working with.',
    href: '/clients',
    actionLabel: 'Add client',
    icon: IdentificationCard,
    trackingName: 'onboarding_first_client',
    scope: 'personal',
    deps: ['first-invoice'],
  },
  {
    id: 'invite-team',
    title: 'Invite your team',
    description: 'Add teammates and assign roles in under a minute.',
    href: '/workspace/members',
    actionLabel: 'Invite team',
    icon: UsersThree,
    trackingName: 'onboarding_invite_team',
    scope: 'organization',
  },
  {
    id: 'setup-payroll',
    title: 'Set up payroll',
    description: 'Pay your team in USDC, on your schedule.',
    href: '/workspace/settings',
    actionLabel: 'Set up payroll',
    icon: CurrencyDollar,
    trackingName: 'onboarding_setup_payroll',
    scope: 'organization',
    deps: ['invite-team'],
  },
  {
    id: 'try-bookkeeping',
    title: 'Try bookkeeping',
    description: 'Import a bank statement or receipt and see it categorized automatically.',
    href: '/revenue',
    actionLabel: 'Try bookkeeping',
    icon: FileText,
    trackingName: 'onboarding_try_bookkeeping',
    scope: 'shared',
    deps: ['first-invoice', 'first-client'],
  },
  {
    id: 'track-project',
    title: 'Track a project',
    description: 'Log time and bill clients based on hours worked.',
    href: '/projects',
    actionLabel: 'Track project',
    icon: FolderSimple,
    trackingName: 'onboarding_track_project',
    scope: 'shared',
    deps: ['first-invoice', 'first-client'],
  },
];

function loadCompleted(userKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}:${userKey}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveCompleted(userKey: string, ids: Set<string>) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}:${userKey}`, JSON.stringify([...ids]));
  } catch {}
}

export function OnboardingActions({
  userKey,
  hasInvoice,
  hasClient,
  hasPayment,
  hasMember,
  hasPayroll,
}: {
  userKey: string;
  hasInvoice: boolean;
  hasClient: boolean;
  hasPayment: boolean;
  hasMember: boolean;
  hasPayroll: boolean;
}) {
  const posthog = usePostHog();
  const { activeWorkspace } = useWorkspaceContext();
  const isOrg = activeWorkspace?.type === 'organization';

  const storageKey = `${STORAGE_KEY_PREFIX}:${userKey}`;
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => {
    const base = loadCompleted(userKey);
    if (hasInvoice) base.add('first-invoice');
    if (hasClient) base.add('first-client');
    if (hasPayment) base.add('has-received-payment');
    if (hasMember) base.add('invite-team');
    if (hasPayroll) base.add('setup-payroll');
    return base;
  });

  const available = useMemo(() => {
    return ACTIONS
      .filter((a) => {
        if (a.scope === 'personal' && isOrg) return false;
        if (a.scope === 'organization' && !isOrg) return false;
        if (completedIds.has(a.id)) return false;
        if (a.deps?.some((dep) => !completedIds.has(dep))) return false;
        return true;
      });
  }, [isOrg, completedIds]);

  const heading = isOrg
    ? "👋 Let's get your team set up."
    : "👋 Let's get you paid.";

  const suggestion = available.length > 0 ? available[0] : null;
  const hasSeenSecondary = completedIds.has('first-invoice') || completedIds.has('first-client');
  const showSecondary = hasSeenSecondary && available.length > 0;
  const isFirstSuggestion = !showSecondary;

  const markComplete = useCallback((id: string) => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveCompleted(userKey, next);
      return next;
    });
  }, [userKey]);

  const handleAction = useCallback((action: OnboardingAction) => {
    posthog?.capture?.('onboarding_action_started', { action_id: action.id, scope: action.scope });
  }, [posthog]);

  const secondaryActions = available.filter((a) => a.id === 'try-bookkeeping' || a.id === 'track-project');

  useEffect(() => {
    if (available.length === 0) {
      posthog?.capture?.('onboarding_completed', { workspace_type: isOrg ? 'organization' : 'personal' });
    }
  }, [available.length, posthog, isOrg]);

  if (available.length === 0) return null;

  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs">
      {isFirstSuggestion && suggestion ? (
        <div>
          <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{heading}</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-soft)]">
                <suggestion.icon className="h-4 w-4 text-[var(--color-primary)]" weight="bold" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{suggestion.title}</p>
                <p className="text-[12px] text-[var(--color-text-tertiary)]">{suggestion.description}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { markComplete(suggestion.id); }}
                className="text-[12px] text-[var(--color-text-muted)]"
              >
                Skip
              </Button>
              <Button
                variant="default"
                size="sm"
                className="create-btn"
                onClick={() => { handleAction(suggestion); markComplete(suggestion.id); }}
                asChild
              >
                <Link href={suggestion.href || '#'}>
                  {suggestion.actionLabel}
                  <ArrowRight className="ml-1 h-3 w-3" weight="bold" />
                </Link>
              </Button>
            </div>
          </div>

          <OnboardingProgressBar
            completedIds={completedIds}
            isOrg={isOrg}
            userKey={userKey}
            hasInvoice={hasInvoice}
            hasClient={hasClient}
            hasPayment={hasPayment}
            hasMember={hasMember}
            hasPayroll={hasPayroll}
          />
        </div>
      ) : showSecondary && secondaryActions.length > 0 ? (
        <div>
          <p className="text-[14px] font-semibold text-[var(--color-foreground)]">Nice work. Here&rsquo;s what&rsquo;s next:</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {secondaryActions.slice(0, 2).map((action) => (
              <div key={action.id} className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-4">
                <div className="flex items-center gap-2">
                  <action.icon className="h-4 w-4 text-[var(--color-primary)]" weight="bold" />
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{action.title}</p>
                </div>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">{action.description}</p>
                <Button
                  variant="default"
                  size="sm"
                  className="mt-1 self-start create-btn"
                  asChild
                  onClick={() => { handleAction(action); markComplete(action.id); }}
                >
                  <Link href={action.href || '#'}>
                    {action.actionLabel}
                    <ArrowRight className="ml-1 h-3 w-3" weight="bold" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>

          <OnboardingProgressBar
            completedIds={completedIds}
            isOrg={isOrg}
            userKey={userKey}
            hasInvoice={hasInvoice}
            hasClient={hasClient}
            hasPayment={hasPayment}
            hasMember={hasMember}
            hasPayroll={hasPayroll}
          />
        </div>
      ) : null}
    </article>
  );
}

function OnboardingProgressBar({
  completedIds,
  isOrg,
  userKey,
  hasInvoice,
  hasClient,
  hasPayment,
  hasMember,
  hasPayroll,
}: {
  completedIds: Set<string>;
  isOrg: boolean;
  userKey: string;
  hasInvoice: boolean;
  hasClient: boolean;
  hasPayment: boolean;
  hasMember: boolean;
  hasPayroll: boolean;
}) {
  const activeItems = useMemo(() => {
    const items: { id: string; label: string; href: string; done: boolean }[] = [];

    items.push({
      id: 'profile',
      label: 'Profile completed',
      href: '/settings',
      done: false, // checked externally
    });
    items.push({
      id: 'payment-sent',
      label: hasInvoice ? 'Invoice sent' : 'Payment sent',
      href: '/payments',
      done: hasInvoice || hasPayment,
    });

    if (isOrg) {
      items.push({
        id: 'team-invited',
        label: 'Team invited',
        href: '/workspace/members',
        done: hasMember,
      });
      items.push({
        id: 'payroll-setup',
        label: 'Payroll set up',
        href: '/workspace/settings',
        done: hasPayroll,
      });
    }

    return items;
  }, [isOrg, hasInvoice, hasClient, hasPayment, hasMember, hasPayroll]);

  const completedCount = activeItems.filter((i) => i.done).length;
  const totalCount = activeItems.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (totalCount === 0) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => {
          const el = document.getElementById('onboarding-progress-details');
          if (el) el.classList.toggle('hidden');
        }}
        className="flex w-full items-center gap-3 text-left"
      >
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Setup progress</p>
            <p className="text-[11px] font-medium text-[var(--color-text-tertiary)]">{progressPct}%</p>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <ArrowRight className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
      </button>
      <div id="onboarding-progress-details" className="hidden mt-2 space-y-1">
        {activeItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)]"
          >
            {item.done ? (
              <CheckCircle className="h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" weight="fill" />
            ) : (
              <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--color-border-input)]" />
            )}
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
