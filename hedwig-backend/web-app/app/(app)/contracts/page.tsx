import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { contracts as mockContracts } from '@/lib/mock/data';
import { ContractsClient } from './view';

export default async function ContractsPage({
  searchParams
}: {
  searchParams?: Promise<{ contract?: string }>;
}) {
  const session = await getCurrentSession();
  let contracts = mockContracts;
  try {
    contracts = await hedwigApi.contracts({ accessToken: session.accessToken });
  } catch {
    // Fall back to mock contracts if the API call fails
  }
  const params = (await searchParams) ?? {};

  return <ContractsClient accessToken={session.accessToken} highlightedContractId={params.contract ?? null} initialContracts={contracts} />;
}
