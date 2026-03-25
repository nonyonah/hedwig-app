'use client';

import Image from 'next/image';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, ShareNetwork } from '@/components/ui/lucide-icons';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';

type Chain = 'Base' | 'Solana';

const chainMeta: Record<Chain, { icon: string; color: string }> = {
  Base:   { icon: '/icons/networks/base.png', color: '#0052ff' },
  Solana: { icon: '/icons/networks/solana.png', color: '#9945ff' }
};

export function ShareWalletDialog({
  baseAddress,
  solanaAddress
}: {
  baseAddress?: string | null;
  solanaAddress?: string | null;
}) {
  const availableChains: Chain[] = [
    ...(baseAddress   ? ['Base'   as Chain] : []),
    ...(solanaAddress ? ['Solana' as Chain] : [])
  ];

  const [open, setOpen] = useState(false);
  const [activeChain, setActiveChain] = useState<Chain>(availableChains[0] ?? 'Base');
  const [copied, setCopied] = useState(false);

  if (availableChains.length === 0) return null;

  const address = activeChain === 'Base' ? baseAddress : solanaAddress;
  const meta = chainMeta[activeChain];

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-[#d5d7da] bg-white px-4 py-2 text-[13px] font-semibold text-[#414651] shadow-xs transition duration-100 hover:bg-[#fafafa]"
      >
        <ShareNetwork className="h-4 w-4" weight="bold" />
        Share address
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Your wallet address</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-5">
            {/* Chain segmented control */}
            {availableChains.length > 1 && (
              <div className="flex items-center gap-1 rounded-full border border-[#e9eaeb] bg-[#f5f5f5] p-1">
                {availableChains.map((chain) => {
                  const isActive = activeChain === chain;
                  return (
                    <button
                      key={chain}
                      type="button"
                      onClick={() => setActiveChain(chain)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-[13px] font-semibold transition duration-100 ${
                        isActive
                          ? 'bg-white text-[#181d27] shadow-xs'
                          : 'text-[#717680] hover:text-[#414651]'
                      }`}
                    >
                      <Image src={chainMeta[chain].icon} alt={chain} width={16} height={16} className="rounded-full" />
                      {chain}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Single chain label when only one */}
            {availableChains.length === 1 && (
              <div className="flex items-center gap-2">
                <Image src={meta.icon} alt={activeChain} width={20} height={20} className="rounded-full" />
                <span className="text-[14px] font-semibold text-[#181d27]">{activeChain} network</span>
              </div>
            )}

            {/* QR code */}
            <div className="flex items-center justify-center rounded-2xl border border-[#e9eaeb] bg-white p-6">
              {address ? (
                <QRCodeSVG
                  value={address}
                  size={200}
                  fgColor="#181d27"
                  bgColor="transparent"
                  level="M"
                />
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center text-[12px] text-[#a4a7ae]">
                  No address connected
                </div>
              )}
            </div>

            {/* Wallet address display */}
            <div className="overflow-hidden rounded-2xl border border-[#e9eaeb] bg-[#fafafa]">
              <div className="flex items-center gap-2 border-b border-[#e9eaeb] px-4 py-2.5">
                <Image src={meta.icon} alt={activeChain} width={14} height={14} className="rounded-full" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                  {activeChain} address
                </span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <p className="flex-1 break-all font-mono text-[12px] leading-relaxed text-[#414651]">
                  {address ?? 'Not connected'}
                </p>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!address}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e9eaeb] bg-white shadow-xs transition duration-100 hover:bg-[#f5f5f5] disabled:opacity-40"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-[#12b76a]" weight="bold" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-[#717680]" weight="bold" />
                  )}
                </button>
              </div>
            </div>

            <p className="text-[12px] leading-relaxed text-[#a4a7ae]">
              Only send USDC or supported tokens on the {activeChain} network to this address. Sending unsupported assets may result in permanent loss.
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
