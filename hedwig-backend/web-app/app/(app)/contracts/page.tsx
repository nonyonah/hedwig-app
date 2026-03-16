import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { ContractsClient } from './view';

export default async function ContractsPage({
  searchParams
}: {
  searchParams?: Promise<{ contract?: string }>;
}) {
  const session = await getCurrentSession();
  const contracts = await hedwigApi.contracts({ accessToken: session.accessToken });
  const params = (await searchParams) ?? {};

  return <ContractsClient accessToken={session.accessToken} highlightedContractId={params.contract ?? null} initialContracts={contracts} />;
}
