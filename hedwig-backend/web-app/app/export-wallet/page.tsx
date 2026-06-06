'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useExportWallet, useLoginWithOAuth, usePrivy, useWallets } from '@privy-io/react-auth';
import { ArrowLeft, Key, Lock, SpinnerGap, Warning } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';

function getWalletLabel(address?: string | null) {
  if (!address) return 'Embedded wallet';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function getExportError(error: unknown) {
  const message =
    typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Could not open the wallet export screen.';

  if (/not authenticated|must be authenticated/i.test(message)) return 'Please sign in first, then try exporting again.';
  if (/does not have an embedded wallet|must have an embedded wallet/i.test(message)) return 'This account does not have an embedded Ethereum wallet to export.';
  return message;
}

export default function ExportWalletPage() {
  const { authenticated, ready } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();
  const { wallets, ready: walletsReady } = useWallets();
  const { exportWallet } = useExportWallet();
  const autoStarted = useRef(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');

  const embeddedWallet = useMemo(
    () => wallets.find((wallet) => wallet.walletClientType === 'privy' && wallet.address),
    [wallets],
  );

  const openExport = useCallback(async () => {
    setError('');

    if (!ready) return;
    if (!authenticated) {
      setError('Sign in with the same account you used in the mobile app, then export again.');
      return;
    }

    if (!walletsReady) return;
    if (!embeddedWallet?.address) {
      setError('This account does not have an embedded Ethereum wallet to export.');
      return;
    }

    setIsExporting(true);
    try {
      await exportWallet({ address: embeddedWallet.address });
    } catch (err) {
      setError(getExportError(err));
    } finally {
      setIsExporting(false);
    }
  }, [authenticated, embeddedWallet?.address, exportWallet, ready, walletsReady]);

  useEffect(() => {
    if (autoStarted.current) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('auto') !== '1') return;
    if (!ready || !walletsReady) return;
    autoStarted.current = true;
    void openExport();
  }, [openExport, ready, walletsReady]);

  return (
    <main className="min-h-screen bg-[var(--color-surface-secondary)] px-5 py-8 text-[var(--color-foreground)]">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[520px] flex-col justify-center">
        <Link href="/settings" className="mb-5 inline-flex w-fit items-center gap-2 text-[13px] font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-foreground)]">
          <ArrowLeft className="h-4 w-4" weight="bold" />
          Back to settings
        </Link>

        <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
          <div className="border-b border-[var(--color-surface-tertiary)] px-6 py-5">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-accent-soft)]">
              <Key className="h-5 w-5 text-[var(--color-primary)]" weight="bold" />
            </div>
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Wallet security</p>
            <h1 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">Export private key</h1>
            <p className="mt-2 text-[14px] leading-6 text-[var(--color-text-tertiary)]">
              Privy opens the export screen in a secure modal. Hedwig never sees or stores your private key.
            </p>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-4">
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" weight="bold" />
                <div>
                  <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">
                    {authenticated ? getWalletLabel(embeddedWallet?.address) : 'Sign in required'}
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--color-text-tertiary)]">
                    Only export on a private device. Anyone with this key can move funds from the wallet.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] px-3 py-2.5 text-[13px] text-[var(--color-danger)]">
                <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="bold" />
                <span>{error}</span>
              </div>
            )}

            {!authenticated ? (
              <div className="space-y-2">
                <Button className="w-full" onClick={() => initOAuth({ provider: 'apple' })} disabled={!ready}>
                  Continue with Apple
                </Button>
                <Button className="w-full" variant="secondary" onClick={() => initOAuth({ provider: 'google' })} disabled={!ready}>
                  Continue with Google
                </Button>
              </div>
            ) : (
              <Button className="w-full" onClick={openExport} disabled={!ready || isExporting}>
                {isExporting || !ready ? <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" /> : <Key className="h-4 w-4" weight="bold" />}
                {!ready ? 'Loading…' : 'Open export screen'}
              </Button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
