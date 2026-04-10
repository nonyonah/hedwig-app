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
  lisk:     { icon: '/icons/networks/lisk.png',     label: 'Lisk' },
};
function getChainMeta(chain: string) {
  return CHAIN_META[chain.toLowerCase()] ?? CHAIN_META['base'];
}

const TOKEN_META: Record<string, { icon: string; label: string }> = {
  USDC: { icon: '/icons/tokens/usdc.png', label: 'USDC' },
  USDT: { icon: '/icons/tokens/usdt.png', label: 'USDT' },
  ETH:  { icon: '/icons/tokens/eth.png',  label: 'ETH' },
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
  isRecurring,
  usdAccount
}: {
  documentId: string;
  amount: number;
  title: string;
  preferredChain: PublicSettlementChain;
  token: PublicPaymentToken;
  evmMerchantAddress?: string | null;
  solanaMerchantAddress?: string | null;
  isRecurring?: boolean;
  usdAccount?: {
    account_number?: string | null;
    routing_number?: string | null;
    bank_name?: string | null;
  } | null;
}) {
  const [selectedChain, setSelectedChain] = useState<PublicSettlementChain>(preferredChain);
  const [selectedToken, setSelectedToken] = useState<PublicPaymentToken>(
    token === 'USDT' ? 'USDT' : 'USDC'
  );

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

      {/* USD bank transfer option */}
      {usdAccount?.account_number && usdAccount?.routing_number ? (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
          <div className="border-b border-[#e9eaeb] px-5 py-4">
            <p className="text-[13px] font-semibold text-[#181d27]">Or pay via bank transfer</p>
            <p className="mt-0.5 text-[12px] text-[#a4a7ae]">Wire / ACH directly to the freelancer's USD account</p>
          </div>
          <div className="divide-y divide-[#f2f4f7] px-5">
            <BankDetailRow label="Bank" value={usdAccount.bank_name || 'Bridge USD account'} />
            <BankDetailRow label="Account #" value={`••••${usdAccount.account_number.slice(-4)}`} mono />
            <BankDetailRow label="Routing #" value={`••••${usdAccount.routing_number.slice(-4)}`} mono />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BankDetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-[12px] text-[#717680]">{label}</span>
      <span className={`text-[13px] font-semibold text-[#181d27] ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</span>
    </div>
  );
}
