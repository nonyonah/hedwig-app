'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Sparkle } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { HedwigLogo } from '@/components/ui/hedwig-logo';
import type { BillingStatusSummary } from '@/lib/api/client';
import { isOnPaidPlan } from '@/lib/billing/feature-gates';
import { PRO_PLAN_FEATURES, STARTER_PLAN_FEATURES } from '@/lib/billing/pricing';

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

 const plan = billing?.plan ?? 'free';
 const isPaid = isOnPaidPlan(billing);
 const isPro = plan === 'pro';
 const planFeatures = isPro ? PRO_PLAN_FEATURES : STARTER_PLAN_FEATURES;
 const planLabel = plan === 'pro' ? 'Pro' : plan === 'starter' ? 'Starter' : 'Paid';

 // On mount: immediately sync via Polar API so we don't wait for webhook
 useEffect(() => {
 if (isPaid || !accessToken || !checkoutId) return;

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

 // Poll billing status until plan is confirmed
 useEffect(() => {
 if (isPaid || !accessToken || !checkoutId) return;

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
 }, [isPaid, accessToken, checkoutId]);

 // Stop polling after plan is confirmed or after 10 attempts
 useEffect(() => {
 if ((isPaid || pollCount >= 10) && intervalRef.current) {
 clearInterval(intervalRef.current);
 }
 }, [isPaid, pollCount]);

 return (
 <main className="min-h-screen bg-[var(--color-background)]">
 {/* Nav */}
 <nav className="sticky top-0 z-40 border-b border-[var(--color-border-light)] bg-[var(--color-surface)]/90 backdrop-blur-xl">
 <div className="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-4">
 <Link href="/" className="flex items-center gap-2.5">
 <HedwigLogo width={28} height={28} priority />
 <span className="text-[14px] font-semibold text-[var(--color-foreground)]">Hedwig</span>
 </Link>
 <Link
 href={accessToken ? '/dashboard' : '/sign-in'}
 className="inline-flex h-8 items-center rounded-full border border-[var(--color-border-input)] px-3.5 text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] transition-colors"
 >
 {accessToken ? 'Open app' : 'Sign in'}
 </Link>
 </div>
 </nav>

 <section className="bg-[var(--color-surface)] border-b border-[var(--color-surface-tertiary)]">
 <div className="mx-auto max-w-[480px] px-6 py-20 text-center">
 {/* Icon */}
 <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
 <Sparkle className="h-6 w-6 text-[var(--color-primary)]" weight="fill" />
 </div>

 <h1 className="text-[32px] font-bold tracking-[-0.04em] text-[var(--color-foreground)]">
 {isPaid ? `You're on ${planLabel}` : 'Payment received'}
 </h1>
 <p className="mt-3 text-[15px] text-[var(--color-text-muted)] leading-relaxed">
 {isPaid
 ? `Your ${planLabel} subscription is active. Everything is ready to go.`
 : 'Your payment was successful. Your subscription will be active shortly — this usually takes a few seconds.'}
 </p>

 {/* Sync indicator */}
 {!isPaid && checkoutId && pollCount < 10 && (
 <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-surface-tertiary)] px-3.5 py-1.5">
 <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-primary)]" />
 <span className="text-[12px] font-medium text-[var(--color-text-tertiary)]">Syncing subscription…</span>
 </div>
 )}

 {isPaid && (
 <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-success-soft)] px-3.5 py-1.5">
 <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-success)]">
 <Check className="h-2.5 w-2.5 text-white" weight="bold" />
 </span>
 <span className="text-[12px] font-semibold text-[var(--color-success)]">{planLabel} active</span>
 </div>
 )}

 {/* Features */}
 <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-left">
 <div className="border-b border-[var(--color-surface-tertiary)] bg-[var(--color-background)] px-5 py-3">
 <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">What you get with {planLabel}</p>
 </div>
 <div className="divide-y divide-[var(--color-surface-secondary)]">
 {planFeatures.map((feat) => (
 <div key={feat} className="flex items-center gap-3 px-5 py-3.5">
 <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
 <Check className="h-3 w-3 text-[var(--color-primary)]" weight="bold" />
 </span>
 <span className="text-[13px] text-[var(--color-text-secondary)]">{feat}</span>
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
 className="block text-center text-[12px] font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
 >
 View plan details
 </Link>
 </div>
 </div>
 </section>
 </main>
 );
}
