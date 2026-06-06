import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { ProjectsClient } from './view';

export default async function ProjectsPage() {
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);
  const [projects, clients] = await Promise.all([
    hedwigApi.projects(opts),
    hedwigApi.clients(opts)
  ]);

  return (
    <ProjectsClient
      key={opts.workspaceId ?? 'default'}
      accessToken={session.accessToken}
      availableClients={clients}
      initialProjects={projects}
    />
  );
}
