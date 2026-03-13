import { EntityTable } from '@/components/data/entity-table';
import { PageHeader } from '@/components/data/page-header';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { formatCurrency, formatShortDate } from '@/lib/utils';

export default async function OfframpPage() {
  const session = await getCurrentSession();
  const offrampTransactions = await hedwigApi.offramp({ accessToken: session.accessToken });

  return (
    <div>
      <PageHeader
        eyebrow="Offramp"
        title="Move earnings out without losing transaction context"
        description="Track fiat conversion requests, destinations, and status transitions as part of the same freelancer cash workflow."
      />
      <EntityTable
        title="Offramp transactions"
        columns={['Asset', 'Destination', 'Status', 'Fiat value', 'Created']}
        rows={offrampTransactions.map((tx) => [
          { value: `${tx.amount} ${tx.asset}` },
          { value: tx.destinationLabel },
          { value: tx.status, badge: true, tone: tx.status === 'completed' ? 'success' : tx.status === 'failed' ? 'warning' : 'neutral' },
          { value: formatCurrency(tx.fiatAmount, tx.fiatCurrency) },
          { value: formatShortDate(tx.createdAt) }
        ])}
      />
    </div>
  );
}
