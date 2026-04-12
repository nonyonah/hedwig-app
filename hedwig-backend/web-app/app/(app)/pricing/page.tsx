import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { PricingClient } from './view';

export default async function PricingPage() {
  const session = await getCurrentSession();
  const billing = await hedwigApi.billingStatus({ accessToken: session.accessToken }).catch(() => null);

  return (
    <PricingClient
      accessToken={session.accessToken}
      billing={billing}
    />
  );
}
