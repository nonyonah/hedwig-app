import { Metadata } from 'next';
import { headers } from 'next/headers';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { TreasuryDashboard } from '@/components/workspace/treasury-dashboard';

export const metadata: Metadata = {
  title: 'Treasury - Hedwig',
  description: 'View and manage your workspace treasury balance and transactions.',
};

export default async function TreasuryPage() {
  const session = await getCurrentSession();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-[20px] font-bold text-[var(--color-foreground)]">Treasury</h1>
        <p className="mt-1 text-[14px] text-[var(--color-text-tertiary)]">
          View your workspace balance and transactions.
        </p>
      </div>
      <TreasuryDashboard />
    </div>
  );
}
