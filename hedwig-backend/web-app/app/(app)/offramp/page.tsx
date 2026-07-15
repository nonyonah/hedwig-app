import { getCurrentSession } from '@/lib/auth/session';
import { hedwigApi } from '@/lib/api/client';
import { getRequestRegionLockDecision } from '@/lib/region-lock';
import type { OfframpTransaction } from '@/lib/models/entities';
import { OfframpClient } from './view';

export const dynamic = 'force-dynamic';

export default async function OfframpPage() {
  const session = await getCurrentSession();

  let initialTransactions: OfframpTransaction[] = [];
  let geoAllowed = false;
  let geoCountry: string | null = null;
  let geoReason: string | null = null;

  if (session.accessToken) {
    const geo = await getRequestRegionLockDecision('offramp');
    geoAllowed = geo.allowed;
    geoCountry = geo.countryCode;
    geoReason = geo.reason;

    if (geoAllowed) {
      try {
        initialTransactions = await hedwigApi.offramp({ accessToken: session.accessToken });
      } catch {
        // Transactions may fail to load
      }
    }
  }

  return (
    <OfframpClient
      initialTransactions={initialTransactions}
      accessToken={session.accessToken}
      isRegionLocked={!geoAllowed}
      regionLockReason={geoReason}
      countryCode={geoCountry}
    />
  );
}
