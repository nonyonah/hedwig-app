import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { AccountsView } from './view';

export default async function AccountsPage() {
  const session = await getCurrentSession();
  const sessionOpts = await workspaceApiOptions(session.accessToken);

  const [walletData, accountsData, accountsSummary] = await Promise.all([
      hedwigApi.wallet({ accessToken: session.accessToken }),
      hedwigApi.virtualAccounts(sessionOpts),
      hedwigApi.virtualAccountsSummary(sessionOpts),
    ]);

  return (
    <AccountsView
      initialWalletData={walletData}
      accessToken={session.accessToken}
      workspaceId={sessionOpts.workspaceId}
      initialAccounts={accountsData}
      initialSummary={accountsSummary}
    />
  );
}
