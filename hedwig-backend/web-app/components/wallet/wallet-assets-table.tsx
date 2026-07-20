'use client';

import Image from 'next/image';
import { useState } from 'react';
import { CaretRight, Wallet } from '@/components/ui/lucide-icons';
import { TokenDetailPanel } from '@/components/wallet/token-detail-panel';
import type { WalletAsset } from '@/lib/models/entities';
import { useCurrency } from '@/components/providers/currency-provider';

const chainMeta: Record<string, { icon: string; label: string }> = {
  Base: { icon: '/icons/networks/base.png', label: 'Base' },
  Solana: { icon: '/icons/networks/solana.png', label: 'Solana' },
  Arbitrum: { icon: '/icons/networks/arbitrum.png', label: 'Arbitrum' },
  Polygon: { icon: '/icons/networks/polygon.png', label: 'Polygon' },
  Optimism: { icon: '/icons/networks/optimism.png', label: 'Optimism' },
};

const tokenIconBySymbol: Record<string, string> = {
  USDC: '/icons/tokens/usdc.png',
  ETH: '/icons/tokens/eth.png',
  SOL: '/icons/tokens/sol.png',
};

export function WalletAssetsTable({
  assetsByChain,
  totalCrypto,
}: {
  assetsByChain: Record<string, WalletAsset[]>;
  totalCrypto: number;
}) {
  const [selected, setSelected] = useState<WalletAsset | null>(null);
  const { formatAmount } = useCurrency();

  const allAssets = Object.values(assetsByChain).flat();
  const chainRows = Object.entries(assetsByChain)
    .map(([chain, assets]) => ({
      chain,
      assets,
      totalUsd: assets.reduce((sum, asset) => sum + asset.valueUsd, 0),
      totalBalance: assets.reduce((sum, asset) => sum + asset.balance, 0),
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <p className="text-[15px] font-semibold text-[var(--color-foreground)]">Multichain balances</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
              Per-chain wallet balances. Aggregated USDC remains available through Circle Gateway when enabled.
            </p>
          </div>
          <div className="shrink-0 rounded-full bg-[var(--color-surface-secondary)] px-3 py-1.5 text-right">
            <p className="text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">{formatAmount(totalCrypto, { compact: true })}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">wallet total</p>
          </div>
        </div>

        {chainRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-5 py-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface-secondary)]">
              <Wallet className="h-5 w-5 text-[var(--color-text-muted)]" weight="duotone" />
            </div>
            <p className="text-[13px] text-[var(--color-text-muted)]">No wallet balances yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-surface-tertiary)]">
            {chainRows.map(({ chain, assets, totalUsd }) => {
              const meta = chainMeta[chain] ?? { icon: '', label: chain };
              return (
                <div key={chain}>
                  <div className="flex items-center justify-between bg-[var(--color-background)] px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      {meta.icon ? (
                        <Image src={meta.icon} alt={meta.label} width={22} height={22} className="rounded-full" />
                      ) : (
                        <div className="h-[22px] w-[22px] rounded-full bg-[var(--color-surface-tertiary)]" />
                      )}
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{meta.label}</p>
                        <p className="text-[11px] text-[var(--color-text-muted)]">
                          {assets.length} asset{assets.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <p className="text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">
                      {formatAmount(totalUsd, { compact: true })}
                    </p>
                  </div>

                  <div className="divide-y divide-[var(--color-surface-secondary)]">
                    {assets.map((asset) => {
                      const tokenIcon = tokenIconBySymbol[asset.symbol.toUpperCase()];
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => setSelected(asset)}
                          className="group grid w-full grid-cols-[minmax(0,1fr)_110px_110px_24px] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[var(--color-background)] max-sm:grid-cols-[minmax(0,1fr)_90px_20px]"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)]">
                              {tokenIcon ? (
                                <Image src={tokenIcon} alt={asset.symbol} width={22} height={22} className="rounded-full" />
                              ) : (
                                <span className="text-[12px] font-bold text-[var(--color-text-tertiary)]">{asset.symbol.slice(0, 2)}</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)]">{asset.name}</p>
                              <p className="text-[11px] text-[var(--color-text-muted)]">{asset.symbol}</p>
                            </div>
                          </div>

                          <div className="text-right max-sm:hidden">
                            <p className="text-[12px] font-semibold tabular-nums text-[var(--color-foreground)]">
                              {asset.balance > 0
                                ? asset.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })
                                : '0'}
                            </p>
                            <p className="text-[10px] text-[var(--color-text-muted)]">balance</p>
                          </div>

                          <div className="text-right">
                            <p className="text-[12px] font-semibold tabular-nums text-[var(--color-foreground)]">{formatAmount(asset.valueUsd)}</p>
                            <p className={`text-[10px] ${asset.changePct24h >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                              {asset.changePct24h >= 0 ? '+' : ''}{asset.changePct24h.toFixed(2)}%
                            </p>
                          </div>

                          <CaretRight className="h-4 w-4 shrink-0 justify-self-end text-[var(--color-border-input)] transition group-hover:text-[var(--color-text-muted)]" weight="bold" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <TokenDetailPanel asset={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
