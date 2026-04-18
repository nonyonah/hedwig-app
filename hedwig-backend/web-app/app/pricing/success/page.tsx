import { hedwigApi, type BillingStatusSummary } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { SuccessPageClient } from './view';

export default async function PricingSuccessPage() {
  const session = await getCurrentSession();

  let billing: BillingStatusSummary | null = null;

  if (session.accessToken) {
    billing = await hedwigApi.billingStatus({ accessToken: session.accessToken }).catch(() => null);
  }

  return (
    <SuccessPageClient
      accessToken={session.accessToken}
      billing={billing}
    />
  );
}
