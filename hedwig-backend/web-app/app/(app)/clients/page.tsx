import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { ClientsClient } from './view';

export default async function ClientsPage() {
  const session = await getCurrentSession();
  // Allow the mock fallback so demo sessions (accessToken === 'demo') still
  // render the page instead of throwing on the unauthenticated backend call.
  const clients = await hedwigApi.clients({
    accessToken: session.accessToken,
  });

  return <ClientsClient accessToken={session.accessToken} initialClients={clients} />;
}
