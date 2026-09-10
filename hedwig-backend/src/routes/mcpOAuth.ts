import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { asyncHandler } from '../utils/asyncHandler';
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';

const router = Router();

/**
 * MCP OAuth provider — Nche port (mcp-oauth.routes.ts), dependency-free.
 * Access tokens are HS256 JWTs signed with node:crypto (no jose needed).
 * Scope is read-only: `hedwig:read`.
 */

const SCOPE = 'hedwig:read';
const ACCESS_TTL_S = Number(process.env.MCP_ACCESS_TTL_SECONDS ?? 3600);
const REFRESH_TTL_S = Number(process.env.MCP_REFRESH_TTL_SECONDS ?? 30 * 24 * 3600);

const issuer = () => process.env.MCP_PUBLIC_URL || process.env.APP_URL || 'http://localhost:8080';
const signingKey = () => process.env.MCP_SESSION_SECRET || process.env.SCHEDULER_SECRET || 'dev-mcp-secret';

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf as string).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (obj: unknown) => b64url(JSON.stringify(obj));

function signJwt(userId: string, tokenVersion: number | null): string {
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = b64urlJson({
    sub: userId,
    typ: 'mcp_access',
    scope: SCOPE,
    ver: tokenVersion,
    iss: issuer(),
    aud: issuer(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_S,
  });
  const sig = requireHmac(`${header}.${body}`);
  return `${header}.${body}.${sig}`;
}

function requireHmac(data: string): string {
  return createHmac('sha256', signingKey()).update(data).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verifyJwt(token: string): Promise<{ sub: string; ver: number | null } | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const expect = requireHmac(`${h}.${b}`);
  const a = Buffer.from(s);
  const c = Buffer.from(expect);
  if (a.length !== c.length || !timingSafeEqual(a, c)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b, 'base64').toString('utf8')) as Record<string, unknown>;
    if (payload.typ !== 'mcp_access' || payload.scope !== SCOPE) return null;
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return null;
    if (typeof payload.sub !== 'string') return null;
    return { sub: payload.sub, ver: typeof payload.ver === 'number' ? payload.ver : null };
  } catch {
    return null;
  }
}

const tokenValue = () => randomBytes(32).toString('base64url');
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export async function requireMcpAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${issuer()}/.well-known/oauth-protected-resource", scope="${SCOPE}"`);
    return res.status(401).json({ error: 'missing MCP bearer token' });
  }
  const claims = await verifyJwt(header.slice('Bearer '.length).trim());
  if (!claims) {
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${issuer()}/.well-known/oauth-protected-resource", scope="${SCOPE}"`);
    return res.status(401).json({ error: 'invalid or expired MCP access token' });
  }
  (req as Request & { mcpUserId?: string }).mcpUserId = claims.sub;
  return next();
}

const isAllowedRedirect = (uri: string) => {
  try {
    const u = new URL(uri);
    return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

router.get('/.well-known/oauth-protected-resource', (_req: Request, res: Response) => {
  return res.json({ resource: issuer(), authorization_servers: [issuer()], scopes_supported: [SCOPE] });
});

router.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
  const base = issuer();
  return res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [SCOPE],
  });
});

router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const name = String(b.client_name ?? 'MCP client').slice(0, 200);
  const uris: string[] = Array.isArray(b.redirect_uris) ? b.redirect_uris : [];
  if (!uris.length || uris.length > 20 || uris.some((u) => !isAllowedRedirect(u))) {
    return res.status(400).json({ error: 'invalid_client_metadata' });
  }
  const clientId = `hedwig_${tokenValue()}`;
  const { data, error } = await supabase
    .from('mcp_clients')
    .insert({ client_id: clientId, client_name: name, redirect_uris: uris })
    .select('*')
    .single();
  if (error) throw error;
  return res.status(201).json({
    client_id: data.client_id,
    client_name: data.client_name,
    redirect_uris: data.redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  });
}));

router.get('/authorize', asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  if (q.response_type !== 'code' || q.code_challenge_method !== 'S256' || !q.client_id || !q.redirect_uri || !q.state || !q.code_challenge) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  if ((q.scope ?? SCOPE) !== SCOPE) return res.status(400).json({ error: 'invalid_scope' });
  const { data: client } = await supabase.from('mcp_clients').select('*').eq('client_id', q.client_id).single();
  if (!client || !(client.redirect_uris as string[]).includes(q.redirect_uri)) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'unknown client or redirect URI' });
  }
  // Hand off to the web app for authenticated consent (mirrors Nche's flow).
  const webApp = process.env.WEB_APP_URL || process.env.APP_URL || 'http://localhost:3001';
  const handoff = new URL(`${webApp}/oauth/authorize`);
  for (const [k, v] of Object.entries(q)) handoff.searchParams.set(k, String(v));
  return res.redirect(handoff.toString());
}));

/** Authenticated user consents → authorization code (called by the web consent screen). */
router.post('/consent', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if ((b.scope ?? SCOPE) !== SCOPE) return res.status(400).json({ error: 'invalid_scope' });
  const { data: client } = await supabase.from('mcp_clients').select('*').eq('client_id', b.client_id).single();
  if (!client || !(client.redirect_uris as string[]).includes(b.redirect_uri)) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  const raw = tokenValue();
  await supabase.from('mcp_auth_codes').insert({
    code_hash: hashToken(raw),
    client_id: client.id,
    user_id: req.user!.id,
    redirect_uri: b.redirect_uri,
    scope: SCOPE,
    code_challenge: b.code_challenge,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  const redirect = new URL(b.redirect_uri);
  redirect.searchParams.set('code', raw);
  redirect.searchParams.set('state', b.state);
  return res.json({ redirect_to: redirect.toString() });
}));

router.post('/token', asyncHandler(async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const { data: client } = await supabase.from('mcp_clients').select('*').eq('client_id', b.client_id).single();
  if (!client) return res.status(400).json({ error: 'invalid_client' });

  let userId: string;
  if (b.grant_type === 'authorization_code') {
    if (!b.code || !b.redirect_uri || !b.code_verifier) return res.status(400).json({ error: 'invalid_request' });
    const { data: code } = await supabase.from('mcp_auth_codes').select('*').eq('code_hash', hashToken(b.code)).single();
    if (!code || code.client_id !== client.id || code.redirect_uri !== b.redirect_uri || code.consumed_at || new Date(code.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'invalid_grant' });
    }
    const challenge = createHash('sha256').update(b.code_verifier).digest('base64url');
    const a = Buffer.from(challenge);
    const c = Buffer.from(code.code_challenge);
    if (a.length !== c.length || !timingSafeEqual(a, c)) return res.status(400).json({ error: 'invalid_grant' });
    const { data: consumed, error: consumeErr } = await supabase
      .from('mcp_auth_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', code.id)
      .is('consumed_at', null)
      .select('id');
    if (consumeErr || !consumed?.length) return res.status(400).json({ error: 'invalid_grant' });
    userId = code.user_id;
  } else if (b.grant_type === 'refresh_token') {
    if (!b.refresh_token) return res.status(400).json({ error: 'invalid_request' });
    const { data: stored } = await supabase.from('mcp_refresh_tokens').select('*').eq('token_hash', hashToken(b.refresh_token)).single();
    if (!stored || stored.client_id !== client.id || stored.revoked_at || new Date(stored.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'invalid_grant' });
    }
    await supabase.from('mcp_refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', stored.id);
    userId = stored.user_id;
  } else {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  const accessToken = signJwt(userId, null);
  const rawRefresh = tokenValue();
  await supabase.from('mcp_refresh_tokens').insert({
    token_hash: hashToken(rawRefresh),
    user_id: userId,
    client_id: client.id,
    scope: SCOPE,
    expires_at: new Date(Date.now() + REFRESH_TTL_S * 1000).toISOString(),
  });
  return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: rawRefresh, scope: SCOPE });
}));

export default router;
