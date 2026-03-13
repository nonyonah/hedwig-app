import { PageHeader } from '@/components/data/page-header';
import { EntityTable } from '@/components/data/entity-table';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';

export default async function ContractsPage() {
  const session = await getCurrentSession();
  const contracts = await hedwigApi.contracts({ accessToken: session.accessToken });

  return (
    <div>
      <PageHeader
        eyebrow="Contracts"
        title="Agreements that sit close to billing and delivery"
        description="Contracts are part of the operating workflow, not a separate legal island."
      />
      <EntityTable
        title="Contract workspace"
        columns={['Title', 'Status', 'Client']}
        rows={contracts.map((contract) => [
          { value: contract.title },
          { value: contract.status, badge: true, tone: contract.status === 'signed' ? 'success' : 'neutral' },
          { value: contract.clientId }
        ])}
      />
    </div>
  );
}
