'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { ArrowsLeftRight, ArrowSquareOut, Bank, Coins, SpinnerGap, Wallet } from '@/components/ui/lucide-icons';
import { useToast } from '@/components/providers/toast-provider';
import { ShareWalletDialog } from '@/components/wallet/share-wallet-dialog';
import { ChangeSettlementDialog } from '@/components/wallet/change-settlement-dialog';
import { WalletAssetsTable } from '@/components/wallet/wallet-assets-table';
import { hedwigApi } from '@/lib/api/client';
import type { AccountTransaction, UsdAccount, WalletAccount, WalletAsset, WalletTransaction } from '@/lib/models/entities';
import { formatCurrency, formatShortDate } from '@/lib/utils';

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

const supportedAssets: Array<{ chain: WalletAsset['chain']; symbol: string; name: string }> = [
  { chain: 'Base', symbol: 'USDC', name: 'USD Coin' },
  { chain: 'Solana', symbol: 'USDC', name: 'USD Coin' },
  { chain: 'Arbitrum', symbol: 'USDC', name: 'USD Coin' },
  { chain: 'Polygon', symbol: 'USDC', name: 'USD Coin' },
  { chain: 'Celo', symbol: 'USDC', name: 'USD Coin' },
];

const TX_KIND: Record<WalletTransaction['kind'], { dot: string; bg: string; text: string }> = {
  receive: { dot: 'bg-[#12b76a]', bg: 'bg-[#ecfdf3]', text: 'text-[#717680]' },
  send: { dot: 'bg-[#f04438]', bg: 'bg-[#fff1f0]', text: 'text-[#717680]' },
  payment: { dot: 'bg-[#2563eb]', bg: 'bg-[#eff4ff]', text: 'text-[#717680]' },
  settlement: { dot: 'bg-[#f59e0b]', bg: 'bg-[#fffaeb]', text: 'text-[#717680]' }
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

type ActionState = 'enroll' | 'bridge_kyc' | 'refresh' | null;

export function WalletView({
  initialWalletData,
  initialAccountsData,
  accessToken: serverAccessToken,
  usdAccountsEnabled = false,
  isUsdAccountPaywalled = false,
  isUsdAccountRegionLocked = false,
  usdAccountRegionLockReason = null,
  regionCountryCode = null,
}: {
  initialWalletData: WalletData;
  initialAccountsData: AccountsData;
  accessToken: string | null;
  usdAccountsEnabled?: boolean;
  isUsdAccountPaywalled?: boolean;
  isUsdAccountRegionLocked?: boolean;
  usdAccountRegionLockReason?: string | null;
  regionCountryCode?: string | null;
}) {
  const { toast } = useToast();
  const { getAccessToken } = usePrivy();
  const [usdAccount, setUsdAccount] = useState(initialAccountsData.usdAccount);
  const [accountTransactions, setAccountTransactions] = useState(initialAccountsData.accountTransactions);
  const [actionState, setActionState] = useState<ActionState>(null);

  useEffect(() => {
    setUsdAccount(initialAccountsData.usdAccount);
    setAccountTransactions(initialAccountsData.accountTransactions);
  }, [initialAccountsData]);

  const { walletAccounts, walletAssets, walletTransactions } = initialWalletData;
  const baseAccount = walletAccounts.find((account) => account.chain === 'Base');
  const solanaAccount = walletAccounts.find((account) => account.chain === 'Solana');

  const allAssets = useMemo(() => mergeSupportedAssets(walletAssets), [walletAssets]);
  const assetsByChain = useMemo(() => groupAssetsByChain(allAssets), [allAssets]);
  const totalCrypto = allAssets.reduce((sum, asset) => sum + asset.valueUsd, 0);
  const recentWalletTx = walletTransactions.slice(0, 6);
  const recentUsdTx = usdAccountsEnabled ? accountTransactions.slice(0, 6) : [];

  const getFreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const token = await getAccessToken();
      return token ?? serverAccessToken;
    } catch {
      return serverAccessToken;
    }
  }, [getAccessToken, serverAccessToken]);

  const refreshUsdAccount = useCallback(async (announce = false) => {
    const token = await getFreshToken();
    if (!token) {
      throw new Error('Session expired. Please sign in again.');
    }

    const data = await hedwigApi.accounts({ accessToken: token, disableMockFallback: true });
    setUsdAccount(data.usdAccount);
    setAccountTransactions(data.accountTransactions);

    if (announce) {
      toast({
        type: 'success',
        title: data.usdAccount.hasAssignedAccount ? 'USD account refreshed' : 'Bridge status refreshed',
        message: data.usdAccount.hasAssignedAccount
          ? 'Your latest USD account details are now available.'
          : 'We checked Bridge again for your latest verification status.'
      });
    }

    return data;
  }, [getFreshToken, toast]);

  const openBridgeKyc = useCallback(async (token: string, announce = true) => {
    const result = await hedwigApi.createUsdAccountKycLink({ accessToken: token, disableMockFallback: true });
    if (!result.url) {
      throw new Error('Could not open Bridge verification.');
    }

    window.open(result.url, '_blank', 'noopener,noreferrer');

    if (announce) {
      toast({
        type: 'info',
        title: 'Bridge verification opened',
        message: 'Finish the verification in the new tab, then come back here and refresh your USD account.'
      });
    }
  }, [toast]);

  const handleEnroll = useCallback(async () => {
    if (isUsdAccountPaywalled) {
      toast({
        type: 'warning',
        title: 'Upgrade required',
        message: 'USD accounts are a Pro feature. Upgrade on the pricing page to unlock this.'
      });
      return;
    }
    if (isUsdAccountRegionLocked) {
      toast({
        type: 'warning',
        title: 'USD account unavailable',
        message: usdAccountRegionLockReason || 'This feature is not available in your region yet.'
      });
      return;
    }
    setActionState('enroll');
    try {
      const token = await getFreshToken();
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }

      const result = await hedwigApi.enrollUsdAccount({ accessToken: token, disableMockFallback: true });
      let refreshedAccount = usdAccount;

      try {
        const refreshed = await refreshUsdAccount(false);
        refreshedAccount = refreshed.usdAccount;
      } catch {
        // If refresh fails immediately, keep the optimistic success flow below.
      }

      if (result.nextAction === 'complete_bridge_kyc') {
        try {
          await openBridgeKyc(token, false);
          toast({
            type: 'success',
            title: 'USD account setup started',
            message: 'Bridge verification opened in a new tab. Complete that step to get your USD account assigned.'
          });
        } catch {
          toast({
            type: 'warning',
            title: 'USD account created',
            message: 'Your Bridge profile is ready. Click Complete Bridge verification to finish setup.'
          });
        }
        return;
      }

      toast({
        type: 'success',
        title: refreshedAccount.hasAssignedAccount ? 'USD account assigned' : 'USD account created',
        message: refreshedAccount.hasAssignedAccount
          ? 'Your USD banking details are ready in the wallet.'
          : 'Your Bridge profile is ready. Refresh again if the banking details are still pending.'
      });
    } catch (error) {
      toast({
        type: 'error',
        title: 'Could not set up USD account',
        message: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setActionState(null);
    }
  }, [getFreshToken, isUsdAccountPaywalled, isUsdAccountRegionLocked, openBridgeKyc, refreshUsdAccount, toast, usdAccount, usdAccountRegionLockReason]);

  const handleOpenBridgeKyc = useCallback(async () => {
    if (isUsdAccountPaywalled) {
      toast({
        type: 'warning',
        title: 'Upgrade required',
        message: 'USD accounts are a Pro feature. Upgrade on the pricing page to unlock this.'
      });
      return;
    }
    if (isUsdAccountRegionLocked) {
      toast({
        type: 'warning',
        title: 'USD account unavailable',
        message: usdAccountRegionLockReason || 'This feature is not available in your region yet.'
      });
      return;
    }
    setActionState('bridge_kyc');
    try {
      const token = await getFreshToken();
      if (!token) {
        throw new Error('Session expired. Please sign in again.');
      }

      await openBridgeKyc(token);
    } catch (error) {
      toast({
        type: 'error',
        title: 'Could not open Bridge verification',
        message: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setActionState(null);
    }
  }, [getFreshToken, isUsdAccountPaywalled, isUsdAccountRegionLocked, openBridgeKyc, toast, usdAccountRegionLockReason]);

  const handleRefresh = useCallback(async () => {
    if (isUsdAccountPaywalled) {
      toast({
        type: 'warning',
        title: 'Upgrade required',
        message: 'USD accounts are a Pro feature. Upgrade on the pricing page to unlock this.'
      });
      return;
    }
    if (isUsdAccountRegionLocked) {
      toast({
        type: 'warning',
        title: 'USD account unavailable',
        message: usdAccountRegionLockReason || 'This feature is not available in your region yet.'
      });
      return;
    }
    setActionState('refresh');
    try {
      await refreshUsdAccount(true);
    } catch (error) {
      toast({
        type: 'error',
        title: 'Could not refresh USD account',
        message: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setActionState(null);
    }
  }, [isUsdAccountPaywalled, isUsdAccountRegionLocked, refreshUsdAccount, toast, usdAccountRegionLockReason]);

  const handleSettlementUpdated = useCallback(async () => {
    if (isUsdAccountPaywalled || isUsdAccountRegionLocked) return;
    const refreshed = await refreshUsdAccount(false);
    setUsdAccount(refreshed.usdAccount);
    setAccountTransactions(refreshed.accountTransactions);
    toast({
      type: 'success',
      title: 'Settlement chain updated',
      message: `USD deposits will now settle to ${refreshed.usdAccount.settlementChain}.`
    });
  }, [isUsdAccountPaywalled, isUsdAccountRegionLocked, refreshUsdAccount, toast]);

  const hasAssignedAccount = Boolean(usdAccount.hasAssignedAccount || usdAccount.accountNumberMasked || usdAccount.routingNumberMasked);
  const hasBridgeEnrollment = Boolean(usdAccount.bridgeCustomerId || hasAssignedAccount);
  const effectiveUsdStatus = hasBridgeEnrollment ? usdAccount.status : 'not_started';
  const effectiveBridgeStatus = hasBridgeEnrollment ? (usdAccount.bridgeKycStatus || 'not_started') : 'not_started';

  const usdStatusLabel = isUsdAccountPaywalled
    ? 'Pro'
    : isUsdAccountRegionLocked
    ? 'Unavailable'
    : effectiveUsdStatus === 'active'
      ? 'Active'
      : effectiveUsdStatus === 'pending_kyc'
        ? 'Pending setup'
        : 'Not started';
  const usdStatusDot = isUsdAccountPaywalled
    ? 'bg-[#2563eb]'
    : isUsdAccountRegionLocked
    ? 'bg-[#a4a7ae]'
    : effectiveUsdStatus === 'active'
      ? 'bg-[#12b76a]'
      : effectiveUsdStatus === 'pending_kyc'
        ? 'bg-[#f59e0b]'
        : 'bg-[#a4a7ae]';
  const usdStatusTone = isUsdAccountPaywalled
    ? 'bg-[#eff4ff] text-[#175cd3]'
    : isUsdAccountRegionLocked
    ? 'bg-[#f2f4f7] text-[#717680]'
    : effectiveUsdStatus === 'active'
      ? 'bg-[#ecfdf3] text-[#717680]'
      : effectiveUsdStatus === 'pending_kyc'
        ? 'bg-[#fffaeb] text-[#717680]'
        : 'bg-[#f2f4f7] text-[#717680]';

  const needsDiditKyc = usdAccount.diditKycStatus !== 'approved';
  const bridgeApproved = effectiveBridgeStatus === 'approved';

  const usdSetupState = getUsdSetupState({
    account: usdAccount,
    needsDiditKyc,
    bridgeApproved,
    hasAssignedAccount,
    hasBridgeEnrollment,
    actionState,
    isPaywalled: isUsdAccountPaywalled,
    isRegionLocked: isUsdAccountRegionLocked,
    regionLockReason: usdAccountRegionLockReason,
    regionCountryCode
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-[#181d27]">Wallet</h1>
          <p className="mt-0.5 text-[13px] text-[#a4a7ae]">Your crypto balances and transaction activity in one place.</p>
        </div>
        <div className="shrink-0 pt-1">
          <ShareWalletDialog
            baseAddress={baseAccount?.address ?? null}
            solanaAddress={solanaAccount?.address ?? null}
          />
        </div>
      </div>

      <div className={`grid gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb] ${usdAccountsEnabled ? 'grid-cols-4' : 'grid-cols-2'}`}>
        <div className="bg-white px-5 py-4">
          <div className="mb-2 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-[#717680]" weight="bold" />
            <span className="text-[12px] font-medium text-[#717680]">Crypto portfolio</span>
          </div>
          <p className="text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">{formatCurrency(totalCrypto)}</p>
          <p className="mt-1 text-[11px] text-[#a4a7ae]">Base + Solana</p>
        </div>
        {usdAccountsEnabled ? (
          <div className="bg-white px-5 py-4">
            <div className="mb-2 flex items-center gap-2">
              <Bank className="h-4 w-4 text-[#717680]" weight="bold" />
              <span className="text-[12px] font-medium text-[#717680]">USD account</span>
            </div>
            <p className="text-[22px] font-bold tracking-[-0.03em] text-[#717680]">{formatCurrency(usdAccount.balanceUsd)}</p>
            <p className="mt-1 text-[11px] text-[#a4a7ae]">{usdStatusLabel}</p>
          </div>
        ) : null}
        <div className="bg-white px-5 py-4">
          <div className="mb-2 flex items-center gap-2">
            <Coins className="h-4 w-4 text-[#717680]" weight="bold" />
            <span className="text-[12px] font-medium text-[#717680]">Assets tracked</span>
          </div>
          <p className="text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">{allAssets.length}</p>
          <p className="mt-1 text-[11px] text-[#a4a7ae]">USDC across supported chains</p>
        </div>
        {usdAccountsEnabled ? (
          <div className="bg-white px-5 py-4">
            <div className="mb-2 flex items-center gap-2">
              <ArrowsLeftRight className="h-4 w-4 text-[#717680]" weight="bold" />
              <span className="text-[12px] font-medium text-[#717680]">Auto-settlement</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <ChainIcon chain={usdAccount.settlementChain} size={20} />
              <p className="text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">{usdAccount.settlementChain}</p>
            </div>
            <p className="mt-1 text-[11px] text-[#a4a7ae]">USD deposits settle here</p>
          </div>
        ) : null}
      </div>

      <WalletAssetsTable assetsByChain={assetsByChain} totalCrypto={totalCrypto} />

      <div className={usdAccountsEnabled ? 'grid gap-5 xl:grid-cols-[400px_1fr]' : ''}>
        {usdAccountsEnabled ? (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
          <div className="border-b border-[#e9eaeb] px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold text-[#181d27]">USD account</p>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${usdStatusTone}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${usdStatusDot}`} />
                {usdStatusLabel}
              </span>
            </div>
          </div>

          <div className="border-b border-[#e9eaeb] bg-[#f8f9fc] px-5 py-5">
            <p className="mb-1 text-[11px] font-medium text-[#a4a7ae]">Available balance</p>
            <p className="text-[32px] font-bold leading-none tracking-[-0.04em] text-[#181d27]">{formatCurrency(usdAccount.balanceUsd)}</p>
          </div>

          <UsdSetupPanel
            account={usdAccount}
            hasBridgeEnrollment={hasBridgeEnrollment}
            actionState={actionState}
            isPaywalled={isUsdAccountPaywalled}
            isRegionLocked={isUsdAccountRegionLocked}
            regionLockReason={usdAccountRegionLockReason}
            regionCountryCode={regionCountryCode}
            onEnroll={handleEnroll}
            onOpenBridgeKyc={handleOpenBridgeKyc}
            onRefresh={handleRefresh}
          />

          <div className="divide-y divide-[#f2f4f7] px-5">
            <DetailRow label="Bank" value={usdAccount.bankName ?? 'Pending assignment'} />
            <DetailRow label="Account number" value={usdAccount.accountNumberMasked ?? 'Pending assignment'} mono />
            <DetailRow label="Routing number" value={usdAccount.routingNumberMasked ?? 'Pending routing details'} mono />
            <DetailRow label="Settlement token" value={usdAccount.settlementToken ?? 'USDC'} />
            <div className="flex items-center justify-between py-3.5">
              <span className="text-[12px] text-[#717680]">Settlement chain</span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <ChainIcon chain={usdAccount.settlementChain} size={16} />
                  <span className="text-[13px] font-semibold text-[#181d27]">{usdAccount.settlementChain}</span>
                </div>
                {!isUsdAccountPaywalled && !isUsdAccountRegionLocked ? (
                  <ChangeSettlementDialog
                    currentChain={usdAccount.settlementChain}
                    accessToken={serverAccessToken ?? ''}
                    onUpdated={handleSettlementUpdated}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-t border-[#e9eaeb] bg-[#fcfcfd] px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {usdSetupState.caption ? <span className="text-[11px] text-[#a4a7ae]">{usdSetupState.caption}</span> : null}
            </div>
          </div>
        </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
          <div className="border-b border-[#e9eaeb] px-5 py-4">
            <p className="text-[15px] font-semibold text-[#181d27]">Recent activity</p>
            <p className="mt-0.5 text-[12px] text-[#a4a7ae]">
              {usdAccountsEnabled ? 'Wallet transactions and USD transfers' : 'Wallet transactions'}
            </p>
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
                  <div key={tx.id} className="grid grid-cols-[1fr_100px_100px_90px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fafafa]">
                    <div className="flex min-w-0 items-center gap-3">
                      <TokenIcon chain={tx.chain} symbol={tx.asset} label={tx.asset} size={32} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold capitalize text-[#181d27]">{tx.kind} · {tx.asset}</p>
                        <p className="truncate text-[11px] text-[#a4a7ae]">{tx.counterparty || tx.chain}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${kind.bg} ${kind.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${kind.dot}`} />
                      <span className="capitalize">{tx.kind}</span>
                    </span>
                    <p className="text-right text-[13px] font-semibold tabular-nums text-[#181d27]">
                      {tx.amount} <span className="text-[11px] font-normal text-[#a4a7ae]">{tx.asset}</span>
                    </p>
                    <p className="text-right text-[12px] text-[#a4a7ae]">{formatShortDate(tx.createdAt)}</p>
                  </div>
                );
              })}

              {usdAccountsEnabled ? recentUsdTx.map((tx) => {
                const status = USD_TX_STATUS[tx.status] ?? USD_TX_STATUS.pending;
                return (
                  <div key={tx.id} className="grid grid-cols-[1fr_100px_100px_90px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fafafa]">
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
                    <p className="text-right text-[13px] font-semibold tabular-nums text-[#181d27]">{formatCurrency(tx.amountUsd)}</p>
                    <p className="text-right text-[12px] text-[#a4a7ae]">{formatShortDate(tx.createdAt)}</p>
                  </div>
                );
              }) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UsdSetupPanel({
  account,
  hasBridgeEnrollment,
  actionState,
  isPaywalled,
  isRegionLocked,
  regionLockReason,
  regionCountryCode,
  onEnroll,
  onOpenBridgeKyc,
  onRefresh
}: {
  account: UsdAccount;
  hasBridgeEnrollment: boolean;
  actionState: ActionState;
  isPaywalled: boolean;
  isRegionLocked: boolean;
  regionLockReason?: string | null;
  regionCountryCode?: string | null;
  onEnroll: () => void;
  onOpenBridgeKyc: () => void;
  onRefresh: () => void;
}) {
  const needsDiditKyc = account.diditKycStatus !== 'approved';
  const hasAssignedAccount = Boolean(account.hasAssignedAccount || account.accountNumberMasked || account.routingNumberMasked);
  const bridgeApproved = hasBridgeEnrollment && account.bridgeKycStatus === 'approved';
  const state = getUsdSetupState({
    account,
    needsDiditKyc,
    bridgeApproved,
    hasAssignedAccount,
    hasBridgeEnrollment,
    actionState,
    isPaywalled,
    isRegionLocked,
    regionLockReason,
    regionCountryCode
  });

  return (
    <div className="border-b border-[#e9eaeb] px-5 py-4">
      <div className={`rounded-[18px] border px-4 py-4 ${state.tone}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[#181d27]">{state.title}</p>
            <p className="mt-1 text-[12px] leading-5 text-[#717680]">{state.description}</p>
          </div>
          <div className="shrink-0">
            <ChainIcon chain={account.settlementChain} size={22} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {state.primaryAction === 'upgrade' ? (
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full bg-[#2563eb] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              Upgrade to Pro
            </Link>
          ) : state.primaryAction === 'enroll' ? (
            <ActionButton
              busy={actionState === 'enroll'}
              onClick={onEnroll}
              label="Create USD account"
              busyLabel="Creating…"
            />
          ) : state.primaryAction === 'bridge_kyc' ? (
            <ActionButton
              busy={actionState === 'bridge_kyc'}
              onClick={onOpenBridgeKyc}
              label="Complete account verification"
              busyLabel="Opening…"
              icon
            />
          ) : state.primaryAction === 'refresh' ? (
            <ActionButton
              busy={actionState === 'refresh'}
              onClick={onRefresh}
              label={hasAssignedAccount ? 'Refresh details' : 'Generate USD account'}
              busyLabel="Refreshing…"
            />
          ) : null}
          {state.secondaryAction === 'settings' ? (
            <Link
              href="/settings"
              className="inline-flex items-center justify-center rounded-full border border-[#d5d7da] bg-white px-4 py-2 text-[12px] font-semibold text-[#414651] transition hover:bg-[#fafafa]"
            >
              Complete verification in settings
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  busy,
  onClick,
  label,
  busyLabel,
  icon
}: {
  busy: boolean;
  onClick: () => void;
  label: string;
  busyLabel: string;
  icon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#2563eb] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <SpinnerGap className="h-3.5 w-3.5 animate-spin" weight="bold" /> : icon ? <ArrowSquareOut className="h-3.5 w-3.5" weight="bold" /> : null}
      {busy ? busyLabel : label}
    </button>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <span className="text-[12px] text-[#717680]">{label}</span>
      <span className={`text-[13px] font-semibold text-[#181d27] ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</span>
    </div>
  );
}

function ChainIcon({ chain, size = 24 }: { chain: 'Base' | 'Solana'; size?: number }) {
  return <Image src={chainIconByName[chain]} alt={chain} width={size} height={size} className="rounded-full shrink-0" />;
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

function getUsdSetupState({
  account,
  needsDiditKyc,
  bridgeApproved,
  hasAssignedAccount,
  hasBridgeEnrollment,
  actionState,
  isPaywalled,
  isRegionLocked,
  regionLockReason,
  regionCountryCode
}: {
  account: UsdAccount;
  needsDiditKyc: boolean;
  bridgeApproved: boolean;
  hasAssignedAccount: boolean;
  hasBridgeEnrollment: boolean;
  actionState: ActionState;
  isPaywalled: boolean;
  isRegionLocked: boolean;
  regionLockReason?: string | null;
  regionCountryCode?: string | null;
}) {
  if (isPaywalled) {
    return {
      tone: 'border-[#dbeafe] bg-[#f5f9ff]',
      title: 'USD account is a Pro feature',
      description: 'Upgrade to Pro to generate ACH account details, complete verification, and settle USD deposits.',
      primaryAction: 'upgrade',
      secondaryAction: null,
      caption: 'Pro plan required'
    } as const;
  }

  if (isRegionLocked) {
    return {
      tone: 'border-[#e9eaeb] bg-[#fcfcfd]',
      title: 'USD accounts are unavailable in your region',
      description: `${regionLockReason || 'This feature is not currently available where you are located.'}${regionCountryCode ? ` (Detected region: ${regionCountryCode})` : ''}`,
      primaryAction: null,
      secondaryAction: null,
      caption: 'Region locked'
    } as const;
  }

  if (account.featureEnabled === false) {
    return {
      tone: 'border-[#e9eaeb] bg-[#fcfcfd]',
      title: 'USD accounts are not enabled yet',
      description: 'This feature is still being rolled out for your account.',
      primaryAction: null,
      secondaryAction: null,
      caption: 'Feature gated'
    } as const;
  }

  if (needsDiditKyc) {
    return {
      tone: 'border-[#ffecd2] bg-[#fff9f5]',
      title: 'Complete verification before setup',
      description: 'Our banking partners require identity verification to be approved before you can generate a USD account.',
      primaryAction: 'settings',
      secondaryAction: null,
      caption: 'Verification required'
    } as const;
  }

  if (!hasBridgeEnrollment) {
    return {
      tone: 'border-[#d9e8ff] bg-[#f5f9ff]',
      title: 'Generate your USD account',
      description: 'Start the setup flow and we’ll begin assigning the ACH banking details tied to your wallet.',
      primaryAction: 'enroll',
      secondaryAction: null,
      caption: actionState === 'enroll' ? 'Creating account profile' : 'Account onboarding'
    } as const;
  }

  if (!bridgeApproved) {
    return {
      tone: 'border-[#ffecd2] bg-[#fff9f5]',
      title: 'Complete account verification',
      description: 'Your account profile is ready, but you still need to finish verification before the USD account can be assigned.',
      primaryAction: 'bridge_kyc',
      secondaryAction: null,
      caption: 'Verification pending'
    } as const;
  }

  if (!hasAssignedAccount) {
    return {
      tone: 'border-[#d9e8ff] bg-[#f5f9ff]',
      title: 'Generate your USD account details',
      description: 'Verification is approved. Refresh once to fetch the ACH routing and account details assigned to you.',
      primaryAction: 'refresh',
      secondaryAction: null,
      caption: 'Waiting for ACH details'
    } as const;
  }

  return {
    tone: 'border-[#d1fadf] bg-[#f6fef9]',
    title: 'Your USD account is ready',
    description: 'These ACH details are live and ready to receive USD deposits, which will settle as USDC to your chosen chain.',
    primaryAction: 'refresh',
    secondaryAction: null,
    caption: 'ACH details assigned'
  } as const;
}
