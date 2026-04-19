'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/providers/toast-provider';

type IntegrationProvider = 'gmail' | 'google_calendar' | 'slack';

interface Integration {
  id: string;
  provider: IntegrationProvider;
  status: 'connected' | 'error' | 'token_expired';
  provider_email: string | null;
  last_synced_at: string | null;
}

const INTEGRATION_META: Record<IntegrationProvider, { label: string; description: string; iconPath: string }> = {
  gmail: {
    label: 'Gmail',
    description: 'Sync emails and match them to invoices, contracts, and clients.',
    iconPath: '/icons/gmail.svg',
  },
  google_calendar: {
    label: 'Google Calendar',
    description: 'Pull upcoming meetings and match them to your projects.',
    iconPath: '/icons/google-calendar.svg',
  },
  slack: {
    label: 'Slack',
    description: 'Receive payment and invoice notifications in Slack.',
    iconPath: '/icons/slack.svg',
  },
};

const PROVIDERS: IntegrationProvider[] = ['gmail', 'google_calendar', 'slack'];

export function IntegrationsClient({ accessToken }: { accessToken: string | null }) {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<IntegrationProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<IntegrationProvider | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<IntegrationProvider | null>(null);

  const loadIntegrations = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const resp = await fetch('/api/integrations/status');
      const data = await resp.json() as { success: boolean; data: Integration[] };
      if (data.success) setIntegrations(data.data ?? []);
    } catch {
      // non-fatal
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadIntegrations();
  }, [accessToken]);

  useEffect(() => {
    const connected = searchParams.get('integration_connected');
    const error = searchParams.get('integration_error');
    if (connected) {
      toast({ type: 'success', title: `${INTEGRATION_META[connected as IntegrationProvider]?.label ?? connected} connected` });
      void loadIntegrations();
    }
    if (error) {
      toast({ type: 'error', title: 'Integration failed', message: error.replace(/_/g, ' ') });
    }
  }, [searchParams]);

  const connectIntegration = (provider: IntegrationProvider) => {
    setConnectingProvider(provider);
    window.location.assign(`/api/integrations/connect?provider=${provider}`);
  };

  const disconnectIntegration = async (provider: IntegrationProvider) => {
    setDisconnectingProvider(provider);
    try {
      await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      await loadIntegrations();
      toast({ type: 'success', title: `${INTEGRATION_META[provider].label} disconnected` });
    } catch {
      toast({ type: 'error', title: 'Could not disconnect', message: 'Please try again.' });
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const syncIntegration = async (provider: IntegrationProvider) => {
    setSyncingProvider(provider);
    try {
      await fetch('/api/integrations/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      toast({ type: 'info', title: 'Sync started', message: 'Your data will appear shortly.' });
      setTimeout(() => void loadIntegrations(), 3000);
    } catch {
      toast({ type: 'error', title: 'Sync failed', message: 'Please try again.' });
    } finally {
      setSyncingProvider(null);
    }
  };

  const getConnected = (provider: IntegrationProvider) =>
    integrations.find((i) => i.provider === provider);

  return (
    <div className="mx-auto max-w-[900px] px-6 py-8">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[#181d27]">Integrations</h1>
        <p className="mt-1 text-[13px] text-[#717680]">
          Connect your tools to sync emails, meetings, and notifications.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[180px] animate-pulse rounded-2xl bg-[#f2f4f7]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {PROVIDERS.map((provider) => {
            const meta = INTEGRATION_META[provider];
            const connected = getConnected(provider);
            const isConnecting = connectingProvider === provider;
            const isDisconnecting = disconnectingProvider === provider;
            const isSyncing = syncingProvider === provider;

            const statusDot = connected
              ? connected.status === 'connected'
                ? 'bg-[#12b76a]'
                : 'bg-[#f79009]'
              : 'bg-[#d0d5dd]';

            const statusLabel = connected
              ? connected.status === 'connected'
                ? 'Connected'
                : 'Reconnect needed'
              : 'Not connected';

            return (
              <div
                key={provider}
                className="flex flex-col rounded-2xl border border-[#e9eaeb] bg-white p-5 shadow-xs"
              >
                {/* Icon + status */}
                <div className="flex items-start justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f2f4f7]">
                    <Image
                      src={meta.iconPath}
                      alt={`${meta.label} icon`}
                      width={22}
                      height={22}
                    />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${statusDot}`} />
                    <span className="text-[11px] font-medium text-[#717680]">{statusLabel}</span>
                  </span>
                </div>

                {/* Label + description */}
                <div className="mt-3 flex-1">
                  <p className="text-[14px] font-semibold text-[#181d27]">{meta.label}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#717680]">
                    {connected?.provider_email
                      ? `Syncing as ${connected.provider_email}`
                      : meta.description}
                  </p>
                  {connected?.last_synced_at && (
                    <p className="mt-1 text-[11px] text-[#a4a7ae]">
                      Last sync {new Date(connected.last_synced_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {connected ? (
                    <>
                      {connected.status === 'connected' && provider !== 'slack' && (
                        <button
                          type="button"
                          onClick={() => void syncIntegration(provider)}
                          disabled={isSyncing}
                          className="rounded-full border border-[#d5d7da] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#414651] transition hover:bg-[#f9fafb] disabled:opacity-60"
                        >
                          {isSyncing ? 'Syncing…' : 'Sync now'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void disconnectIntegration(provider)}
                        disabled={isDisconnecting}
                        className="rounded-full border border-[#fda29b] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#b42318] transition hover:bg-[#fff4f2] disabled:opacity-60"
                      >
                        {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => connectIntegration(provider)}
                      disabled={isConnecting}
                      className="rounded-full bg-[#2563eb] px-4 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
                    >
                      {isConnecting ? 'Redirecting…' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
