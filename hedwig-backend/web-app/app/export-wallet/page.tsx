'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useExportWallet } from '@privy-io/react-auth/solana';
import {
  ArrowLeft,
  ArrowSquareOut,
  CheckCircle,
  Copy,
  Key,
  Lock,
  ShieldCheck,
  SignIn,
  SpinnerGap,
  Warning
} from '@/components/ui/lucide-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

type ChainType = 'ethereum' | 'solana';

const CHAIN_UI: Record<ChainType, { label: string; subtitle: string; icon: string }> = {
  ethereum: {
    label: 'Base wallet',
    subtitle: 'Embedded EVM wallet used for Base activity',
    icon: '/icons/networks/base.png'
  },
  solana: {
    label: 'Solana wallet',
    subtitle: 'Embedded wallet used for Solana activity',
    icon: '/icons/networks/solana.png'
  }
};

function truncateAddress(address?: string | null) {
  if (!address) return 'Not available';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function ExportWalletPage() {
  const { ready, authenticated, login, user, exportWallet: exportEthereumWallet } = usePrivy();
  const { exportWallet: exportSolanaWallet } = useExportWallet();
  const { toast } = useToast();

  const [selectedChain, setSelectedChain] = useState<ChainType>('ethereum');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ethereumWallet = useMemo(
    () => user?.linkedAccounts.find(
      (account) =>
        account.type === 'wallet' &&
        account.walletClientType === 'privy' &&
        account.chainType === 'ethereum'
    ),
    [user]
  );

  const solanaWallet = useMemo(
    () => user?.linkedAccounts.find(
      (account) =>
        account.type === 'wallet' &&
        account.walletClientType === 'privy' &&
        account.chainType === 'solana'
    ),
    [user]
  );

  const selectedWallet = selectedChain === 'ethereum' ? ethereumWallet : solanaWallet;
  const selectedAddress = selectedWallet && 'address' in selectedWallet ? String((selectedWallet as any).address || '') : '';
  const hasSelectedWallet = Boolean(selectedAddress);

  const copyAddress = async () => {
    if (!selectedAddress) return;
    try {
      await navigator.clipboard.writeText(selectedAddress);
      toast({ type: 'success', title: 'Address copied', message: `${CHAIN_UI[selectedChain].label} copied to clipboard.` });
    } catch {
      toast({ type: 'error', title: 'Could not copy address', message: 'Copy the wallet address manually instead.' });
    }
  };

  const handleExport = async () => {
    setError(null);
    setExporting(true);
    try {
      if (selectedChain === 'ethereum') {
        await exportEthereumWallet();
      } else {
        await exportSolanaWallet();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to export wallet. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#fafafa] px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings">
              <ArrowLeft className="h-4 w-4" weight="bold" />
              Back to settings
            </Link>
          </Button>

          <div className="flex items-center gap-3 rounded-full border border-[#e9eaeb] bg-white px-4 py-2 shadow-xs">
            <Image alt="Hedwig" className="h-6 w-6 rounded-full" height={24} src="/hedwig-icon.png" width={24} />
            <span className="text-[13px] font-semibold text-[#414651]">Hedwig wallet recovery</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
          <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
            <div className="border-b border-[#f2f4f7] px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">Security</p>
              <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[#181d27]">Export embedded wallet</h1>
              <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#717680]">
                Export your wallet only when you’re ready to store the private key offline. This gives full control of your funds to whoever holds it.
              </p>
            </div>

            <div className="space-y-5 p-6">
              <div className="rounded-2xl border border-[#fddcab] bg-[#fffaeb] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#717680] ring-1 ring-[#fedf89]">
                    <Warning className="h-5 w-5" weight="fill" />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-[#717680]">Never share your private key</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#717680]">
                      Hedwig support, clients, and partners will never ask for it. Save it in a password manager or another secure offline location.
                    </p>
                  </div>
                </div>
              </div>

              {!ready ? (
                <div className="flex items-center gap-3 rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] px-4 py-4 text-[14px] font-medium text-[#414651]">
                  <SpinnerGap className="h-4 w-4 animate-spin text-[#717680]" weight="bold" />
                  Preparing secure wallet recovery…
                </div>
              ) : !authenticated ? (
                <div className="rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eff4ff] text-[#717680]">
                      <SignIn className="h-5 w-5" weight="fill" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-[#181d27]">Sign in to continue</p>
                      <p className="mt-1 text-[13px] leading-5 text-[#717680]">
                        Use the same Hedwig identity you use on mobile to access wallet recovery.
                      </p>
                    </div>
                  </div>
                  <Button className="mt-4" onClick={login}>
                    <SignIn className="h-4 w-4" weight="bold" />
                    Sign in with Privy
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(Object.keys(CHAIN_UI) as ChainType[]).map((chain) => {
                      const chainWallet = chain === 'ethereum' ? ethereumWallet : solanaWallet;
                      const address = chainWallet && 'address' in chainWallet ? String((chainWallet as any).address || '') : '';
                      const active = selectedChain === chain;

                      return (
                        <button
                          key={chain}
                          type="button"
                          onClick={() => setSelectedChain(chain)}
                          className={cn(
                            'rounded-2xl border px-4 py-4 text-left transition duration-100',
                            active
                              ? 'border-[#2563eb] bg-[#eff4ff] shadow-xs'
                              : 'border-[#e9eaeb] bg-[#fcfcfd] hover:border-[#d0d5dd]'
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white ring-1 ring-[#e9eaeb]">
                                <Image alt={CHAIN_UI[chain].label} height={22} src={CHAIN_UI[chain].icon} width={22} />
                              </div>
                              <div>
                                <p className="text-[14px] font-semibold text-[#181d27]">{CHAIN_UI[chain].label}</p>
                                <p className="mt-1 text-[12px] leading-5 text-[#717680]">{CHAIN_UI[chain].subtitle}</p>
                              </div>
                            </div>
                            <Badge variant={address ? 'success' : 'neutral'}>{address ? 'Available' : 'Unavailable'}</Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white ring-1 ring-[#e9eaeb]">
                          <Image alt={CHAIN_UI[selectedChain].label} height={22} src={CHAIN_UI[selectedChain].icon} width={22} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-[15px] font-semibold text-[#181d27]">{CHAIN_UI[selectedChain].label}</p>
                            <Badge variant={hasSelectedWallet ? 'success' : 'neutral'}>{hasSelectedWallet ? 'Ready' : 'Missing'}</Badge>
                          </div>
                          <p className="mt-1 text-[13px] leading-5 text-[#717680]">{truncateAddress(selectedAddress)}</p>
                        </div>
                      </div>

                      {hasSelectedWallet ? (
                        <Button variant="secondary" size="sm" onClick={copyAddress}>
                          <Copy className="h-4 w-4" weight="bold" />
                          Copy address
                        </Button>
                      ) : null}
                    </div>

                    {error ? (
                      <div className="mt-4 rounded-2xl border border-[#fda29b] bg-[#fef3f2] px-4 py-3 text-[13px] text-[#717680]">
                        {error}
                      </div>
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button onClick={handleExport} disabled={!hasSelectedWallet || exporting}>
                        {exporting ? <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" /> : <Key className="h-4 w-4" weight="bold" />}
                        {exporting ? 'Exporting…' : 'Export private key'}
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <a href="https://support.privy.io/hc/en-us/articles/what-does-exporting-a-wallet-mean" rel="noreferrer" target="_blank">
                          <ArrowSquareOut className="h-4 w-4" weight="bold" />
                          Learn more
                        </a>
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
              <div className="border-b border-[#f2f4f7] px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">What happens next</p>
                <h2 className="mt-2 text-[17px] font-semibold text-[#181d27]">Recovery checklist</h2>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex items-start gap-3 rounded-2xl border border-[#f2f4f7] bg-[#fcfcfd] p-4">
                  <CheckCircle className="mt-0.5 h-5 w-5 text-[#717680]" weight="fill" />
                  <div>
                    <p className="text-[14px] font-semibold text-[#181d27]">Confirm the correct chain</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#717680]">Choose Base or Solana before exporting so you recover the wallet you actually use.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border border-[#f2f4f7] bg-[#fcfcfd] p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-[#717680]" weight="fill" />
                  <div>
                    <p className="text-[14px] font-semibold text-[#181d27]">Store the key offline</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#717680]">Use a password manager or another offline method that only you control.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border border-[#f2f4f7] bg-[#fcfcfd] p-4">
                  <Lock className="mt-0.5 h-5 w-5 text-[#525866]" weight="fill" />
                  <div>
                    <p className="text-[14px] font-semibold text-[#181d27]">Return only when you’re done</p>
                    <p className="mt-1 text-[13px] leading-5 text-[#717680]">Once exported, treat that key as permanent recovery material and keep it out of shared channels.</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
              <div className="border-b border-[#f2f4f7] px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">Availability</p>
                <h2 className="mt-2 text-[17px] font-semibold text-[#181d27]">Embedded wallets in this account</h2>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex items-center justify-between rounded-2xl border border-[#f2f4f7] bg-[#fcfcfd] px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <Image alt="Base" height={20} src="/icons/networks/base.png" width={20} />
                    <span className="text-[14px] font-semibold text-[#181d27]">Base</span>
                  </div>
                  <Badge variant={ethereumWallet ? 'success' : 'neutral'}>{ethereumWallet ? 'Connected' : 'Missing'}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-[#f2f4f7] bg-[#fcfcfd] px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <Image alt="Solana" height={20} src="/icons/networks/solana.png" width={20} />
                    <span className="text-[14px] font-semibold text-[#181d27]">Solana</span>
                  </div>
                  <Badge variant={solanaWallet ? 'success' : 'neutral'}>{solanaWallet ? 'Connected' : 'Missing'}</Badge>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
