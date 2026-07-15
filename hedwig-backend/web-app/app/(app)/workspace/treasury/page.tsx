import { Metadata } from 'next';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { TreasuryDashboard } from '@/components/workspace/treasury-dashboard';

export const metadata: Metadata = {
  title: 'Treasury - Hedwig',
  description: 'View and manage your workspace treasury balance and transactions.',
};

export default async function TreasuryPage() {
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 py-6">
      <TreasuryDashboard key={opts.workspaceId ?? 'default'} />
    </div>
  );
}
