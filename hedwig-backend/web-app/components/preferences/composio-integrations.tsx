'use client';

import { useEffect, useState } from 'react';
import { ArrowSquareOut, ArrowsClockwise, WarningCircle } from '@/components/ui/lucide-icons';
import { useToast } from '@/components/providers/toast-provider';
import { extractApiErrorMessage, friendlyErrorMessage } from '@/lib/api/errors';
import { cn, formatShortDate } from '@/lib/utils';

type Provider =
  | 'gmail'
  | 'google_calendar'
  | 'google_drive'
  | 'google_docs';

interface ConnectionView {
  provider: Provider;
  label: string;
  description: string;
  connected: boolean;
  status: 'pending' | 'active' | 'expired' | 'revoked' | 'error' | 'not_connected';
  accountLabel: string | null;
  lastSyncedAt: string | null;
  tools: string[];
}

const ICON_PATH: Record<Provider, string> = {
  gmail: '/icons/gmail.svg',
  google_calendar: '/icons/google-calendar.svg',
  google_drive: '/icons/google-drive.svg',
  google_docs: '/icons/google-docs.svg',
};

const STATUS_CONFIG: Record<
  ConnectionView['status'],
  { label: string; dot: string; text: string; bg: string }
> = {
  active:        { label: 'Connected',     dot: 'bg-[#039855]', text: 'text-[#027a48]', bg: 'bg-[#ecfdf3]' },
  pending:       { label: 'Pending auth',  dot: 'bg-[#f79009]', text: 'text-[#b54708]', bg: 'bg-[#fffaeb]' },
  expired:       { label: 'Expired',       dot: 'bg-[#d92d20]', text: 'text-[#b42318]', bg: 'bg-[#fef3f2]' },
  error:         { label: 'Error',         dot: 'bg-[#d92d20]', text: 'text-[#b42318]', bg: 'bg-[#fef3f2]' },
  revoked:       { label: 'Revoked',       dot: 'bg-[#a4a7ae]', text: 'text-[#717680]', bg: 'bg-[#f2f4f7]' },
  not_connected: { label: 'Not connected', dot: 'bg-[#d0d5dd]', text: 'text-[#717680]', bg: 'bg-[#f9fafb]' },
};

function StatusPill({ status }: { status: ConnectionView['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold', cfg.bg, cfg.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function ComposioIntegrations() {
  const { toast } = useToast();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const resp = await fetch('/api/integrations/composio/status', { cache: 'no-store' });
      const payload = await resp.json();
      if (payload.success) {
        setConfigured(Boolean(payload.data.configured));
        setConnections(payload.data.connections ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleConnect = async (provider: Provider) => {
    setBusy(provider);
    try {
      const resp = await fetch(`/api/integrations/composio/connect/${provider}`, { method: 'POST' });
      const payload = await resp.json();
      if (resp.ok && payload.success && payload.data?.redirectUrl) {
        window.location.assign(payload.data.redirectUrl);
        return;
      }
      toast({ type: 'error', title: 'Could not start connection', message: extractApiErrorMessage(payload, 'Please try again.') });
    } catch (error: any) {
      toast({ type: 'error', title: 'Could not start connection', message: friendlyErrorMessage(error, 'Please try again.') });
    } finally {
      setBusy(null);
    }
  };

  const handleDisconnect = async (provider: Provider) => {
    setBusy(provider);
    try {
      const resp = await fetch(`/api/integrations/composio/connect/${provider}`, { method: 'DELETE' });
      const payload = await resp.json();
      if (resp.ok && payload.success) {
        setConnections(payload.data.connections ?? connections);
        toast({ type: 'success', title: 'Integration disconnected' });
        return;
      }
      toast({ type: 'error', title: 'Could not disconnect', message: extractApiErrorMessage(payload, 'Please try again.') });
    } catch (error: any) {
      toast({ type: 'error', title: 'Could not disconnect', message: friendlyErrorMessage(error, 'Please try again.') });
    } finally {
      setBusy(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Refresh each connected provider's remote status, then reload.
      await Promise.all(
        connections
          .filter((c) => c.status === 'pending' || c.status === 'active')
          .map((c) => fetch(`/api/integrations/composio/refresh/${c.provider}`, { method: 'POST' }).catch(() => null))
      );
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
      <div className="flex items-start justify-between gap-4 border-b border-[#f2f4f7] px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-semibold text-[#181d27]">Workspace integrations</h2>
            <span className="rounded-full bg-[#eff4ff] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2563eb]">Beta</span>
          </div>
          <p className="mt-0.5 text-[13px] text-[#717680]">
            Connect the tools your assistant and agent can read from and act on.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#d5d7da] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#414651] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowsClockwise className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} weight="bold" />
          Refresh
        </button>
      </div>

      {configured === false && (
        <div className="flex items-start gap-2.5 border-b border-[#f2f4f7] bg-[#fffaeb] px-5 py-3">
          <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#b54708]" weight="fill" />
          <p className="text-[12px] text-[#92400e]">
            <span className="font-semibold">Integrations are not configured.</span> Set the integration API key on the backend to enable connections.
          </p>
        </div>
      )}

      <div className="divide-y divide-[#f2f4f7]">
        {(loading ? PLACEHOLDER_CONNECTIONS : connections).map((connection) => (
          <div key={connection.provider} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e9eaeb] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ICON_PATH[connection.provider]} alt={connection.label} className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-semibold text-[#181d27]">{connection.label}</p>
                  <StatusPill status={connection.status} />
                </div>
                <p className="mt-0.5 truncate text-[12px] text-[#717680]">
                  {connection.accountLabel
                    ? connection.accountLabel
                    : connection.description}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[#a4a7ae]">
                  {connection.connected && connection.tools.length > 0 && (
                    <span>
                      {connection.tools.length} tool{connection.tools.length === 1 ? '' : 's'} available to assistant
                    </span>
                  )}
                  {connection.lastSyncedAt && (
                    <span>· Last synced {formatShortDate(connection.lastSyncedAt)}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0">
              {connection.connected ? (
                <button
                  type="button"
                  onClick={() => handleDisconnect(connection.provider)}
                  disabled={busy === connection.provider}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#d5d7da] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#414651] transition hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy === connection.provider ? 'Disconnecting…' : 'Disconnect'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnect(connection.provider)}
                  disabled={busy === connection.provider || configured === false}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#2563eb] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ArrowSquareOut className="h-3.5 w-3.5" weight="bold" />
                  {busy === connection.provider ? 'Opening…' : 'Connect'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const PLACEHOLDER_CONNECTIONS: ConnectionView[] = [
  { provider: 'gmail',           label: 'Gmail',           description: '—', connected: false, status: 'not_connected', accountLabel: null, lastSyncedAt: null, tools: [] },
  { provider: 'google_calendar', label: 'Google Calendar', description: '—', connected: false, status: 'not_connected', accountLabel: null, lastSyncedAt: null, tools: [] },
  { provider: 'google_drive',    label: 'Google Drive',    description: '—', connected: false, status: 'not_connected', accountLabel: null, lastSyncedAt: null, tools: [] },
  { provider: 'google_docs',     label: 'Google Docs',     description: '—', connected: false, status: 'not_connected', accountLabel: null, lastSyncedAt: null, tools: [] },
];
