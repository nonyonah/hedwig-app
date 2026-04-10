import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { WalletView } from './view';

export default async function WalletPage() {
  const session = await getCurrentSession();
  const [walletData, accountsData] = await Promise.all([
    hedwigApi.wallet({ accessToken: session.accessToken, disableMockFallback: true }),
    hedwigApi.accounts({ accessToken: session.accessToken, disableMockFallback: true }).catch(() => ({
      usdAccount: {
        id: 'usd-account-fallback',
        provider: 'Bridge' as const,
        status: 'not_started' as const,
        balanceUsd: 0,
        settlementChain: 'Base' as const,
        settlementToken: 'USDC' as const,
        hasAssignedAccount: false,
      },
      accountTransactions: [],
    })),
  ]);

  return (
    <WalletView
      initialWalletData={walletData}
      initialAccountsData={accountsData}
      accessToken={session.accessToken}
      isUsdAccountRegionLocked={false}
    />
  );
}
