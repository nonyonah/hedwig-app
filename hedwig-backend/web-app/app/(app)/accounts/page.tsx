import { ListCard } from '@/components/data/list-card';
import { MetricCard } from '@/components/data/metric-card';
import { PageHeader } from '@/components/data/page-header';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { formatCurrency, formatShortDate } from '@/lib/utils';

export default async function AccountsPage() {
  const session = await getCurrentSession();
  const { usdAccount, accountTransactions } = await hedwigApi.accounts({ accessToken: session.accessToken });

  return (
    <div>
      <PageHeader
        eyebrow="USD accounts"
        title="Banking rails for clients without crypto wallets"
        description="USD accounts live beside wallet settlement so freelancers can receive fiat, monitor account flows, and manage crypto conversion from one place."
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard label="Available balance" value={formatCurrency(usdAccount.balanceUsd)} />
        <MetricCard label="Status" value={usdAccount.status.replace('_', ' ')} />
        <MetricCard label="Auto-settle to" value={usdAccount.settlementChain} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ListCard title="Bank account details" items={[
          {
            id: 'bank_1',
            title: usdAccount.bankName ?? 'Bridge partner bank',
            subtitle: usdAccount.accountNumberMasked ? `Account ${usdAccount.accountNumberMasked}` : 'Account details pending',
            meta: usdAccount.routingNumberMasked ? `Routing ${usdAccount.routingNumberMasked}` : 'Awaiting routing details'
          }
        ]} />
        <ListCard title="Recent account transactions" items={accountTransactions.map((tx) => ({ id: tx.id, title: tx.description, subtitle: tx.status, meta: `${formatCurrency(tx.amountUsd)} • ${formatShortDate(tx.createdAt)}` }))} />
      </div>
    </div>
  );
}
