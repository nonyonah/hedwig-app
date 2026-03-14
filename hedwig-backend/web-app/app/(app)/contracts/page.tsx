import { CheckCircle, FileText, PencilSimpleLine } from '@phosphor-icons/react/dist/ssr';
import { PageHeader } from '@/components/data/page-header';
import { EntityTable } from '@/components/data/entity-table';
import { MetricCard } from '@/components/data/metric-card';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';

export default async function ContractsPage({
  searchParams
}: {
  searchParams?: Promise<{ contract?: string }>;
}) {
  const session = await getCurrentSession();
  const contracts = await hedwigApi.contracts({ accessToken: session.accessToken });
  const params = (await searchParams) ?? {};
  const signedCount = contracts.filter((contract) => contract.status === 'signed').length;
  const reviewCount = contracts.filter((contract) => contract.status === 'review').length;
  const draftCount = contracts.filter((contract) => contract.status === 'draft').length;
  const highlightedIndex = contracts.findIndex((contract) => contract.id === params.contract);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contracts"
        title="Agreements that sit close to billing and delivery"
        description="Contracts are part of the operating workflow, not a separate legal island."
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard
          icon={<FileText className="h-5 w-5 text-[#72706b]" weight="bold" />}
          label="Total contracts"
          value={`${contracts.length}`}
        />
        <MetricCard
          icon={<PencilSimpleLine className="h-5 w-5 text-[#72706b]" weight="bold" />}
          label="In review"
          value={`${reviewCount + draftCount}`}
        />
        <MetricCard
          icon={<CheckCircle className="h-5 w-5 text-[#72706b]" weight="bold" />}
          label="Signed"
          value={`${signedCount}`}
        />
      </div>
      <EntityTable
        highlightedRowIndex={highlightedIndex >= 0 ? highlightedIndex : null}
        title="Contract workspace"
        columns={['Title', 'Status', 'Client']}
        rows={contracts.map((contract) => [
          { value: contract.title },
          { value: contract.status, badge: true, tone: contract.status === 'signed' ? 'success' : 'neutral' },
          { value: contract.clientName || contract.clientId || 'Unassigned' }
        ])}
      />
    </div>
  );
}
