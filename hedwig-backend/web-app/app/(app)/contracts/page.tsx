import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import type { Contract } from '@/lib/models/entities';
import { ContractsClient } from './view';

export default async function ContractsPage({
  searchParams
}: {
  searchParams?: Promise<{ contract?: string }>;
}) {
  const session = await getCurrentSession();
  let contracts: Contract[] = [];
  try {
    contracts = await hedwigApi.contracts({ accessToken: session.accessToken });
  } catch {
    // Keep an empty state here; client-side retry in ContractsClient handles transient failures.
  }
  const params = (await searchParams) ?? {};

  return <ContractsClient accessToken={session.accessToken} highlightedContractId={params.contract ?? null} initialContracts={contracts} />;
}
