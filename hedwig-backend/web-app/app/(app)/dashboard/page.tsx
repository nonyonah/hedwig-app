import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { redirect } from 'next/navigation';
import { DashboardClient } from './view';

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    redirect('/sign-in');
  }
  const opts = await workspaceApiOptions(session.accessToken);
  const [data, shell, billing] = await Promise.all([
    hedwigApi.dashboard(opts),
    hedwigApi.shell(opts),
    hedwigApi.billingStatus(opts).catch(() => null)
  ]);

  const greetingName = shell.currentUser.firstName || shell.currentUser.email.split('@')[0] || 'there';

  return (
    <DashboardClient
      key={opts.workspaceId ?? 'default'}
      greetingName={greetingName}
      userKey={shell.currentUser.id || shell.currentUser.email}
      data={data}
      billing={billing}
      isDemo={session.isMockSession}
    />
  );
}
