import { notFound } from 'next/navigation';
import { ListCard } from '@/components/data/list-card';
import { MetricCard } from '@/components/data/metric-card';
import { PageHeader } from '@/components/data/page-header';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { formatCompactCurrency, formatShortDate } from '@/lib/utils';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  const data = await hedwigApi.project(id, { accessToken: session.accessToken });

  if (!data.project) notFound();

  return (
    <div>
      <PageHeader
        eyebrow="Project detail"
        title={data.project.name}
        description="Scope, milestones, and invoice readiness live together so delivery and money stay in sync."
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard label="Progress" value={`${data.project.progress}%`} />
        <MetricCard label="Budget" value={formatCompactCurrency(data.project.budgetUsd)} />
        <MetricCard label="Next deadline" value={formatShortDate(data.project.nextDeadlineAt)} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ListCard title="Milestones" items={data.milestones.map((milestone) => ({ id: milestone.id, title: milestone.name, subtitle: milestone.status, meta: formatShortDate(milestone.dueAt) }))} />
        <ListCard title="Related invoices" items={data.invoices.map((invoice) => ({ id: invoice.id, title: invoice.number, subtitle: invoice.status, meta: formatCompactCurrency(invoice.amountUsd) }))} />
      </div>
    </div>
  );
}
