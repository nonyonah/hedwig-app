import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ success: false, error: 'Invalid form data' }, { status: 400 });
  }

  const backendForm = new FormData();

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      backendForm.append(key, value);
    } else if (typeof value === 'string') {
      backendForm.append(key, value);
    }
  }

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/chat/message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: backendForm,
    cache: 'no-store',
  }).catch(() => null);

  if (!resp) {
    return NextResponse.json({ success: false, error: 'Could not reach backend' }, { status: 502 });
  }

  const data = await resp.json().catch(() => ({ success: false }));
  return NextResponse.json(data, { status: resp.ok ? 200 : resp.status });
}
