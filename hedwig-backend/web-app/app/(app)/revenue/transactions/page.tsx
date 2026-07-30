import { getCurrentSession } from '@/lib/auth/session';
import { TransactionsClient } from './view';

export default async function TransactionsPage() {
  const session = await getCurrentSession();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Transactions</h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Reconcile bank statement imports with invoices and expenses.</p>
      </div>
      <TransactionsClient accessToken={session.accessToken} />
    </div>
  );
}
