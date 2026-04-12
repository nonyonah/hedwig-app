'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, Sparkle } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { backendConfig } from '@/lib/auth/config';
import type { BillingStatusSummary } from '@/lib/api/client';
import { isProPlan } from '@/lib/billing/feature-gates';

type Interval = 'monthly' | 'annual';

export function PricingClient({
  accessToken,
  billing,
}: {
  accessToken: string | null;
  billing: BillingStatusSummary | null;
}) {
  const [interval, setInterval] = useState<Interval>('annual');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPro = isProPlan(billing);
  const canCheckout = Boolean(billing?.featureFlags?.webCheckoutEnabled);

  const pricing = useMemo(() => {
    if (interval === 'annual') {
      return {
        label: '$48',
        subLabel: 'per year',
        helper: '$4/month billed annually',
        badge: 'Save 20%',
      };
    }

    return {
      label: '$5',
      subLabel: 'per month',
      helper: 'Cancel anytime',
      badge: null,
    };
  }, [interval]);

  const startCheckout = async () => {
    if (!accessToken || !canCheckout) return;
    setIsRedirecting(true);
    setError(null);
    try {
      const response = await fetch(`${backendConfig.apiBaseUrl}/api/billing/checkout-link`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          interval,
          returnUrl: `${window.location.origin}/pricing`,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success || !payload?.data?.checkoutUrl) {
        throw new Error(payload?.error?.message || 'Checkout is not available right now.');
      }

      window.location.assign(String(payload.data.checkoutUrl));
    } catch (checkoutError: any) {
      setError(checkoutError?.message || 'Could not start checkout. Please try again.');
      setIsRedirecting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
      <div>
        <h1 className="text-[15px] font-semibold text-[#181d27]">Pricing</h1>
        <p className="mt-0.5 text-[13px] text-[#a4a7ae]">
          One plan for freelancers who want better visibility and fewer manual steps.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-xs ring-1 ring-[#e9eaeb]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eff4ff]">
              <Sparkle className="h-4 w-4 text-[#717680]" weight="fill" />
            </div>
            <div>
              <p className="text-[16px] font-semibold text-[#181d27]">Hedwig Pro</p>
              <p className="text-[12px] text-[#717680]">For independent operators and small teams.</p>
            </div>
          </div>
          <div className="inline-flex rounded-full bg-[#f5f5f5] p-1">
            <button
              type="button"
              onClick={() => setInterval('monthly')}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                interval === 'monthly' ? 'bg-white text-[#181d27] shadow-xs' : 'text-[#717680]'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval('annual')}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                interval === 'annual' ? 'bg-white text-[#181d27] shadow-xs' : 'text-[#717680]'
              }`}
            >
              Annual
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-[#e9eaeb] bg-[#fafafa] px-5 py-5">
          <div className="flex items-end gap-2">
            <p className="text-[40px] font-bold tracking-[-0.04em] leading-none text-[#181d27]">{pricing.label}</p>
            <p className="pb-1 text-[13px] text-[#717680]">{pricing.subLabel}</p>
            {pricing.badge ? (
              <span className="mb-1 inline-flex items-center rounded-full bg-[#ecfdf3] px-2.5 py-1 text-[11px] font-semibold text-[#027a48]">
                {pricing.badge}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[12px] text-[#717680]">{pricing.helper}</p>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          {[
            'Assistant summary for payments and projects',
            'Recurring invoice automation',
            'Tax summaries with monthly and yearly totals',
            'Subscription sync across web and mobile',
          ].map((feature) => (
            <div key={feature} className="flex items-start gap-2 rounded-xl border border-[#f2f4f7] bg-white px-3 py-2.5">
              <CheckCircle className="mt-[1px] h-4 w-4 shrink-0 text-[#12b76a]" weight="regular" />
              <p className="text-[13px] text-[#414651]">{feature}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={startCheckout} disabled={isRedirecting || !canCheckout || isPro}>
            {isPro ? 'You are on Pro' : isRedirecting ? 'Opening checkout…' : 'Upgrade to Pro'}
          </Button>
          {isPro ? <p className="text-[12px] text-[#12b76a]">Your Pro subscription is active.</p> : null}
          {!canCheckout ? (
            <p className="text-[12px] text-[#b42318]">Checkout is temporarily unavailable.</p>
          ) : null}
          {error ? <p className="text-[12px] text-[#b42318]">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
