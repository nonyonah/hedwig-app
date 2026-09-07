'use client';

import { useCallback, useEffect, useState } from 'react';
import { SendTokenDialog } from '@/components/wallet/send-token-dialog';
import { ShareWalletDialog } from '@/components/wallet/share-wallet-dialog';
import { OfframpModal } from '@/components/wallet/offramp-modal';
import { OnrampModal } from '@/components/wallet/onramp-modal';
import { hedwigApi } from '@/lib/api/client';
import type { WalletAccount, WalletAsset } from '@/lib/models/entities';

export type MoneyAction = 'send' | 'receive' | 'withdraw' | 'fund';

export function openMoneyAction(action: MoneyAction) {
  window.dispatchEvent(new CustomEvent('hedwig:money-action', { detail: action }));
}

/**
 * Global money-action dialogs (Base-only). Mounted once in the app shell so
 * the top-bar Move money menu, account pages, and deep-links all open the
 * same actions in place — no page navigation required.
 */
export function MoneyActionDialogs({
  accessToken,
  onrampAllowed = true,
  offrampAllowed = true,
}: {
  accessToken: string | null;
  onrampAllowed?: boolean;
  offrampAllowed?: boolean;
}) {
  const [action, setAction] = useState<MoneyAction | null>(null);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [gatewayAvailable, setGatewayAvailable] = useState(0);
  const [gatewayPerDomain, setGatewayPerDomain] = useState([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [wallet, gateway] = await Promise.all([
        hedwigApi.wallet({ accessToken }),
        hedwigApi
          .gatewayBalance({ accessToken, disableMockFallback: true })
          .catch(() => ({ available: '0', perDomain: [] })),
      ]);
      setAccounts(wallet?.walletAccounts ?? []);
      setAssets((wallet?.walletAssets ?? []).filter((a) => a.chain === 'Base'));
      setGatewayAvailable(Number((gateway as { available?: string })?.available ?? 0) / 1_000_000 || 0);
      setGatewayPerDomain(((gateway as { perDomain?: [] })?.perDomain ?? []) as []);
    } catch {
      // Dialogs open with empty data rather than failing.
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
    const handler = (e: Event) => {
      const next = (e as CustomEvent<MoneyAction>).detail;
      if (next === 'send' || next === 'receive') {
        void load();
        setAction(next);
      } else if (next === 'withdraw' && offrampAllowed) {
        void load();
        setAction(next);
      } else if (next === 'fund' && onrampAllowed) {
        void load();
        setAction(next);
      }
    };
    window.addEventListener('hedwig:money-action', handler);
    return () => window.removeEventListener('hedwig:money-action', handler);
  }, [load, onrampAllowed, offrampAllowed]);

  const close = () => setAction(null);
  const baseAddress = accounts.find((a) => a.chain === 'Base')?.address ?? null;
  const baseBalance = assets
    .filter((a) => a.symbol.toUpperCase() === 'USDC')
    .reduce((s, a) => s + Number(a.balance ?? 0), 0);

  return (
    <>
      <ShareWalletDialog
        baseAddress={baseAddress}
        solanaAddress={null}
        open={action === 'receive'}
        onOpenChange={(o) => !o && close()}
      />
      <OnrampModal open={action === 'fund'} onClose={close} accessToken={accessToken} />
      <OfframpModal
        open={action === 'withdraw'}
        onClose={close}
        source="personal"
        returnAddress={baseAddress || ''}
        maxAmount={baseBalance}
        chainBalances={{ base: baseBalance }}
        accessToken={accessToken}
        solanaAddress={null}
        baseOnly
      />
      {action === 'send' && (
        <SendTokenDialog
          assets={assets}
          gatewayAvailableUsdc={gatewayAvailable}
          gatewayPerDomain={gatewayPerDomain}
          accessToken={accessToken}
          onClose={close}
          baseOnly
        />
      )}
    </>
  );
}
