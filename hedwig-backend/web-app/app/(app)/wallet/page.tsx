import { ListCard } from '@/components/data/list-card';
import { MetricCard } from '@/components/data/metric-card';
import { PageHeader } from '@/components/data/page-header';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { formatCompactCurrency, formatCurrency, formatShortDate } from '@/lib/utils';

export default async function WalletPage() {
  const session = await getCurrentSession();
  const { walletAccounts, walletAssets, walletTransactions } = await hedwigApi.wallet({ accessToken: session.accessToken });
  const total = walletAssets.reduce((sum, asset) => sum + asset.valueUsd, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Wallet"
        title="Operational crypto balances for getting paid and settling"
        description="This surface treats the wallet as part of freelancer cash operations: receive, hold, settle, and offramp."
      />
      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard label="Total wallet value" value={formatCompactCurrency(total)} />
        {walletAssets.slice(0, 3).map((asset) => (
          <MetricCard key={asset.id} label={`${asset.symbol} • ${asset.chain}`} value={formatCurrency(asset.valueUsd)} change={`${asset.changePct24h}% 24h`} />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <ListCard title="Wallet accounts" items={walletAccounts.map((account) => ({ id: account.id, title: account.label, subtitle: account.address, meta: account.chain }))} />
        <ListCard title="Assets" items={walletAssets.map((asset) => ({ id: asset.id, title: `${asset.name} (${asset.symbol})`, subtitle: `${asset.balance} on ${asset.chain}`, meta: formatCurrency(asset.valueUsd) }))} />
        <ListCard title="Recent wallet activity" items={walletTransactions.map((tx) => ({ id: tx.id, title: `${tx.kind} ${tx.amount} ${tx.asset}`, subtitle: tx.counterparty, meta: formatShortDate(tx.createdAt) }))} />
      </div>
    </div>
  );
}
