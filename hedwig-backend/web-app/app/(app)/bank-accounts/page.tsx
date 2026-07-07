import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { canUseFeature } from '@/lib/billing/feature-gates';
import { USD_ACCOUNTS_ENABLED } from '@/lib/feature-flags';
import { BankAccountsView } from './view';

export default async function BankAccountsPage() {
  const session = await getCurrentSession();
  const accessToken = session.accessToken;

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

  const [billing, accountsData] = await Promise.all([
    USD_ACCOUNTS_ENABLED
      ? hedwigApi.billingStatus({ accessToken }).catch(() => null)
      : Promise.resolve(null),
    USD_ACCOUNTS_ENABLED
      ? hedwigApi.accounts({ accessToken }).catch(() => fallbackAccountsData)
      : Promise.resolve(fallbackAccountsData),
  ]);

  const isUsdAccountPaywalled = USD_ACCOUNTS_ENABLED
    ? !canUseFeature('usd_account', billing)
    : false;

  return (
    <BankAccountsView
      initialAccountsData={accountsData}
      accessToken={accessToken}
      usdAccountsEnabled={USD_ACCOUNTS_ENABLED}
      isUsdAccountPaywalled={isUsdAccountPaywalled}
    />
  );
}
