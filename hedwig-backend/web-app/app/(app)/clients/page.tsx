import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { ClientsClient } from './view';

export default async function ClientsPage() {
  const session = await getCurrentSession();
  const clients = await hedwigApi.clients({
    accessToken: session.accessToken,
    disableMockFallback: true
  });

  return <ClientsClient accessToken={session.accessToken} initialClients={clients} />;
}
