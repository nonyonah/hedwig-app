'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Wallet } from '@/components/ui/lucide-icons';
import { Table } from '@heroui/react';
import { TokenDetailPanel } from '@/components/wallet/token-detail-panel';
import type { WalletAsset } from '@/lib/models/entities';
import { useCurrency } from '@/components/providers/currency-provider';

const tokenIconBySymbol: Record<string, string> = {
  USDC: '/icons/tokens/usdc.png',
  ETH: '/icons/tokens/eth.png',
  SOL: '/icons/tokens/sol.png',
};

const chainIconByName: Record<string, string> = {
  Base: '/icons/networks/base.png',
  Solana: '/icons/networks/solana.png',
  Arbitrum: '/icons/networks/arbitrum.png',
  Polygon: '/icons/networks/polygon.png',
  Optimism: '/icons/networks/optimism.png',
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

        <Table variant="secondary" className="[&_.table__row]:cursor-pointer">
          <Table.ScrollContainer>
            <Table.Content aria-label="Wallet assets">
              <Table.Header>
                <Table.Column isRowHeader className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Asset</Table.Column>
                <Table.Column className="text-right text-[11px] font-medium text-[var(--color-text-tertiary)]">Balance</Table.Column>
                <Table.Column className="text-right text-[11px] font-medium text-[var(--color-text-tertiary)]">Value</Table.Column>
                <Table.Column />
              </Table.Header>
              <Table.Body
                renderEmptyState={() => (
                  <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface-secondary)]">
                      <Wallet className="h-5 w-5 text-[var(--color-text-muted)]" weight="duotone" />
                    </div>
                    <p className="text-[13px] text-[var(--color-text-muted)]">No wallet balances yet.</p>
                  </div>
                )}
              >
                {allAssets.map((asset) => {
                  const tokenIcon = tokenIconBySymbol[asset.symbol.toUpperCase()];
                  return (
                    <Table.Row key={asset.id} onAction={() => setSelected(asset)}>
                      <Table.Cell>
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)]">
                              {tokenIcon ? (
                                <Image src={tokenIcon} alt={asset.symbol} width={22} height={22} className="rounded-full" />
                              ) : (
                                <span className="text-[12px] font-bold text-[var(--color-text-tertiary)]">{asset.symbol.slice(0, 2)}</span>
                              )}
                            </div>
                            {chainIconByName[asset.chain] && (
                              <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-surface)]">
                                <Image src={chainIconByName[asset.chain]} alt={asset.chain} width={14} height={14} className="rounded-full" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)]">{asset.name}</p>
                            <p className="text-[11px] text-[var(--color-text-muted)]">{asset.chain}</p>
                          </div>
                        </div>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <p className="text-[13px] font-medium tabular-nums text-[var(--color-foreground)]">
                          {asset.balance > 0
                            ? asset.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })
                            : '0'}
                        </p>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <p className="text-[13px] font-medium tabular-nums text-[var(--color-foreground)]">{formatAmount(asset.valueUsd)}</p>
                        <p className={`text-[11px] ${asset.changePct24h >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                          {asset.changePct24h >= 0 ? '+' : ''}{asset.changePct24h.toFixed(2)}%
                        </p>
                      </Table.Cell>
                      <Table.Cell />
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </div>

      {selected && (
        <TokenDetailPanel asset={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
