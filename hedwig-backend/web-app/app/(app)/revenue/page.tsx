import { getCurrentSession } from '@/lib/auth/session';
import { hedwigApi } from '@/lib/api/client';
import { RevenueClient } from './view';
import { normalizeExpenseRecords } from '@/lib/revenue-analytics';

export default async function RevenuePage() {
  const session = await getCurrentSession();
  const opts = { accessToken: session.accessToken };

  const [summary, expensesData, breakdown, activity, paymentSources, paymentsData, clients] = await Promise.all([
    hedwigApi.revenueSummary('30d', opts).catch(() => ({
      totalRevenue: 0,
      paidRevenue: 0,
      pendingRevenue: 0,
      overdueRevenue: 0,
      totalExpenses: 0,
      netRevenue: 0,
      currency: 'USD',
      range: '30d',
      previousPeriodRevenue: 0,
      revenueDeltaPct: 0,
    })),
    hedwigApi.revenueExpenses(opts).catch(() => []),
    hedwigApi.revenueBreakdown('30d', opts).catch(() => ({ clients: [], projects: [] })),
    hedwigApi.revenueActivity(opts).catch(() => []),
    hedwigApi.revenuePaymentSources('30d', opts).catch(() => []),
    hedwigApi.payments(opts).catch(() => ({
      invoices: [],
      paymentLinks: [],
      invoiceDrafts: [],
      paymentLinkDrafts: [],
    })),
    hedwigApi.clients(opts).catch(() => []),
  ]);

  const expensesList = normalizeExpenseRecords(expensesData as any[]);

  return (
    <RevenueClient
      accessToken={session.accessToken}
      initialSummary={summary as any}
      initialExpenses={expensesList}
      clientBreakdown={Array.isArray((breakdown as any)?.clients) ? (breakdown as any).clients : []}
      projectBreakdown={Array.isArray((breakdown as any)?.projects) ? (breakdown as any).projects : []}
      activityFeed={Array.isArray(activity) ? (activity as any) : []}
      paymentSources={paymentSources}
      invoices={paymentsData.invoices}
      clients={clients}
    />
  );
}
