import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { AccountDetailClient } from './view';

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);
  const detail = await hedwigApi.accountDetail(id, opts);

  return (
    <AccountDetailClient
      key={`${opts.workspaceId ?? 'default'}-${id}`}
      accessToken={session.accessToken}
      workspaceId={opts.workspaceId}
      accountId={id}
      initialDetail={detail}
    />
  );
}
