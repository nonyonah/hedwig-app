import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { getRequestRegionLockDecision } from '@/lib/region-lock';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { WalletView } from './view';

export default async function WalletPage() {
  const session = await getCurrentSession();
  const sessionOpts = await workspaceApiOptions(session.accessToken);

  const [walletData, gatewayBalance, onrampDecision, offrampDecision, accountsData, accountsSummary] =
    await Promise.all([
      hedwigApi.wallet({ accessToken: session.accessToken }),
      hedwigApi
        .gatewayBalance({ accessToken: session.accessToken, disableMockFallback: true })
        .catch(() => ({
          available: '0',
          pending: '0',
          perDomain: [],
          evmAddress: null,
          solanaAddress: null,
          testnet: false,
        })),
      getRequestRegionLockDecision('onramp'),
      getRequestRegionLockDecision('offramp'),
      hedwigApi.virtualAccounts(sessionOpts),
      hedwigApi.virtualAccountsSummary(sessionOpts),
    ]);

  return (
    <WalletView
      initialWalletData={walletData}
      initialGatewayBalance={gatewayBalance}
      accessToken={session.accessToken}
      workspaceId={sessionOpts.workspaceId}
      onrampAllowed={onrampDecision.allowed}
      offrampAllowed={offrampDecision.allowed}
      initialAccounts={accountsData}
      initialSummary={accountsSummary}
    />
  );
}
