import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { OfframpClient } from './view';

export default async function OfframpPage() {
  const session = await getCurrentSession();
  const transactions = await hedwigApi.offramp({ accessToken: session.accessToken });

  return <OfframpClient accessToken={session.accessToken} initialTransactions={transactions} />;
}
