import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { getRequestRegionLockDecision } from '@/lib/region-lock';
import { OfframpClient } from './view';

export default async function OfframpPage() {
  const session = await getCurrentSession();
  const decision = await getRequestRegionLockDecision('offramp');
  const transactions = decision.allowed
    ? await hedwigApi.offramp({ accessToken: session.accessToken })
    : [];

  return (
    <OfframpClient
      accessToken={session.accessToken}
      initialTransactions={transactions}
      isRegionLocked={!decision.allowed}
      regionLockReason={decision.reason}
      countryCode={decision.countryCode}
    />
  );
}
