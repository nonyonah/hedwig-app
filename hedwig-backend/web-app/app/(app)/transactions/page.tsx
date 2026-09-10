import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { workspaceApiOptions } from '@/lib/workspace/server';
import { TransactionsView } from './view';
import type { LedgerEntry } from '@/lib/types/revenue';

export default async function TransactionsPage() {
  const session = await getCurrentSession();
  const opts = await workspaceApiOptions(session.accessToken);

  const [ledger, categories] = await Promise.all([
    hedwigApi.ledger({ range: '30d', kind: 'all', pageSize: 500 }, opts).catch(() => null),
    hedwigApi.transactionCategories(opts).catch(() => ({ categories: [], custom: [] as string[] })),
  ]);

  return (
    <TransactionsView
      key={opts.workspaceId ?? 'default'}
      accessToken={session.accessToken}
      workspaceId={opts.workspaceId}
      initialEntries={((ledger?.entries ?? []) as unknown) as LedgerEntry[]}
      initialSummary={{
        moneyIn: ledger?.summary?.moneyIn ?? 0,
        moneyOut: ledger?.summary?.moneyOut ?? 0,
        net: ledger?.summary?.net ?? 0,
      }}
      initialRange="30d"
      initialCategories={categories.categories ?? []}
    />
  );
}
