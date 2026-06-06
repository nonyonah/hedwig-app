'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { PublicCheckoutPanel } from '@/components/public/public-checkout-panel';
import type { PublicPaymentToken, PublicSettlementChain } from '@/lib/payments/public-constants';

const CHAIN_META: Record<string, { icon: string; label: string }> = {
  base:     { icon: '/icons/networks/base.png',     label: 'Base' },
  solana:   { icon: '/icons/networks/solana.png',   label: 'Solana' },
  arbitrum: { icon: '/icons/networks/arbitrum.png', label: 'Arbitrum' },
  polygon:  { icon: '/icons/networks/polygon.png',  label: 'Polygon' },
  optimism: { icon: '/icons/networks/optimism.png', label: 'Optimism' },
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
    if (preferredChain !== 'solana' && evmMerchantAddress) return preferredChain;
    if (evmMerchantAddress) return 'base';
    if (solanaMerchantAddress && token === 'USDC') return 'solana';
    return preferredChain;
  }, [preferredChain, solanaMerchantAddress, token, evmMerchantAddress]);

  const [selectedChain, setSelectedChain] = useState<PublicSettlementChain>(initialChain);
  const [selectedToken, setSelectedToken] = useState<PublicPaymentToken>('USDC');

  const { icon: chainIcon, label: networkLabel } = getChainMeta(selectedChain);
  const { icon: tokenIcon, label: tokenLabel } = TOKEN_META[selectedToken] ?? TOKEN_META['USDC'];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xs">
        <p className="text-sm font-medium text-[var(--color-text-tertiary)]">Pay now</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Amount</p>
            <p className="mt-2 text-base font-semibold text-[var(--color-foreground)]">{formatCurrency(amount)}</p>
          </div>
          <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Token</p>
            <div className="mt-2 inline-flex items-center gap-2 text-base font-semibold text-[var(--color-foreground)]">
              <Image src={tokenIcon} alt={tokenLabel} width={18} height={18} className="rounded-full" />
              {tokenLabel}
            </div>
          </div>
          <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">Network</p>
            <div className="mt-2 inline-flex items-center gap-2 text-base font-semibold text-[var(--color-foreground)]">
              <Image src={chainIcon} alt={networkLabel} width={18} height={18} className="rounded-full" />
              {networkLabel}
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">How to pay</p>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-[var(--color-text-tertiary)]">
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
        selectedToken={selectedToken}
        onSelectedTokenChange={setSelectedToken}
      />
    </div>
  );
}
