'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorCode, Purchases, PurchasesError, type Offering, type Package } from '@revenuecat/purchases-js';
import { Check, Sparkle, X } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import type { BillingStatusSummary } from '@/lib/api/client';
import { isProPlan } from '@/lib/billing/feature-gates';

type Interval = 'monthly' | 'annual';

const FREE_FEATURES = [
  'Invoices and payment links',
  'Clients, projects, and contracts',
  'Wallet and transaction history',
  'Basic dashboard metrics',
];

const PRO_FEATURES = [
  'Assistant summary and priority feed',
  'Recurring invoice automation',
  'Tax summaries (monthly and yearly)',
  'USD account with ACH details',
  'Subscription sync across web and mobile',
];

const FEATURE_ROWS: Array<{ feature: string; free: boolean; pro: boolean }> = [
  { feature: 'Create invoices and payment links', free: true, pro: true },
  { feature: 'Manage clients and projects', free: true, pro: true },
  { feature: 'Assistant summary feed', free: false, pro: true },
  { feature: 'Recurring invoice automation', free: false, pro: true },
  { feature: 'Tax summary reports', free: false, pro: true },
  { feature: 'USD account with ACH details', free: false, pro: true },
  { feature: 'Priority product updates', free: false, pro: true },
];

const SANDBOX_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_WEB_BILLING_SANDBOX_API_KEY?.trim() || '';
const PROD_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_WEB_BILLING_API_KEY?.trim() || '';
const USE_SANDBOX = process.env.NEXT_PUBLIC_REVENUECAT_USE_SANDBOX !== 'false';
const REVENUECAT_API_KEY = USE_SANDBOX ? SANDBOX_API_KEY || PROD_API_KEY : PROD_API_KEY || SANDBOX_API_KEY;
const PRIMARY_ENTITLEMENT_ID = process.env.NEXT_PUBLIC_REVENUECAT_PRIMARY_ENTITLEMENT_ID?.trim() || 'pro';

const isPackageType = (rcPackage: Package, value: string) =>
  String(rcPackage.packageType || '').toLowerCase() === value.toLowerCase();

function pickMonthlyPackage(offering: Offering | null): Package | null {
  if (!offering) return null;
  return (
    offering.monthly ||
    offering.availablePackages.find((item) => isPackageType(item, '$rc_monthly')) ||
    offering.availablePackages.find((item) => item.identifier.toLowerCase().includes('monthly')) ||
    null
  );
}

function pickAnnualPackage(offering: Offering | null): Package | null {
  if (!offering) return null;
  return (
    offering.annual ||
    offering.availablePackages.find((item) => isPackageType(item, '$rc_annual')) ||
    offering.availablePackages.find((item) => item.identifier.toLowerCase().includes('annual')) ||
    null
  );
}

export function PricingPageClient({
  accessToken,
  billing,
}: {
  accessToken: string | null;
  billing: BillingStatusSummary | null;
}) {
  const router = useRouter();
  const [interval, setInterval] = useState<Interval>('annual');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [packages, setPackages] = useState<{ monthly: Package | null; annual: Package | null }>({
    monthly: null,
    annual: null,
  });

  const isPro = isProPlan(billing);
  const appUserId = billing?.appUserId || null;
  const hasSdkKey = REVENUECAT_API_KEY.length > 0;

  useEffect(() => {
    if (!accessToken || !appUserId || !hasSdkKey) return;

    let cancelled = false;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      setError(null);
      setInfo(null);
      try {
        let purchases: Purchases;
        if (!Purchases.isConfigured()) {
          purchases = Purchases.configure({
            apiKey: REVENUECAT_API_KEY,
            appUserId,
          });
        } else {
          purchases = Purchases.getSharedInstance();
          if (purchases.getAppUserId() !== appUserId) {
            await purchases.changeUser(appUserId);
          }
        }

        const offerings = await purchases.getOfferings();
        const current = offerings.current;
        const customerInfo = await purchases.getCustomerInfo();

        if (cancelled) return;

        setPackages({
          monthly: pickMonthlyPackage(current),
          annual: pickAnnualPackage(current),
        });
        setPortalUrl(customerInfo.managementURL || null);
        setInfo(
          purchases.isSandbox()
            ? 'RevenueCat sandbox mode is active.'
            : USE_SANDBOX
              ? 'Using a production RevenueCat key while sandbox mode is requested.'
              : null
        );
      } catch (bootstrapError: any) {
        if (!cancelled) {
          setError(bootstrapError?.message || 'Could not initialize billing.');
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, appUserId, hasSdkKey]);

  const price = useMemo(() => {
    if (interval === 'annual') {
      const formatted = packages.annual?.webBillingProduct?.price?.formattedPrice;
      return {
        value: formatted || '$48',
        suffix: '/year',
        helper: 'Billed annually',
        badge: 'Save 20%',
      };
    }

    const formatted = packages.monthly?.webBillingProduct?.price?.formattedPrice;
    return {
      value: formatted || '$5',
      suffix: '/month',
      helper: 'Billed monthly',
      badge: null,
    };
  }, [interval, packages.annual, packages.monthly]);

  const startCheckout = async () => {
    if (!accessToken) {
      router.push('/sign-in');
      return;
    }
    if (!appUserId) {
      setError('Could not resolve account identity for billing.');
      return;
    }
    if (!hasSdkKey) {
      setError(
        'Missing RevenueCat key. Set NEXT_PUBLIC_REVENUECAT_WEB_BILLING_SANDBOX_API_KEY (or NEXT_PUBLIC_REVENUECAT_WEB_BILLING_API_KEY).'
      );
      return;
    }
    if (isPro) return;

    setIsRedirecting(true);
    setError(null);

    try {
      let purchases: Purchases;
      if (!Purchases.isConfigured()) {
        purchases = Purchases.configure({
          apiKey: REVENUECAT_API_KEY,
          appUserId,
        });
      } else {
        purchases = Purchases.getSharedInstance();
        if (purchases.getAppUserId() !== appUserId) {
          await purchases.changeUser(appUserId);
        }
      }

      const targetPackage = interval === 'annual' ? packages.annual : packages.monthly;
      if (!targetPackage) {
        const offerings = await purchases.getOfferings();
        const current = offerings.current;
        const fallbackPackage = interval === 'annual' ? pickAnnualPackage(current) : pickMonthlyPackage(current);
        if (!fallbackPackage) {
          throw new Error(
            interval === 'annual'
              ? 'Annual package is not configured in the current RevenueCat offering.'
              : 'Monthly package is not configured in the current RevenueCat offering.'
          );
        }
        setPackages((prev) => ({
          monthly: prev.monthly || pickMonthlyPackage(current),
          annual: prev.annual || pickAnnualPackage(current),
        }));
        const result = await purchases.purchase({ rcPackage: fallbackPackage });
        setPortalUrl(result.customerInfo.managementURL || null);
      } else {
        const result = await purchases.purchase({ rcPackage: targetPackage });
        setPortalUrl(result.customerInfo.managementURL || null);
      }

      setInfo('Purchase completed. Refreshing your plan status…');
      router.refresh();
    } catch (checkoutError: any) {
      if (checkoutError instanceof PurchasesError && checkoutError.errorCode === ErrorCode.UserCancelledError) {
        setInfo('Checkout cancelled.');
      } else {
        setError(checkoutError?.message || 'Could not start checkout right now.');
      }
    } finally {
      setIsRedirecting(false);
    }
  };

  return (
    <main className="min-h-screen bg-white">
      <nav className="sticky top-0 z-40 border-b border-[#eef0f3] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/hedwig-logo.png" alt="Hedwig" width={32} height={32} priority />
            <span className="text-[14px] font-semibold text-[#181d27]">Hedwig</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link href="/" className="text-[13px] font-medium text-[#717680] hover:text-[#181d27]">Overview</Link>
            <span className="text-[13px] font-semibold text-[#181d27]">Pricing</span>
            <Link
              href={accessToken ? '/dashboard' : '/sign-in'}
              className="inline-flex h-9 items-center rounded-full border border-[#d5d7da] px-4 text-[13px] font-semibold text-[#344054] hover:bg-[#fafafa]"
            >
              {accessToken ? 'Open app' : 'Sign in'}
            </Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-[1200px] px-6 pb-10 pt-14">
        <div className="mx-auto max-w-[780px] text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">Pricing</p>
          <h1 className="mt-3 text-[44px] font-bold tracking-[-0.04em] text-[#181d27]">
            Straightforward pricing for independent teams.
          </h1>
          <p className="mt-4 text-[15px] leading-7 text-[#667085]">
            Start for free. Upgrade to Pro when you need automation, deeper reporting, and assistant workflows.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full bg-[#f5f5f5] p-1">
            <button
              type="button"
              onClick={() => setInterval('monthly')}
              className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition ${
                interval === 'monthly' ? 'bg-white text-[#181d27] shadow-xs' : 'text-[#717680]'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval('annual')}
              className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition ${
                interval === 'annual' ? 'bg-white text-[#181d27] shadow-xs' : 'text-[#717680]'
              }`}
            >
              Annual
            </button>
          </div>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-[#e9eaeb] bg-white p-7">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Free</p>
            <h2 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#181d27]">$0<span className="text-[15px] font-medium text-[#717680]">/month</span></h2>
            <p className="mt-2 text-[13px] text-[#667085]">Use core workflows to run client work and payments.</p>
            <div className="mt-5 space-y-2.5">
              {FREE_FEATURES.map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-[#717680]" weight="bold" />
                  <span className="text-[13px] text-[#414651]">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <Button asChild variant="secondary">
                <Link href={accessToken ? '/dashboard' : '/sign-in'}>
                  {accessToken ? 'Continue with Free' : 'Get started'}
                </Link>
              </Button>
            </div>
          </article>

          <article className="relative rounded-3xl border border-[#bfd4ff] bg-[#f8fbff] p-7">
            <span className="absolute right-6 top-6 inline-flex items-center rounded-full bg-[#ecfdf3] px-2.5 py-1 text-[11px] font-semibold text-[#027a48]">
              Recommended
            </span>
            <div className="flex items-center gap-2">
              <Sparkle className="h-4 w-4 text-[#717680]" weight="fill" />
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Pro</p>
            </div>
            <h2 className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#181d27]">
              {price.value}
              <span className="text-[15px] font-medium text-[#717680]">{price.suffix}</span>
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-[13px] text-[#667085]">{price.helper}</p>
              {price.badge ? (
                <span className="inline-flex rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[11px] font-semibold text-[#027a48]">
                  {price.badge}
                </span>
              ) : null}
            </div>
            <div className="mt-5 space-y-2.5">
              {PRO_FEATURES.map((item) => (
                <div key={item} className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 text-[#717680]" weight="bold" />
                  <span className="text-[13px] text-[#414651]">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-2.5">
              <Button onClick={startCheckout} disabled={isRedirecting || isPro || isBootstrapping}>
                {isPro ? 'You are on Pro' : isRedirecting ? 'Opening checkout…' : isBootstrapping ? 'Preparing checkout…' : 'Upgrade to Pro'}
              </Button>
              {portalUrl ? (
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-[12px] font-semibold text-[#2563eb] hover:text-[#1d4ed8]"
                >
                  Manage subscription
                </a>
              ) : null}
              {info ? <p className="text-[12px] text-[#717680]">{info}</p> : null}
              {error ? <p className="text-[12px] text-[#b42318]">{error}</p> : null}
            </div>
          </article>
        </div>
      </section>

      <section className="border-t border-[#f1f2f4] bg-[#fafafa]">
        <div className="mx-auto max-w-[1200px] px-6 py-12">
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#181d27]">Plan comparison</h2>
          <div className="mt-5 overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white">
            <div className="grid grid-cols-[1.5fr_0.5fr_0.5fr] border-b border-[#f2f4f7] bg-[#fcfcfd] px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Feature</p>
              <p className="text-center text-[12px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Free</p>
              <p className="text-center text-[12px] font-semibold uppercase tracking-wider text-[#a4a7ae]">Pro</p>
            </div>
            <div className="divide-y divide-[#f9fafb]">
              {FEATURE_ROWS.map((row) => (
                <div key={row.feature} className="grid grid-cols-[1.5fr_0.5fr_0.5fr] px-4 py-3">
                  <p className="text-[13px] text-[#414651]">{row.feature}</p>
                  <div className="flex items-center justify-center">
                    {row.free ? <Check className="h-4 w-4 text-[#717680]" weight="bold" /> : <X className="h-4 w-4 text-[#c1c5cd]" />}
                  </div>
                  <div className="flex items-center justify-center">
                    {row.pro ? <Check className="h-4 w-4 text-[#717680]" weight="bold" /> : <X className="h-4 w-4 text-[#c1c5cd]" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
