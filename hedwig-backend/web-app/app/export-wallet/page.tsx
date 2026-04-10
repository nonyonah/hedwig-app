'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useExportWallet } from '@privy-io/react-auth/solana';
import {
  ArrowLeft,
  CaretDown,
  Check,
  Key,
  SpinnerGap,
  Warning,
} from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast-provider';
import { cn } from '@/lib/utils';

type ChainType = 'ethereum' | 'solana';

const CHAINS: Record<ChainType, { label: string; icon: string }> = {
  ethereum: { label: 'EVM', icon: '/icons/tokens/eth.png' },
  solana:   { label: 'Solana', icon: '/icons/networks/solana.png' },
};

function truncateAddress(address?: string) {
  if (!address) return null;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function ExportWalletPage() {
  const { ready, authenticated, user, exportWallet: exportEthereumWallet } = usePrivy();
  const { exportWallet: exportSolanaWallet } = useExportWallet();
  const { toast } = useToast();

  const [selectedChain, setSelectedChain] = useState<ChainType>('ethereum');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const ethereumWallet = useMemo(
    () => user?.linkedAccounts.find(
      (a) => a.type === 'wallet' && a.walletClientType === 'privy' && a.chainType === 'ethereum'
    ),
    [user]
  );

  const solanaWallet = useMemo(
    () => user?.linkedAccounts.find(
      (a) => a.type === 'wallet' && a.walletClientType === 'privy' && a.chainType === 'solana'
    ),
    [user]
  );

  const selectedWallet = selectedChain === 'ethereum' ? ethereumWallet : solanaWallet;
  const selectedAddress = selectedWallet && 'address' in selectedWallet ? String((selectedWallet as any).address || '') : '';

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
      setError(err?.message || 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-white px-6 py-10">
      <div className="mx-auto w-full max-w-[400px]">

        {/* Back */}
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-8 text-[#a4a7ae] hover:text-[#717680]">
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" weight="bold" />
            Settings
          </Link>
        </Button>

        {/* Header */}
        <div className="mb-8">
          <Image src="/hedwig-logo.png" alt="Hedwig" width={32} height={32} priority />
          <h1 className="mt-6 text-[22px] font-bold tracking-[-0.02em] text-[#181d27]">Export private key</h1>
          <p className="mt-1.5 text-[14px] text-[#a4a7ae]">Save your key somewhere only you can access it.</p>
        </div>

        {/* Loading */}
        {!ready && (
          <div className="flex items-center gap-2.5 text-[14px] text-[#a4a7ae]">
            <SpinnerGap className="h-4 w-4 animate-spin text-[#2563eb]" weight="bold" />
            Please wait…
          </div>
        )}

        {ready && !authenticated && (
          <div className="space-y-4">
            <p className="text-[14px] text-[#717680]">Sign in to access your embedded wallets.</p>
            <Button asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        )}

        {ready && authenticated && (
          <div className="space-y-5">
            {/* Warning */}
            <div className="flex items-start gap-2.5 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3.5 py-3">
              <Warning className="mt-0.5 h-4 w-4 shrink-0 text-[#92400e]" weight="fill" />
              <p className="text-[12px] leading-5 text-[#b45309]">
                Never share your private key. Anyone who has it has full control of your funds.
              </p>
            </div>

            {/* Chain dropdown */}
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-[#414651]">Network</label>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((p) => !p)}
                  className="flex h-10 w-full items-center justify-between rounded-xl border border-[#e9eaeb] bg-white px-3.5 text-left transition focus:border-[#2563eb] focus:outline-none focus:ring-3 focus:ring-[#2563eb]/10 hover:border-[#d0d5dd]"
                >
                  <span className="flex items-center gap-2.5">
                    <Image
                      alt={CHAINS[selectedChain].label}
                      src={CHAINS[selectedChain].icon}
                      width={18}
                      height={18}
                      className="rounded-full"
                    />
                    <span className="text-[14px] text-[#181d27]">{CHAINS[selectedChain].label}</span>
                    {selectedAddress && (
                      <span className="text-[12px] text-[#c1c5cd]">{truncateAddress(selectedAddress)}</span>
                    )}
                  </span>
                  <CaretDown className="h-4 w-4 text-[#c1c5cd]" weight="bold" />
                </button>

                {dropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-xl border border-[#e9eaeb] bg-white py-1 shadow-lg shadow-black/5">
                      {(Object.entries(CHAINS) as [ChainType, { label: string; icon: string }][]).map(([chain, ui]) => {
                        const wallet = chain === 'ethereum' ? ethereumWallet : solanaWallet;
                        const address = wallet && 'address' in wallet ? String((wallet as any).address || '') : '';
                        const active = selectedChain === chain;
                        return (
                          <button
                            key={chain}
                            type="button"
                            onClick={() => { setSelectedChain(chain); setError(null); setDropdownOpen(false); }}
                            className="flex w-full items-center justify-between px-3.5 py-2.5 transition hover:bg-[#f9fafb]"
                          >
                            <span className="flex items-center gap-2.5">
                              <Image alt={ui.label} src={ui.icon} width={18} height={18} className="rounded-full" />
                              <span className="text-[14px] text-[#181d27]">{ui.label}</span>
                              {address && (
                                <span className="text-[12px] text-[#c1c5cd]">{truncateAddress(address)}</span>
                              )}
                            </span>
                            {active && <Check className="h-3.5 w-3.5 text-[#2563eb]" weight="bold" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="rounded-lg border border-[#fda29b] bg-[#fef3f2] px-3 py-2 text-[12px] text-[#b42318]">
                {error}
              </p>
            )}

            {/* Export */}
            <Button
              className="w-full"
              onClick={handleExport}
              disabled={!selectedAddress || exporting}
            >
              {exporting
                ? <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" />
                : <Key className="h-4 w-4" weight="bold" />
              }
              {exporting ? 'Please wait…' : `Export ${CHAINS[selectedChain].label} key`}
            </Button>

            <p className="text-center text-[12px] text-[#c1c5cd]">
              Store the exported key in a password manager or secure offline location.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
