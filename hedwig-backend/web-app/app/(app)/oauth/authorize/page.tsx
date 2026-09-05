import { getCurrentSession } from '@/lib/auth/session';
import { OAuthConsentClient } from './view';

export default async function OAuthAuthorizePage() {
  const session = await getCurrentSession();

  return <OAuthConsentClient accessToken={session.accessToken} />;
}
