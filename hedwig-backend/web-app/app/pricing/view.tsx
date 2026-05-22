'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Sparkle } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
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
  const [interval, setInterval] = useState<Interval>('annual');
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

  const buttonFor = (targetPlan: 'starter' | 'pro') => {
    const key = `${targetPlan}-${interval}`;
    const busy = isRedirecting[key];
    const isOnThisPlan = plan === targetPlan;

    if (busy) return 'Opening…';
    if (isOnThisPlan) return 'Subscribed';
    return 'Subscribe';
  };

  return (
    <main className="min-h-screen bg-[#fafafa]">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-[#eef0f3] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/hedwig-logo.png" alt="Hedwig" width={28} height={28} priority />
            <span className="text-[14px] font-semibold text-[#181d27]">Hedwig</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link href="/" className="text-[13px] text-[#717680] hover:text-[#181d27] transition-colors">Overview</Link>
            <span className="text-[13px] font-medium text-[#181d27]">Pricing</span>
            <Link
              href={accessToken ? '/dashboard' : '/sign-in'}
              className="inline-flex h-8 items-center rounded-full border border-[#d5d7da] px-3.5 text-[13px] font-medium text-[#344054] hover:bg-[#f9fafb] transition-colors"
            >
              {accessToken ? 'Open app' : 'Sign in'}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-white border-b border-[#f1f2f4]">
        <div className="mx-auto max-w-[1100px] px-6 py-16 text-center">
          <h1 className="text-[40px] font-bold tracking-[-0.04em] text-[#181d27]">
            Simple pricing. No surprises.
          </h1>
          <p className="mt-3 text-[15px] text-[#667085] max-w-[480px] mx-auto leading-relaxed">
            Start free. Upgrade to Starter for recurring invoices and full history, or go Pro for AI, automations, and integrations.
          </p>

          {/* Toggle */}
          <div className="mt-8 inline-flex items-center gap-3">
            <div className="inline-flex rounded-full bg-[#f2f4f7] p-0.5">
              <button
                type="button"
                onClick={() => setInterval('monthly')}
                className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition-all ${
                  interval === 'monthly' ? 'bg-white text-[#181d27] shadow-sm' : 'text-[#717680] hover:text-[#414651]'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setInterval('annual')}
                className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition-all ${
                  interval === 'annual' ? 'bg-white text-[#181d27] shadow-sm' : 'text-[#717680] hover:text-[#414651]'
                }`}
              >
                Annual
              </button>
            </div>
            {interval === 'annual' && (
              <span className="inline-flex items-center rounded-full bg-[#ecfdf3] px-2.5 py-1 text-[11px] font-semibold text-[#027a48]">
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
          <article className="rounded-2xl border border-[#e9eaeb] bg-white p-6">
            <div className="border-b border-[#f2f4f7] pb-5 mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Free</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[36px] font-bold tracking-[-0.04em] text-[#181d27]">$0</span>
                <span className="text-[13px] text-[#a4a7ae]">/ month</span>
              </div>
              <p className="mt-1.5 text-[13px] text-[#667085]">Core tools to manage clients, invoices, and payments.</p>
            </div>
            <div className="space-y-3 mb-6">
              {FREE_PLAN_FEATURES.map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7]">
                    <Check className="h-2.5 w-2.5 text-[#717680]" weight="bold" />
                  </span>
                  <span className="text-[13px] text-[#414651]">{item}</span>
                </div>
              ))}
            </div>
            <Button asChild variant="secondary" className="w-full">
              <Link href={accessToken ? '/dashboard' : '/sign-in'}>
                {accessToken ? 'Continue with Free' : 'Get started for free'}
              </Link>
            </Button>
          </article>

          {/* Starter — always shown as highlighted Recommended plan */}
          <article className="relative rounded-2xl border border-[#2563eb] bg-white p-6 ring-1 ring-[#2563eb]/10">
            <div className="absolute right-5 top-5">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#2563eb] px-2.5 py-1 text-[11px] font-semibold text-white">
                <Sparkle className="h-2.5 w-2.5" weight="fill" />
                Recommended
              </span>
            </div>
            <div className="border-b border-[#f2f4f7] pb-5 mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#2563eb]">Starter</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[36px] font-bold tracking-[-0.04em] text-[#181d27]">{priceFor('starter').value}</span>
                <span className="text-[13px] text-[#a4a7ae]">{priceFor('starter').suffix}</span>
                {priceFor('starter').compareAt && (
                  <>
                    <span className="mx-1 text-[13px] text-[#a4a7ae]">—</span>
                    <span className="text-[13px] text-[#a4a7ae] line-through">{priceFor('starter').compareAt}</span>
                  </>
                )}
              </div>
              <p className="mt-1.5 text-[13px] text-[#667085]">{priceFor('starter').helper} · cancel anytime.</p>
              {plan === 'free' && (
                <p className="mt-1 text-[12px] font-medium text-[#027a48]">7-day free trial included</p>
              )}
            </div>
            <div className="space-y-3 mb-6">
              {[...FREE_PLAN_FEATURES, ...STARTER_PLAN_FEATURES].map((item, i) => (
                <div key={item} className="flex items-center gap-2.5">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${i < FREE_PLAN_FEATURES.length ? 'bg-[#f2f4f7]' : 'bg-[#eff4ff]'}`}>
                    <Check className={`h-2.5 w-2.5 font-bold ${i < FREE_PLAN_FEATURES.length ? 'text-[#717680]' : 'text-[#2563eb]'}`} weight="bold" />
                  </span>
                  <span className="text-[13px] text-[#414651]">{item}</span>
                  {i >= FREE_PLAN_FEATURES.length && (
                    <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#2563eb]">Starter</span>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Button
                onClick={() => startCheckout('starter')}
                disabled={isRedirecting[`starter-${interval}`] || plan === 'starter'}
                className="w-full"
              >
                {buttonFor('starter')}
              </Button>
              {plan === 'free' && (
                <p className="text-center text-[11px] text-[#717680]">7 days free · then {priceFor('starter').value}{priceFor('starter').suffix} · cancel anytime</p>
              )}
            </div>
          </article>

          {/* Pro */}
          <article className={`relative rounded-2xl border bg-white p-6 ring-1 ${
            plan === 'pro'
              ? 'border-[#7c3aed] ring-[#7c3aed]/10'
              : 'border-[#e9eaeb] ring-transparent'
          }`}>
            <div className="border-b border-[#f2f4f7] pb-5 mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#7c3aed]">Pro</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[36px] font-bold tracking-[-0.04em] text-[#181d27]">{priceFor('pro').value}</span>
                <span className="text-[13px] text-[#a4a7ae]">{priceFor('pro').suffix}</span>
                {priceFor('pro').compareAt && (
                  <>
                    <span className="mx-1 text-[13px] text-[#a4a7ae]">—</span>
                    <span className="text-[13px] text-[#a4a7ae] line-through">{priceFor('pro').compareAt}</span>
                  </>
                )}
              </div>
              <p className="mt-1.5 text-[13px] text-[#667085]">{priceFor('pro').helper} · cancel anytime.</p>
              {plan === 'free' && (
                <p className="mt-1 text-[12px] font-medium text-[#027a48]">7-day free trial included</p>
              )}
            </div>
            <div className="space-y-3 mb-6">
              {[...FREE_PLAN_FEATURES, ...STARTER_PLAN_FEATURES, ...PRO_PLAN_FEATURES].map((item, i) => {
                const freeCount = FREE_PLAN_FEATURES.length;
                const starterCount = STARTER_PLAN_FEATURES.length;
                const isFree = i < freeCount;
                const isStarter = i < freeCount + starterCount;
                let circleBg: string, checkColor: string;
                if (isFree) {
                  circleBg = 'bg-[#f2f4f7]';
                  checkColor = 'text-[#717680]';
                } else if (isStarter) {
                  circleBg = 'bg-[#eff4ff]';
                  checkColor = 'text-[#2563eb]';
                } else {
                  circleBg = 'bg-[#f3e8ff]';
                  checkColor = 'text-[#7c3aed]';
                }
                return (
                  <div key={item} className="flex items-center gap-2.5">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${circleBg}`}>
                      <Check className={`h-2.5 w-2.5 font-bold ${checkColor}`} weight="bold" />
                    </span>
                    <span className="text-[13px] text-[#414651]">{item}</span>
                    {!isFree && !isStarter && (
                      <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#7c3aed]">Pro</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              <Button
                onClick={() => startCheckout('pro')}
                disabled={isRedirecting[`pro-${interval}`] || plan === 'pro'}
                className="w-full"
              >
                {buttonFor('pro')}
              </Button>
              {plan === 'free' && (
                <p className="text-center text-[11px] text-[#717680]">7 days free · then {priceFor('pro').value}{priceFor('pro').suffix} · cancel anytime</p>
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
                className="text-[12px] font-semibold text-[#717680] hover:text-[#414651] transition-colors"
              >
                Manage subscription
              </button>
            ) : (
              <p className="text-[12px] text-[#717680]">
                Subscription managed on mobile — open the app to make changes.
              </p>
            )}
          </div>
        ) : null}

        {info || checkoutId ? (
          <p className="mt-4 text-center text-[12px] text-[#717680]">
            {info || 'Checkout completed. Subscription sync is in progress.'}
          </p>
        ) : null}
        {error ? <p className="mt-4 text-center text-[12px] text-[#b42318]">{error}</p> : null}
      </section>

      {/* Comparison table */}
      <section className="mx-auto max-w-[1100px] px-6 pb-16">
        <div className="overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white">
          <div className="grid grid-cols-[1fr_100px_100px_100px] border-b border-[#f2f4f7] bg-[#fafafa] px-5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Feature</p>
            <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Free</p>
            <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-[#2563eb]">Starter</p>
            <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-[#7c3aed]">Pro</p>
          </div>
          <div className="divide-y divide-[#f9fafb]">
            {PLAN_COMPARISON_ROWS.map((row) => (
              <div key={row.feature} className="grid grid-cols-[1fr_100px_100px_100px] items-center px-5 py-3.5">
                <p className="text-[13px] text-[#414651]">{row.feature}</p>
                <p className="text-center text-[12px] font-medium text-[#717680]">{row.free}</p>
                <p className="text-center text-[12px] font-semibold text-[#2563eb]">{row.starter}</p>
                <p className="text-center text-[12px] font-semibold text-[#7c3aed]">{row.pro}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
