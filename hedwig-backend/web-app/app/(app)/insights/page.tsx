import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';
import { normalizeExpenseRecords } from '@/lib/revenue-analytics';
import { InsightsClient } from './view';

export default async function InsightsPage() {
  const session = await getCurrentSession();
  const opts = { accessToken: session.accessToken };

  const [insightsData, profileData, billing, expensesData, breakdown, paymentsData] = await Promise.all([
    hedwigApi.insights('30d', opts),
    hedwigApi.userProfile(opts),
    hedwigApi.billingStatus(opts).catch(() => null),
    hedwigApi.revenueExpenses(opts).catch(() => []),
    hedwigApi.revenueBreakdown('30d', opts).catch(() => ({ clients: [], projects: [] })),
    hedwigApi.payments(opts).catch(() => ({ invoices: [], paymentLinks: [], invoiceDrafts: [], paymentLinkDrafts: [] })),
  ]);

  const expenses = normalizeExpenseRecords(expensesData as any[]);
  const clientBreakdown = Array.isArray((breakdown as any)?.clients) ? (breakdown as any).clients : [];

  return (
    <InsightsClient
      accessToken={session.accessToken}
      initialData={insightsData}
      initialTarget={profileData.monthlyTarget ?? 10000}
      billing={billing}
      initialExpenses={expenses}
      clientBreakdown={clientBreakdown}
      invoices={paymentsData.invoices}
    />
  );
}
