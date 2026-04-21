import { getCurrentSession } from '@/lib/auth/session';
import { MagicInboxClient } from './view';

export default async function InboxPage() {
  const session = await getCurrentSession();
  return <MagicInboxClient accessToken={session.accessToken} />;
}
