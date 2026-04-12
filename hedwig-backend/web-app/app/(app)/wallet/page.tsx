import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { canUseFeature } from '@/lib/billing/feature-gates';
import { WalletView } from './view';

export default async function WalletPage() {
  const session = await getCurrentSession();
  const fallbackAccountsData = {
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
  };

  const [walletData, billing] = await Promise.all([
    hedwigApi.wallet({ accessToken: session.accessToken, disableMockFallback: true }),
    hedwigApi.billingStatus({ accessToken: session.accessToken }).catch(() => null),
  ]);

  const isUsdAccountPaywalled = !canUseFeature('usd_account', billing);
  const accountsData = isUsdAccountPaywalled
    ? fallbackAccountsData
    : await hedwigApi.accounts({ accessToken: session.accessToken, disableMockFallback: true }).catch(() => ({
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
    }));

  return (
    <WalletView
      initialWalletData={walletData}
      initialAccountsData={accountsData}
      accessToken={session.accessToken}
      isUsdAccountPaywalled={isUsdAccountPaywalled}
      isUsdAccountRegionLocked={false}
    />
  );
}
