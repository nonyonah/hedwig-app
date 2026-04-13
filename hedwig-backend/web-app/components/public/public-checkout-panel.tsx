'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PublicEvmCheckout } from '@/components/public/public-evm-checkout';
import { PublicSolanaCheckout } from '@/components/public/public-solana-checkout';
import type { PublicPaymentToken, PublicSettlementChain } from '@/lib/payments/public-constants';

type AvailableChain = {
  id: PublicSettlementChain;
  label: string;
  icon: string;
};

const TOKEN_OPTIONS = [
  { id: 'USDC' as const, label: 'USDC', icon: '/icons/tokens/usdc.png' },
];

export function PublicCheckoutPanel({
  documentId,
  amount,
  title,
  preferredChain,
  token,
  evmMerchantAddress,
  solanaMerchantAddress,
  selectedChain,
  onSelectedChainChange,
  selectedToken,
  onSelectedTokenChange
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
  selectedToken?: PublicPaymentToken | null;
  onSelectedTokenChange?: (t: PublicPaymentToken) => void;
}) {
  const availableChains = useMemo<AvailableChain[]>(() => {
    const chains: AvailableChain[] = [];
    if (evmMerchantAddress) {
      chains.push({ id: 'base',     label: 'Base',     icon: '/icons/networks/base.png' });
      chains.push({ id: 'arbitrum', label: 'Arbitrum', icon: '/icons/networks/arbitrum.png' });
      chains.push({ id: 'polygon',  label: 'Polygon',  icon: '/icons/networks/polygon.png' });
      chains.push({ id: 'celo',     label: 'Celo',     icon: '/icons/networks/celo.png' });
    }
    if (solanaMerchantAddress) {
      chains.push({ id: 'solana', label: 'Solana', icon: '/icons/networks/solana.png' });
    }
    return chains;
  }, [evmMerchantAddress, solanaMerchantAddress]);

  const initialChain = useMemo<PublicSettlementChain | null>(() => {
    if (availableChains.some((chain) => chain.id === preferredChain)) {
      return preferredChain;
    }
    return availableChains[0]?.id || null;
  }, [availableChains, preferredChain]);

  const [internalSelectedChain, setInternalSelectedChain] = useState<PublicSettlementChain | null>(initialChain);
  const activeChain = selectedChain ?? internalSelectedChain;

  const [internalSelectedToken, setInternalSelectedToken] = useState<PublicPaymentToken>(token);
  const activeToken: PublicPaymentToken = selectedToken ?? internalSelectedToken;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (tokenDropdownRef.current && !tokenDropdownRef.current.contains(e.target as Node)) {
        setTokenDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChainChange = (chain: PublicSettlementChain) => {
    setInternalSelectedChain(chain);
    onSelectedChainChange?.(chain);
    setDropdownOpen(false);
  };

  const handleTokenChange = (t: PublicPaymentToken) => {
    setInternalSelectedToken(t);
    onSelectedTokenChange?.(t);
    setTokenDropdownOpen(false);
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

  const visibleTokenOptions = TOKEN_OPTIONS;
  const showTokenDropdown = visibleTokenOptions.length > 1;

  return (
    <div className="space-y-4">
      {/* Chain + Token selectors */}
      <div className="space-y-2">
        {availableChains.length > 1 ? (
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex w-full items-center gap-3 rounded-2xl border border-[#e9eaeb] bg-white px-4 py-3 shadow-xs transition hover:bg-[#fafafa]"
            >
              {activeChain && (() => {
                const meta = availableChains.find((c) => c.id === activeChain);
                return meta ? (
                  <>
                    <Image src={meta.icon} alt={meta.label} width={20} height={20} className="rounded-full" />
                    <span className="flex-1 text-left text-[13px] font-semibold text-[#181d27]">{meta.label}</span>
                  </>
                ) : null;
              })()}
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Network</span>
              <svg
                className={`h-4 w-4 text-[#a4a7ae] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white shadow-lg">
                {availableChains.map((chain) => {
                  const isActive = activeChain === chain.id;
                  return (
                    <button
                      key={chain.id}
                      type="button"
                      onClick={() => handleChainChange(chain.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-[13px] font-medium transition ${
                        isActive
                          ? 'bg-[#f8f9fc] text-[#181d27]'
                          : 'text-[#414651] hover:bg-[#fafafa]'
                      }`}
                    >
                      <Image src={chain.icon} alt={chain.label} width={20} height={20} className="rounded-full" />
                      <span className="flex-1 text-left">{chain.label}</span>
                      {isActive && (
                        <svg className="h-4 w-4 text-[#181d27]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {showTokenDropdown ? (
          <div ref={tokenDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setTokenDropdownOpen((o) => !o)}
              className="flex w-full items-center gap-3 rounded-2xl border border-[#e9eaeb] bg-white px-4 py-3 shadow-xs transition hover:bg-[#fafafa]"
            >
              {(() => {
                const meta = TOKEN_OPTIONS.find((t) => t.id === activeToken) ?? TOKEN_OPTIONS[0];
                return (
                  <>
                    <Image src={meta.icon} alt={meta.label} width={20} height={20} className="rounded-full" />
                    <span className="flex-1 text-left text-[13px] font-semibold text-[#181d27]">{meta.label}</span>
                  </>
                );
              })()}
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Token</span>
              <svg
                className={`h-4 w-4 text-[#a4a7ae] transition-transform ${tokenDropdownOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {tokenDropdownOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white shadow-lg">
                {visibleTokenOptions.map((opt) => {
                  const isActive = activeToken === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleTokenChange(opt.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-[13px] font-medium transition ${
                        isActive
                          ? 'bg-[#f8f9fc] text-[#181d27]'
                          : 'text-[#414651] hover:bg-[#fafafa]'
                      }`}
                    >
                      <Image src={opt.icon} alt={opt.label} width={20} height={20} className="rounded-full" />
                      <span className="flex-1 text-left">{opt.label}</span>
                      {isActive && (
                        <svg className="h-4 w-4 text-[#181d27]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {activeChain === 'solana' ? (
        <PublicSolanaCheckout
          documentId={documentId}
          amount={amount}
          title={title}
          merchantAddress={solanaMerchantAddress}
          token={activeToken}
        />
      ) : (
        <PublicEvmCheckout
          documentId={documentId}
          amount={amount}
          title={title}
          token={activeToken}
          merchantAddress={evmMerchantAddress}
          selectedChain={activeChain ?? 'base'}
        />
      )}
    </div>
  );
}
