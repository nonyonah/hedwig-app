import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { ClientsClient } from './view';

export default async function ClientsPage() {
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);
  const clients = await hedwigApi.clients(opts);

  return <ClientsClient key={opts.workspaceId ?? 'default'} accessToken={session.accessToken} initialClients={clients} />;
}
