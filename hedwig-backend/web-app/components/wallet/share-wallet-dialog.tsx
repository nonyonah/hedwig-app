'use client';

import Image from 'next/image';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, ShareNetwork } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';

type Chain = 'Base' | 'Solana';
type ReceiveMode = Chain;

const chainMeta: Record<Chain, { icon: string; color: string }> = {
  Base:    { icon: '/icons/networks/base.png', color: '#0052ff' },
  Solana:  { icon: '/icons/networks/solana.png', color: '#9945ff' },
};

export function ShareWalletDialog({
  baseAddress,
  solanaAddress,
}: {
  baseAddress?: string | null;
  solanaAddress?: string | null;
}) {
  const receiveModes: Chain[] = [
    ...(baseAddress    ? ['Base'    as Chain] : []),
    ...(solanaAddress  ? ['Solana'  as Chain] : []),
  ];

  const [open, setOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<ReceiveMode>(receiveModes[0] ?? 'Base');
  const [copied, setCopied] = useState(false);

  if (receiveModes.length === 0) return null;

  const activeChain = activeMode;
  const address = activeChain === 'Base' ? baseAddress
    : activeChain === 'Solana' ? solanaAddress
    : null;
  const meta = chainMeta[activeChain];

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <ShareNetwork className="h-4 w-4" weight="bold" />
        Receive
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Receive funds</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-5">
            {receiveModes.length > 1 && (
              <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-1">
                {receiveModes.map((mode) => {
                  const isActive = activeMode === mode;
                  const meta = chainMeta[mode];
                  return (
                    <Button
                      key={mode}
                      variant={isActive ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setActiveMode(mode)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-[13px] font-semibold transition duration-100 ${
                        isActive
                          ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-xs'
                          : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                      }`}
                    >
                      <Image src={meta.icon} alt={mode} width={16} height={16} className="rounded-full" />
                      {mode}
                    </Button>
                  );
                })}
              </div>
            )}

            {activeChain && meta && receiveModes.length === 1 ? (
              <div className="flex items-center gap-2">
                <Image src={meta.icon} alt={activeChain} width={20} height={20} className="rounded-full" />
                <span className="text-[14px] font-semibold text-[var(--color-foreground)]">{activeChain} network</span>
              </div>
            ) : null}

            <div className="flex items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              {address ? (
                <QRCodeSVG
                  value={address}
                  size={200}
                  fgColor="#181d27"
                  bgColor="transparent"
                  level="M"
                />
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center text-[12px] text-[var(--color-text-muted)]">
                  No address connected
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
                {meta ? <Image src={meta.icon} alt={activeChain ?? ''} width={14} height={14} className="rounded-full" /> : null}
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                  {activeChain} address
                </span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <p className="flex-1 break-all font-mono text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
                  {address ?? 'Not connected'}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!address}
                  className="h-8 w-8 rounded-full"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" weight="bold" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" weight="bold" />
                  )}
                </Button>
              </div>
            </div>

            <p className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">
              Only send USDC or supported tokens on the {activeChain} network to this address. Sending unsupported assets may result in permanent loss.
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
