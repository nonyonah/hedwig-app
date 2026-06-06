import { notFound } from 'next/navigation';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { ProjectDetailClient } from './view';

export default async function ProjectDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ milestone?: string }>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);
  const data = await hedwigApi.project(id, opts);

  if (!data.project) notFound();

  return (
    <ProjectDetailClient
      accessToken={session.accessToken}
      contract={data.contract}
      highlightedMilestoneId={query.milestone ?? null}
      initialProject={data.project}
      invoices={data.invoices}
      milestones={data.milestones}
    />
  );
}
