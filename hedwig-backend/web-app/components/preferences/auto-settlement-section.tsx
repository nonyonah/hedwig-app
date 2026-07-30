'use client';

import { useCallback, useEffect, useState } from 'react';
import { Switch } from '@heroui/react';
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
        <Switch isSelected={gatewayAutoDepositEnabled} isDisabled={isSaving} onChange={() => void handleToggle(!gatewayAutoDepositEnabled)}>
          <Switch.Control><Switch.Thumb /></Switch.Control>
        </Switch>
      </SettingsRow>
    </SettingsSection>
  );
}
