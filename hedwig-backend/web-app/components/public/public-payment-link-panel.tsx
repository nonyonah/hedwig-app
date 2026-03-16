'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { PublicCheckoutPanel } from '@/components/public/public-checkout-panel';
import type { PublicPaymentToken, PublicSettlementChain } from '@/lib/payments/public-constants';

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(amount || 0);
}

export function PublicPaymentLinkPanel({
  documentId,
  title,
  amount,
  currencyLabel,
  preferredChain,
  token,
  evmMerchantAddress,
  solanaMerchantAddress
}: {
  documentId: string;
  title: string;
  amount: number;
  currencyLabel: string;
  preferredChain: PublicSettlementChain;
  token: PublicPaymentToken;
  evmMerchantAddress?: string | null;
  solanaMerchantAddress?: string | null;
}) {
  const initialChain = useMemo<PublicSettlementChain>(() => {
    if (preferredChain === 'solana' && solanaMerchantAddress && token === 'USDC') return 'solana';
    if (evmMerchantAddress) return 'base';
    if (solanaMerchantAddress && token === 'USDC') return 'solana';
    return preferredChain;
  }, [preferredChain, solanaMerchantAddress, token, evmMerchantAddress]);

  const [selectedChain, setSelectedChain] = useState<PublicSettlementChain>(initialChain);

  const networkLabel = selectedChain === 'solana' ? 'Solana' : 'Base';
  const chainIcon = selectedChain === 'solana' ? '/icons/networks/solana.png' : '/icons/networks/base.png';
  const tokenIcon = token === 'ETH' ? '/icons/tokens/eth.png' : '/icons/tokens/usdc.png';

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#e9eaeb] bg-white p-6 shadow-xs">
        <p className="text-sm font-medium text-[#717680]">Pay now</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[14px] border border-[#e9eaeb] bg-[#fcfcfd] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#717680]">Amount</p>
            <p className="mt-2 text-base font-semibold text-[#181d27]">{formatCurrency(amount)}</p>
          </div>
          <div className="rounded-[14px] border border-[#e9eaeb] bg-[#fcfcfd] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#717680]">Token</p>
            <div className="mt-2 inline-flex items-center gap-2 text-base font-semibold text-[#181d27]">
              <Image src={tokenIcon} alt={token} width={18} height={18} className="rounded-full" />
              {currencyLabel}
            </div>
          </div>
          <div className="rounded-[14px] border border-[#e9eaeb] bg-[#fcfcfd] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#717680]">Network</p>
            <div className="mt-2 inline-flex items-center gap-2 text-base font-semibold text-[#181d27]">
              <Image src={chainIcon} alt={networkLabel} width={18} height={18} className="rounded-full" />
              {networkLabel}
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] p-4">
          <p className="text-sm font-medium text-[#414651]">How to pay</p>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-[#717680]">
            <li>1. Select the network you want to use if more than one payment option is available.</li>
            <li>2. Connect a wallet that holds the token shown for this payment.</li>
            <li>3. Confirm the exact amount and approve the transaction in your wallet.</li>
            <li>4. Wait for the payment confirmation screen before closing this page.</li>
          </ol>
        </div>
      </section>

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
      />
    </div>
  );
}
