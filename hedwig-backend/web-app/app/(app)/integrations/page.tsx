import { Suspense } from 'react';
import { getCurrentSession } from '@/lib/auth/session';
import { IntegrationsClient } from './view';

export default async function IntegrationsPage() {
  const session = await getCurrentSession();
  return (
    <Suspense>
      <IntegrationsClient accessToken={session.accessToken} />
    </Suspense>
  );
}
