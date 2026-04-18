import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { canUseFeature } from '@/lib/billing/feature-gates';
import { USD_ACCOUNTS_ENABLED } from '@/lib/feature-flags';
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
    USD_ACCOUNTS_ENABLED
      ? hedwigApi.billingStatus({ accessToken: session.accessToken }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const isUsdAccountPaywalled = USD_ACCOUNTS_ENABLED
    ? !canUseFeature('usd_account', billing)
    : false;
  const accountsData = !USD_ACCOUNTS_ENABLED || isUsdAccountPaywalled
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
      usdAccountsEnabled={USD_ACCOUNTS_ENABLED}
      isUsdAccountPaywalled={isUsdAccountPaywalled}
      isUsdAccountRegionLocked={false}
    />
  );
}
