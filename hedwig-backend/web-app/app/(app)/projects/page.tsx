import { PageHeader } from '@/components/data/page-header';
import { EntityTable } from '@/components/data/entity-table';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { formatCompactCurrency, formatShortDate } from '@/lib/utils';

export default async function ProjectsPage() {
  const session = await getCurrentSession();
  const projects = await hedwigApi.projects({ accessToken: session.accessToken });

  return (
    <div>
      <PageHeader
        eyebrow="Projects"
        title="Delivery work linked to payment readiness"
        description="Keep project health, next deadlines, and cash exposure visible without jumping across separate systems."
      />
      <EntityTable
        title="Active project pipeline"
        columns={['Project', 'Status', 'Progress', 'Budget', 'Next deadline']}
        rows={projects.map((project) => [
          { value: project.name, href: `/projects/${project.id}` },
          { value: project.status, badge: true, tone: project.status === 'active' ? 'success' : project.status === 'paused' ? 'warning' : 'neutral' },
          { value: `${project.progress}%` },
          { value: formatCompactCurrency(project.budgetUsd) },
          { value: formatShortDate(project.nextDeadlineAt) }
        ])}
      />
    </div>
  );
}
