import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { AgentsClient } from './view';

export default async function AgentsPage() {
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);
  const agents = await hedwigApi.agents(opts);

  return <AgentsClient key={opts.workspaceId ?? 'default'} accessToken={session.accessToken} workspaceId={opts.workspaceId ?? undefined} initialAgents={agents} />;
}
