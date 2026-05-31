'use client';

import Image from 'next/image';
import { useCallback, useMemo, useState } from 'react';
import { ArrowsLeftRight, ArrowDown, Bank, Info, Wallet, X } from '@/components/ui/lucide-icons';
import { ShareWalletDialog } from '@/components/wallet/share-wallet-dialog';
import { WalletAssetsTable } from '@/components/wallet/wallet-assets-table';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { ClientPortal } from '@/components/ui/client-portal';
import { useCurrency } from '@/components/providers/currency-provider';
import { Button } from '@/components/ui/button';
import { hedwigApi } from '@/lib/api/client';
import type { AccountTransaction, GatewayBalance, UsdAccount, WalletAccount, WalletAsset, WalletTransaction } from '@/lib/models/entities';
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
  receive: { dot: 'bg-[#12b76a]', bg: 'bg-[#ecfdf3]', text: 'text-[#717680]' },
  send: { dot: 'bg-[#f04438]', bg: 'bg-[#fff1f0]', text: 'text-[#717680]' },
  payment: { dot: 'bg-[#2563eb]', bg: 'bg-[#eff4ff]', text: 'text-[#717680]' },
  settlement: { dot: 'bg-[#f59e0b]', bg: 'bg-[#fffaeb]', text: 'text-[#717680]' },
  onramp: { dot: 'bg-[#12b76a]', bg: 'bg-[#ecfdf3]', text: 'text-[#717680]' },
  offramp: { dot: 'bg-[#f59e0b]', bg: 'bg-[#fffaeb]', text: 'text-[#717680]' },
};

const USD_TX_STATUS: Record<AccountTransaction['status'], { dot: string; label: string }> = {
  pending: { dot: 'bg-[#f59e0b]', label: 'Pending' },
  completed: { dot: 'bg-[#12b76a]', label: 'Completed' },
  failed: { dot: 'bg-[#f04438]', label: 'Failed' }
};

type WalletData = {
  walletAccounts: WalletAccount[];
  walletAssets: WalletAsset[];
  walletTransactions: WalletTransaction[];
};

type AccountsData = {
  usdAccount: UsdAccount;
  accountTransactions: AccountTransaction[];
};

export function WalletView({
  initialWalletData,
  initialAccountsData,
  initialGatewayBalance,
  gatewayAutoDepositEnabled = false,
  usdAccountsEnabled = false,
  isUsdAccountPaywalled = false,
  isUsdAccountRegionLocked = false,
  accessToken,
}: {
  initialWalletData: WalletData;
  initialAccountsData: AccountsData;
  initialGatewayBalance: GatewayBalance;
  gatewayAutoDepositEnabled?: boolean;
  accessToken: string | null;
  usdAccountsEnabled?: boolean;
  isUsdAccountPaywalled?: boolean;
  isUsdAccountRegionLocked?: boolean;
  usdAccountRegionLockReason?: string | null;
  regionCountryCode?: string | null;
}) {
  const { formatAmount } = useCurrency();
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<WalletTransaction | AccountTransaction | null>(null);
  const [usdSetupState, setUsdSetupState] = useState<'idle' | 'enrolling' | 'kyc_loading' | 'error'>('idle');
  const [usdSetupError, setUsdSetupError] = useState('');
  const usdAccount = initialAccountsData.usdAccount;
  const accountTransactions = initialAccountsData.accountTransactions;
  const { walletAccounts, walletAssets, walletTransactions } = initialWalletData;
  const baseAccount = walletAccounts.find((account) => account.chain === 'Base');
  const solanaAccount = walletAccounts.find((account) => account.chain === 'Solana');

  const allAssets = useMemo(() => mergeSupportedAssets(walletAssets), [walletAssets]);
  const assetsByChain = useMemo(() => groupAssetsByChain(allAssets), [allAssets]);
  const totalCrypto = allAssets.reduce((sum, asset) => sum + asset.valueUsd, 0);
  const eoaUsdcAssets = allAssets.filter((asset) => asset.symbol.toUpperCase() === 'USDC');
  const eoaUsdcTotal = eoaUsdcAssets.reduce((sum, asset) => sum + asset.balance, 0);
  const gatewayAvailableUsdc = gatewaySubunitsToNumber(initialGatewayBalance.available);
  const gatewayPendingUsdc = gatewaySubunitsToNumber(initialGatewayBalance.pending);
  const gatewaySourceRows = useMemo(() => normalizeGatewayDomainRows(initialGatewayBalance.perDomain), [initialGatewayBalance.perDomain]);
  const totalReceived = walletTransactions
    .filter((tx) => tx.kind === 'receive' || tx.kind === 'settlement')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const recentWalletTx = showAllActivity ? walletTransactions : walletTransactions.slice(0, 6);
  const recentUsdTx = usdAccountsEnabled
    ? showAllActivity ? accountTransactions : accountTransactions.slice(0, 6)
    : [];
  const totalActivityCount = walletTransactions.length + (usdAccountsEnabled ? accountTransactions.length : 0);
  const canToggleActivity = totalActivityCount > 6;

  const hasAssignedAccount = Boolean(usdAccount.hasAssignedAccount || usdAccount.accountNumberMasked || usdAccount.routingNumberMasked);
  const hasBridgeEnrollment = Boolean(usdAccount.bridgeCustomerId || hasAssignedAccount);
  const effectiveUsdStatus = hasBridgeEnrollment ? usdAccount.status : 'not_started';

  const shouldShowUsdSetupCard = usdAccountsEnabled && !isUsdAccountPaywalled && !isUsdAccountRegionLocked && (effectiveUsdStatus === 'not_started' || effectiveUsdStatus === 'pending_kyc');

  const handleUsdSetup = useCallback(async () => {
    if (!accessToken) return;
    setUsdSetupState('enrolling');
    setUsdSetupError('');
    try {
      const enrollResult = await hedwigApi.enrollUsdAccount({ accessToken, disableMockFallback: true });
      if (enrollResult.nextAction === 'complete_bridge_kyc') {
        setUsdSetupState('kyc_loading');
        const kycResult = await hedwigApi.createUsdAccountKycLink({ accessToken, disableMockFallback: true });
        window.open(kycResult.url, '_blank');
        setUsdSetupState('idle');
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setUsdSetupState('error');
      setUsdSetupError(err?.message || 'Something went wrong. Please try again.');
    }
  }, [accessToken]);

  const handleRetryUsdSetup = useCallback(() => {
    setUsdSetupState('idle');
    setUsdSetupError('');
  }, []);

  const usdStatusLabel = isUsdAccountPaywalled
    ? 'Pro'
    : isUsdAccountRegionLocked
    ? 'Unavailable'
    : effectiveUsdStatus === 'active'
      ? 'Active'
      : effectiveUsdStatus === 'pending_kyc'
        ? 'Pending setup'
        : 'Not started';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-[#181d27]">Revenue</h1>
          <p className="mt-0.5 text-[13px] text-[#a4a7ae]">Your USDC earnings, settlements, and account balances.</p>
        </div>
        <div className="shrink-0 pt-1">
          <ShareWalletDialog
            baseAddress={baseAccount?.address ?? null}
            solanaAddress={solanaAccount?.address ?? null}
            usdAccountsEnabled={usdAccountsEnabled}
            usdAccount={usdAccount}
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
            iconClassName: 'text-[#717680]',
          },
          {
            id: 'aggregated-usdc',
            title: 'Aggregated USDC',
            value: formatAmount(gatewayAvailableUsdc, { compact: true }),
            helper: gatewayAutoDepositEnabled ? 'Auto-aggregation on' : 'Auto-aggregation off',
            icon: ArrowsLeftRight,
            valueClassName: gatewayAutoDepositEnabled ? 'text-[#027a48]' : undefined,
            iconWrapClassName: gatewayAutoDepositEnabled ? 'bg-[#ecfdf3]' : undefined,
            iconClassName: gatewayAutoDepositEnabled ? 'text-[#12b76a]' : 'text-[#717680]',
          },
          ...(usdAccountsEnabled ? [{
            id: 'usd-account',
            title: 'USD account',
            value: formatAmount(usdAccount.balanceUsd, { compact: true }),
            helper: usdStatusLabel,
            icon: Bank,
            valueClassName: 'text-[#717680]',
            iconClassName: 'text-[#717680]',
          }] : []),
          {
            id: 'finality',
            title: 'Finality',
            value: gatewayPendingUsdc > 0 ? formatAmount(gatewayPendingUsdc, { compact: true }) : 'Clear',
            helper: gatewayPendingUsdc > 0 ? 'Pending aggregation' : 'No pending deposits',
            icon: Info,
            valueClassName: gatewayPendingUsdc > 0 ? 'text-[#b54708]' : 'text-[#027a48]',
            iconWrapClassName: gatewayPendingUsdc > 0 ? 'bg-[#fffaeb]' : 'bg-[#ecfdf3]',
            iconClassName: gatewayPendingUsdc > 0 ? 'text-[#f59e0b]' : 'text-[#12b76a]',
          },
          {
            id: 'total-received',
            title: 'Total received',
            value: formatAmount(totalReceived, { compact: true }),
            helper: 'Payments & settlements',
            icon: ArrowDown,
            iconClassName: 'text-[#717680]',
          },
          ...(usdAccountsEnabled ? [{
            id: 'auto-settlement',
            title: 'Auto-settlement',
            value: usdAccount.settlementChain,
            helper: 'USD deposits settle here',
            icon: ArrowsLeftRight,
            iconClassName: 'text-[#717680]',
          }] : []),
        ]}
        className={usdAccountsEnabled ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'}
      />

      {shouldShowUsdSetupCard ? (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
          <div className="flex items-start gap-5 px-5 py-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eff4ff]">
              <Bank className="h-5 w-5 text-[#2563eb]" weight="bold" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-[#181d27]">Set up your USD account</p>
              <p className="mt-1 text-[13px] leading-5 text-[#717680]">
                Get a US bank account number and routing number. Clients can pay you directly by ACH
                or wire — the funds settle as USDC in your wallet automatically.
              </p>
              {usdSetupError ? (
                <p className="mt-2 text-[12px] text-[#b42318]">{usdSetupError}</p>
              ) : null}
              <div className="mt-4 flex items-center gap-3">
                {usdSetupState === 'idle' || usdSetupState === 'error' ? (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleUsdSetup}
                    >
                      {usdSetupState === 'error' ? 'Try again' : 'Get started'}
                    </Button>
                    {usdSetupState === 'error' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRetryUsdSetup}
                        className="text-[#717680] hover:text-[#414651]"
                      >
                        Dismiss
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-[13px] text-[#717680]">
                    <svg className="h-4 w-4 animate-spin text-[#2563eb]" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                    </svg>
                    {usdSetupState === 'enrolling' ? 'Setting up your account…' : 'Preparing KYC verification…'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <WalletAssetsTable
        assetsByChain={assetsByChain}
        totalCrypto={totalCrypto}
        aggregatedSources={gatewaySourceRows}
        aggregationEnabled={gatewayAutoDepositEnabled}
        pendingAggregation={gatewayPendingUsdc}
      />

      <div>
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
          <div className="flex items-start justify-between gap-3 border-b border-[#e9eaeb] px-5 py-4">
            <div>
              <p className="text-[15px] font-semibold text-[#181d27]">Recent activity</p>
              <p className="mt-0.5 text-[12px] text-[#a4a7ae]">
                {usdAccountsEnabled ? 'Incoming payments, buy USDC orders, withdrawals, settlements, and USD transfers' : 'Incoming payments, buy USDC orders, withdrawals, and settlements'}
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

          <div className="grid grid-cols-[1fr_100px_100px_90px] gap-3 border-b border-[#f2f4f7] px-5 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Transaction</span>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Type</span>
            <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Amount</span>
            <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Date</span>
          </div>

          {recentWalletTx.length === 0 && recentUsdTx.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Wallet className="h-8 w-8 text-[#d0d5dd]" weight="duotone" />
              <p className="text-[13px] text-[#a4a7ae]">
                {usdAccountsEnabled
                  ? 'No activity yet. Transfers, payments, and settlements will appear here.'
                  : 'No activity yet. Wallet transfers and payments will appear here.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#f9fafb]">
              {recentWalletTx.map((tx) => {
                const kind = TX_KIND[tx.kind] ?? TX_KIND.payment;
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => setSelectedActivity(tx)}
                    className="grid w-full grid-cols-[1fr_100px_100px_90px] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[#fafafa]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <TokenIcon chain={tx.chain} symbol={tx.asset} label={tx.asset} size={32} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold capitalize text-[#181d27]">{formatTransactionTitle(tx)}</p>
                        <p className="truncate text-[11px] text-[#a4a7ae]">{tx.counterparty || tx.chain}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${kind.bg} ${kind.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${kind.dot}`} />
                      <span className="capitalize">{formatTransactionKind(tx.kind)}</span>
                    </span>
                    <p className="text-right text-[13px] font-semibold tabular-nums text-[#181d27]">
                      {tx.amount} <span className="text-[11px] font-normal text-[#a4a7ae]">{tx.asset}</span>
                    </p>
                    <p className="text-right text-[12px] text-[#a4a7ae]">{formatShortDate(tx.createdAt)}</p>
                  </button>
                );
              })}

              {usdAccountsEnabled ? recentUsdTx.map((tx) => {
                const status = USD_TX_STATUS[tx.status] ?? USD_TX_STATUS.pending;
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => setSelectedActivity(tx)}
                    className="grid w-full grid-cols-[1fr_100px_100px_90px] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[#fafafa]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ecfdf3] text-[#717680]">
                        <Bank className="h-4 w-4" weight="bold" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#181d27]">{tx.description}</p>
                        <p className="text-[11px] text-[#a4a7ae]">USD transfer</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[11px] font-semibold text-[#717680]">
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                    <p className="text-right text-[13px] font-semibold tabular-nums text-[#181d27]">{formatAmount(tx.amountUsd)}</p>
                    <p className="text-right text-[12px] text-[#a4a7ae]">{formatShortDate(tx.createdAt)}</p>
                  </button>
                );
              }) : null}
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
    </div>
  );
}

function ActivityDetailPanel({
  activity,
  formatAmount,
  onClose,
}: {
  activity: WalletTransaction | AccountTransaction;
  formatAmount: (amount: number, options?: { compact?: boolean }) => string;
  onClose: () => void;
}) {
  const isWalletActivity = 'kind' in activity;
  const title = isWalletActivity ? formatTransactionTitle(activity) : activity.description;
  const status = isWalletActivity ? activity.status : activity.status;
  const amountLabel = isWalletActivity
    ? `${activity.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${activity.asset}`
    : formatAmount(activity.amountUsd);
  const chain = isWalletActivity ? activity.chain : 'USD account';
  const statusLabel = status ? String(status).replace(/_/g, ' ') : 'Unknown';
  const iconNode = isWalletActivity ? (
    <div className="relative shrink-0">
      <TokenIcon chain={activity.chain} symbol={activity.asset} label={activity.asset} size={44} />
      <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5">
        <ChainIcon chain={activity.chain} size={18} />
      </div>
    </div>
  ) : (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ecfdf3] text-[#717680]">
      <Bank className="h-5 w-5" weight="bold" />
    </div>
  );

  return (
    <ClientPortal>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={onClose} />

      <div
        className="fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-full max-w-[480px] flex-col bg-white shadow-2xl animate-in slide-in-from-left-full duration-300 ease-out"
        role="dialog"
        aria-modal="true"
        aria-label="Activity details"
      >
        <div className="flex items-center gap-4 border-b border-[#e9eaeb] px-5 py-4">
          {iconNode}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-bold text-[#181d27]">{title}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[12px] text-[#a4a7ae]">{formatShortDate(activity.createdAt)}</span>
              <span className="text-[#e9eaeb]">·</span>
              <span className="truncate text-[12px] text-[#a4a7ae]">{chain}</span>
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
          <div className="border-b border-[#f2f4f7] bg-[#fafafa] px-5 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Amount</p>
            <p className="mt-1 text-[28px] font-bold leading-none tracking-[-0.04em] text-[#181d27]">{amountLabel}</p>
            <p className="mt-2 text-[13px] font-medium capitalize text-[#717680]">{statusLabel}</p>
          </div>

          <div className="px-5 py-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Details</p>
            <div className="overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white">
              <div className="divide-y divide-[#f2f4f7] px-4">
                <ActivityDetailRow label="Type" value={isWalletActivity ? formatTransactionKind(activity.kind) : 'USD transfer'} />
                <ActivityDetailRow label="Status" value={statusLabel} />
                {isWalletActivity ? <ActivityDetailRow label="Chain" value={activity.chain} /> : null}
                {isWalletActivity ? <ActivityDetailRow label="Counterparty" value={activity.counterparty || 'Unknown'} /> : null}
                {isWalletActivity && activity.fiatAmount ? (
                  <ActivityDetailRow label="Fiat amount" value={`${activity.fiatAmount.toLocaleString()} ${activity.fiatCurrency || ''}`.trim()} />
                ) : null}
                {isWalletActivity && activity.exchangeRate ? (
                  <ActivityDetailRow label="Exchange rate" value={activity.exchangeRate.toLocaleString()} />
                ) : null}
                {isWalletActivity && activity.destinationLabel ? (
                  <ActivityDetailRow label={activity.kind === 'onramp' ? 'Source' : 'Destination'} value={activity.destinationLabel} />
                ) : null}
                {isWalletActivity && activity.txHash ? (
                  <ActivityDetailRow label="Transaction hash" value={activity.txHash} mono />
                ) : null}
                {!isWalletActivity ? <ActivityDetailRow label="Description" value={activity.description} /> : null}
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
      <span className="shrink-0 text-[12px] text-[#717680]">{label}</span>
      <span className={`text-right text-[13px] font-semibold capitalize text-[#181d27] ${mono ? 'break-all font-mono text-[11px] normal-case' : ''}`}>{value}</span>
    </div>
  );
}

function ChainIcon({ chain, size = 24 }: { chain: string; size?: number }) {
  const iconSrc = chainIconByName[chain];
  if (!iconSrc) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full bg-[#f2f4f7] text-[9px] font-bold text-[#717680]"
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
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7] text-[11px] font-semibold text-[#667085]">
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
