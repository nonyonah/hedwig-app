import { getCurrentSession } from '@/lib/auth/session';
import { ReportsClient } from './view';

export default async function ReportsPage() {
  const session = await getCurrentSession();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Reports</h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Profit & loss, cash flow, and financial journal.</p>
      </div>
      <ReportsClient accessToken={session.accessToken} />
    </div>
  );
}
