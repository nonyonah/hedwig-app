import { Metadata } from 'next';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { getRequestRegionLockDecision } from '@/lib/region-lock';
import { PayrollDashboard } from '@/components/workspace/payroll-dashboard';

export const metadata: Metadata = {
  title: 'Payroll - Hedwig',
  description: 'Treasury balance, run payroll, and view payment history.',
};

export default async function PayrollPage() {
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);
  const offrampDecision = await getRequestRegionLockDecision('offramp');
  return <PayrollDashboard key={opts.workspaceId ?? 'default'} offrampAllowed={offrampDecision.allowed} />;
}
