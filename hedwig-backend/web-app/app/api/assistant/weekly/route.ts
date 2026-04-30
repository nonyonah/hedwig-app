import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

function emptyWeekly() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  return {
    success: true,
    data: {
      weekLabel: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      revenueUsd: 0,
      previousWeekRevenueUsd: 0,
      revenueChangePct: 0,
      newInvoiceCount: 0,
      paidInvoiceCount: 0,
      overdueCount: 0,
      overdueAmountUsd: 0,
      topClients: [],
      aiInsight: 'No paid invoice activity was found for this week yet.'
    }
  };
}

export async function GET(_req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/assistant/weekly`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!resp) return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 502 });
  if (resp.status === 404) return NextResponse.json(emptyWeekly());

  const data = await resp.json().catch(() => ({ success: false }));
  return NextResponse.json(data, { status: resp.status });
}
