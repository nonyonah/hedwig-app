'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { ArrowsLeftRight, ArrowDown, Bank, Info, Wallet, X } from '@/components/ui/lucide-icons';
import { WalletAssetsTable } from '@/components/wallet/wallet-assets-table';
import { ShareWalletDialog } from '@/components/wallet/share-wallet-dialog';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { ClientPortal } from '@/components/ui/client-portal';
import { PayoutPanel } from '@/components/workspace/payout-panel';
import { useCurrency } from '@/components/providers/currency-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { Button } from '@/components/ui/button';
import { OfframpModal } from '@/components/wallet/offramp-modal';
import { OnrampModal } from '@/components/wallet/onramp-modal';

import type { GatewayBalance, WalletAccount, WalletAsset, WalletTransaction } from '@/lib/models/entities';
import { formatShortDate } from '@/lib/utils';

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

const supportedAssets: Array<{ chain: WalletAsset['chain']; symbol: string; name: string }> = [
  { chain: 'Base', symbol: 'USDC', name: 'USD Coin' },
  { chain: 'Solana', symbol: 'USDC', name: 'USD Coin' },
  { chain: 'Arbitrum', symbol: 'USDC', name: 'USD Coin' },
  { chain: 'Polygon', symbol: 'USDC', name: 'USD Coin' },
  { chain: 'Optimism', symbol: 'USDC', name: 'USD Coin' },
];

const TX_KIND: Record<WalletTransaction['kind'], { dot: string; bg: string; text: string }> = {
  receive: { dot: 'bg-[var(--color-success)]', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-text-tertiary)]' },
  send: { dot: 'bg-[var(--color-danger)]', bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-text-tertiary)]' },
  payment: { dot: 'bg-[var(--color-primary)]', bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-text-tertiary)]' },
  settlement: { dot: 'bg-[var(--color-warning)]', bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-text-tertiary)]' },
  onramp: { dot: 'bg-[var(--color-success)]', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-text-tertiary)]' },
  offramp: { dot: 'bg-[var(--color-warning)]', bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-text-tertiary)]' },
};

type WalletData = {
  walletAccounts: WalletAccount[];
  walletAssets: WalletAsset[];
  walletTransactions: WalletTransaction[];
};

export function WalletView({
  initialWalletData,
  initialGatewayBalance,
  gatewayAutoDepositEnabled = false,
  accessToken,
}: {
  initialWalletData: WalletData;
  initialGatewayBalance: GatewayBalance;
  gatewayAutoDepositEnabled?: boolean;
  accessToken: string | null;
}) {
  const { formatAmount } = useCurrency();
  useAssistantPageContext('Wallet', {
    assetsCount: initialWalletData.walletAssets.length,
    accountsCount: initialWalletData.walletAccounts.length,
    transactionsCount: initialWalletData.walletTransactions.length,
    gatewayBalance: initialGatewayBalance.available,
  });

  const [showAllActivity, setShowAllActivity] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<WalletTransaction | null>(null);
  const [offrampOpen, setOfframpOpen] = useState(false);
  const [onrampOpen, setOnrampOpen] = useState(false);
  const { walletAccounts, walletAssets, walletTransactions } = initialWalletData;
  const baseAccount = walletAccounts.find((account) => account.chain === 'Base');
  const solanaAccount = walletAccounts.find((account) => account.chain === 'Solana');

  const allAssets = useMemo(() => mergeSupportedAssets(walletAssets), [walletAssets]);
  const assetsByChain = useMemo(() => groupAssetsByChain(allAssets), [allAssets]);
  const totalCrypto = allAssets.reduce((sum, asset) => sum + asset.valueUsd, 0);
  const eoaUsdcAssets = allAssets.filter((asset) => asset.symbol.toUpperCase() === 'USDC');
  const eoaUsdcTotal = eoaUsdcAssets.reduce((sum, asset) => sum + asset.balance, 0);
  const chainBalances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const asset of eoaUsdcAssets) {
      const key = asset.chain.toLowerCase();
      map[key] = (map[key] || 0) + asset.balance;
    }
    return map;
  }, [eoaUsdcAssets]);
  const gatewayAvailableUsdc = gatewaySubunitsToNumber(initialGatewayBalance.available);
  const gatewayPendingUsdc = gatewaySubunitsToNumber(initialGatewayBalance.pending);
  const gatewaySourceRows = useMemo(() => normalizeGatewayDomainRows(initialGatewayBalance.perDomain), [initialGatewayBalance.perDomain]);
  const totalReceived = walletTransactions
    .filter((tx) => tx.kind === 'receive' || tx.kind === 'settlement')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const recentWalletTx = showAllActivity ? walletTransactions : walletTransactions.slice(0, 6);
  const canToggleActivity = walletTransactions.length > 6;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-[var(--color-foreground)]">Revenue</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">Your USDC earnings, settlements, and account balances.</p>
        </div>
        <div className="shrink-0 pt-1 flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOnrampOpen(true)}>
            <Bank className="h-4 w-4" weight="bold" /> Fund via Bank
          </Button>
          {(baseAccount?.address || solanaAccount?.address) && (
            <Button variant="secondary" size="sm" onClick={() => setOfframpOpen(true)}>
              <ArrowDown className="h-4 w-4" weight="bold" /> Withdraw
            </Button>
          )}
          <ShareWalletDialog
            baseAddress={baseAccount?.address}
            solanaAddress={solanaAccount?.address}
          />
        </div>
      </div>

      <AttachedStatGrid
        items={[
          {
            id: 'balance',
            title: 'Balance',
            value: formatAmount(eoaUsdcTotal, { compact: true }),
            helper: 'Per-chain wallet USDC',
            icon: Wallet,
            iconClassName: 'text-[var(--color-text-tertiary)]',
          },
          {
            id: 'aggregated-usdc',
            title: 'Aggregated USDC',
            value: formatAmount(gatewayAvailableUsdc, { compact: true }),
            helper: gatewayAutoDepositEnabled ? 'Auto-aggregation on' : 'Auto-aggregation off',
            icon: ArrowsLeftRight,
            valueClassName: gatewayAutoDepositEnabled ? 'text-[var(--color-success)]' : undefined,
            iconWrapClassName: gatewayAutoDepositEnabled ? 'bg-[var(--color-success-soft)]' : undefined,
            iconClassName: gatewayAutoDepositEnabled ? 'text-[var(--color-success)]' : 'text-[var(--color-text-tertiary)]',
          },
          {
            id: 'finality',
            title: 'Finality',
            value: gatewayPendingUsdc > 0 ? formatAmount(gatewayPendingUsdc, { compact: true }) : 'Clear',
            helper: gatewayPendingUsdc > 0 ? 'Pending aggregation' : 'No pending deposits',
            icon: Info,
            valueClassName: gatewayPendingUsdc > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]',
            iconWrapClassName: gatewayPendingUsdc > 0 ? 'bg-[var(--color-warning-soft)]' : 'bg-[var(--color-success-soft)]',
            iconClassName: gatewayPendingUsdc > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]',
          },
          {
            id: 'total-received',
            title: 'Total received',
            value: formatAmount(totalReceived, { compact: true }),
            helper: 'Payments & settlements',
            icon: ArrowDown,
            iconClassName: 'text-[var(--color-text-tertiary)]',
          },
        ]}
        className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
      />

      <WalletAssetsTable
        assetsByChain={assetsByChain}
        totalCrypto={totalCrypto}
        aggregatedSources={gatewaySourceRows}
        aggregationEnabled={gatewayAutoDepositEnabled}
        pendingAggregation={gatewayPendingUsdc}
      />

      <div>
        <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <p className="text-[15px] font-semibold text-[var(--color-foreground)]">Recent activity</p>
              <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
                Incoming payments, buy USDC orders, withdrawals, and settlements.
              </p>
            </div>
            {canToggleActivity ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAllActivity((value) => !value)}
              >
                {showAllActivity ? 'Show recent' : 'View all'}
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-[1fr_100px_100px_90px] gap-3 border-b border-[var(--color-surface-tertiary)] px-5 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Transaction</span>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Type</span>
            <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Amount</span>
            <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Date</span>
          </div>

          {recentWalletTx.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Wallet className="h-8 w-8 text-[var(--color-border-input)]" weight="duotone" />
              <p className="text-[13px] text-[var(--color-text-muted)]">
                No activity yet. Wallet transfers and payments will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-surface-secondary)]">
              {recentWalletTx.map((tx) => {
                const kind = TX_KIND[tx.kind] ?? TX_KIND.payment;
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => setSelectedActivity(tx)}
                    className="grid w-full grid-cols-[1fr_100px_100px_90px] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[var(--color-background)]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <TokenIcon chain={tx.chain} symbol={tx.asset} label={tx.asset} size={32} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold capitalize text-[var(--color-foreground)]">{formatTransactionTitle(tx)}</p>
                        <p className="truncate text-[11px] text-[var(--color-text-muted)]">{tx.counterparty || tx.chain}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${kind.bg} ${kind.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${kind.dot}`} />
                      <span className="capitalize">{formatTransactionKind(tx.kind)}</span>
                    </span>
                    <p className="text-right text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">
                      {tx.amount} <span className="text-[11px] font-normal text-[var(--color-text-muted)]">{tx.asset}</span>
                    </p>
                    <p className="text-right text-[12px] text-[var(--color-text-muted)]">{formatShortDate(tx.createdAt)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedActivity ? (
        <ActivityDetailPanel
          activity={selectedActivity}
          formatAmount={formatAmount}
          onClose={() => setSelectedActivity(null)}
        />
      ) : null}
      <PayoutPanel gatewayAutoDepositEnabled={gatewayAutoDepositEnabled} />
      <OnrampModal
        open={onrampOpen}
        onClose={() => setOnrampOpen(false)}
        accessToken={accessToken}
      />
      <OfframpModal
        open={offrampOpen}
        onClose={() => setOfframpOpen(false)}
        source="personal"
        returnAddress={baseAccount?.address || ''}
        maxAmount={eoaUsdcTotal}
        chainBalances={chainBalances}
        accessToken={accessToken}
        solanaAddress={solanaAccount?.address}
      />
    </div>
  );
}

function ActivityDetailPanel({
  activity,
  formatAmount,
  onClose,
}: {
  activity: WalletTransaction;
  formatAmount: (amount: number, options?: { compact?: boolean }) => string;
  onClose: () => void;
}) {
  const title = formatTransactionTitle(activity);
  const amountLabel = `${activity.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${activity.asset}`;
  const statusLabel = activity.status ? String(activity.status).replace(/_/g, ' ') : 'Unknown';
  const iconNode = (
    <div className="relative shrink-0">
      <TokenIcon chain={activity.chain} symbol={activity.asset} label={activity.asset} size={44} />
      <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[var(--color-surface)] p-0.5">
        <ChainIcon chain={activity.chain} size={18} />
      </div>
    </div>
  );

  return (
    <ClientPortal>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={onClose} />

      <div
        className="fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-full max-w-[480px] flex-col bg-[var(--color-surface)] shadow-2xl animate-in slide-in-from-left-full duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-label="Activity details"
      >
        <div className="flex items-center gap-4 border-b border-[var(--color-border)] px-5 py-4">
          {iconNode}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-bold text-[var(--color-foreground)]">{title}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[12px] text-[var(--color-text-muted)]">{formatShortDate(activity.createdAt)}</span>
              <span className="text-[var(--color-border)]">·</span>
              <span className="truncate text-[12px] text-[var(--color-text-muted)]">{activity.chain}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close activity details"
            className="h-8 w-8 rounded-full"
          >
            <X className="h-4 w-4" weight="bold" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-[var(--color-surface-tertiary)] bg-[var(--color-background)] px-5 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Amount</p>
            <p className="mt-1 text-[28px] font-bold leading-none tracking-[-0.04em] text-[var(--color-foreground)]">{amountLabel}</p>
            <p className="mt-2 text-[13px] font-medium capitalize text-[var(--color-text-tertiary)]">{statusLabel}</p>
          </div>

          <div className="px-5 py-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Details</p>
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="divide-y divide-[var(--color-surface-tertiary)] px-4">
                <ActivityDetailRow label="Type" value={formatTransactionKind(activity.kind)} />
                <ActivityDetailRow label="Status" value={statusLabel} />
                <ActivityDetailRow label="Chain" value={activity.chain} />
                <ActivityDetailRow label="Counterparty" value={activity.counterparty || 'Unknown'} />
                {activity.fiatAmount ? (
                  <ActivityDetailRow label="Fiat amount" value={`${activity.fiatAmount.toLocaleString()} ${activity.fiatCurrency || ''}`.trim()} />
                ) : null}
                {activity.exchangeRate ? (
                  <ActivityDetailRow label="Exchange rate" value={activity.exchangeRate.toLocaleString()} />
                ) : null}
                {activity.destinationLabel ? (
                  <ActivityDetailRow label={activity.kind === 'onramp' ? 'Source' : 'Destination'} value={activity.destinationLabel} />
                ) : null}
                {activity.txHash ? (
                  <ActivityDetailRow label="Transaction hash" value={activity.txHash} mono />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ClientPortal>
  );
}

function ActivityDetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="shrink-0 text-[12px] text-[var(--color-text-tertiary)]">{label}</span>
      <span className={`text-right text-[13px] font-semibold capitalize text-[var(--color-foreground)] ${mono ? 'break-all font-mono text-[11px] normal-case' : ''}`}>{value}</span>
    </div>
  );
}

function ChainIcon({ chain, size = 24 }: { chain: string; size?: number }) {
  const iconSrc = chainIconByName[chain];
  if (!iconSrc) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[9px] font-bold text-[var(--color-text-tertiary)]"
        style={{ width: size, height: size }}
      >
        {chain.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return <Image src={iconSrc} alt={chain} width={size} height={size} className="rounded-full shrink-0" />;
}

function TokenIcon({ chain, symbol, label, size = 32 }: { chain: string; symbol: string; label: string; size?: number }) {
  const iconSrc = tokenIconByKey[`${chain}:${symbol}`];
  if (iconSrc) return <Image src={iconSrc} alt={label} width={size} height={size} className="rounded-full shrink-0" />;
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[11px] font-semibold text-[var(--color-text-muted)]">
      {symbol.slice(0, 3)}
    </div>
  );
}

function mergeSupportedAssets(walletAssets: WalletAsset[]) {
  return supportedAssets.map((supported, index) => {
    const found = walletAssets.find((asset) => asset.chain === supported.chain && asset.symbol === supported.symbol);
    return found ?? {
      id: `${supported.chain.toLowerCase()}-${supported.symbol.toLowerCase()}-${index}`,
      chain: supported.chain,
      symbol: supported.symbol,
      name: supported.name,
      balance: 0,
      valueUsd: 0,
      changePct24h: 0
    };
  });
}

function groupAssetsByChain(walletAssets: WalletAsset[]) {
  return walletAssets.reduce<Record<string, WalletAsset[]>>(
    (groups, asset) => {
      if (!groups[asset.chain]) groups[asset.chain] = [];
      groups[asset.chain].push(asset);
      return groups;
    },
    {}
  );
}

function formatTransactionKind(kind: WalletTransaction['kind']) {
  if (kind === 'onramp') return 'Buy';
  if (kind === 'offramp') return 'Withdraw';
  return kind;
}

function formatTransactionTitle(tx: WalletTransaction) {
  if (tx.kind === 'onramp') return `Buy ${tx.asset}`;
  if (tx.kind === 'offramp') return `Withdraw ${tx.asset}`;
  return `${tx.kind} · ${tx.asset}`;
}

const GATEWAY_DOMAIN_TO_CHAIN: Record<number, string> = {
  2: 'Optimism',
  3: 'Arbitrum',
  5: 'Solana',
  6: 'Base',
  7: 'Polygon',
  26: 'Arc',
};

function gatewaySubunitsToNumber(value: string | number | bigint | null | undefined): number {
  try {
    const raw = BigInt(String(value ?? '0'));
    return Number(raw) / 1_000_000;
  } catch {
    return 0;
  }
}

function normalizeGatewayDomainRows(perDomain: GatewayBalance['perDomain']) {
  return (perDomain || [])
    .map((entry) => ({
      domain: entry.domain,
      depositor: entry.depositor,
      chain: GATEWAY_DOMAIN_TO_CHAIN[Number(entry.domain)] || `Domain ${entry.domain}`,
      balance: gatewaySubunitsToNumber(entry.balance),
      pending: gatewaySubunitsToNumber(entry.pending),
    }))
    .filter((entry) => entry.balance > 0 || entry.pending > 0)
    .sort((a, b) => b.balance - a.balance);
}
