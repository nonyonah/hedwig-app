import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

// Try the new /threads endpoint first; fall back to the existing /emails endpoint
// so the inbox works even before the new backend route is deployed.
export async function GET(req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const limit = req.nextUrl.searchParams.get('limit') ?? '20';
  const base  = backendConfig.apiBaseUrl;
  const auth  = { Authorization: `Bearer ${session.accessToken}` };

  // ── Try new dedicated threads endpoint ──────────────────────────────────────
  const newResp = await fetch(
    `${base}/api/integrations/threads?limit=${limit}`,
    { headers: auth, cache: 'no-store' }
  ).catch(() => null);

  if (newResp?.ok) {
    const data = await newResp.json().catch(() => ({ success: false }));
    return NextResponse.json(data);
  }

  // ── Fall back to the existing /emails endpoint ────────────────────────────
  const oldResp = await fetch(
    `${base}/api/integrations/emails?limit=${limit}`,
    { headers: auth, cache: 'no-store' }
  ).catch(() => null);

  if (!oldResp?.ok) {
    return NextResponse.json({ success: false, error: 'Could not load inbox' }, { status: 502 });
  }

  const oldData = await oldResp.json().catch(() => ({ success: false, data: [] }));
  if (!oldData.success) {
    return NextResponse.json(oldData, { status: 200 });
  }

  // Map old snake_case shape → EmailThread camelCase shape the UI expects
  const threads = (oldData.data ?? []).map((t: any) => ({
    id:                  t.id,
    integrationId:       t.integration_id ?? '',
    provider:            t.provider ?? 'gmail',
    subject:             t.subject ?? '(no subject)',
    snippet:             t.snippet ?? '',
    summary:             t.summary,
    summaryGeneratedAt:  t.summary_generated_at,
    fromEmail:           t.from_email ?? '',
    fromName:            t.from_name ?? null,
    participants:        t.participants ?? [],
    messageCount:        t.message_count ?? 1,
    hasAttachments:      t.has_attachments ?? false,
    attachmentCount:     t.attachment_count ?? 0,
    lastMessageAt:       t.last_message_at ?? new Date().toISOString(),
    labels:              t.labels ?? [],
    status:              (t.matched_client_id ? 'matched' : 'needs_review') as 'matched' | 'needs_review',
    confidenceScore:     t.match_confidence,
    matchedClientId:     t.matched_client_id,
    matchedClientName:   t.matched_client_name ?? null,
    matchedProjectId:    t.matched_project_id,
    matchedProjectName:  t.matched_project_name ?? null,
    matchedDocumentId:   undefined,
    matchedDocumentType: undefined,
    isArchived:          false,
    detectedType:        t.detected_type,
    detectedAmount:      t.detected_amount ? Number(t.detected_amount) : undefined,
    detectedCurrency:    t.detected_currency,
    detectedDueDate:     t.detected_due_date,
  }));

  return NextResponse.json({ success: true, data: threads, total: threads.length, hasGmailConnected: true });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id   = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/integrations/threads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify(body),
  }).catch(() => null);

  if (!resp) return NextResponse.json({ success: false }, { status: 502 });
  const data = await resp.json().catch(() => ({ success: false }));
  return NextResponse.json(data, { status: resp.ok ? 200 : resp.status });
}
