import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { privy } from '../lib/privy';
import {
  getIntegrations,
  deleteIntegration,
  upsertIntegration,
  exchangeGoogleCode,
  getGoogleUserInfo,
  exchangeSlackCode,
  buildGoogleAuthUrl,
  buildSlackAuthUrl,
  type Provider,
} from '../services/integrations';
import { syncGmailThreads, matchThreadsToWorkspace, syncGoogleCalendar } from '../services/emailSync';
import { createLogger } from '../utils/logger';

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
    const claims = await privy.verifyAuthToken(token);
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('privy_did', claims.userId)
      .maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

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
        syncGoogleCalendar(userId, integration.id).catch(() => {});
      }
    }

    res.json({ success: true, data: { provider, email: userInfo.email } });
  } catch (err: any) {
    logger.error('Google OAuth callback', { userId, provider, err });
    res.status(500).json({ success: false, error: err.message || 'OAuth failed' });
  }
});

// POST /api/integrations/oauth/slack/callback — called by Next.js after Slack OAuth
router.post('/oauth/slack/callback', async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

  const { code, redirectUri } = req.body as { code: string; redirectUri: string };
  if (!code || !redirectUri) {
    res.status(400).json({ success: false, error: 'Missing code or redirectUri' });
    return;
  }

  try {
    const slackData = await exchangeSlackCode(code, redirectUri);
    await upsertIntegration(
      userId,
      'slack',
      { access_token: slackData.access_token, scope: slackData.scope },
      slackData.authed_user.id,
      slackData.team.name,
      { team_id: slackData.team.id, team_name: slackData.team.name }
    );

    res.json({ success: true, data: { provider: 'slack', team: slackData.team.name } });
  } catch (err: any) {
    logger.error('Slack OAuth callback', { userId, err });
    res.status(500).json({ success: false, error: err.message || 'Slack OAuth failed' });
  }
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
    }
  } catch (err: any) {
    logger.error('manual sync', { userId, provider, err });
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
