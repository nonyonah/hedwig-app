'use client';

import { useCallback, useState } from 'react';
import { Bank, X } from '@/components/ui/lucide-icons';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { ClientPortal } from '@/components/ui/client-portal';
import { StrailsSection } from '@/components/preferences/strails-section';
import { PayoutBankSection } from '@/components/preferences/payout-bank-section';
import { useCurrency } from '@/components/providers/currency-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { Button } from '@/components/ui/button';
import { hedwigApi } from '@/lib/api/client';
import type { AccountTransaction, UsdAccount } from '@/lib/models/entities';
import { formatShortDate } from '@/lib/utils';

const USD_TX_STATUS: Record<AccountTransaction['status'], { dot: string; label: string }> = {
 pending: { dot: 'bg-[var(--color-warning)]', label: 'Pending' },
 completed: { dot: 'bg-[var(--color-success)]', label: 'Completed' },
 failed: { dot: 'bg-[var(--color-danger)]', label: 'Failed' }
};

type AccountsData = {
 usdAccount: UsdAccount;
 accountTransactions: AccountTransaction[];
};

export function BankAccountsView({
 initialAccountsData,
 usdAccountsEnabled = false,
 isUsdAccountPaywalled = false,
 accessToken,
}: {
 initialAccountsData: AccountsData;
 usdAccountsEnabled?: boolean;
 isUsdAccountPaywalled?: boolean;
 accessToken: string | null;
}) {
 const { formatAmount } = useCurrency();
 useAssistantPageContext('Bank Accounts', {
 transactionsCount: initialAccountsData.accountTransactions.length,
 usdBalance: initialAccountsData.usdAccount.balanceUsd,
 });

 const [showAllActivity, setShowAllActivity] = useState(false);
 const [selectedActivity, setSelectedActivity] = useState<AccountTransaction | null>(null);
 const [usdSetupState, setUsdSetupState] = useState<'idle' | 'enrolling' | 'kyc_loading' | 'error'>('idle');
 const [usdSetupError, setUsdSetupError] = useState('');
 const usdAccount = initialAccountsData.usdAccount;
 const accountTransactions = initialAccountsData.accountTransactions;

 const hasAssignedAccount = Boolean(usdAccount.hasAssignedAccount || usdAccount.accountNumberMasked || usdAccount.routingNumberMasked);
 const hasBridgeEnrollment = Boolean(usdAccount.bridgeCustomerId || hasAssignedAccount);
 const effectiveUsdStatus = hasBridgeEnrollment ? usdAccount.status : 'not_started';

 const shouldShowUsdSetupCard = usdAccountsEnabled && !isUsdAccountPaywalled && (effectiveUsdStatus === 'not_started' || effectiveUsdStatus === 'pending_kyc');

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
 : effectiveUsdStatus === 'active'
 ? 'Active'
 : effectiveUsdStatus === 'pending_kyc'
 ? 'Pending setup'
 : 'Not started';

 const recentUsdTx = showAllActivity ? accountTransactions : accountTransactions.slice(0, 6);
 const canToggleActivity = accountTransactions.length > 6;

 return (
 <div className="space-y-6">
 <div>
 <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Bank accounts</h1>
 <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">USD account, virtual accounts, and payout bank details.</p>
 </div>

 {usdAccountsEnabled ? (
 <>
 <AttachedStatGrid
 items={[
 {
 id: 'usd-account',
 title: 'USD account',
 value: formatAmount(usdAccount.balanceUsd, { compact: true }),
 helper: usdStatusLabel,
 icon: Bank,
 valueClassName: 'text-[var(--color-text-tertiary)]',
 iconClassName: 'text-[var(--color-text-tertiary)]',
 },
 ...(effectiveUsdStatus === 'active' ? [{
 id: 'auto-settlement',
 title: 'Auto-settlement',
 value: usdAccount.settlementChain,
 helper: 'USD deposits settle here',
 icon: Bank,
 iconClassName: 'text-[var(--color-text-tertiary)]',
 }] : []),
 ]}
 className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
 />

 {shouldShowUsdSetupCard ? (
 <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
 <div className="flex items-start gap-5 px-5 py-5">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
 <Bank className="h-5 w-5 text-[var(--color-primary)]" weight="bold" />
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-[15px] font-semibold text-[var(--color-foreground)]">Set up your USD account</p>
 <p className="mt-1 text-[13px] leading-5 text-[var(--color-text-tertiary)]">
 Get a US bank account number and routing number. Clients can pay you directly by ACH
 or wire — the funds settle as USDC in your wallet automatically.
 </p>
 {usdSetupError ? (
 <p className="mt-2 text-[12px] text-[var(--color-danger)]">{usdSetupError}</p>
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
 className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
 >
 Dismiss
 </Button>
 ) : null}
 </>
 ) : (
 <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-tertiary)]">
 <svg className="h-4 w-4 animate-spin text-[var(--color-primary)]" viewBox="0 0 24 24" fill="none">
 <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
 <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
 </svg>
 {usdSetupState === 'enrolling' ? 'Setting up your account\u2026' : 'Preparing KYC verification\u2026'}
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 ) : null}

 {effectiveUsdStatus === 'active' && hasAssignedAccount ? (
 <section className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
 <div className="flex items-center justify-between border-b border-[var(--color-surface-tertiary)] px-5 py-4">
 <div>
 <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">USD account details</h2>
 <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">
 Receive ACH and wire transfers to this account.
 </p>
 </div>
 </div>
 <div className="px-5 py-5 space-y-3">
 <div className="rounded-2xl border border-[var(--color-border)] px-4 py-4 space-y-3">
 <div className="flex items-center justify-between gap-4">
 <span className="text-[13px] text-[var(--color-text-tertiary)]">Bank</span>
 <span className="text-right text-[13px] font-semibold text-[var(--color-foreground)]">{usdAccount.bankName || 'Bridge'}</span>
 </div>
 <div className="flex items-center justify-between gap-4">
 <span className="text-[13px] text-[var(--color-text-tertiary)]">Account number</span>
 <span className="text-right font-mono text-[13px] font-semibold text-[var(--color-foreground)]">{usdAccount.accountNumberMasked}</span>
 </div>
 <div className="flex items-center justify-between gap-4">
 <span className="text-[13px] text-[var(--color-text-tertiary)]">Routing number</span>
 <span className="text-right font-mono text-[13px] font-semibold text-[var(--color-foreground)]">{usdAccount.routingNumberMasked}</span>
 </div>
 {usdAccount.depositMessage ? (
 <div className="flex items-center justify-between gap-4">
 <span className="text-[13px] text-[var(--color-text-tertiary)]">Memo / reference</span>
 <span className="text-right font-mono text-[13px] font-semibold text-[var(--color-foreground)]">{usdAccount.depositMessage}</span>
 </div>
 ) : null}
 </div>
 <p className="text-[11px] text-[var(--color-text-muted)]">
 Funds arrive as USDC in your wallet on {usdAccount.settlementChain}. Transfers usually complete in 1\u20132 business days.
 </p>
 </div>
 </section>
 ) : null}

 {accountTransactions.length > 0 ? (
 <div>
 <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
 <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
 <div>
 <p className="text-[15px] font-semibold text-[var(--color-foreground)]">USD activity</p>
 <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
 ACH settlements, wire transfers, and USDC conversions.
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
 <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Transaction</span>
 <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Status</span>
 <span className="text-right text-[11px] font-semibold text-[var(--color-text-muted)]">Amount</span>
 <span className="text-right text-[11px] font-semibold text-[var(--color-text-muted)]">Date</span>
 </div>

 <div className="divide-y divide-[var(--color-surface-secondary)]">
 {recentUsdTx.map((tx) => {
 const status = USD_TX_STATUS[tx.status] ?? USD_TX_STATUS.pending;
 return (
 <button
 key={tx.id}
 type="button"
 onClick={() => setSelectedActivity(tx)}
 className="grid w-full grid-cols-[1fr_100px_100px_90px] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[var(--color-background)]"
 >
 <div className="flex min-w-0 items-center gap-3">
 <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]">
 <Bank className="h-4 w-4" weight="bold" />
 </div>
 <div className="min-w-0">
 <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)]">{tx.description}</p>
 <p className="text-[11px] text-[var(--color-text-muted)]">USD transfer</p>
 </div>
 </div>
 <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface-tertiary)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-tertiary)]">
 <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
 {status.label}
 </span>
 <p className="text-right text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">{formatAmount(tx.amountUsd)}</p>
 <p className="text-right text-[12px] text-[var(--color-text-muted)]">{formatShortDate(tx.createdAt)}</p>
 </button>
 );
 })}
 </div>
 </div>
 </div>
 ) : null}
 </>
 ) : null}

 <StrailsSection accessToken={accessToken} />

 <PayoutBankSection accessToken={accessToken} />

 {selectedActivity ? (
 <UsdActivityDetailPanel
 activity={selectedActivity}
 formatAmount={formatAmount}
 onClose={() => setSelectedActivity(null)}
 />
 ) : null}
 </div>
 );
}

function UsdActivityDetailPanel({
 activity,
 formatAmount,
 onClose,
}: {
 activity: AccountTransaction;
 formatAmount: (amount: number, options?: { compact?: boolean }) => string;
 onClose: () => void;
}) {
 const status = USD_TX_STATUS[activity.status] ?? USD_TX_STATUS.pending;

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
 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]">
 <Bank className="h-5 w-5" weight="bold" />
 </div>
 <div className="min-w-0 flex-1">
 <p className="truncate text-[16px] font-bold text-[var(--color-foreground)]">{activity.description}</p>
 <div className="mt-0.5 flex items-center gap-2">
 <span className="text-[12px] text-[var(--color-text-muted)]">{formatShortDate(activity.createdAt)}</span>
 <span className="text-[var(--color-border)]">·</span>
 <span className="truncate text-[12px] text-[var(--color-text-muted)]">USD account</span>
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
 <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">Amount</p>
 <p className="mt-1 text-[28px] font-bold leading-none tracking-[-0.04em] text-[var(--color-foreground)]">{formatAmount(activity.amountUsd)}</p>
 <p className="mt-2 text-[13px] font-medium capitalize text-[var(--color-text-tertiary)]">{status.label}</p>
 </div>

 <div className="px-5 py-5">
 <p className="mb-2 text-[11px] font-semibold text-[var(--color-text-muted)]">Details</p>
 <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
 <div className="divide-y divide-[var(--color-surface-tertiary)] px-4">
 <div className="flex items-start justify-between gap-4 py-3">
 <span className="shrink-0 text-[12px] text-[var(--color-text-tertiary)]">Type</span>
 <span className="text-right text-[13px] font-semibold capitalize text-[var(--color-foreground)]">USD transfer</span>
 </div>
 <div className="flex items-start justify-between gap-4 py-3">
 <span className="shrink-0 text-[12px] text-[var(--color-text-tertiary)]">Status</span>
 <span className="text-right text-[13px] font-semibold capitalize text-[var(--color-foreground)]">{status.label}</span>
 </div>
 <div className="flex items-start justify-between gap-4 py-3">
 <span className="shrink-0 text-[12px] text-[var(--color-text-tertiary)]">Description</span>
 <span className="text-right text-[13px] font-semibold text-[var(--color-foreground)]">{activity.description}</span>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 </ClientPortal>
 );
}
