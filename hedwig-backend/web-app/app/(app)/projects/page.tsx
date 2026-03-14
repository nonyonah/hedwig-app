import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { ProjectsClient } from './view';

export default async function ProjectsPage() {
  const session = await getCurrentSession();
  const [projects, clients] = await Promise.all([
    hedwigApi.projects({ accessToken: session.accessToken }),
    hedwigApi.clients({ accessToken: session.accessToken })
  ]);

  return (
    <ProjectsClient
      accessToken={session.accessToken}
      availableClients={clients}
      initialProjects={projects}
    />
  );
}
