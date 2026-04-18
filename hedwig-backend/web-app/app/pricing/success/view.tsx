'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Sparkle } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import type { BillingStatusSummary } from '@/lib/api/client';
import { isProPlan } from '@/lib/billing/feature-gates';

const PRO_FEATURES = [
  'Assistant summary and priority feed',
  'Recurring invoice automation',
  'Tax summaries (monthly and yearly)',
  'Subscription sync across web and mobile',
];

export function SuccessPageClient({
  accessToken,
  billing: initialBilling,
}: {
  accessToken: string | null;
  billing: BillingStatusSummary | null;
}) {
  const searchParams = useSearchParams();
  const checkoutId = searchParams.get('checkoutId');
  const [billing, setBilling] = useState(initialBilling);
  const [pollCount, setPollCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPro = isProPlan(billing);

  // On mount: immediately sync via Polar API so we don't wait for webhook
  useEffect(() => {
    if (isPro || !accessToken || !checkoutId) return;

    const syncNow = async () => {
      try {
        await fetch('/api/billing/polar/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkoutId }),
        });
      } catch {
        // non-fatal — polling will catch it
      }
    };

    void syncNow();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll billing status until Pro is confirmed
  useEffect(() => {
    if (isPro || !accessToken || !checkoutId) return;

    const poll = async () => {
      try {
        const res = await fetch('/api/billing/status');
        if (!res.ok) return;
        const data = await res.json() as { billing?: BillingStatusSummary };
        if (data?.billing) setBilling(data.billing);
        setPollCount((c) => c + 1);
      } catch {
        // ignore
      }
    };

    // First poll immediately, then every 3s
    void poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPro, accessToken, checkoutId]);

  // Stop polling after Pro is confirmed or after 10 attempts
  useEffect(() => {
    if ((isPro || pollCount >= 10) && intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  }, [isPro, pollCount]);

  return (
    <main className="min-h-screen bg-[#fafafa]">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-[#eef0f3] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/hedwig-logo.png" alt="Hedwig" width={28} height={28} priority />
            <span className="text-[14px] font-semibold text-[#181d27]">Hedwig</span>
          </Link>
          <Link
            href={accessToken ? '/dashboard' : '/sign-in'}
            className="inline-flex h-8 items-center rounded-full border border-[#d5d7da] px-3.5 text-[13px] font-medium text-[#344054] hover:bg-[#f9fafb] transition-colors"
          >
            {accessToken ? 'Open app' : 'Sign in'}
          </Link>
        </div>
      </nav>

      <section className="bg-white border-b border-[#f1f2f4]">
        <div className="mx-auto max-w-[480px] px-6 py-20 text-center">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#eff4ff]">
            <Sparkle className="h-6 w-6 text-[#2563eb]" weight="fill" />
          </div>

          <h1 className="text-[32px] font-bold tracking-[-0.04em] text-[#181d27]">
            {isPro ? "You're on Pro" : 'Payment received'}
          </h1>
          <p className="mt-3 text-[15px] text-[#667085] leading-relaxed">
            {isPro
              ? 'Your Pro subscription is active. Everything is ready to go.'
              : 'Your payment was successful. Your subscription will be active shortly — this usually takes a few seconds.'}
          </p>

          {/* Sync indicator */}
          {!isPro && checkoutId && pollCount < 10 && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#f2f4f7] px-3.5 py-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2563eb]" />
              <span className="text-[12px] font-medium text-[#717680]">Syncing subscription…</span>
            </div>
          )}

          {isPro && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#ecfdf3] px-3.5 py-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#12b76a]">
                <Check className="h-2.5 w-2.5 text-white" weight="bold" />
              </span>
              <span className="text-[12px] font-semibold text-[#027a48]">Pro active</span>
            </div>
          )}

          {/* Features */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white text-left">
            <div className="border-b border-[#f2f4f7] bg-[#fafafa] px-5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">What you get with Pro</p>
            </div>
            <div className="divide-y divide-[#f9fafb]">
              {PRO_FEATURES.map((feat) => (
                <div key={feat} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#eff4ff]">
                    <Check className="h-3 w-3 text-[#2563eb]" weight="bold" />
                  </span>
                  <span className="text-[13px] text-[#414651]">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="mt-6 space-y-2">
            <Button asChild className="w-full">
              <Link href={accessToken ? '/dashboard' : '/sign-in'}>
                Go to dashboard
              </Link>
            </Button>
            <Link
              href="/pricing"
              className="block text-center text-[12px] font-medium text-[#717680] hover:text-[#414651] transition-colors"
            >
              View plan details
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
