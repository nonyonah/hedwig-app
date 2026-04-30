import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ provider: string }> };

async function proxy(req: NextRequest, context: RouteContext, method: 'POST' | 'DELETE'): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { provider } = await context.params;

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/integrations/composio/connect/${encodeURIComponent(provider)}`, {
    method,
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!resp) return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 502 });
  return NextResponse.json(await resp.json().catch(() => ({ success: false })), { status: resp.status });
}

export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  const { provider } = await context.params;

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/integrations/composio/connect/${encodeURIComponent(provider)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!resp) {
    return NextResponse.redirect(new URL('/settings?integration_error=backend_unreachable', req.url));
  }

  const payload = await resp.json().catch(() => null) as any;
  if (resp.ok && payload?.success && payload?.data?.redirectUrl) {
    return NextResponse.redirect(payload.data.redirectUrl);
  }

  return NextResponse.redirect(new URL(`/settings?integration_error=${encodeURIComponent(payload?.error || 'connect_failed')}`, req.url));
}

export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(req, context, 'POST');
}

export async function DELETE(req: NextRequest, context: RouteContext): Promise<Response> {
  return proxy(req, context, 'DELETE');
}
