import { getCurrentSession } from '@/lib/auth/session';
import { IntelligenceClient } from './view';

export default async function IntelligencePage() {
  const session = await getCurrentSession();
  return <IntelligenceClient accessToken={session.accessToken} />;
}
