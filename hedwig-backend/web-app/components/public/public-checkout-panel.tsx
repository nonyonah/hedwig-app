'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { PublicEvmCheckout } from '@/components/public/public-evm-checkout';
import { PublicSolanaCheckout } from '@/components/public/public-solana-checkout';
import type { PublicPaymentToken, PublicSettlementChain } from '@/lib/payments/public-constants';

type AvailableChain = {
  id: PublicSettlementChain;
  label: string;
  icon: string;
};

export function PublicCheckoutPanel({
  documentId,
  amount,
  title,
  preferredChain,
  token,
  evmMerchantAddress,
  solanaMerchantAddress,
  selectedChain,
  onSelectedChainChange
}: {
  documentId: string;
  amount: number;
  title: string;
  preferredChain: PublicSettlementChain;
  token: PublicPaymentToken;
  evmMerchantAddress?: string | null;
  solanaMerchantAddress?: string | null;
  selectedChain?: PublicSettlementChain | null;
  onSelectedChainChange?: (chain: PublicSettlementChain) => void;
}) {
  const availableChains = useMemo<AvailableChain[]>(() => {
    const chains: AvailableChain[] = [];
    if (evmMerchantAddress) {
      chains.push({ id: 'base', label: 'Base', icon: '/icons/networks/base.png' });
    }
    if (solanaMerchantAddress && token === 'USDC') {
      chains.push({ id: 'solana', label: 'Solana', icon: '/icons/networks/solana.png' });
    }
    return chains;
  }, [evmMerchantAddress, solanaMerchantAddress, token]);

  const initialChain = useMemo<PublicSettlementChain | null>(() => {
    if (availableChains.some((chain) => chain.id === preferredChain)) {
      return preferredChain;
    }
    return availableChains[0]?.id || null;
  }, [availableChains, preferredChain]);

  const [internalSelectedChain, setInternalSelectedChain] = useState<PublicSettlementChain | null>(initialChain);
  const activeChain = selectedChain ?? internalSelectedChain;

  const handleChainChange = (chain: PublicSettlementChain) => {
    setInternalSelectedChain(chain);
    onSelectedChainChange?.(chain);
  };

  if (!activeChain || availableChains.length === 0) {
    return (
      <div className="rounded-2xl border border-[#fecdca] bg-[#fef3f2] p-5 shadow-xs">
        <p className="text-[13px] font-semibold text-[#717680]">Merchant wallet unavailable</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#717680]">
          This payment page does not have a supported merchant wallet configured yet. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {availableChains.length > 1 ? (
        <div className="overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white shadow-xs">
          <div className="border-b border-[#e9eaeb] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Choose network</p>
          </div>
          <div className="flex items-center gap-1 p-2">
            {availableChains.map((chain) => {
              const isActive = activeChain === chain.id;
              return (
                <button
                  key={chain.id}
                  type="button"
                  onClick={() => handleChainChange(chain.id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-[13px] font-medium transition ${
                    isActive
                      ? 'bg-[#181d27] text-white shadow-xs'
                      : 'text-[#717680] hover:bg-[#f5f5f5] hover:text-[#414651]'
                  }`}
                >
                  <Image src={chain.icon} alt={chain.label} width={16} height={16} className="rounded-full" />
                  {chain.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeChain === 'solana' ? (
        <PublicSolanaCheckout
          documentId={documentId}
          amount={amount}
          title={title}
          merchantAddress={solanaMerchantAddress}
        />
      ) : (
        <PublicEvmCheckout
          documentId={documentId}
          amount={amount}
          title={title}
          token={token}
          merchantAddress={evmMerchantAddress}
        />
      )}
    </div>
  );
}
