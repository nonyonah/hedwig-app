'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ArrowsLeftRight, CaretRight, Info } from '@/components/ui/lucide-icons';
import { TokenDetailPanel } from '@/components/wallet/token-detail-panel';
import type { WalletAsset } from '@/lib/models/entities';
import { useCurrency } from '@/components/providers/currency-provider';

const chainIconByName: Record<string, string> = {
  Base:     '/icons/networks/base.png',
  Solana:   '/icons/networks/solana.png',
  Arbitrum: '/icons/networks/arbitrum.png',
  Polygon:  '/icons/networks/polygon.png',
  Optimism: '/icons/networks/optimism.png',
};

const tokenIconByKey: Record<string, string> = {
  'Base:USDC':      '/icons/tokens/usdc.png',
  'Solana:USDC':    '/icons/tokens/usdc.png',
  'Arbitrum:USDC':  '/icons/tokens/usdc.png',
  'Polygon:USDC':   '/icons/tokens/usdc.png',
  'Optimism:USDC':  '/icons/tokens/usdc.png',
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
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[11px] font-semibold text-[var(--color-text-muted)]">
      {symbol.slice(0, 3)}
    </div>
  );
}

export function WalletAssetsTable({
  assetsByChain,
  totalCrypto,
  aggregatedSources = [],
  aggregationEnabled = false,
  pendingAggregation = 0,
}: {
  assetsByChain: Record<string, WalletAsset[]>;
  totalCrypto: number;
  aggregatedSources?: Array<{ chain: string; balance: number; pending: number }>;
  aggregationEnabled?: boolean;
  pendingAggregation?: number;
}) {
  const [selected, setSelected] = useState<WalletAsset | null>(null);
  const { formatAmount } = useCurrency();

  return (
    <>
      <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <p className="text-[15px] font-semibold text-[var(--color-foreground)]">USDC Balances</p>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">Per-chain wallet balances and finalized aggregated sources.</p>
          </div>
          <p className="text-[14px] font-semibold text-[var(--color-foreground)]">
            {formatAmount(totalCrypto, { compact: true })}{' '}
            <span className="text-[var(--color-text-muted)] font-normal text-[12px]">total</span>
          </p>
        </div>

        <div className="border-b border-[var(--color-surface-tertiary)] bg-[var(--color-background)] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex max-w-2xl items-start gap-2.5">
              <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${aggregationEnabled ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)]'}`}>
                <ArrowsLeftRight className="h-3.5 w-3.5" weight="bold" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">Aggregated sources</p>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${aggregationEnabled ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)]'}`}>
                    {aggregationEnabled ? 'Auto on' : 'Auto off'}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-5 text-[var(--color-text-tertiary)]">
                  Aggregation combines finalized USDC from supported chains into one spendable balance. When it is off, new USDC stays on its original chain until you add it from mobile.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {aggregatedSources.length > 0 ? aggregatedSources.map((source) => (
                <div key={source.chain} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
                  <ChainIcon chain={source.chain} size={16} />
                  <span className="text-[12px] font-semibold text-[var(--color-foreground)]">{source.chain}</span>
                  <span className="text-[12px] tabular-nums text-[var(--color-text-tertiary)]">{formatAmount(source.balance, { compact: true })}</span>
                </div>
              )) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-dashed border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] text-[var(--color-text-muted)]">
                  <Info className="h-3.5 w-3.5" weight="bold" />
                  No finalized aggregated sources yet
                </div>
              )}
              {pendingAggregation > 0 ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-warning)]">
                  Pending {formatAmount(pendingAggregation, { compact: true })}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[auto_1fr_140px_170px_110px_28px] items-center gap-4 border-b border-[var(--color-surface-tertiary)] px-5 py-2">
          <span className="w-8" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Asset</span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Chain</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Holdings</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Market value</span>
          <span />
        </div>

        {Object.entries(assetsByChain).map(([chain, assets]) => (
          <div key={chain}>
            {/* Chain group header */}
            <div className="flex items-center gap-2.5 border-b border-[var(--color-background)] bg-[var(--color-background)] px-5 py-2">
              <ChainIcon chain={chain as WalletAsset['chain']} size={16} />
              <span className="text-[12px] font-semibold text-[var(--color-text-muted)]">{chain}</span>
              <span className="text-[11px] text-[var(--color-text-muted)]">
                — {formatAmount(assets.reduce((s, a) => s + a.valueUsd, 0), { compact: true })}
              </span>
            </div>
            <div className="divide-y divide-[var(--color-background)]">
              {assets.map((asset) => {
                const change = asset.changePct24h ?? 0;
                const isPositive = change >= 0;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setSelected(asset)}
                    className="group grid w-full grid-cols-[auto_1fr_140px_170px_110px_28px] items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-[var(--color-background)]"
                  >
                    <TokenIcon chain={asset.chain} symbol={asset.symbol} label={asset.name} size={32} />
                    <div>
                      <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{asset.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-[11px] text-[var(--color-text-muted)]">{asset.symbol}</p>
                        {change !== 0 && (
                          <span className={`text-[10px] font-semibold ${isPositive ? 'text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-tertiary)]'}`}>
                            {isPositive ? '+' : ''}{change.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ChainIcon chain={asset.chain} size={14} />
                      <span className="text-[12px] text-[var(--color-text-tertiary)]">{asset.chain}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">
                        {asset.balance > 0
                          ? asset.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })
                          : '—'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{asset.symbol}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold tabular-nums text-[var(--color-foreground)]">
                        {asset.valueUsd > 0 ? formatAmount(asset.valueUsd, { compact: true }) : <span className="text-[var(--color-border-input)]">{formatAmount(0)}</span>}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">USD value</p>
                    </div>
                    <CaretRight className="h-4 w-4 shrink-0 text-[var(--color-border-input)] transition group-hover:text-[var(--color-text-muted)]" weight="bold" />
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
