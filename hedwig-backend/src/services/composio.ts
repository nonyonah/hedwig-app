import { Composio } from '@composio/core';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { getProviderToolNames } from './agent/composio-tools';

const logger = createLogger('ComposioService');

export type ComposioProvider =
  | 'gmail'
  | 'google_calendar'
  | 'google_drive'
  | 'google_docs';

export const COMPOSIO_PROVIDERS: ComposioProvider[] = [
  'gmail',
  'google_calendar',
  'google_drive',
  'google_docs',
];

// Composio toolkit slug per provider — the v3 API and SDK both use these.
const PROVIDER_TO_TOOLKIT: Record<ComposioProvider, string> = {
  gmail: 'gmail',
  google_calendar: 'googlecalendar',
  google_drive: 'googledrive',
  google_docs: 'googledocs',
};

const PROVIDER_LABEL: Record<ComposioProvider, string> = {
  gmail: 'Gmail',
  google_calendar: 'Google Calendar',
  google_drive: 'Google Drive',
  google_docs: 'Google Docs',
};

const PROVIDER_DESCRIPTION: Record<ComposioProvider, string> = {
  gmail: 'Read invoice replies and draft outbound emails on your behalf.',
  google_calendar: 'Sync milestones, reminders, and project deadlines.',
  google_drive: 'Reference and attach files from your Drive in invoices and contracts.',
  google_docs: 'Create and edit contract drafts and project briefs.',
};

export interface ComposioConnectionRecord {
  id: string;
  user_id: string;
  provider: ComposioProvider;
  composio_entity_id: string;
  composio_connected_account_id: string | null;
  composio_integration_id: string | null;
  status: 'pending' | 'active' | 'expired' | 'revoked' | 'error';
  account_label: string | null;
  metadata: Record<string, unknown>;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComposioConnectionView {
  provider: ComposioProvider;
  label: string;
  description: string;
  connected: boolean;
  status: ComposioConnectionRecord['status'] | 'not_connected';
  accountLabel: string | null;
  lastSyncedAt: string | null;
  tools: string[];
}

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;

let cachedSdk: Composio | null = null;
function getSdk(): Composio {
  if (!COMPOSIO_API_KEY) throw new Error('COMPOSIO_API_KEY is not configured');
  if (cachedSdk) return cachedSdk;
  cachedSdk = new Composio({ apiKey: COMPOSIO_API_KEY });
  return cachedSdk;
}

export function isComposioConfigured(): boolean {
  return Boolean(COMPOSIO_API_KEY);
}

export function getProviderLabel(provider: ComposioProvider): string {
  return PROVIDER_LABEL[provider];
}

export function isValidProvider(value: string): value is ComposioProvider {
  return (COMPOSIO_PROVIDERS as string[]).includes(value);
}

function userIdFor(hedwigUserId: string): string {
  return `hedwig_${hedwigUserId}`;
}

function normalizeRemoteStatus(status: unknown, fallback: ComposioConnectionRecord['status']): ComposioConnectionRecord['status'] {
  const remoteStatus = String(status || '').toUpperCase();
  if (remoteStatus === 'ACTIVE') return 'active';
  if (remoteStatus === 'INITIALIZING' || remoteStatus === 'INITIATED' || remoteStatus === 'PENDING') return 'pending';
  if (remoteStatus === 'EXPIRED') return 'expired';
  if (remoteStatus === 'FAILED' || remoteStatus === 'INACTIVE') return 'error';
  return fallback;
}

function accountLabelFromRemote(account: any, fallback: string | null): string | null {
  return account?.alias
    || account?.meta?.userEmail
    || account?.meta?.entityName
    || account?.params?.email
    || account?.state?.val?.email
    || account?.state?.val?.account_email
    || account?.word_id
    || fallback
    || null;
}

async function findRemoteConnection(userId: string, provider: ComposioProvider, authConfigId?: string | null): Promise<any | null> {
  const sdk = getSdk();
  const composioUserId = userIdFor(userId);
  const toolkit = PROVIDER_TO_TOOLKIT[provider];

  const response: any = await sdk.connectedAccounts.list({
    user_ids: [composioUserId],
    toolkit_slugs: [toolkit],
    ...(authConfigId ? { auth_config_ids: [authConfigId] } : {}),
    order_by: 'updated_at',
    order_direction: 'desc',
    limit: 10,
  } as any);

  const items: any[] = response?.items ?? response?.data ?? [];
  return items.find((item) => item?.status === 'ACTIVE')
    ?? items.find((item) => ['INITIATED', 'INITIALIZING', 'PENDING'].includes(String(item?.status || '').toUpperCase()))
    ?? items[0]
    ?? null;
}

// ─── Auth config resolution ──────────────────────────────────────────────────
// Each toolkit needs an auth config in Composio. We support two paths:
//   1. Env var override: COMPOSIO_AUTH_CONFIG_<PROVIDER_UPPER> = ac_xxx
//   2. Lazy resolution: list configs for toolkit; if none, create a managed one.
// Resolved IDs are cached in-memory for the process lifetime.

const authConfigCache = new Map<ComposioProvider, string>();

function envAuthConfigId(provider: ComposioProvider): string | undefined {
  const key = `COMPOSIO_AUTH_CONFIG_${provider.toUpperCase()}`;
  const value = process.env[key];
  return value && value.trim() ? value.trim() : undefined;
}

async function resolveAuthConfigId(provider: ComposioProvider): Promise<string> {
  if (authConfigCache.has(provider)) return authConfigCache.get(provider)!;

  const fromEnv = envAuthConfigId(provider);
  if (fromEnv) {
    authConfigCache.set(provider, fromEnv);
    return fromEnv;
  }

  const sdk = getSdk();
  const toolkit = PROVIDER_TO_TOOLKIT[provider];

  // Look for an existing auth config for this toolkit.
  try {
    const existing: any = await sdk.authConfigs.list({ toolkit });
    const items: any[] = existing?.items ?? existing?.data ?? [];
    if (items.length > 0 && items[0].id) {
      authConfigCache.set(provider, items[0].id);
      return items[0].id;
    }
  } catch (error) {
    logger.warn('authConfigs.list failed; will try create', {
      provider,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // None exist — create a Composio-managed auth config.
  try {
    const created: any = await sdk.authConfigs.create(toolkit, {
      type: 'use_composio_managed_auth',
      name: `Hedwig ${PROVIDER_LABEL[provider]}`,
    } as any);
    const id: string | undefined = created?.id ?? created?.authConfig?.id;
    if (!id) {
      throw new Error('authConfigs.create returned no id');
    }
    authConfigCache.set(provider, id);
    return id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Could not resolve Composio auth config', { provider, message });
    throw new Error(
      `${PROVIDER_LABEL[provider]} connection setup could not be resolved. Check the backend integration configuration.`
    );
  }
}

// ─── Connection management ───────────────────────────────────────────────────

async function getConnectionRow(userId: string, provider: ComposioProvider): Promise<ComposioConnectionRecord | null> {
  const { data, error } = await supabase
    .from('composio_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) {
    logger.warn('Failed to load composio connection', { userId, provider, error: error.message });
    return null;
  }
  return (data as ComposioConnectionRecord | null) ?? null;
}

export async function listConnectionsForUser(userId: string): Promise<ComposioConnectionView[]> {
  const { data } = await supabase
    .from('composio_connections')
    .select('*')
    .eq('user_id', userId);

  const rows = (data ?? []) as ComposioConnectionRecord[];
  const byProvider = new Map<ComposioProvider, ComposioConnectionRecord>();
  for (const row of rows) byProvider.set(row.provider, row);

  return COMPOSIO_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    const connected = row?.status === 'active';
    return {
      provider,
      label: PROVIDER_LABEL[provider],
      description: PROVIDER_DESCRIPTION[provider],
      connected,
      status: row?.status ?? 'not_connected',
      accountLabel: row?.account_label ?? null,
      lastSyncedAt: row?.last_synced_at ?? null,
      tools: getProviderToolNames(provider),
    };
  });
}

export async function refreshConnectionsForUser(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('composio_connections')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'active']);

  if (error) {
    logger.warn('Failed to load composio connections for refresh', { userId, error: error.message });
    return;
  }

  await Promise.all(
    ((data ?? []) as ComposioConnectionRecord[])
      .filter((row) => COMPOSIO_PROVIDERS.includes(row.provider))
      .map((row) => refreshConnectionStatus(userId, row.provider).catch((refreshError) => {
        logger.warn('Composio connection refresh skipped', {
          userId,
          provider: row.provider,
          message: refreshError instanceof Error ? refreshError.message : String(refreshError),
        });
      }))
  );
}

export async function initiateConnection(params: {
  userId: string;
  provider: ComposioProvider;
  redirectUri: string;
}): Promise<{ redirectUrl: string }> {
  const { userId, provider, redirectUri } = params;
  const sdk = getSdk();
  const composioUserId = userIdFor(userId);
  const authConfigId = await resolveAuthConfigId(provider);

  let connectionRequest: any;
  try {
    connectionRequest = await sdk.connectedAccounts.initiate(composioUserId, authConfigId, {
      callbackUrl: redirectUri,
    } as any);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Composio initiateConnection failed', { userId, provider, message });
    throw new Error(`Could not start ${PROVIDER_LABEL[provider]} connection: ${message}`);
  }

  const redirectUrl: string | undefined = connectionRequest?.redirectUrl ?? connectionRequest?.redirect_url;
  const connectedAccountId: string | undefined = connectionRequest?.id ?? connectionRequest?.connectedAccountId ?? connectionRequest?.connected_account_id;
  if (!redirectUrl) {
    throw new Error(`Composio did not return a redirect URL for ${PROVIDER_LABEL[provider]}`);
  }

  const nowIso = new Date().toISOString();
  await supabase
    .from('composio_connections')
    .upsert(
      {
        user_id: userId,
        provider,
        composio_entity_id: composioUserId,
        composio_connected_account_id: connectedAccountId ?? null,
        composio_integration_id: authConfigId,
        status: 'pending',
        updated_at: nowIso,
      },
      { onConflict: 'user_id,provider' }
    );

  return { redirectUrl };
}

export async function refreshConnectionStatus(userId: string, provider: ComposioProvider): Promise<ComposioConnectionRecord | null> {
  const row = await getConnectionRow(userId, provider);
  if (!row) return row;

  try {
    const sdk = getSdk();
    const account: any = row.composio_connected_account_id
      ? await sdk.connectedAccounts.get(row.composio_connected_account_id)
      : await findRemoteConnection(userId, provider, row.composio_integration_id);

    if (!account) return row;

    const connectedAccountId = account?.id ?? row.composio_connected_account_id ?? null;
    const nextStatus = normalizeRemoteStatus(account?.status, row.status);
    const accountLabel = accountLabelFromRemote(account, row.account_label);

    if (
      nextStatus !== row.status
      || accountLabel !== row.account_label
      || connectedAccountId !== row.composio_connected_account_id
    ) {
      await supabase
        .from('composio_connections')
        .update({
          composio_connected_account_id: connectedAccountId,
          status: nextStatus,
          account_label: accountLabel,
          metadata: {
            ...(row.metadata ?? {}),
            remoteStatus: account?.status ?? null,
            statusReason: account?.status_reason ?? null,
            toolkit: account?.toolkit?.slug ?? PROVIDER_TO_TOOLKIT[provider],
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    }

    return {
      ...row,
      composio_connected_account_id: connectedAccountId,
      status: nextStatus,
      account_label: accountLabel,
    };
  } catch (error) {
    logger.warn('Composio refreshConnectionStatus failed', {
      userId,
      provider,
      message: error instanceof Error ? error.message : String(error),
    });
    return row;
  }
}

export async function revokeConnection(userId: string, provider: ComposioProvider): Promise<void> {
  const row = await getConnectionRow(userId, provider);
  if (!row) return;

  if (row.composio_connected_account_id) {
    try {
      const sdk = getSdk();
      await sdk.connectedAccounts.delete(row.composio_connected_account_id);
    } catch (error) {
      logger.warn('Composio revoke remote delete failed', {
        userId,
        provider,
        message: error instanceof Error ? error.message : String(error),
      });
      // Continue — still remove local record so user can reconnect.
    }
  }

  await supabase
    .from('composio_connections')
    .delete()
    .eq('id', row.id);
}
