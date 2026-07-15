'use client';

import { useState } from 'react';
import { CaretRight } from '@/components/ui/lucide-icons';
import { TokenDetailPanel } from '@/components/wallet/token-detail-panel';
import type { WalletAsset } from '@/lib/models/entities';
import { useCurrency } from '@/components/providers/currency-provider';

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

  return (
    <>
      <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <p className="text-[15px] font-semibold text-[var(--color-foreground)]">USDC Balance</p>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
              {allAssets.length} asset{allAssets.length !== 1 ? 's' : ''}
            </p>
          </div>
          <p className="text-[14px] font-semibold text-[var(--color-foreground)]">
            {formatAmount(totalCrypto, { compact: true })}{' '}
            <span className="text-[var(--color-text-muted)] font-normal text-[12px]">total</span>
          </p>
        </div>

        <div className="divide-y divide-[var(--color-surface-tertiary)]">
          {allAssets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => setSelected(asset)}
              className="group flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-[var(--color-background)]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)]">
                  <span className="text-[13px] font-bold text-[var(--color-text-tertiary)]">
                    {asset.symbol.slice(0, 2)}
                  </span>
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{asset.name}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">{asset.symbol}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">
                    {asset.balance > 0
                      ? asset.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })
                      : '—'}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">{formatAmount(asset.valueUsd)}</p>
                </div>
                <CaretRight className="h-4 w-4 shrink-0 text-[var(--color-border-input)] transition group-hover:text-[var(--color-text-muted)]" weight="bold" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <TokenDetailPanel asset={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
