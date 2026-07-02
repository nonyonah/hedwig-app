import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { WalletView } from './view';

export default async function WalletPage() {
  const session = await getCurrentSession();

  const [walletData, gatewayBalance, userPreferences, userProfile] = await Promise.all([
    hedwigApi.wallet({ accessToken: session.accessToken }),
    hedwigApi.gatewayBalance({ accessToken: session.accessToken, disableMockFallback: true }).catch(() => ({
      available: '0',
      pending: '0',
      perDomain: [],
      evmAddress: null,
      solanaAddress: null,
      testnet: false,
    })),
    hedwigApi.userPreferences({ accessToken: session.accessToken, disableMockFallback: true }).catch(() => ({
      clientRemindersEnabled: true,
      gatewayAutoDepositEnabled: false,
    })),
    hedwigApi.getUserProfile({ accessToken: session.accessToken, disableMockFallback: true }).catch(() => null),
  ]);

  return (
    <WalletView
      initialWalletData={walletData}
      initialGatewayBalance={gatewayBalance}
      gatewayAutoDepositEnabled={userPreferences.gatewayAutoDepositEnabled}
      accessToken={session.accessToken}
    />
  );
}
