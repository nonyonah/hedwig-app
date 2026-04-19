'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Sparkle, X } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import type { BillingStatusSummary } from '@/lib/api/client';
import { isProPlan } from '@/lib/billing/feature-gates';

type Interval = 'monthly' | 'annual';
type SubscriptionProvider = 'polar' | 'revenue_cat';

const resolveSubscriptionProvider = (billing: BillingStatusSummary | null): SubscriptionProvider | null => {
  const provider = billing?.subscriptionProvider;
  if (provider === 'polar' || provider === 'revenue_cat') return provider;
  const store = String(billing?.entitlement?.store || '').trim().toUpperCase();
  if (!store) return null;
  if (store === 'POLAR') return 'polar';
  return 'revenue_cat';
};

const FREE_FEATURES = [
  'Invoices and payment links',
  'Clients, projects, and contracts',
  'Earnings dashboard and reporting',
  'Assistant summary and priority feed',
];

const PRO_FEATURES = [
  'Recurring invoice automation',
  'Tax summaries (monthly and yearly)',
  'Priority product updates',
  'Subscription sync across web and mobile',
];

const FEATURE_ROWS: Array<{ feature: string; free: boolean; pro: boolean }> = [
  { feature: 'Create invoices and payment links', free: true, pro: true },
  { feature: 'Manage clients and projects', free: true, pro: true },
  { feature: 'Assistant summary feed', free: true, pro: true },
  { feature: 'Recurring invoice automation', free: false, pro: true },
  { feature: 'Tax summary reports', free: false, pro: true },
  { feature: 'Priority product updates', free: false, pro: true },
];

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
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const checkoutId = searchParams.get('checkoutId');

  const isPro = isProPlan(billing);
  const subscriptionProvider = useMemo(() => resolveSubscriptionProvider(billing), [billing]);

  const price = useMemo(() => {
    if (interval === 'annual') {
      return {
        value: '$48',
        suffix: '/year',
        helper: 'Billed annually',
        badge: 'Save 20%',
      };
    }

    return {
      value: '$5',
      suffix: '/month',
      helper: 'Billed monthly',
      badge: null,
    };
  }, [interval]);

  const startCheckout = async () => {
    if (!accessToken) {
      router.push('/sign-in');
      return;
    }
    if (isPro) return;

    setIsRedirecting(true);
    setError(null);
    setInfo('Opening secure checkout…');

    try {
      window.location.assign(`/api/billing/polar/checkout?interval=${interval}`);
    } catch (checkoutError: any) {
      setError(checkoutError?.message || 'Could not start checkout right now.');
      setIsRedirecting(false);
    } finally {
      // no-op: browser navigates away on success
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
            Start free. Upgrade when you need recurring invoices, tax summaries, and assistant workflows.
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
        <div className="grid gap-4 lg:grid-cols-2">

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
              {FREE_FEATURES.map((item) => (
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

          {/* Pro */}
          <article className="relative rounded-2xl border border-[#2563eb] bg-white p-6 ring-1 ring-[#2563eb]/10">
            <div className="absolute right-5 top-5">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#2563eb] px-2.5 py-1 text-[11px] font-semibold text-white">
                <Sparkle className="h-2.5 w-2.5" weight="fill" />
                Recommended
              </span>
            </div>
            <div className="border-b border-[#f2f4f7] pb-5 mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#2563eb]">Pro</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[36px] font-bold tracking-[-0.04em] text-[#181d27]">{price.value}</span>
                <span className="text-[13px] text-[#a4a7ae]">{price.suffix}</span>
              </div>
              <p className="mt-1.5 text-[13px] text-[#667085]">{price.helper} · cancel anytime.</p>
              {!isPro && (
                <p className="mt-1 text-[12px] font-medium text-[#027a48]">7-day free trial included</p>
              )}
            </div>
            <div className="space-y-3 mb-6">
              {[...FREE_FEATURES, ...PRO_FEATURES].map((item, i) => (
                <div key={item} className="flex items-center gap-2.5">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${i < FREE_FEATURES.length ? 'bg-[#f2f4f7]' : 'bg-[#eff4ff]'}`}>
                    <Check className={`h-2.5 w-2.5 font-bold ${i < FREE_FEATURES.length ? 'text-[#717680]' : 'text-[#2563eb]'}`} weight="bold" />
                  </span>
                  <span className="text-[13px] text-[#414651]">{item}</span>
                  {i >= FREE_FEATURES.length && (
                    <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#2563eb]">Pro</span>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Button onClick={startCheckout} disabled={isRedirecting || isPro} className="w-full">
                {isPro ? 'You are on Pro' : isRedirecting ? 'Opening checkout…' : 'Start free trial'}
              </Button>
              {!isPro && (
                <p className="text-center text-[11px] text-[#717680]">7 days free · then {price.value}{price.suffix} · cancel anytime</p>
              )}
              {accessToken ? (
                <button
                  type="button"
                  onClick={openSubscriptionManagement}
                  className="block w-full text-center text-[12px] font-medium text-[#717680] hover:text-[#414651] transition-colors"
                >
                  Manage subscription
                </button>
              ) : null}
              {info || checkoutId ? (
                <p className="text-center text-[12px] text-[#717680]">
                  {info || 'Checkout completed. Subscription sync is in progress.'}
                </p>
              ) : null}
              {error ? <p className="text-center text-[12px] text-[#b42318]">{error}</p> : null}
            </div>
          </article>
        </div>
      </section>

      {/* Comparison table */}
      <section className="mx-auto max-w-[1100px] px-6 pb-16">
        <div className="overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white">
          <div className="grid grid-cols-[1fr_100px_100px] border-b border-[#f2f4f7] bg-[#fafafa] px-5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Feature</p>
            <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Free</p>
            <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-[#2563eb]">Pro</p>
          </div>
          <div className="divide-y divide-[#f9fafb]">
            {FEATURE_ROWS.map((row) => (
              <div key={row.feature} className="grid grid-cols-[1fr_100px_100px] items-center px-5 py-3.5">
                <p className="text-[13px] text-[#414651]">{row.feature}</p>
                <div className="flex items-center justify-center">
                  {row.free
                    ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f2f4f7]"><Check className="h-3 w-3 text-[#717680]" weight="bold" /></span>
                    : <X className="h-4 w-4 text-[#e4e7ec]" />}
                </div>
                <div className="flex items-center justify-center">
                  {row.pro
                    ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#eff4ff]"><Check className="h-3 w-3 text-[#2563eb]" weight="bold" /></span>
                    : <X className="h-4 w-4 text-[#e4e7ec]" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
