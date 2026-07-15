import { createClient } from '@supabase/supabase-js';
import { Composio } from '@composio/core';
import { createLogger } from '../utils/logger';
import { getValidAccessToken } from './integrations';
import { uploadToR2 } from '../lib/r2';

const logger = createLogger('EmailSync');

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;

let cachedComposioSdk: Composio | null = null;
function getComposioSdk(): Composio {
  if (!COMPOSIO_API_KEY) throw new Error('COMPOSIO_API_KEY is not configured');
  if (cachedComposioSdk) return cachedComposioSdk;
  cachedComposioSdk = new Composio({ apiKey: COMPOSIO_API_KEY });
  return cachedComposioSdk;
}

function composioUserIdFor(hedwigUserId: string): string {
  return `hedwig_${hedwigUserId}`;
}

type GmailAttachmentPart = {
  attachmentId: string;
  filename: string;
  mimeType: string;
};

const IMPORTABLE_THREAD_TYPES = new Set(['invoice', 'contract', 'receipt', 'proposal', 'other']);
const SKIPPED_THREAD_TYPES = new Set<string>();
const DOCUMENT_KEYWORDS = [
  'invoice',
  'contract',
  'agreement',
  'retainer',
  'statement',
  'proposal',
];

function normalizeDetectedType(value?: string | null): ThreadIntelligence['detectedType'] | undefined {
  const normalized = String(value || '').trim().toLowerCase();
  if (['invoice', 'contract', 'receipt', 'proposal', 'other'].includes(normalized)) {
    return normalized as ThreadIntelligence['detectedType'];
  }
  return undefined;
}

function inferThreadTypeFromText(subject: string, snippet: string, attachments: GmailAttachmentPart[]): ThreadIntelligence['detectedType'] | undefined {
  const haystack = [
    subject,
    snippet,
    ...attachments.map((attachment) => attachment.filename),
  ].join(' ').toLowerCase();

  if (/\b(receipt|paid receipt|payment confirmation|payment received)\b/.test(haystack)) return 'receipt';
  if (/\b(invoice|inv[_\s-]?\d+|statement)\b/.test(haystack)) return 'invoice';
  if (/\b(contract|agreement|retainer|msa|sow)\b/.test(haystack)) return 'contract';
  if (/\b(proposal|quote|estimate)\b/.test(haystack)) return 'proposal';
  return undefined;
}

function hasFinancialDocumentSignal(subject: string, snippet: string, attachments: GmailAttachmentPart[]): boolean {
  const haystack = [
    subject,
    snippet,
    ...attachments.map((attachment) => attachment.filename),
  ].join(' ').toLowerCase();

  return DOCUMENT_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function isSupportedAttachment(filename: string, contentType: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith('.pdf') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.doc') ||
    lower.endsWith('.docx') ||
    contentType === 'application/pdf' ||
    contentType.startsWith('image/')
  );
}

function collectAttachmentPartsFromPayload(payload: any): GmailAttachmentPart[] {
  const collected: GmailAttachmentPart[] = [];
  const queue: any[] = [payload];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const filename = String(current.filename || '').trim();
    const attachmentId = String(current.body?.attachmentId || '').trim();
    const mimeType = String(current.mimeType || 'application/octet-stream');

    if (filename && attachmentId) {
      collected.push({ attachmentId, filename, mimeType });
    }

    const nested = Array.isArray(current.parts) ? current.parts : [];
    for (const part of nested) queue.push(part);
  }

  return collected;
}

// ─── Gmail API helpers ────────────────────────────────────────────────────────

async function gmailGet(accessToken: string, path: string): Promise<any> {
  const resp = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Gmail API error ${resp.status}: ${text}`);
  }
  return resp.json();
}

function extractHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim().toLowerCase() };
  return { name: '', email: raw.trim().toLowerCase() };
}

function asArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    for (const key of ['items', 'messages', 'emails', 'threads', 'data', 'results']) {
      if (Array.isArray(objectValue[key])) return objectValue[key] as any[];
    }
  }
  return [];
}

function pickString(source: any, keys: string[]): string {
  for (const key of keys) {
    const value = key.split('.').reduce((acc, part) => acc?.[part], source);
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function normalizeComposioAttachment(raw: any): GmailAttachmentPart | null {
  const filename = pickString(raw, ['filename', 'name', 'fileName', 'attachment.filename']);
  const mimeType = pickString(raw, ['mimeType', 'mime_type', 'contentType', 'content_type']) || 'application/octet-stream';
  const attachmentId = pickString(raw, ['id', 'attachmentId', 'attachment_id', 'provider_attachment_id']) || filename;
  if (!filename) return null;
  return { filename, mimeType, attachmentId };
}

async function ensureComposioGmailIntegration(userId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('user_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'gmail')
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: composioConnection } = await supabase
    .from('composio_connections')
    .select('account_label, composio_connected_account_id')
    .eq('user_id', userId)
    .eq('provider', 'gmail')
    .eq('status', 'active')
    .maybeSingle();

  const { data, error } = await supabase
    .from('user_integrations')
    .upsert({
      user_id: userId,
      provider: 'gmail',
      status: 'connected',
      provider_email: composioConnection?.account_label ?? null,
      provider_user_id: composioConnection?.composio_connected_account_id ?? null,
      metadata: { source: 'composio' },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(`Could not create Composio-backed Gmail integration: ${error?.message || 'insert failed'}`);
  }

  return data.id as string;
}

function normalizeComposioEmail(raw: any) {
  const subject = pickString(raw, ['subject', 'payload.headers.subject']) || '(no subject)';
  const snippet = pickString(raw, ['snippet', 'preview', 'bodyPreview', 'text', 'body', 'message.snippet']);
  const fromRaw = pickString(raw, ['from', 'sender', 'from_email', 'fromEmail', 'sender.email', 'payload.headers.from']);
  const from = parseEmailAddress(fromRaw);
  if (!from.email && typeof raw?.sender === 'object') {
    from.email = pickString(raw.sender, ['email', 'address']).toLowerCase();
    from.name = pickString(raw.sender, ['name']);
  }

  const providerThreadId =
    pickString(raw, ['threadId', 'thread_id', 'provider_thread_id', 'id', 'messageId', 'message_id'])
    || `${from.email}:${subject}`;
  const lastMessageAt =
    pickString(raw, ['date', 'internalDate', 'receivedAt', 'received_at', 'timestamp', 'createdAt', 'created_at'])
    || new Date().toISOString();
  const parsedDateMs = /^\d+$/.test(lastMessageAt) ? Number(lastMessageAt) : Date.parse(lastMessageAt);
  const attachments = asArray(raw?.attachments)
    .map(normalizeComposioAttachment)
    .filter((attachment): attachment is GmailAttachmentPart => Boolean(attachment));
  const participants = new Set<string>();
  for (const field of ['to', 'cc', 'recipients']) {
    for (const entry of asArray(raw?.[field] ?? [])) {
      const email = typeof entry === 'string' ? parseEmailAddress(entry).email : pickString(entry, ['email', 'address']).toLowerCase();
      if (email) participants.add(email);
    }
  }
  if (from.email) participants.add(from.email);

  return {
    providerThreadId,
    subject,
    snippet,
    from,
    participants: Array.from(participants),
    lastMessageAt: Number.isFinite(parsedDateMs) ? new Date(parsedDateMs).toISOString() : new Date().toISOString(),
    labels: asArray(raw?.labels ?? raw?.labelIds).map(String),
    attachments,
  };
}

// ─── Phase 2: Thread ingestion ────────────────────────────────────────────────

export async function syncGmailThreads(userId: string, integrationId: string, maxResults = 50): Promise<void> {
  const accessToken = await getValidAccessToken(userId, 'gmail');
  if (!accessToken) {
    logger.warn('No valid Gmail token', { userId });
    return;
  }

  // Fetch inbox threads with financial document attachments (invoices and contracts only).
  const financeAttachmentQuery =
    'in:inbox has:attachment (hedwig OR work OR client OR project OR freelance OR invoice OR contract OR agreement OR retainer OR statement OR proposal OR payment) filename:(pdf OR doc OR docx OR png OR jpg OR jpeg OR webp)';
  const listResp = await gmailGet(
    accessToken,
    `/threads?maxResults=${maxResults}&labelIds=INBOX&q=${encodeURIComponent(financeAttachmentQuery)}`
  );
  const threads: Array<{ id: string }> = listResp.threads ?? [];

  for (const thread of threads) {
    try {
      await ingestThread(userId, integrationId, accessToken, thread.id);
    } catch (err) {
      logger.error('Thread ingest failed', { userId, threadId: thread.id, err });
    }
  }

  await supabase
    .from('user_integrations')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', integrationId);

  logger.info('Gmail sync complete', { userId, count: threads.length });
}

export async function hasActiveComposioGmail(userId: string): Promise<boolean> {
  if (!COMPOSIO_API_KEY) return false;
  const { data } = await supabase
    .from('composio_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'gmail')
    .eq('status', 'active')
    .maybeSingle();
  return Boolean(data?.id);
}

export async function syncComposioGmailThreads(userId: string, maxResults = 50): Promise<void> {
  if (!(await hasActiveComposioGmail(userId))) {
    logger.warn('No active Composio Gmail connection', { userId });
    return;
  }

  const sdk = getComposioSdk();
  const integrationId = await ensureComposioGmailIntegration(userId);
  const query = 'in:inbox has:attachment (hedwig OR work OR client OR project OR freelance OR invoice OR contract OR agreement OR retainer OR statement OR proposal OR payment) filename:(pdf OR doc OR docx OR png OR jpg OR jpeg OR webp)';

  const result: any = await sdk.tools.execute('GMAIL_FETCH_EMAILS', {
    userId: composioUserIdFor(userId),
    arguments: {
      query,
      max_results: Math.min(maxResults, 50),
    },
    dangerouslySkipVersionCheck: true,
  });

  const emails = asArray(result?.data ?? result).slice(0, maxResults);
  for (const email of emails) {
    try {
      await ingestComposioEmail(userId, integrationId, email);
    } catch (err) {
      logger.error('Composio Gmail email ingest failed', { userId, err });
    }
  }

  await supabase
    .from('user_integrations')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', integrationId);

  await supabase
    .from('composio_connections')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', 'gmail');

  logger.info('Composio Gmail sync complete', { userId, count: emails.length });
}

async function ingestComposioEmail(userId: string, integrationId: string, rawEmail: any): Promise<void> {
  const email = normalizeComposioEmail(rawEmail);
  const supportedAttachmentParts = email.attachments.filter((part) => isSupportedAttachment(part.filename, part.mimeType));
  const hasAttachments = supportedAttachmentParts.length > 0 || Boolean(rawEmail?.hasAttachments ?? rawEmail?.has_attachments);

  if (!hasAttachments || !hasFinancialDocumentSignal(email.subject, email.snippet, supportedAttachmentParts)) {
    return;
  }

  const intel = await detectThreadIntelligence(email.subject, email.snippet, email.from.email);
  intel.detectedType = normalizeDetectedType(intel.detectedType)
    ?? inferThreadTypeFromText(email.subject, email.snippet, supportedAttachmentParts);

  if (!intel.detectedType || SKIPPED_THREAD_TYPES.has(intel.detectedType)) return;
  if (!IMPORTABLE_THREAD_TYPES.has(intel.detectedType)) return;

  const { data: existingThread } = await supabase
    .from('email_threads')
    .select('id, status')
    .eq('user_id', userId)
    .eq('provider', 'gmail')
    .eq('provider_thread_id', email.providerThreadId)
    .maybeSingle();

  if (existingThread?.status === 'ignored') return;

  const { data: upserted, error } = await supabase
    .from('email_threads')
    .upsert({
      user_id: userId,
      integration_id: integrationId,
      provider: 'gmail',
      provider_thread_id: email.providerThreadId,
      subject: email.subject,
      snippet: email.snippet,
      from_email: email.from.email,
      from_name: email.from.name,
      participants: email.participants,
      message_count: Number(rawEmail?.message_count ?? rawEmail?.messageCount ?? 1),
      has_attachments: hasAttachments,
      attachment_count: supportedAttachmentParts.length,
      last_message_at: email.lastMessageAt,
      labels: email.labels.map((label) => label.toLowerCase()),
      detected_type: intel.detectedType,
      detected_amount: intel.detectedAmount ?? null,
      detected_currency: intel.detectedCurrency ?? null,
      detected_due_date: intel.detectedDueDate ?? null,
      status: existingThread?.status === 'matched' ? 'matched' : 'imported',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider,provider_thread_id' })
    .select('id')
    .single();

  if (error || !upserted?.id) {
    logger.error('Composio thread upsert failed', { userId, providerThreadId: email.providerThreadId, error });
    return;
  }

  for (const attachment of supportedAttachmentParts) {
    const { data: existing } = await supabase
      .from('email_attachments')
      .select('id')
      .eq('thread_id', upserted.id)
      .eq('provider_attachment_id', attachment.attachmentId)
      .maybeSingle();

    if (existing) continue;

    await supabase.from('email_attachments').insert({
      thread_id: upserted.id,
      user_id: userId,
      provider_attachment_id: attachment.attachmentId,
      provider_message_id: email.providerThreadId,
      filename: attachment.filename,
      content_type: attachment.mimeType,
      size_bytes: null,
      r2_key: null,
      attachment_type: inferAttachmentType(attachment.filename, attachment.mimeType),
    });
  }

  summarizeThread(userId, upserted.id).catch(() => {});
}

async function ingestThread(
  userId: string,
  integrationId: string,
  accessToken: string,
  providerThreadId: string
): Promise<void> {
  const threadData = await gmailGet(accessToken, `/threads/${providerThreadId}?format=metadata&metadataHeaders=From,To,Cc,Subject,Date`);
  const messages: any[] = threadData.messages ?? [];
  if (!messages.length) return;

  const lastMsg   = messages[messages.length - 1];
  const firstMsg  = messages[0];
  const hdrs      = firstMsg.payload?.headers ?? [];
  const lastHdrs  = lastMsg.payload?.headers ?? [];

  const subject   = extractHeader(hdrs, 'subject');
  const fromRaw   = extractHeader(hdrs, 'from');
  const from      = parseEmailAddress(fromRaw);
  const snippet   = firstMsg.snippet ?? '';

  // Collect unique participants
  const participantSet = new Set<string>();
  for (const msg of messages) {
    const msgHdrs = msg.payload?.headers ?? [];
    for (const field of ['from', 'to', 'cc']) {
      const val = extractHeader(msgHdrs, field);
      if (val) {
        val.split(',').forEach((p: string) => {
          const { email } = parseEmailAddress(p.trim());
          if (email) participantSet.add(email);
        });
      }
    }
  }

  const labels: string[] = (firstMsg.labelIds ?? []).map((l: string) => l.toLowerCase());
  const allAttachmentParts = messages.flatMap((m: any) => collectAttachmentPartsFromPayload(m.payload));
  const supportedAttachmentParts = allAttachmentParts.filter((part) => isSupportedAttachment(part.filename, part.mimeType));
  const attachmentCount = supportedAttachmentParts.length;
  const hasAttachments = attachmentCount > 0;

  const internalDateMs = Number(lastMsg?.internalDate ?? firstMsg?.internalDate ?? 0);
  const lastDateHeader = extractHeader(lastHdrs, 'date');
  const parsedHeaderMs = Date.parse(lastDateHeader);
  const lastMessageAt =
    Number.isFinite(internalDateMs) && internalDateMs > 0
      ? new Date(internalDateMs).toISOString()
      : Number.isFinite(parsedHeaderMs)
        ? new Date(parsedHeaderMs).toISOString()
        : null;

  if (!hasAttachments || !hasFinancialDocumentSignal(subject, snippet, supportedAttachmentParts)) {
    return;
  }

  // Run DeepSeek intelligence detection on subject + snippet, with deterministic
  // filename/subject fallback so obvious invoice and contract threads still
  // import when AI extraction is unavailable.
  const intel = await detectThreadIntelligence(subject, snippet, from.email);
  intel.detectedType = normalizeDetectedType(intel.detectedType)
    ?? inferThreadTypeFromText(subject, snippet, supportedAttachmentParts);

  // Only store invoice/contract imports. Receipts, proposals, general mail, and
  // unknown threads are intentionally ignored so Gmail sync stays targeted.
  if (!intel.detectedType || SKIPPED_THREAD_TYPES.has(intel.detectedType)) return;
  if (!IMPORTABLE_THREAD_TYPES.has(intel.detectedType)) return;

  const { data: existingThread } = await supabase
    .from('email_threads')
    .select('id, status')
    .eq('user_id', userId)
    .eq('provider', 'gmail')
    .eq('provider_thread_id', providerThreadId)
    .maybeSingle();

  if (existingThread?.status === 'ignored') {
    return;
  }

  const { data: upserted, error } = await supabase
    .from('email_threads')
    .upsert({
      user_id:            userId,
      integration_id:     integrationId,
      provider:           'gmail',
      provider_thread_id: providerThreadId,
      subject,
      snippet,
      from_email:         from.email,
      from_name:          from.name,
      participants:       Array.from(participantSet),
      message_count:      messages.length,
      has_attachments:    hasAttachments,
      attachment_count:   attachmentCount,
      last_message_at:    lastMessageAt,
      labels,
      detected_type:      intel.detectedType    ?? null,
      detected_amount:    intel.detectedAmount   ?? null,
      detected_currency:  intel.detectedCurrency ?? null,
      detected_due_date:  intel.detectedDueDate  ?? null,
      status:             existingThread?.status === 'matched' ? 'matched' : 'imported',
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'user_id,provider,provider_thread_id' })
    .select('id, has_attachments')
    .single();

  if (error) {
    logger.error('Thread upsert failed', { userId, providerThreadId, error });
    return;
  }

  // Phase 4: Fetch attachments + DeepSeek Vision analysis
  if (hasAttachments && upserted) {
    await fetchAndStoreAttachments(userId, accessToken, upserted.id, messages);
  }

  // Generate summary in background (non-blocking)
  if (upserted) {
    summarizeThread(userId, upserted.id).catch(() => {});
  }
}

// ─── Phase 4: Attachment fetching + R2 upload ─────────────────────────────────

async function fetchAndStoreAttachments(
  userId: string,
  accessToken: string,
  threadDbId: string,
  messages: any[]
): Promise<void> {
  for (const msg of messages) {
    const attachmentParts = collectAttachmentPartsFromPayload(msg.payload);
    for (const part of attachmentParts) {
      if (!part.filename || !part.attachmentId) continue;

      try {
        if (!isSupportedAttachment(part.filename, part.mimeType)) continue;

        const attData = await gmailGet(
          accessToken,
          `/messages/${msg.id}/attachments/${part.attachmentId}`
        );

        const base64 = (attData.data as string).replace(/-/g, '+').replace(/_/g, '/');
        const buffer = Buffer.from(base64, 'base64');

        // Determine attachment type
        const contentType = part.mimeType ?? 'application/octet-stream';
        const filename    = part.filename as string;
        const attachType  = inferAttachmentType(filename, contentType);

        // Upload to R2
        const r2Key = `attachments/${userId}/${threadDbId}/${msg.id}_${filename}`;
        let r2KeyStored: string | null = null;

        try {
          const uploaded = await uploadToR2(r2Key, buffer, contentType);
          r2KeyStored = uploaded.key;
        } catch (r2Err) {
          logger.warn('R2 upload failed for attachment', { userId, filename, r2Err });
        }

        // Check if already stored
        const { data: existing } = await supabase
          .from('email_attachments')
          .select('id')
          .eq('thread_id', threadDbId)
          .eq('provider_attachment_id', part.attachmentId)
          .maybeSingle();

        if (!existing) {
          const { data: inserted } = await supabase.from('email_attachments').insert({
            thread_id:              threadDbId,
            user_id:                userId,
            provider_attachment_id: part.attachmentId,
            provider_message_id:    msg.id,
            filename,
            content_type:           contentType,
            size_bytes:             buffer.length,
            r2_key:                 r2KeyStored,
            attachment_type:        attachType,
          }).select('id').single();

          // Run DeepSeek Vision on PDFs/images to extract structured invoice data
          if (inserted?.id && (contentType.includes('pdf') || contentType.startsWith('image/'))) {
            analyzeAttachmentWithDeepSeek(threadDbId, inserted.id, filename, contentType, buffer).catch(() => {});
          }
        }
      } catch (err) {
        logger.error('Attachment fetch failed', { userId, msgId: msg.id, part: part.filename, err });
      }
    }
  }
}

function inferAttachmentType(filename: string, contentType: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('invoice') || lower.includes('inv_')) return 'invoice';
  if (lower.includes('contract') || lower.includes('agreement')) return 'contract';
  if (lower.includes('receipt')) return 'receipt';
  if (contentType.includes('pdf') || lower.endsWith('.pdf')) return 'document';
  return 'other';
}

// ─── Phase 3a: DeepSeek invoice intelligence ──────────────────────────────────

import { llmService } from './llm';

interface ThreadIntelligence {
  detectedType?: 'invoice' | 'contract' | 'receipt' | 'proposal' | 'other';
  detectedAmount?: number;
  detectedCurrency?: string;
  detectedDueDate?: string;
}


async function detectThreadIntelligence(
  subject: string,
  snippet: string,
  fromEmail: string,
): Promise<ThreadIntelligence> {
  if (!process.env.AI_GATEWAY_API_KEY) return {};

  const prompt = `Analyze this email and extract structured business data. Return ONLY valid JSON, no markdown.

Subject: ${subject || '(no subject)'}
From: ${fromEmail}
Snippet: ${snippet?.slice(0, 500) || ''}

Return JSON with these fields (all optional, omit if not found):
{
  "detectedType": "invoice" | "contract" | "receipt" | "proposal" | "other",
  "detectedAmount": number,
  "detectedCurrency": "USD" | "EUR" | "GBP" | "NGN" | etc.,
  "detectedDueDate": "YYYY-MM-DD"
}

Rules:
- detectedType: "invoice" if requesting payment, "contract" if agreement/retainer, "receipt" if payment confirmation, "proposal" if quote/estimate
- Only include detectedAmount if a specific monetary amount is clearly mentioned
- Only include detectedDueDate if a specific due date is mentioned
- If none of these apply, return {}`;

  try {
    const text = (await llmService.generateText(prompt, {
      maxOutputTokens: 200,
      temperature: 0.1,
    })).trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};

    const parsed = JSON.parse(jsonMatch[0]);
    const intel: ThreadIntelligence = {};
    if (['invoice', 'contract', 'receipt', 'proposal', 'other'].includes(parsed.detectedType)) {
      intel.detectedType = parsed.detectedType;
    }
    if (typeof parsed.detectedAmount === 'number' && parsed.detectedAmount > 0) {
      intel.detectedAmount = parsed.detectedAmount;
    }
    if (typeof parsed.detectedCurrency === 'string' && parsed.detectedCurrency.length <= 5) {
      intel.detectedCurrency = parsed.detectedCurrency.toUpperCase();
    }
    if (typeof parsed.detectedDueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.detectedDueDate)) {
      intel.detectedDueDate = parsed.detectedDueDate;
    }
    return intel;
  } catch {
    return {};
  }
}

// ─── DeepSeek Vision: extract data from PDF/image invoice attachments ─────────

export async function analyzeAttachmentWithDeepSeek(
  threadId: string,
  attachmentId: string,
  _filename: string,
  contentType: string,
  buffer: Buffer,
): Promise<void> {
  if (!process.env.AI_GATEWAY_API_KEY) return;

  const supportedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!supportedTypes.includes(contentType)) return;

  const base64Data = buffer.toString('base64');

  const prompt = `Extract invoice/document data from this file. Return ONLY valid JSON, no markdown.

Return JSON with these fields (all optional, omit if not found):
{
  "documentType": "invoice" | "contract" | "receipt" | "proposal",
  "invoiceNumber": "string",
  "issuer": "company name",
  "amount": number,
  "currency": "USD" | "EUR" etc.,
  "issueDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "lineItems": [{"description": "string", "quantity": number, "unitPrice": number, "total": number}],
  "confidence": 0.0 to 1.0
}`;

  try {
    const text = (await llmService.generateText(prompt, {
      files: [{ mimeType: contentType, data: base64Data }],
      maxOutputTokens: 600,
      temperature: 0.1,
    })).trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]);

    await supabase
      .from('email_attachments')
      .update({
        attachment_type: parsed.documentType ?? null,
        parsed_data: {
          invoiceNumber:  parsed.invoiceNumber  ?? null,
          issuer:         parsed.issuer         ?? null,
          amount:         parsed.amount         ?? null,
          currency:       parsed.currency       ?? null,
          issueDate:      parsed.issueDate      ?? null,
          dueDate:        parsed.dueDate        ?? null,
          lineItems:      parsed.lineItems      ?? [],
          confidence:     parsed.confidence     ?? 0,
          extractedAt:    new Date().toISOString(),
        },
      })
      .eq('id', attachmentId);

    if (parsed.documentType || parsed.amount || parsed.dueDate) {
      const threadUpdate: Record<string, any> = {};
      const parsedType = normalizeDetectedType(parsed.documentType);
      if (parsedType && IMPORTABLE_THREAD_TYPES.has(parsedType)) threadUpdate.detected_type = parsedType;
      if (parsed.amount && parsed.amount > 0) {
        threadUpdate.detected_amount   = parsed.amount;
        threadUpdate.detected_currency = parsed.currency ?? 'USD';
      }
      if (parsed.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate)) {
        threadUpdate.detected_due_date = parsed.dueDate;
      }
      if (Object.keys(threadUpdate).length > 0) {
        await supabase.from('email_threads').update(threadUpdate).eq('id', threadId);
      }
    }
  } catch {
    // Vision analysis is best-effort
  }
}

// ─── Phase 3: DeepSeek email summarization ────────────────────────────────────

export async function summarizeThread(userId: string, threadDbId: string): Promise<void> {
  const { data: thread } = await supabase
    .from('email_threads')
    .select('subject, snippet, from_email, from_name, participants, message_count')
    .eq('id', threadDbId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!thread) return;

  if (!process.env.AI_GATEWAY_API_KEY) return;

  const prompt = `You are a business assistant for a freelancer. Summarize this email thread in 1–2 sentences, focusing on what action (if any) is required.

Subject: ${thread.subject || '(no subject)'}
From: ${thread.from_name || thread.from_email}
Participants: ${(thread.participants as string[]).join(', ')}
Messages: ${thread.message_count}
Snippet: ${thread.snippet || ''}

Write a concise, professional summary. If the email is about a payment, invoice, project update, or contract, mention that explicitly.`;

  try {
    const summary = (await llmService.generateText(prompt, {
      maxOutputTokens: 150,
      temperature: 0.3,
    })).trim();
    if (!summary) return;

    await supabase
      .from('email_threads')
      .update({ summary, summary_generated_at: new Date().toISOString() })
      .eq('id', threadDbId);
  } catch {
    // Summarization is best-effort
  }
}

// ─── Phase 5: Matching engine ─────────────────────────────────────────────────

export async function matchThreadsToWorkspace(userId: string): Promise<void> {
  // Fetch all unmatched threads for this user
  const { data: threads } = await supabase
    .from('email_threads')
    .select('id, from_email, subject, participants')
    .eq('user_id', userId)
    .is('matched_client_id', null)
    .limit(100);

  if (!threads?.length) return;

  // Load user's clients once
  const { data: clients } = await supabase
    .from('clients')
    .select('id, email, name')
    .eq('user_id', userId);

  if (!clients?.length) return;

  const clientEmailMap = new Map<string, string>();
  for (const c of clients) {
    if (c.email) clientEmailMap.set(c.email.toLowerCase(), c.id);
  }

  for (const thread of threads) {
    const participants = (thread.participants as string[]).map((p) => p.toLowerCase());
    let matchedClientId: string | null = null;
    let confidence = 0;

    // Exact email match
    for (const email of participants) {
      if (clientEmailMap.has(email)) {
        matchedClientId = clientEmailMap.get(email)!;
        confidence = 1.0;
        break;
      }
    }

    // Domain match (if no exact match)
    if (!matchedClientId) {
      for (const email of participants) {
        const domain = email.split('@')[1];
        if (!domain) continue;
        for (const [clientEmail, clientId] of clientEmailMap) {
          if (clientEmail.endsWith(`@${domain}`)) {
            matchedClientId = clientId;
            confidence = 0.7;
            break;
          }
        }
        if (matchedClientId) break;
      }
    }

    if (matchedClientId) {
      await supabase
        .from('email_threads')
        .update({
          matched_client_id: matchedClientId,
          match_confidence:  confidence,
          status:            'matched',
          updated_at:        new Date().toISOString(),
        })
        .eq('id', thread.id);
    }
  }

  logger.info('Thread matching complete', { userId, checked: threads.length });
}

// ─── Phase 6: Google Calendar sync ───────────────────────────────────────────

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

export async function syncGoogleCalendar(userId: string, integrationId: string): Promise<void> {
  const accessToken = await getValidAccessToken(userId, 'google_calendar');
  if (!accessToken) {
    logger.warn('No valid Google Calendar token', { userId });
    return;
  }

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ahead

  const url = `${GCAL_BASE}/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=50&singleEvents=true&orderBy=startTime`;

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) {
    logger.error('Calendar API failed', { userId, status: resp.status });
    return;
  }

  const data = await resp.json() as any;
  const events: any[] = data.items ?? [];

  for (const event of events) {
    const startAt = event.start?.dateTime ?? event.start?.date ?? null;
    const endAt   = event.end?.dateTime   ?? event.end?.date   ?? null;
    const allDay  = !event.start?.dateTime;
    const attendees = (event.attendees ?? []).map((a: any) => a.email as string).filter(Boolean);

    await supabase
      .from('external_calendar_events')
      .upsert({
        user_id:          userId,
        integration_id:   integrationId,
        provider:         'google_calendar',
        provider_event_id: event.id,
        title:            event.summary ?? '',
        description:      event.description ?? null,
        location:         event.location ?? null,
        start_at:         startAt,
        end_at:           endAt,
        all_day:          allDay,
        attendees,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'user_id,provider,provider_event_id' });
  }

  await supabase
    .from('user_integrations')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', integrationId);

  logger.info('Google Calendar sync complete', { userId, count: events.length });

  // Push Hedwig events back to Google Calendar
  await pushHedwigEventsToGoogleCalendar(userId).catch(() => {});
}

// ─── Phase 7: Push Hedwig events → Google Calendar ───────────────────────────

export async function pushHedwigEventsToGoogleCalendar(userId: string): Promise<void> {
  const accessToken = await getValidAccessToken(userId, 'google_calendar');
  if (!accessToken) {
    logger.warn('No valid Google Calendar token for push', { userId });
    return;
  }

  const { data: hedwigEvents } = await supabase
    .from('calendar_events')
    .select('id, title, description, event_date, event_type, status, google_event_id')
    .eq('user_id', userId)
    .in('status', ['upcoming', 'completed'])
    .order('event_date', { ascending: true })
    .limit(200);

  if (!hedwigEvents?.length) return;

  let pushed = 0;
  let failed = 0;

  for (const event of hedwigEvents) {
    const startDate = (event.event_date as string).slice(0, 10);
    const endDay = new Date(startDate + 'T00:00:00Z');
    endDay.setUTCDate(endDay.getUTCDate() + 1);
    const endDate = endDay.toISOString().slice(0, 10);

    const gcalBody = JSON.stringify({
      summary: event.title,
      description: event.description || undefined,
      start: { date: startDate },
      end: { date: endDate },
      extendedProperties: {
        private: { hedwigEventId: event.id as string, hedwigEventType: event.event_type as string },
      },
    });

    if (event.google_event_id) {
      const resp = await fetch(`${GCAL_BASE}/calendars/primary/events/${event.google_event_id as string}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: gcalBody,
      });

      if (resp.status === 404) {
        // Event was deleted in Google Calendar — clear stored ID so it gets re-created next sync
        await supabase.from('calendar_events').update({ google_event_id: null }).eq('id', event.id);
      } else if (resp.status === 403) {
        logger.warn('Google Calendar write access denied — user needs to reconnect', { userId });
        return; // Stop pushing; token lacks write scope
      } else if (resp.ok) {
        pushed++;
      } else {
        failed++;
      }
    } else {
      const resp = await fetch(`${GCAL_BASE}/calendars/primary/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: gcalBody,
      });

      if (resp.status === 403) {
        logger.warn('Google Calendar write access denied — user needs to reconnect', { userId });
        return;
      }

      if (resp.ok) {
        const created = await resp.json() as { id: string };
        await supabase.from('calendar_events').update({ google_event_id: created.id }).eq('id', event.id);
        pushed++;
      } else {
        failed++;
      }
    }
  }

  logger.info('Pushed Hedwig events to Google Calendar', { userId, pushed, failed });
}

// ─── Phase 8: Assistant-ready queries ────────────────────────────────────────

export async function getEmailsForAssistant(userId: string, limit = 10): Promise<any[]> {
  const { data } = await supabase
    .from('email_threads')
    .select(`
      id, subject, from_email, from_name, snippet, summary,
      has_attachments, last_message_at, message_count,
      matched_client_id, matched_project_id
    `)
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}

export async function getCalendarEventsForAssistant(userId: string, limit = 10): Promise<any[]> {
  const { data } = await supabase
    .from('external_calendar_events')
    .select('id, title, start_at, end_at, all_day, attendees, matched_client_id')
    .eq('user_id', userId)
    .gte('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })
    .limit(limit);

  return data ?? [];
}
