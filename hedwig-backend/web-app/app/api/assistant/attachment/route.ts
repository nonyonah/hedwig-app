import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<Response> {
  const limit = checkRateLimit(req, { name: 'assistant_attachment', limit: 20, windowMs: 60_000 });
  if (!limit.ok) return rateLimitResponse(limit.retryAfter);

  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Forward the original multipart body untouched.
  const body = await req.arrayBuffer();
  const contentType = req.headers.get('content-type') || 'multipart/form-data';

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/assistant/attachment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': contentType,
    },
    body: Buffer.from(body),
    cache: 'no-store',
  }).catch(() => null);

  if (!resp) return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 502 });
  return NextResponse.json(await resp.json().catch(() => ({ success: false })), { status: resp.status });
}
