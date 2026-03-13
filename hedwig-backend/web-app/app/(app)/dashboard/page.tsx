import { Landmark, Sparkles, Wallet } from 'lucide-react';
import { ListCard } from '@/components/data/list-card';
import { MetricCard } from '@/components/data/metric-card';
import { PageHeader } from '@/components/data/page-header';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { formatCompactCurrency, formatCurrency, formatShortDate } from '@/lib/utils';
import { DashboardClient } from './view';

export default async function DashboardPage() {
  const session = await getCurrentSession();
  const data = await hedwigApi.dashboard({ accessToken: session.accessToken });

  return (
    <DashboardClient>
      <PageHeader
        eyebrow="Control center"
        title="Run client work, billing, and money movement together"
        description="Hedwig keeps active projects, payment collection, USD account flows, wallet balances, and deadlines on one operating surface."
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard label="Expected inflow" value={formatCompactCurrency(data.totals.inflowUsd)} change="Open invoices and payment requests" icon={<Sparkles className="h-5 w-5" />} />
        <MetricCard label="Outstanding invoices" value={formatCompactCurrency(data.totals.outstandingUsd)} trend="down" change="Client receivables tracked from backend records" icon={<Landmark className="h-5 w-5" />} />
        <MetricCard label="Crypto wallet value" value={formatCompactCurrency(data.totals.walletUsd)} change="Base + Solana balances" icon={<Wallet className="h-5 w-5" />} />
        <MetricCard label="USD account balance" value={formatCurrency(data.totals.usdAccountUsd)} change="Bridge account activity surface" icon={<Landmark className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <ListCard
          title="Deadlines and reminders"
          description="Everything that can impact delivery or cash flow in the next few days."
          items={data.reminders.map((item) => ({ id: item.id, title: item.title, meta: formatShortDate(item.dueAt) }))}
        />
        <ListCard
          title="Recent notifications"
          description="Work and money signals that need attention."
          items={data.notifications.map((item) => ({ id: item.id, title: item.title, subtitle: item.body, meta: formatShortDate(item.createdAt) }))}
        />
        <ListCard
          title="Recent activity"
          description="AI actions, settlements, and project movement across the workspace."
          items={data.activities.map((item) => ({ id: item.id, title: item.summary, subtitle: item.actor, meta: formatShortDate(item.createdAt) }))}
        />
      </div>
    </DashboardClient>
  );
}
