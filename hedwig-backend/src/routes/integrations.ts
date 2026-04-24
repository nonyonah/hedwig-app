import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { getPrivyAuthClient } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import {
  getIntegrations,
  deleteIntegration,
  upsertIntegration,
  exchangeGoogleCode,
  getGoogleUserInfo,
  buildGoogleAuthUrl,
  type Provider,
} from '../services/integrations';
import { syncGmailThreads, matchThreadsToWorkspace, syncGoogleCalendar, pushHedwigEventsToGoogleCalendar } from '../services/emailSync';
import { createLogger } from '../utils/logger';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();
const logger = createLogger('IntegrationsRoute');

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  if (!token) return null;

  try {
    const claims = await getPrivyAuthClient().verifyAuthToken(token);
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('privy_id', claims.userId)
      .maybeSingle();

    if (data?.id) {
      return data.id;
    }

    // Some accounts arrive here before a local users row exists.
    // Create/sync the row using Privy as source of truth.
    const syncedUser = await getOrCreateUser(claims.userId);
    return syncedUser?.id ? String(syncedUser.id) : null;
  } catch {
    return null;
  }
}

// GET /api/integrations/oauth-url — mobile: generate Google OAuth URL directly
// Returns the accounts.google.com URL so the mobile app can open it without
// bouncing through hedwigbot.xyz first.
router.get('/oauth-url', async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

  const provider = req.query.provider as string;
  if (!provider || !['gmail', 'google_calendar'].includes(provider)) {
    res.status(400).json({ success: false, error: 'Invalid provider' }); return;
  }

  const auth = req.headers.authorization!;
  const accessToken = auth.slice(7);

  const WEB_BASE_URL = (process.env.NEXT_PUBLIC_WEB_URL || 'https://hedwigbot.xyz').replace(/\/$/, '');
  const redirectUri  = `${WEB_BASE_URL}/api/integrations/callback/google`;
  const state        = require('crypto').randomBytes(24).toString('hex');

  // Store state → userId + token so the Next.js callback can resolve the user
  // without needing a browser session cookie.
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error: stateInsertError } = await supabase.from('oauth_pending_states').insert({
    state,
    provider,
    user_id:      userId,
    access_token: accessToken,
    expires_at:   expiresAt,
  });
  if (stateInsertError) {
    logger.error('oauth-url state insert failed', { userId, provider, err: stateInsertError });
    res.status(500).json({ success: false, error: 'Could not persist OAuth state' });
    return;
  }

  const authUrl = buildGoogleAuthUrl(provider as 'gmail' | 'google_calendar', redirectUri, state);
  res.json({ success: true, data: { url: authUrl } });
});

// GET /api/integrations/oauth-state/:state — Next.js callback uses this to
// resolve a mobile OAuth state nonce into a userId + token without cookies.
router.get('/oauth-state/:state', async (req: Request, res: Response) => {
  const { state } = req.params;
  const { data, error } = await supabase
    .from('oauth_pending_states')
    .select('user_id, access_token, provider')
    .eq('state', state)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    res.status(404).json({ success: false, error: 'State not found or expired' }); return;
  }

  // Consume the state so it can't be replayed
  await supabase.from('oauth_pending_states').delete().eq('state', state);

  res.json({ success: true, data });
});

// GET /api/integrations — list user's connected integrations
router.get('/', async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

  try {
    const integrations = await getIntegrations(userId);
    res.json({ success: true, data: integrations });
  } catch (err: any) {
    logger.error('list integrations', { userId, err });
    res.status(500).json({ success: false, error: 'Failed to list integrations' });
  }
});

// DELETE /api/integrations/:provider — disconnect a provider
router.delete('/:provider', async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

  const provider = req.params.provider as Provider;
  const valid: Provider[] = ['gmail', 'google_calendar', 'slack'];
  if (!valid.includes(provider)) {
    res.status(400).json({ success: false, error: 'Unknown provider' });
    return;
  }

  try {
    await deleteIntegration(userId, provider);
    res.json({ success: true });
  } catch (err: any) {
    logger.error('disconnect integration', { userId, provider, err });
    res.status(500).json({ success: false, error: 'Failed to disconnect' });
  }
});

// POST /api/integrations/oauth/google/callback — called by Next.js after OAuth
router.post('/oauth/google/callback', async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

  const { code, redirectUri, provider } = req.body as {
    code: string;
    redirectUri: string;
    provider: 'gmail' | 'google_calendar';
  };

  if (!code || !redirectUri || !provider) {
    res.status(400).json({ success: false, error: 'Missing code, redirectUri, or provider' });
    return;
  }

  try {
    const tokens     = await exchangeGoogleCode(code, redirectUri);
    const userInfo   = await getGoogleUserInfo(tokens.access_token);
    await upsertIntegration(userId, provider, tokens, userInfo.id, userInfo.email);

    // Kick off initial sync in background
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();

    if (integration?.id) {
      if (provider === 'gmail') {
        syncGmailThreads(userId, integration.id).catch(() => {});
      } else if (provider === 'google_calendar') {
        syncGoogleCalendar(userId, integration.id)
          .then(() => pushHedwigEventsToGoogleCalendar(userId))
          .catch(() => {});
      }
    }

    res.json({ success: true, data: { provider, email: userInfo.email } });
  } catch (err: any) {
    logger.error('Google OAuth callback', { userId, provider, err });
    res.status(500).json({ success: false, error: err.message || 'OAuth failed' });
  }
});

// POST /api/integrations/oauth/slack/callback — called by Next.js after Slack OAuth
router.post('/oauth/slack/callback', async (_req: Request, res: Response) => {
  res.status(410).json({ success: false, error: 'Slack integration is temporarily disabled.' });
});

// POST /api/integrations/sync — trigger manual sync
router.post('/sync', async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

  const { provider } = req.body as { provider: Provider };

  try {
    const { data: integration } = await supabase
      .from('user_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();

    if (!integration) {
      res.status(404).json({ success: false, error: 'Integration not found' });
      return;
    }

    res.json({ success: true, message: 'Sync started' });

    // Run sync after responding
    if (provider === 'gmail') {
      await syncGmailThreads(userId, integration.id);
      await matchThreadsToWorkspace(userId);
    } else if (provider === 'google_calendar') {
      await syncGoogleCalendar(userId, integration.id);
      await pushHedwigEventsToGoogleCalendar(userId);
    }
  } catch (err: any) {
    logger.error('manual sync', { userId, provider, err });
  }
});

// GET /api/integrations/threads — Magic Inbox thread list
router.get('/threads', async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

  const limit  = Math.min(parseInt(String(req.query.limit  ?? 20)), 50);
  const offset = parseInt(String(req.query.offset ?? 0));
  const status = String(req.query.status ?? '').trim();
  const detectedType = String(req.query.detectedType ?? '').trim();
  const hasAttachments = req.query.hasAttachments === 'true' ? true : undefined;
  const search = String(req.query.search ?? '').trim();

  let query = supabase
    .from('email_threads')
    .select(`
      id, integration_id, provider, subject, snippet, summary, summary_generated_at,
      from_email, from_name, participants, message_count, has_attachments, attachment_count,
      last_message_at, labels, status, match_confidence,
      matched_client_id, matched_project_id, matched_document_id, matched_document_type,
      is_archived, detected_type, detected_amount, detected_currency, detected_due_date,
      clients:matched_client_id ( name ),
      projects:matched_project_id ( name )
    `, { count: 'exact' })
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('last_message_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (detectedType) query = query.eq('detected_type', detectedType);
  if (hasAttachments !== undefined) query = query.eq('has_attachments', hasAttachments);
  if (search) {
    query = query.or(`subject.ilike.%${search}%,from_email.ilike.%${search}%,snippet.ilike.%${search}%`);
  }

  // Check if Gmail is connected so the frontend can show a connect prompt
  const { data: gmailInt } = await supabase
    .from('user_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'gmail')
    .maybeSingle();

  const { data, error, count } = await query;
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  // Map snake_case DB fields → camelCase
  const threads = (data ?? []).map((t: any) => ({
    id:                  t.id,
    integrationId:       t.integration_id,
    provider:            t.provider,
    subject:             t.subject,
    snippet:             t.snippet,
    summary:             t.summary,
    summaryGeneratedAt:  t.summary_generated_at,
    fromEmail:           t.from_email,
    fromName:            t.from_name,
    participants:        t.participants ?? [],
    messageCount:        t.message_count,
    hasAttachments:      t.has_attachments,
    attachmentCount:     t.attachment_count ?? 0,
    lastMessageAt:       t.last_message_at,
    labels:              t.labels ?? [],
    status:              t.status ?? 'needs_review',
    confidenceScore:     t.match_confidence,
    matchedClientId:     t.matched_client_id,
    matchedClientName:   t.clients?.name ?? null,
    matchedProjectId:    t.matched_project_id,
    matchedProjectName:  t.projects?.name ?? null,
    matchedDocumentId:   t.matched_document_id,
    matchedDocumentType: t.matched_document_type,
    isArchived:          t.is_archived,
    detectedType:        t.detected_type,
    detectedAmount:      t.detected_amount ? Number(t.detected_amount) : undefined,
    detectedCurrency:    t.detected_currency,
    detectedDueDate:     t.detected_due_date,
  }));

  res.json({ success: true, data: threads, total: count ?? 0, hasGmailConnected: !!gmailInt });
});

// PATCH /api/integrations/threads/:id — update thread status (confirm/ignore)
router.patch('/threads/:id', async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

  const { id } = req.params;
  const { status, matchedClientId, matchedProjectId } = req.body as {
    status?: string;
    matchedClientId?: string;
    matchedProjectId?: string;
  };

  const validStatuses = ['needs_review', 'matched', 'ignored'];
  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ success: false, error: 'Invalid status' });
    return;
  }

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (status) update.status = status;
  if (matchedClientId !== undefined) update.matched_client_id = matchedClientId;
  if (matchedProjectId !== undefined) update.matched_project_id = matchedProjectId;

  const { error } = await supabase
    .from('email_threads')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true });
});

// POST /api/integrations/analyze-document — Gemini Vision invoice extraction
router.post('/analyze-document', upload.single('file'), async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) { res.status(400).json({ success: false, error: 'No file uploaded' }); return; }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) { res.status(503).json({ success: false, error: 'AI extraction not configured' }); return; }

  const supportedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!supportedTypes.includes(file.mimetype)) {
    res.status(400).json({ success: false, error: 'Unsupported file type. Use PDF, PNG, or JPG.' });
    return;
  }

  const base64Data = file.buffer.toString('base64');

  const prompt = `Analyze this uploaded file and extract invoice data only. Return ONLY valid JSON with no markdown fences or commentary.

If the file does not appear to be an invoice, set "documentType" to "unknown" and include only invoice-like fields you can detect confidently.

Use this exact JSON shape and omit any field you cannot confidently extract:
{
  "documentType": "invoice" | "unknown",
  "invoiceNumber": "string",
  "issuer": "company or person name",
  "senderEmail": "email address",
  "recipient": "string",
  "recipientEmail": "email address",
  "amount": number,
  "currency": "USD" | "EUR" | "GBP" | "NGN" | "USDC" | etc.,
  "issueDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "title": "document title or short summary",
  "projectReference": "project name, scope label, or workstream reference",
  "lineItems": [{"description": "string", "quantity": number, "unitPrice": number, "total": number}],
  "paymentTerms": "string",
  "notes": "short notes about missing fields or ambiguity",
  "confidence": number between 0 and 1
}

Rules:
- If it is clearly an invoice, populate as many invoice fields as possible.
- If it is not clearly an invoice, set "documentType" to "unknown".
- Normalize dates to YYYY-MM-DD when possible.
- Keep lineItems as an array.`;

  try {
    const gemResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: file.mimetype, data: base64Data } },
              { text: prompt },
            ],
          }],
          generationConfig: { maxOutputTokens: 1400, temperature: 0.1 },
        }),
      }
    );

    if (!gemResp.ok) {
      const errText = await gemResp.text().catch(() => '');
      logger.error('Gemini Vision failed', { status: gemResp.status, errText });
      res.status(502).json({ success: false, error: 'Extraction service error' });
      return;
    }

    const gemData = await gemResp.json() as any;
    const text = gemData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(422).json({ success: false, error: 'Could not extract data from document' });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const normalizedDocumentType =
      typeof parsed.documentType === 'string' ? String(parsed.documentType).toLowerCase() : 'unknown';
    parsed.documentType = ['invoice'].includes(normalizedDocumentType)
      ? normalizedDocumentType
      : 'unknown';
    parsed.lineItems = Array.isArray(parsed.lineItems) ? parsed.lineItems : [];
    parsed.title = typeof parsed.title === 'string' ? parsed.title.trim() : parsed.title;
    parsed.projectReference = typeof parsed.projectReference === 'string' ? parsed.projectReference.trim() : parsed.projectReference;
    parsed.paymentTerms = typeof parsed.paymentTerms === 'string' ? parsed.paymentTerms.trim() : parsed.paymentTerms;
    parsed.notes = typeof parsed.notes === 'string' ? parsed.notes.trim() : parsed.notes;

    // Load user's clients to build match suggestions
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, email')
      .eq('user_id', userId)
      .limit(50);

    const suggestions: Array<{
      id: string; entityType: string; suggestedName: string;
      confidenceScore: number; reason: string; approvalStatus: string;
    }> = [];

    if (parsed.issuer) {
      const issuerLower = (parsed.issuer as string).toLowerCase();
      const exactMatch = (clients ?? []).find(
        (c: any) => c.name?.toLowerCase() === issuerLower || c.email?.toLowerCase().includes(issuerLower)
      );
      if (!exactMatch) {
        suggestions.push({
          id: 'sug_client',
          entityType: 'client',
          suggestedName: parsed.issuer,
          confidenceScore: 0.88,
          reason: `"${parsed.issuer}" is not in your clients list. Approve to create a new client record.`,
          approvalStatus: 'pending',
        });
      }
    }

    if (parsed.documentType === 'invoice' && parsed.invoiceNumber) {
      suggestions.push({
        id: 'sug_invoice',
        entityType: 'invoice',
        suggestedName: `Invoice ${parsed.invoiceNumber}`,
        confidenceScore: 0.82,
        reason: `Create an invoice record for ${parsed.invoiceNumber}${parsed.amount ? ` (${parsed.currency ?? 'USD'} ${parsed.amount})` : ''}.`,
        approvalStatus: 'pending',
      });
    }
    res.json({ success: true, data: { parsed, suggestions } });
  } catch (err: any) {
    logger.error('analyze-document error', { err });
    res.status(500).json({ success: false, error: err.message ?? 'Extraction failed' });
  }
});

// GET /api/integrations/emails — fetch synced emails for assistant
router.get('/emails', async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

  const limit  = Math.min(parseInt(String(req.query.limit ?? 20)), 50);
  const search = String(req.query.search ?? '').trim();

  let query = supabase
    .from('email_threads')
    .select(`
      id, subject, from_email, from_name, snippet, summary,
      has_attachments, last_message_at, message_count, labels,
      matched_client_id, matched_project_id, match_confidence
    `)
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(`subject.ilike.%${search}%,from_email.ilike.%${search}%,snippet.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ success: false, error: error.message }); return; }

  res.json({ success: true, data: data ?? [] });
});

// GET /api/integrations/calendar-events — fetch upcoming calendar events
router.get('/calendar-events', async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

  const { data, error } = await supabase
    .from('external_calendar_events')
    .select('id, title, start_at, end_at, all_day, attendees, matched_client_id, matched_project_id')
    .eq('user_id', userId)
    .gte('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })
    .limit(20);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: data ?? [] });
});

export default router;
