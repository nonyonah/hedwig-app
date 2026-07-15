import { getCurrentSession } from '@/lib/auth/session';
import { hedwigApi } from '@/lib/api/client';
import { PricingPageClient } from './view';

export default async function PricingPage() {
  const session = await getCurrentSession();

  let billing = null;
  if (session.accessToken) {
    try {
      billing = await hedwigApi.billingStatus({ accessToken: session.accessToken });
    } catch {
      // Billing API may fail for users without a subscription — that's fine
    }
  }

  return <PricingPageClient accessToken={session.accessToken} billing={billing} />;
}
