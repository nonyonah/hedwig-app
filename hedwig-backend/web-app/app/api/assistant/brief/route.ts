import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

function emptyBrief() {
  return {
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      summary: 'Hedwig Assistant is ready. Your daily brief will appear here as live billing, project, and reminder activity builds up.',
      highlights: [],
      events: [],
      metrics: {
        unpaidCount: 0,
        unpaidAmountUsd: 0,
        overdueCount: 0,
        overdueAmountUsd: 0,
        upcomingDeadlines: 0,
        activePaymentLinks: 0,
        reviewDocuments: 0,
        expensesLast30DaysUsd: 0,
        transactionFeesLast30DaysUsd: 0,
      },
      expenseBreakdown: [],
      taxHint: null,
      projectAlerts: [],
    },
  };
}

export async function GET(_req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/assistant/brief`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!resp) return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 502 });
  if (resp.status === 404) return NextResponse.json(emptyBrief());

  const data = await resp.json().catch(() => ({ success: false }));
  return NextResponse.json(data, { status: resp.status });
}
