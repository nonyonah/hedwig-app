import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../utils/logger';

const logger = createLogger('IntegrationsService');

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type Provider = 'gmail' | 'google_calendar' | 'slack';

export interface IntegrationRecord {
  id: string;
  user_id: string;
  provider: Provider;
  status: 'connected' | 'error' | 'token_expired';
  provider_email: string | null;
  provider_user_id: string | null;
  scope: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

const GOOGLE_TOKEN_URL   = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_REVOKE_URL  = 'https://oauth2.googleapis.com/revoke';

export function buildGoogleAuthUrl(provider: 'gmail' | 'google_calendar', redirectUri: string, state: string): string {
  const scopes: Record<string, string[]> = {
    gmail: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
    google_calendar: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  };

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         scopes[provider].join(' '),
    access_type:   'offline',
    prompt:        'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<OAuthTokens> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Google token exchange failed: ${text}`);
  }

  return resp.json() as Promise<OAuthTokens>;
}

export async function refreshGoogleToken(refreshToken: string): Promise<OAuthTokens> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      grant_type:    'refresh_token',
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Google token refresh failed: ${text}`);
  }

  return resp.json() as Promise<OAuthTokens>;
}

export async function getGoogleUserInfo(accessToken: string): Promise<{ id: string; email: string }> {
  const resp = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error('Failed to fetch Google user info');
  return resp.json() as Promise<{ id: string; email: string }>;
}

// ─── Slack OAuth ──────────────────────────────────────────────────────────────

export function buildSlackAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id:    process.env.SLACK_CLIENT_ID || '',
    redirect_uri: redirectUri,
    scope:        'channels:read,chat:write,users:read',
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params}`;
}

export async function exchangeSlackCode(code: string, redirectUri: string): Promise<{
  access_token: string;
  team: { id: string; name: string };
  authed_user: { id: string };
  scope: string;
}> {
  const resp = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.SLACK_CLIENT_ID || '',
      client_secret: process.env.SLACK_CLIENT_SECRET || '',
      redirect_uri:  redirectUri,
    }),
  });

  const data = await resp.json() as any;
  if (!data.ok) throw new Error(`Slack OAuth failed: ${data.error}`);
  return data;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

export async function upsertIntegration(
  userId: string,
  provider: Provider,
  tokens: OAuthTokens,
  providerUserId: string,
  providerEmail: string,
  metadata: Record<string, unknown> = {}
): Promise<IntegrationRecord> {
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const { data, error } = await supabase
    .from('user_integrations')
    .upsert({
      user_id:          userId,
      provider,
      status:           'connected',
      access_token:     tokens.access_token,
      refresh_token:    tokens.refresh_token ?? null,
      token_expires_at: expiresAt,
      scope:            tokens.scope ?? null,
      provider_user_id: providerUserId,
      provider_email:   providerEmail,
      metadata,
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })
    .select()
    .single();

  if (error) throw new Error(`upsertIntegration: ${error.message}`);
  return data as IntegrationRecord;
}

export async function getIntegrations(userId: string): Promise<IntegrationRecord[]> {
  const { data, error } = await supabase
    .from('user_integrations')
    .select('id, user_id, provider, status, provider_email, provider_user_id, scope, last_synced_at, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`getIntegrations: ${error.message}`);
  return (data ?? []) as IntegrationRecord[];
}

export async function getIntegration(userId: string, provider: Provider): Promise<IntegrationRecord & {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
} | null> {
  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (error) throw new Error(`getIntegration: ${error.message}`);
  return data;
}

export async function deleteIntegration(userId: string, provider: Provider): Promise<void> {
  const integration = await getIntegration(userId, provider);
  if (!integration) return;

  // Best-effort token revocation
  if (integration.access_token && (provider === 'gmail' || provider === 'google_calendar')) {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(integration.access_token)}`).catch(() => {});
  }

  await supabase
    .from('user_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);

  logger.info('Integration disconnected', { userId, provider });
}

export async function getValidAccessToken(userId: string, provider: Provider): Promise<string | null> {
  const integration = await getIntegration(userId, provider);
  if (!integration || integration.status !== 'connected') return null;

  const { access_token, refresh_token, token_expires_at } = integration;
  if (!access_token) return null;

  // Check if token is still valid (with 60s buffer)
  const expiresAt = token_expires_at ? new Date(token_expires_at).getTime() : Infinity;
  if (expiresAt > Date.now() + 60_000) return access_token;

  // Try to refresh
  if (!refresh_token) {
    await supabase
      .from('user_integrations')
      .update({ status: 'token_expired', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', provider);
    return null;
  }

  try {
    const newTokens = await refreshGoogleToken(refresh_token);
    const newExpiry = newTokens.expires_in
      ? new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
      : null;

    await supabase
      .from('user_integrations')
      .update({
        access_token:     newTokens.access_token,
        token_expires_at: newExpiry,
        status:           'connected',
        updated_at:       new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', provider);

    return newTokens.access_token;
  } catch (err) {
    logger.error('Token refresh failed', { userId, provider, err });
    await supabase
      .from('user_integrations')
      .update({ status: 'token_expired', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', provider);
    return null;
  }
}
