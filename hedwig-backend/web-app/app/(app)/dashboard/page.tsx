import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { DashboardClient } from './view';

export default async function DashboardPage() {
  const session = await getCurrentSession();
  const [data, shell, billing] = await Promise.all([
    hedwigApi.dashboard({ accessToken: session.accessToken }),
    hedwigApi.shell({ accessToken: session.accessToken }),
    hedwigApi.billingStatus({ accessToken: session.accessToken }).catch(() => null)
  ]);

  const greetingName = shell.currentUser.firstName || shell.currentUser.email.split('@')[0] || 'there';

  return <DashboardClient greetingName={greetingName} data={data} billing={billing} />;
}
