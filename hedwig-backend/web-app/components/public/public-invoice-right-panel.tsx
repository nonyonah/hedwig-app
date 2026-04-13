'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Repeat } from '@/components/ui/lucide-icons';
import { PublicCheckoutPanel } from '@/components/public/public-checkout-panel';
import type { PublicPaymentToken, PublicSettlementChain } from '@/lib/payments/public-constants';

const CHAIN_META: Record<string, { icon: string; label: string }> = {
  base:     { icon: '/icons/networks/base.png',     label: 'Base' },
  solana:   { icon: '/icons/networks/solana.png',   label: 'Solana' },
  arbitrum: { icon: '/icons/networks/arbitrum.png', label: 'Arbitrum' },
  polygon:  { icon: '/icons/networks/polygon.png',  label: 'Polygon' },
  celo:     { icon: '/icons/networks/celo.png',     label: 'Celo' },
};
function getChainMeta(chain: string) {
  return CHAIN_META[chain.toLowerCase()] ?? CHAIN_META['base'];
}

const TOKEN_META: Record<string, { icon: string; label: string }> = {
  USDC: { icon: '/icons/tokens/usdc.png', label: 'USDC' },
};

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(amount || 0);
}

export function PublicInvoiceRightPanel({
  documentId,
  amount,
  title,
  preferredChain,
  token,
  evmMerchantAddress,
  solanaMerchantAddress,
  isRecurring
}: {
  documentId: string;
  amount: number;
  title: string;
  preferredChain: PublicSettlementChain;
  token: PublicPaymentToken;
  evmMerchantAddress?: string | null;
  solanaMerchantAddress?: string | null;
  isRecurring?: boolean;
}) {
  const [selectedChain, setSelectedChain] = useState<PublicSettlementChain>(preferredChain);
  const [selectedToken, setSelectedToken] = useState<PublicPaymentToken>('USDC');

  const { icon: chainIcon, label: chainLabel } = getChainMeta(selectedChain);
  const { icon: tokenIcon, label: tokenLabel } = TOKEN_META[selectedToken] ?? TOKEN_META['USDC'];

  return (
    <div className="space-y-4">
      {/* Amount due card */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        <div className="border-b border-[#e9eaeb] bg-[#f8f9fc] px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Amount due</p>
          <p className="mt-1.5 text-[34px] font-bold tracking-[-0.04em] leading-none text-[#181d27]">
            {formatCurrency(amount)}
          </p>
          {isRecurring && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#717680]">
              <Repeat className="h-3 w-3" />
              This is a recurring invoice — auto-generated on a scheduled basis.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 px-5 py-3.5">
          <div className="flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-[#fafafa] px-3 py-1.5 text-[12px] font-medium text-[#414651]">
            <Image src={chainIcon} alt={chainLabel} width={14} height={14} className="rounded-full" />
            {chainLabel}
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-[#fafafa] px-3 py-1.5 text-[12px] font-medium text-[#414651]">
            <Image src={tokenIcon} alt={tokenLabel} width={14} height={14} className="rounded-full" />
            {tokenLabel}
          </div>
        </div>
      </div>

      {/* Checkout widget */}
      <PublicCheckoutPanel
        documentId={documentId}
        amount={amount}
        title={title}
        preferredChain={preferredChain}
        token={token}
        evmMerchantAddress={evmMerchantAddress}
        solanaMerchantAddress={solanaMerchantAddress}
        selectedChain={selectedChain}
        onSelectedChainChange={setSelectedChain}
        selectedToken={selectedToken}
        onSelectedTokenChange={setSelectedToken}
      />
    </div>
  );
}
