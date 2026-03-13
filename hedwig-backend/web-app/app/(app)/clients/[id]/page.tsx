import { notFound } from 'next/navigation';
import { ListCard } from '@/components/data/list-card';
import { MetricCard } from '@/components/data/metric-card';
import { PageHeader } from '@/components/data/page-header';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { formatCompactCurrency } from '@/lib/utils';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  const data = await hedwigApi.client(id, { accessToken: session.accessToken });

  if (!data.client) notFound();

  return (
    <div>
      <PageHeader
        eyebrow="Client detail"
        title={data.client.name}
        description={`A full operating view for ${data.client.company ?? data.client.name}: active work, contracts, invoices, and payment links.`}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard label="Outstanding" value={formatCompactCurrency(data.client.outstandingUsd)} />
        <MetricCard label="Lifetime billed" value={formatCompactCurrency(data.client.totalBilledUsd)} />
        <MetricCard label="Email" value={data.client.email} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <ListCard title="Projects" items={data.projects.map((project) => ({ id: project.id, title: project.name, subtitle: `${project.progress}% complete`, href: `/projects/${project.id}` }))} />
        <ListCard title="Invoices" items={data.invoices.map((invoice) => ({ id: invoice.id, title: invoice.number, subtitle: invoice.status, meta: formatCompactCurrency(invoice.amountUsd) }))} />
        <ListCard title="Contracts and payment links" items={[...data.contracts.map((contract) => ({ id: contract.id, title: contract.title, subtitle: contract.status })), ...data.paymentLinks.map((link) => ({ id: link.id, title: link.title, subtitle: `${link.chain} • ${link.asset}`, meta: formatCompactCurrency(link.amountUsd) }))]} />
      </div>
    </div>
  );
}
