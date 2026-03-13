import { PageHeader } from '@/components/data/page-header';
import { EntityTable } from '@/components/data/entity-table';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { formatCompactCurrency, formatShortDate } from '@/lib/utils';

export default async function ClientsPage() {
  const session = await getCurrentSession();
  const clients = await hedwigApi.clients({ accessToken: session.accessToken });

  return (
    <div>
      <PageHeader
        eyebrow="Clients"
        title="Client relationships tied directly to revenue"
        description="Track who you work with, what they owe, and how active each account is without leaving the operating surface."
      />
      <EntityTable
        title="Client roster"
        columns={['Client', 'Status', 'Outstanding', 'Lifetime billed', 'Last activity']}
        rows={clients.map((client) => [
          { value: client.name, href: `/clients/${client.id}` },
          { value: client.status.replace('_', ' '), badge: true, tone: client.status === 'active' ? 'success' : client.status === 'at_risk' ? 'warning' : 'neutral' },
          { value: formatCompactCurrency(client.outstandingUsd) },
          { value: formatCompactCurrency(client.totalBilledUsd) },
          { value: formatShortDate(client.lastActivityAt) }
        ])}
      />
    </div>
  );
}
