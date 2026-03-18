import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { InsightsClient } from './view';

export default async function InsightsPage() {
  const session = await getCurrentSession();
  const [insightsData, profileData] = await Promise.all([
    hedwigApi.insights('30d', { accessToken: session.accessToken }),
    hedwigApi.userProfile({ accessToken: session.accessToken }),
  ]);

  return (
    <InsightsClient
      accessToken={session.accessToken}
      initialData={insightsData}
      initialTarget={profileData.monthlyTarget ?? 10000}
    />
  );
}
