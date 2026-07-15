'use client';

import { useCallback, useEffect, useState } from 'react';
import { backendConfig } from '@/lib/auth/config';
import { useToast } from '@/components/providers/toast-provider';
import { SettingsRow } from './settings-row';
import { SettingsSection } from './settings-section';

export function AutoSettlementSection({ accessToken }: { accessToken: string | null }) {
  const [gatewayAutoDepositEnabled, setGatewayAutoDepositEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const loadPref = useCallback(async () => {
    if (!accessToken) return;
    try {
      const resp = await fetch(`${backendConfig.apiBaseUrl}/api/users/preferences`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await resp.json() as { success: boolean; data: { gatewayAutoDepositEnabled: boolean } };
      if (data.success) setGatewayAutoDepositEnabled(data.data.gatewayAutoDepositEnabled ?? false);
    } catch {
      // keep default
    }
  }, [accessToken]);

  useEffect(() => { void loadPref(); }, [loadPref]);

  const handleToggle = async (enabled: boolean) => {
    if (!accessToken) return;
    setGatewayAutoDepositEnabled(enabled);
    setIsSaving(true);
    try {
      const resp = await fetch(`${backendConfig.apiBaseUrl}/api/users/preferences`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ gatewayAutoDepositEnabled: enabled }),
      });
      if (!resp.ok) throw new Error('Save failed');
    } catch {
      setGatewayAutoDepositEnabled(!enabled);
      toast({ type: 'error', title: 'Could not save preference', message: 'Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsSection
      title="Gateway aggregation"
      description="Automatically aggregate USDC from all chains into one unified balance via Circle Gateway."
    >
      <SettingsRow
        label="Auto-aggregation"
        description="When enabled, USDC received on any supported chain is automatically combined into your available Gateway balance."
      >
        <button
          type="button"
          role="switch"
          aria-checked={gatewayAutoDepositEnabled}
          disabled={isSaving}
          onClick={() => void handleToggle(!gatewayAutoDepositEnabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
            gatewayAutoDepositEnabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-input)]'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--color-surface)] shadow-xs transition-transform ${
              gatewayAutoDepositEnabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </SettingsRow>
    </SettingsSection>
  );
}
