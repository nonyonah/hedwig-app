'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Sparkle } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { HedwigLogo } from '@/components/ui/hedwig-logo';
import type { BillingStatusSummary } from '@/lib/api/client';
import { isOnPaidPlan } from '@/lib/billing/feature-gates';
import {
  FREE_PLAN_FEATURES,
  STARTER_PLAN_FEATURES,
  PRO_PLAN_FEATURES,
  PLAN_COMPARISON_ROWS,
} from '@/lib/billing/pricing';
import { friendlyErrorMessage } from '@/lib/api/errors';

type Interval = 'monthly' | 'annual';
type SubscriptionProvider = 'polar' | 'revenue_cat';

const MONTHLY_PRICES = { starter: 5, pro: 12 } as const;
const ANNUAL_PRICES = { starter: 48, pro: 115 } as const;

const resolveSubscriptionProvider = (billing: BillingStatusSummary | null): SubscriptionProvider | null => {
  const provider = billing?.subscriptionProvider;
  if (provider === 'polar' || provider === 'revenue_cat') return provider;
  const store = String(billing?.entitlement?.store || '').trim().toUpperCase();
  if (!store) return null;
  if (store === 'POLAR') return 'polar';
  return 'revenue_cat';
};

export function PricingPageClient({
  accessToken,
  billing,
}: {
  accessToken: string | null;
  billing: BillingStatusSummary | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialInterval = (billing?.entitlement?.billingInterval as Interval) ?? 'annual';
  const [interval, setInterval] = useState<Interval>(initialInterval);
  const [isRedirecting, setIsRedirecting] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const checkoutId = searchParams.get('checkoutId');

  const plan = billing?.plan ?? 'free';
  const isPaid = isOnPaidPlan(billing);
  const subscriptionProvider = useMemo(() => resolveSubscriptionProvider(billing), [billing]);
  const billingInterval = billing?.entitlement?.billingInterval ?? null;
  const canSwitchOnWeb = Boolean(accessToken && isPaid && subscriptionProvider !== 'revenue_cat');

  const startCheckout = async (targetPlan: 'starter' | 'pro') => {
    if (!accessToken) {
      router.push('/sign-in');
      return;
    }

    const key = `${targetPlan}-${interval}`;
    setIsRedirecting((prev) => ({ ...prev, [key]: true }));
    setError(null);
    setInfo('Opening secure checkout…');

    try {
      window.location.assign(`/api/billing/polar/checkout?plan=${targetPlan}&interval=${interval}`);
    } catch (checkoutError: any) {
      setError(friendlyErrorMessage(checkoutError, 'Could not start checkout right now.'));
      setIsRedirecting((prev) => ({ ...prev, [key]: false }));
    }
  };

  const openSubscriptionManagement = () => {
    if (!accessToken) {
      router.push('/sign-in');
      return;
    }

    if (subscriptionProvider === 'revenue_cat') {
      const message = 'You cannot make changes to this subscription on web because it was purchased through the mobile app.';
      setError(null);
      setInfo(message);
      window.alert(message);
      return;
    }

    window.location.assign('/api/billing/polar/portal');
  };

  const priceFor = (p: 'starter' | 'pro') => {
    if (interval === 'annual') {
      const monthly = MONTHLY_PRICES[p];
      const annual = ANNUAL_PRICES[p];
      const monthlyEq = (annual / 12).toFixed(2).replace(/\.?0+$/, '');
      return {
        value: `$${annual}`,
        suffix: '/year',
        compareAt: `$${monthly}/mo`,
        helper: `$${monthlyEq}/mo billed annually`,
      };
    }
    return {
      value: `$${MONTHLY_PRICES[p]}`,
      suffix: '/month',
      compareAt: null,
      helper: 'Billed monthly',
    };
  };

  const activeIntervalLabel = billingInterval === 'monthly' ? 'Monthly' : billingInterval === 'annual' ? 'Annual' : null;

  const buttonFor = (targetPlan: 'starter' | 'pro') => {
    const key = `${targetPlan}-${interval}`;
    const busy = isRedirecting[key];
    const isOnThisPlan = plan === targetPlan;

    if (busy) return 'Opening…';
    if (isOnThisPlan) return activeIntervalLabel ? `Subscribed (${activeIntervalLabel})` : 'Subscribed';
    return 'Subscribe';
  };

  return (
    <main className="min-h-screen bg-[var(--color-background)]">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-[var(--color-border-light)] bg-[var(--color-surface)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <HedwigLogo width={28} height={28} priority />
            <span className="text-[14px] font-semibold text-[var(--color-foreground)]">Hedwig</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link href="/" className="text-[13px] text-[var(--color-text-tertiary)] hover:text-[var(--color-foreground)] transition-colors">Overview</Link>
            <span className="text-[13px] font-medium text-[var(--color-foreground)]">Pricing</span>
            <Link
              href={accessToken ? '/dashboard' : '/sign-in'}
              className="inline-flex h-8 items-center rounded-full border border-[var(--color-border-input)] px-3.5 text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] transition-colors"
            >
              {accessToken ? 'Open app' : 'Sign in'}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-[var(--color-surface)] border-b border-[var(--color-surface-tertiary)]">
        <div className="mx-auto max-w-[1100px] px-6 py-16 text-center">
          <h1 className="text-[40px] font-bold tracking-[-0.04em] text-[var(--color-foreground)]">
            Simple pricing. No surprises.
          </h1>
          <p className="mt-3 text-[15px] text-[var(--color-text-muted)] max-w-[480px] mx-auto leading-relaxed">
            Start free. Upgrade to Starter for recurring invoices and full history, or go Pro for AI, automations, and integrations.
          </p>

          {/* Toggle */}
          <div className="mt-8 inline-flex items-center gap-3">
            <div className="inline-flex rounded-full bg-[var(--color-surface-tertiary)] p-0.5">
              <button
                type="button"
                onClick={() => setInterval('monthly')}
                className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition-all ${
                  interval === 'monthly' ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setInterval('annual')}
                className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition-all ${
                  interval === 'annual' ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-sm' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                Annual
              </button>
            </div>
            {interval === 'annual' && (
              <span className="inline-flex items-center rounded-full bg-[var(--color-success-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-success)]">
                Save 20%
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="mx-auto max-w-[1100px] px-6 py-10">
        <div className="grid gap-4 lg:grid-cols-3">

          {/* Free */}
          <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <div className="border-b border-[var(--color-surface-tertiary)] pb-5 mb-5">
              <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Free</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[36px] font-bold tracking-[-0.04em] text-[var(--color-foreground)]">$0</span>
                <span className="text-[13px] text-[var(--color-text-muted)]">/ month</span>
              </div>
              <p className="mt-1.5 text-[13px] text-[var(--color-text-muted)]">Core tools to manage clients, invoices, and payments.</p>
            </div>
            <div className="space-y-3 mb-6">
              {FREE_PLAN_FEATURES.map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)]">
                    <Check className="h-2.5 w-2.5 text-[var(--color-text-tertiary)]" weight="bold" />
                  </span>
                  <span className="text-[13px] text-[var(--color-text-secondary)]">{item}</span>
                </div>
              ))}
            </div>
            <Button asChild variant="secondary" className="w-full">
              <Link href={accessToken ? '/dashboard' : '/sign-in'}>
                {accessToken ? 'Continue with Free' : 'Get started for free'}
              </Link>
            </Button>
          </article>

          {/* Starter */}
          <article className={`relative rounded-2xl border bg-[var(--color-surface)] p-6 ${
            plan === 'free' || plan === 'starter'
              ? 'border-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent-soft)]'
              : 'border-[var(--color-border)]'
          }`}>
            {plan === 'free' && (
              <div className="absolute right-5 top-5">
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-tertiary)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
                  <Sparkle className="h-2.5 w-2.5" weight="fill" />
                  Recommended
                </span>
              </div>
            )}
            <div className="border-b border-[var(--color-surface-tertiary)] pb-5 mb-5">
              <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Starter</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[36px] font-bold tracking-[-0.04em] text-[var(--color-foreground)]">{priceFor('starter').value}</span>
                <span className="text-[13px] text-[var(--color-text-muted)]">{priceFor('starter').suffix}</span>
                {priceFor('starter').compareAt && (
                  <>
                    <span className="mx-1 text-[13px] text-[var(--color-text-muted)]">—</span>
                    <span className="text-[13px] text-[var(--color-text-muted)] line-through">{priceFor('starter').compareAt}</span>
                  </>
                )}
              </div>
              <p className="mt-1.5 text-[13px] text-[var(--color-text-muted)]">{priceFor('starter').helper} · cancel anytime.</p>
              {plan === 'free' && (
                <p className="mt-1 text-[12px] font-medium text-[var(--color-success)]">7-day free trial included</p>
              )}
            </div>
            <div className="space-y-3 mb-6">
              {[...FREE_PLAN_FEATURES, ...STARTER_PLAN_FEATURES].map((item, i) => (
                <div key={item} className="flex items-center gap-2.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)]">
                    <Check className="h-2.5 w-2.5 text-[var(--color-text-tertiary)]" weight="bold" />
                  </span>
                  <span className="text-[13px] text-[var(--color-text-secondary)]">{item}</span>
                  {i >= FREE_PLAN_FEATURES.length && (
                    <span className="ml-auto shrink-0 text-[10px] font-medium text-[var(--color-text-tertiary)]">Starter</span>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {plan === 'starter' ? (
                <Button variant="outline" className="w-full" disabled>
                  {buttonFor('starter')}
                </Button>
              ) : (
                <Button
                  onClick={() => startCheckout('starter')}
                  disabled={isRedirecting[`starter-${interval}`]}
                  className="w-full"
                >
                  {buttonFor('starter')}
                </Button>
              )}
              {plan === 'free' && (
                <p className="text-center text-[11px] text-[var(--color-text-tertiary)]">7 days free · then {priceFor('starter').value}{priceFor('starter').suffix} · cancel anytime</p>
              )}
            </div>
          </article>

          {/* Pro */}
          <article className={`relative rounded-2xl border bg-[var(--color-surface)] p-6 ${
            plan === 'pro'
              ? 'border-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent-soft)]'
              : 'border-[var(--color-border)]'
          }`}>
            <div className="border-b border-[var(--color-surface-tertiary)] pb-5 mb-5">
              <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Pro</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[36px] font-bold tracking-[-0.04em] text-[var(--color-foreground)]">{priceFor('pro').value}</span>
                <span className="text-[13px] text-[var(--color-text-muted)]">{priceFor('pro').suffix}</span>
                {priceFor('pro').compareAt && (
                  <>
                    <span className="mx-1 text-[13px] text-[var(--color-text-muted)]">—</span>
                    <span className="text-[13px] text-[var(--color-text-muted)] line-through">{priceFor('pro').compareAt}</span>
                  </>
                )}
              </div>
              <p className="mt-1.5 text-[13px] text-[var(--color-text-muted)]">{priceFor('pro').helper} · cancel anytime.</p>
              {plan === 'free' && (
                <p className="mt-1 text-[12px] font-medium text-[var(--color-success)]">7-day free trial included</p>
              )}
            </div>
            <div className="space-y-3 mb-6">
              {[...FREE_PLAN_FEATURES, ...STARTER_PLAN_FEATURES, ...PRO_PLAN_FEATURES].map((item, i) => {
                const freeCount = FREE_PLAN_FEATURES.length;
                const starterCount = STARTER_PLAN_FEATURES.length;
                const isFree = i < freeCount;
                const isStarter = i < freeCount + starterCount;
                return (
                  <div key={item} className="flex items-center gap-2.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)]">
                      <Check className="h-2.5 w-2.5 text-[var(--color-text-tertiary)]" weight="bold" />
                    </span>
                    <span className="text-[13px] text-[var(--color-text-secondary)]">{item}</span>
                    {!isFree && !isStarter && (
                      <span className="ml-auto shrink-0 text-[10px] font-medium text-[var(--color-text-tertiary)]">Pro</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              {plan === 'pro' ? (
                <Button variant="outline" className="w-full" disabled>
                  {buttonFor('pro')}
                </Button>
              ) : (
                <Button
                  onClick={() => startCheckout('pro')}
                  disabled={isRedirecting[`pro-${interval}`]}
                  className="w-full"
                >
                  {buttonFor('pro')}
                </Button>
              )}
              {plan === 'free' && (
                <p className="text-center text-[11px] text-[var(--color-text-tertiary)]">7 days free · then {priceFor('pro').value}{priceFor('pro').suffix} · cancel anytime</p>
              )}
            </div>
          </article>
        </div>

        {/* Manage subscription */}
        {accessToken && isPaid ? (
          <div className="mt-6 text-center space-y-2">
            {canSwitchOnWeb ? (
              <button
                type="button"
                onClick={openSubscriptionManagement}
                className="text-[12px] font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                Manage subscription
              </button>
            ) : (
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                Subscription managed on mobile — open the app to make changes.
              </p>
            )}
          </div>
        ) : null}

        {info || checkoutId ? (
          <p className="mt-4 text-center text-[12px] text-[var(--color-text-tertiary)]">
            {info || 'Checkout completed. Subscription sync is in progress.'}
          </p>
        ) : null}
        {error ? <p className="mt-4 text-center text-[12px] text-[var(--color-danger)]">{error}</p> : null}
      </section>

      {/* Comparison table */}
      <section className="mx-auto max-w-[1100px] px-6 pb-16">
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="grid grid-cols-[1fr_100px_100px_100px] border-b border-[var(--color-surface-tertiary)] bg-[var(--color-background)] px-5 py-3">
            <p className="text-[11px] font-medium text-[var(--color-text-muted)]">Feature</p>
            <p className="text-center text-[11px] font-medium text-[var(--color-text-muted)]">Free</p>
            <p className="text-center text-[11px] font-medium text-[var(--color-text-muted)]">Starter</p>
            <p className="text-center text-[11px] font-medium text-[var(--color-text-muted)]">Pro</p>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {PLAN_COMPARISON_ROWS.map((row) => (
              <div key={row.feature} className="grid grid-cols-[1fr_100px_100px_100px] items-center px-5 py-3.5">
                <p className="text-[13px] text-[var(--color-text-secondary)]">{row.feature}</p>
                <p className="text-center text-[12px] font-medium text-[var(--color-text-tertiary)]">{row.free}</p>
                <p className="text-center text-[12px] text-[var(--color-text-tertiary)]">{row.starter}</p>
                <p className="text-center text-[12px] text-[var(--color-text-tertiary)]">{row.pro}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
