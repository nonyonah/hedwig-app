'use client';

import Image from 'next/image';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Bank, Check, Copy, ShareNetwork } from '@/components/ui/lucide-icons';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';
import type { UsdAccount } from '@/lib/models/entities';

type Chain = 'Base' | 'Solana';
type ReceiveMode = Chain | 'USD account';

const chainMeta: Record<Chain, { icon: string; color: string }> = {
  Base:   { icon: '/icons/networks/base.png', color: '#0052ff' },
  Solana: { icon: '/icons/networks/solana.png', color: '#9945ff' }
};

export function ShareWalletDialog({
  baseAddress,
  solanaAddress,
  usdAccountsEnabled = false,
  usdAccount
}: {
  baseAddress?: string | null;
  solanaAddress?: string | null;
  usdAccountsEnabled?: boolean;
  usdAccount?: UsdAccount | null;
}) {
  const availableChains: Chain[] = [
    ...(baseAddress   ? ['Base'   as Chain] : []),
    ...(solanaAddress ? ['Solana' as Chain] : [])
  ];
  const receiveModes: ReceiveMode[] = [
    ...availableChains,
    ...(usdAccountsEnabled ? ['USD account' as ReceiveMode] : [])
  ];

  const [open, setOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<ReceiveMode>(receiveModes[0] ?? 'Base');
  const [copied, setCopied] = useState(false);

  if (receiveModes.length === 0) return null;

  const activeChain = activeMode === 'USD account' ? null : activeMode;
  const address = activeChain === 'Base' ? baseAddress : activeChain === 'Solana' ? solanaAddress : null;
  const meta = activeChain ? chainMeta[activeChain] : null;
  const hasAssignedUsdAccount = Boolean(
    usdAccount?.hasAssignedAccount ||
    usdAccount?.accountNumberMasked ||
    usdAccount?.routingNumberMasked
  );

  const handleCopy = () => {
    const value = activeMode === 'USD account'
      ? [
          usdAccount?.bankName ? `Bank: ${usdAccount.bankName}` : null,
          usdAccount?.accountNumberMasked ? `Account: ${usdAccount.accountNumberMasked}` : null,
          usdAccount?.routingNumberMasked ? `Routing: ${usdAccount.routingNumberMasked}` : null,
          usdAccount?.depositMessage ? `Memo / reference: ${usdAccount.depositMessage}` : null
        ].filter(Boolean).join('\n')
      : address;
    if (!value) return;
    navigator.clipboard.writeText(value);
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
        Receive
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Receive funds</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-5">
            {receiveModes.length > 1 && (
              <div className="flex items-center gap-1 rounded-full border border-[#e9eaeb] bg-[#f5f5f5] p-1">
                {receiveModes.map((mode) => {
                  const isActive = activeMode === mode;
                  const isUsd = mode === 'USD account';
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setActiveMode(mode)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-[13px] font-semibold transition duration-100 ${
                        isActive
                          ? 'bg-white text-[#181d27] shadow-xs'
                          : 'text-[#717680] hover:text-[#414651]'
                      }`}
                    >
                      {isUsd ? (
                        <Bank className="h-4 w-4" weight="bold" />
                      ) : (
                        <Image src={chainMeta[mode as Chain].icon} alt={mode} width={16} height={16} className="rounded-full" />
                      )}
                      {mode}
                    </button>
                  );
                })}
              </div>
            )}

            {activeMode === 'USD account' ? (
              <>
                <div className="rounded-2xl border border-[#e9eaeb] bg-[#fafafa] p-5">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-xs">
                    <Bank className="h-5 w-5 text-[#414651]" weight="bold" />
                  </div>
                  <p className="text-[15px] font-semibold text-[#181d27]">
                    {hasAssignedUsdAccount ? 'Receive bank transfers' : 'Set up your USD account'}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#717680]">
                    {hasAssignedUsdAccount
                      ? 'Share these account details with clients who want to pay by bank transfer.'
                      : 'Finish setup to get account and routing details for receiving USD bank transfers.'}
                  </p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white">
                  <div className="flex items-center gap-2 border-b border-[#e9eaeb] px-4 py-2.5">
                    <Bank className="h-3.5 w-3.5 text-[#a4a7ae]" weight="bold" />
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                      {hasAssignedUsdAccount ? 'Account details' : 'Setup reminder'}
                    </span>
                  </div>
                  <div className="space-y-3 px-4 py-3 text-[13px]">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[#717680]">Bank</span>
                      <span className="text-right font-semibold text-[#181d27]">{usdAccount?.bankName || 'Pending setup'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[#717680]">Account number</span>
                      <span className="text-right font-mono text-[#414651]">{usdAccount?.accountNumberMasked || 'Not assigned yet'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[#717680]">Routing number</span>
                      <span className="text-right font-mono text-[#414651]">{usdAccount?.routingNumberMasked || 'Not assigned yet'}</span>
                    </div>
                    {usdAccount?.depositMessage ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[#717680]">Memo / reference</span>
                        <span className="text-right font-mono text-[#414651]">{usdAccount.depositMessage}</span>
                      </div>
                    ) : null}
                  </div>
                  {hasAssignedUsdAccount ? (
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex w-full items-center justify-center gap-2 border-t border-[#e9eaeb] bg-[#fafafa] px-4 py-3 text-[13px] font-semibold text-[#414651] transition hover:bg-[#f5f5f5]"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" weight="bold" /> : <Copy className="h-3.5 w-3.5" weight="bold" />}
                      {copied ? 'Copied' : 'Copy details'}
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                {activeChain && meta && receiveModes.length === 1 ? (
                  <div className="flex items-center gap-2">
                    <Image src={meta.icon} alt={activeChain} width={20} height={20} className="rounded-full" />
                    <span className="text-[14px] font-semibold text-[#181d27]">{activeChain} network</span>
                  </div>
                ) : null}

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

                <div className="overflow-hidden rounded-2xl border border-[#e9eaeb] bg-[#fafafa]">
                  <div className="flex items-center gap-2 border-b border-[#e9eaeb] px-4 py-2.5">
                    {meta ? <Image src={meta.icon} alt={activeChain ?? ''} width={14} height={14} className="rounded-full" /> : null}
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
                        <Check className="h-3.5 w-3.5 text-[#717680]" weight="bold" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-[#717680]" weight="bold" />
                      )}
                    </button>
                  </div>
                </div>

                <p className="text-[12px] leading-relaxed text-[#a4a7ae]">
                  Only send USDC or supported tokens on the {activeChain} network to this address. Sending unsupported assets may result in permanent loss.
                </p>
              </>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
