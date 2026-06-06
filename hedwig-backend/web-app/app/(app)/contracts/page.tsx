import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import type { Contract } from '@/lib/models/entities';
import { ContractsClient } from './view';

export default async function ContractsPage({
  searchParams
}: {
  searchParams?: Promise<{ contract?: string }>;
}) {
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);
  let contracts: Contract[] = [];
  try {
    contracts = await hedwigApi.contracts(opts);
  } catch {
    // Keep an empty state here; client-side retry in ContractsClient handles transient failures.
  }
  const params = (await searchParams) ?? {};

  return (
    <ContractsClient
      key={opts.workspaceId ?? 'default'}
      accessToken={session.accessToken}
      highlightedContractId={params.contract ?? null}
      initialContracts={contracts}
    />
  );
}
