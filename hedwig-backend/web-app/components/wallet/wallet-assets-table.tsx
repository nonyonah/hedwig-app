'use client';

import Image from 'next/image';
import { useState } from 'react';
import { CaretRight } from '@/components/ui/lucide-icons';
import { TokenDetailPanel } from '@/components/wallet/token-detail-panel';
import type { WalletAsset } from '@/lib/models/entities';
import { formatCurrency } from '@/lib/utils';

const chainIconByName: Record<string, string> = {
  Base:     '/icons/networks/base.png',
  Solana:   '/icons/networks/solana.png',
  Arbitrum: '/icons/networks/arbitrum.png',
  Polygon:  '/icons/networks/polygon.png',
  Celo:     '/icons/networks/celo.png',
};

const tokenIconByKey: Record<string, string> = {
  'Base:USDC':      '/icons/tokens/usdc.png',
  'Solana:USDC':    '/icons/tokens/usdc.png',
  'Arbitrum:USDC':  '/icons/tokens/usdc.png',
  'Polygon:USDC':   '/icons/tokens/usdc.png',
  'Celo:USDC':      '/icons/tokens/usdc.png',
};

function ChainIcon({ chain, size = 16 }: { chain: string; size?: number }) {
  const src = chainIconByName[chain];
  if (!src) return null;
  return <Image src={src} alt={chain} width={size} height={size} className="rounded-full shrink-0" />;
}

function TokenIcon({ chain, symbol, label, size = 32 }: { chain: WalletAsset['chain']; symbol: string; label: string; size?: number }) {
  const iconSrc = tokenIconByKey[`${chain}:${symbol}`];
  if (iconSrc) return <Image src={iconSrc} alt={label} width={size} height={size} className="rounded-full shrink-0" />;
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7] text-[11px] font-semibold text-[#667085]">
      {symbol.slice(0, 3)}
    </div>
  );
}

export function WalletAssetsTable({
  assetsByChain,
  totalCrypto
}: {
  assetsByChain: Record<string, WalletAsset[]>;
  totalCrypto: number;
}) {
  const [selected, setSelected] = useState<WalletAsset | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        <div className="flex items-center justify-between border-b border-[#e9eaeb] px-5 py-4">
          <div>
            <p className="text-[15px] font-semibold text-[#181d27]">USDC Balances</p>
            <p className="mt-0.5 text-[12px] text-[#a4a7ae]">Settled USDC across supported chains · click any row for details</p>
          </div>
          <p className="text-[14px] font-semibold text-[#181d27]">
            {formatCurrency(totalCrypto)}{' '}
            <span className="text-[#a4a7ae] font-normal text-[12px]">total</span>
          </p>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[auto_1fr_140px_170px_110px_28px] items-center gap-4 border-b border-[#f2f4f7] px-5 py-2">
          <span className="w-8" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Asset</span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Chain</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Holdings</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Market value</span>
          <span />
        </div>

        {Object.entries(assetsByChain).map(([chain, assets]) => (
          <div key={chain}>
            {/* Chain group header */}
            <div className="flex items-center gap-2.5 border-b border-[#f9fafb] bg-[#fafafa] px-5 py-2">
              <ChainIcon chain={chain as WalletAsset['chain']} size={16} />
              <span className="text-[12px] font-semibold text-[#535862]">{chain}</span>
              <span className="text-[11px] text-[#a4a7ae]">
                — {formatCurrency(assets.reduce((s, a) => s + a.valueUsd, 0))}
              </span>
            </div>
            <div className="divide-y divide-[#f9fafb]">
              {assets.map((asset) => {
                const change = asset.changePct24h ?? 0;
                const isPositive = change >= 0;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setSelected(asset)}
                    className="group grid w-full grid-cols-[auto_1fr_140px_170px_110px_28px] items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-[#fafafa]"
                  >
                    <TokenIcon chain={asset.chain} symbol={asset.symbol} label={asset.name} size={32} />
                    <div>
                      <p className="text-[13px] font-semibold text-[#181d27]">{asset.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-[11px] text-[#a4a7ae]">{asset.symbol}</p>
                        {change !== 0 && (
                          <span className={`text-[10px] font-semibold ${isPositive ? 'text-[#717680]' : 'text-[#717680]'}`}>
                            {isPositive ? '+' : ''}{change.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ChainIcon chain={asset.chain} size={14} />
                      <span className="text-[12px] text-[#717680]">{asset.chain}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold tabular-nums text-[#181d27]">
                        {asset.balance > 0
                          ? asset.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })
                          : '—'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#a4a7ae]">{asset.symbol}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold tabular-nums text-[#181d27]">
                        {asset.valueUsd > 0 ? formatCurrency(asset.valueUsd) : <span className="text-[#d0d5dd]">$0.00</span>}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#a4a7ae]">USD value</p>
                    </div>
                    <CaretRight className="h-4 w-4 shrink-0 text-[#d0d5dd] transition group-hover:text-[#a4a7ae]" weight="bold" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <TokenDetailPanel asset={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
