import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { ApprovalsClient } from './view';

export default async function ApprovalsPage() {
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);
  const approvals = await hedwigApi.approvals(opts);

  return <ApprovalsClient key={opts.workspaceId ?? 'default'} accessToken={session.accessToken} initialApprovals={approvals} />;
}
