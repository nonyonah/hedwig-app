import { getCurrentSession } from '@/lib/auth/session';
import { ImportReviewPageClient } from './view';

export default async function ImportsPage() {
  const session = await getCurrentSession();
  return <ImportReviewPageClient accessToken={session.accessToken} />;
}
