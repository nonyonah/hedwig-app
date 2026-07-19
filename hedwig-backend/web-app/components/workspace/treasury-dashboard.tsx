'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowRight, Buildings, Copy, Receipt, Warning, ArrowsClockwise } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { backendConfig } from '@/lib/auth/config';

interface TreasuryTx {
 id: string;
 type: string;
 source: string;
 originalAmount: string | null;
 originalCurrency: string | null;
 usdcAmount: string;
 usdAmount: string;
 status: string;
 createdAt: string;
}

interface TreasuryBalance {
 treasuryAddress: string | null;
 stellarTreasuryAddress?: string | null;
 balanceUsdc: string;
 balanceUsd: string;
 stellarBalanceUsdc?: string;
 stellarBalanceUsd?: string;
 combinedBalanceUsdc?: string;
 combinedBalanceUsd?: string;
 reservedUsdc: string;
 availableUsdc: string;
 recentTransactions: TreasuryTx[];
}

interface UsdAccount {
 id: string;
 accountNumber: string;
 routingNumber?: string;
 bankName?: string;
 depositMessage?: string;
 accountType?: string;
}

function timeAgo(dateStr: string): string {
 const now = Date.now();
 const then = new Date(dateStr).getTime();
 const seconds = Math.floor((now - then) / 1000);
 if (seconds < 60) return 'just now';
 const minutes = Math.floor(seconds / 60);
 if (minutes < 60) return `${minutes}m ago`;
 const hours = Math.floor(minutes / 60);
 if (hours < 24) return `${hours}h ago`;
 const days = Math.floor(hours / 24);
 if (days < 7) return `${days}d ago`;
 return new Date(dateStr).toLocaleDateString();
}

function statusColor(status: string): string {
 switch (status) {
 case 'completed':
 case 'settled': return 'text-[var(--color-text-tertiary)] bg-[var(--color-success-soft)]';
 case 'pending':
 case 'pending_convert': return 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]';
 case 'failed': return 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
 default: return 'text-[var(--color-text-secondary)] bg-[var(--color-surface-tertiary)]';
 }
}

function statusLabel(status: string): string {
 switch (status) {
 case 'completed': return 'Completed';
 case 'settled': return 'Settled';
 case 'pending': return 'Pending';
 case 'pending_convert': return 'Converting';
 case 'failed': return 'Failed';
 default: return status;
 }
}

function typeIcon(type: string) {
 switch (type) {
 case 'inflow': return <ArrowDown className="h-3 w-3 text-emerald-500" weight="bold" />;
 case 'payroll_out': return <ArrowUp className="h-3 w-3 text-amber-500" weight="bold" />;
 case 'manual_transfer': return <ArrowRight className="h-3 w-3 text-blue-500" weight="bold" />;
 default: return <Receipt className="h-3 w-3" weight="bold" />;
 }
}

function sourceLabel(source: string): string {
 switch (source) {
 case 'ngn_account': return 'NGN account deposit';
 case 'usd_account': return 'USD account deposit';
 case 'direct_crypto': return 'Direct crypto';
 case 'manual': return 'Manual transfer';
 case 'invoice': return 'Invoice payment';
 case 'payment_link': return 'Payment link';
 default: return source;
 }
}

function counterpartyLabel(source: string): string {
 switch (source) {
 case 'ngn_account': return 'NGN bank';
 case 'usd_account': return 'USD bank';
 case 'direct_crypto': return 'Crypto wallet';
 case 'manual': return 'Manual';
 case 'invoice': return 'Invoice';
 case 'payment_link': return 'Payment link';
 default: return source;
 }
}

function parseUsdValue(usdStr: string): number {
 return parseFloat(usdStr.replace(/[^0-9.]/g, '') || '0');
}

export function TreasuryDashboard() {
 const { activeWorkspace, accessToken } = useWorkspaceContext();
 const [balance, setBalance] = useState<TreasuryBalance | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [copied, setCopied] = useState(false);
 const [usdAccounts, setUsdAccounts] = useState<UsdAccount[]>([]);

 const api = async (url: string) => {
 const res = await fetch(`${backendConfig.apiBaseUrl}${url}`, {
 headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
 });
 if (!res.ok) {
 const body = await res.json().catch(() => ({}));
 throw new Error(body?.error || body?.error?.message || `Request failed (${res.status})`);
 }
 return res.json();
 };

 const fetchData = useCallback(async () => {
 if (!activeWorkspace) return;
 setLoading(true);
 setError(null);
 try {
 const [treasuryRes, accountsRes] = await Promise.all([
 api(`/api/workspaces/${activeWorkspace.id}/treasury`).catch(e => {
 if (e.message?.includes('202') || e.message?.includes('TREASURY_PENDING')) {
 return { data: null, pending: true };
 }
 throw e;
 }),
 api(`/api/usd-accounts`).catch(() => ({ data: { accounts: [] } })),
 ]);

 if (treasuryRes.data) {
 setBalance(treasuryRes.data);
 } else if (treasuryRes.pending) {
 setBalance(null);
 setError('pending');
 }

 setUsdAccounts(accountsRes?.data?.accounts || accountsRes?.data || []);
 } catch (e: any) {
 setError(e.message || 'Failed to load treasury');
 } finally {
 setLoading(false);
 }
 }, [activeWorkspace, accessToken]);

 useEffect(() => { fetchData(); }, [fetchData]);

 const copyAddress = async (text: string) => {
 await navigator.clipboard.writeText(text);
 setCopied(true);
 setTimeout(() => setCopied(false), 2000);
 };

 // Derived stats
 const combinedUsd = balance?.combinedBalanceUsd || balance?.balanceUsd || '0.00';
 const combinedNum = parseUsdValue(combinedUsd);
 const availableNum = balance ? parseUsdValue(balance.availableUsdc) / 1e6 : 0;
 const hasBase = !!balance?.treasuryAddress;
 const hasTransactions = (balance?.recentTransactions?.length || 0) > 0;

 const now = Date.now();
 const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

 const collected30d = (balance?.recentTransactions || [])
 .filter(tx => tx.type === 'inflow' && new Date(tx.createdAt).getTime() >= thirtyDaysAgo)
 .reduce((sum, tx) => sum + parseUsdValue(tx.usdAmount), 0);

 const pendingAmount = (balance?.recentTransactions || [])
 .filter(tx => tx.status === 'pending' || tx.status === 'pending_convert')
 .reduce((sum, tx) => sum + parseUsdValue(tx.usdAmount), 0);

 const settled30d = (balance?.recentTransactions || [])
 .filter(tx => new Date(tx.createdAt).getTime() >= thirtyDaysAgo)
 .filter(tx => tx.status === 'completed' || tx.status === 'settled')
 .filter(tx => tx.type === 'payroll_out' || tx.type === 'manual_transfer')
 .reduce((sum, tx) => sum + parseUsdValue(tx.usdAmount), 0);

 // Loading skeleton
 if (loading) {
 return (
 <div>
 <div className="mb-5">
 <div className="h-3 w-16 animate-pulse rounded bg-[var(--color-surface-tertiary)]" />
 <div className="mt-1.5 h-5 w-24 animate-pulse rounded bg-[var(--color-surface-tertiary)]" />
 </div>
 <div className="mb-4 grid grid-cols-4 gap-3">
 {[...Array(4)].map((_, i) => (
 <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]" />
 ))}
 </div>
 <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
 <div className="h-48 animate-pulse rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]" />
 <div className="flex flex-col gap-3">
 <div className="h-32 animate-pulse rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]" />
 <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]" />
 </div>
 </div>
 </div>
 );
 }

 // Personal workspace
 if (!activeWorkspace || activeWorkspace.type === 'personal') {
 return (
 <div className="flex items-center justify-center py-20">
 <div className="text-center">
 <Buildings className="mx-auto h-10 w-10 text-[var(--color-text-placeholder)]" weight="thin" />
 <p className="mt-4 text-[14px] text-[var(--color-text-tertiary)]">
 Treasury is available for organization workspaces.
 </p>
 </div>
 </div>
 );
 }

 // Pending treasury wallet creation
 if (error === 'pending') {
 return (
 <div className="mx-auto max-w-md py-16 text-center">
 <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800">
 <ArrowsClockwise className="h-6 w-6 text-amber-500" weight="bold" />
 </div>
 <p className="mt-4 text-[15px] font-semibold text-[var(--color-foreground)]">
 Treasury wallet is being set up
 </p>
 <p className="mt-1.5 text-[13px] text-[var(--color-text-tertiary)]">
 This usually takes a few seconds. Check back shortly.
 </p>
 <Button variant="outline" size="sm" className="mt-5" onClick={fetchData}>
 <ArrowsClockwise className="h-3.5 w-3.5" weight="bold" /> Refresh
 </Button>
 </div>
 );
 }

 // Fetch error
 if (error) {
 return (
 <div className="mx-auto max-w-md py-16 text-center">
 <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/20 ring-1 ring-red-200 dark:ring-red-800">
 <Warning className="h-6 w-6 text-red-500" weight="bold" />
 </div>
 <p className="mt-4 text-[15px] font-semibold text-[var(--color-foreground)]">
 Failed to load treasury
 </p>
 <p className="mt-1.5 text-[13px] text-[var(--color-text-tertiary)]">{error}</p>
 <Button variant="outline" size="sm" className="mt-5" onClick={fetchData}>
 <ArrowsClockwise className="h-3.5 w-3.5" weight="bold" /> Try again
 </Button>
 </div>
 );
 }

 return (
 <div>
 {/* Header */}
 <div className="mb-5">
 <p className="text-[10px] font-bold text-[var(--color-text-muted)]">Overview</p>
 <h2 className="mt-0.5 text-[17px] font-semibold text-[var(--color-foreground)]">Treasury</h2>
 </div>

 {/* Stat cards */}
 <div className="mb-4 grid grid-cols-4 gap-px overflow-hidden rounded-2xl bg-[var(--color-border)] ring-1 ring-[var(--color-border)]">
 <div className="bg-[var(--color-surface)] px-4 py-3.5">
 <p className="text-[10px] font-semibold text-[var(--color-text-muted)]">Total balance</p>
 <p className="mt-1.5 text-[20px] font-bold leading-none tracking-[-0.03em] text-[var(--color-foreground)]">
 ${Number.isFinite(combinedNum) ? combinedNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
 </p>
 <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">Across all payment methods</p>
 </div>
 <div className="bg-[var(--color-surface)] px-4 py-3.5">
 <p className="text-[10px] font-semibold text-[var(--color-text-muted)]">Collected (30d)</p>
 <p className="mt-1.5 text-[20px] font-bold leading-none tracking-[-0.03em] text-[var(--color-foreground)]">
 ${collected30d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
 </p>
 <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">From payment links and invoices</p>
 </div>
 <div className="bg-[var(--color-surface)] px-4 py-3.5">
 <p className="text-[10px] font-semibold text-[var(--color-text-muted)]">Pending</p>
 <p className="mt-1.5 text-[20px] font-bold leading-none tracking-[-0.03em] text-[var(--color-foreground)]">
 ${pendingAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
 </p>
 <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">Awaiting settlement</p>
 </div>
 <div className="bg-[var(--color-surface)] px-4 py-3.5">
 <p className="text-[10px] font-semibold text-[var(--color-text-muted)]">Settled (30d)</p>
 <p className="mt-1.5 text-[20px] font-bold leading-none tracking-[-0.03em] text-[var(--color-foreground)]">
 ${settled30d.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
 </p>
 <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">To bank accounts</p>
 </div>
 </div>

 {/* Main two-column layout */}
 <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
 {/* Left: Recent transactions */}
 <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
 <div className="border-b border-[var(--color-surface-secondary)] px-4 py-3">
 <p className="text-[12px] font-semibold text-[var(--color-foreground)]">Recent transactions</p>
 </div>
 {hasTransactions ? (
 <div className="divide-y divide-[var(--color-surface-secondary)]">
 {balance!.recentTransactions.map((tx) => (
 <div key={tx.id} className="flex items-center justify-between px-4 py-2.5">
 <div className="flex min-w-0 items-center gap-2.5">
 <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)]">
 {typeIcon(tx.type)}
 </div>
 <div className="min-w-0">
 <p className="truncate text-[11px] font-semibold text-[var(--color-foreground)]">
 {sourceLabel(tx.source)}
 </p>
 <p className="text-[10px] text-[var(--color-text-muted)]">{counterpartyLabel(tx.source)}</p>
 </div>
 </div>
 <div className="flex shrink-0 items-center gap-2">
 <p className={`text-[11px] font-semibold ${tx.type === 'inflow' ? 'text-[var(--color-success)]' : 'text-[var(--color-foreground)]'}`}>
 {tx.type === 'inflow' ? '+' : '-'}${parseUsdValue(tx.usdAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
 </p>
 <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(tx.status)}`}>
 {statusLabel(tx.status)}
 </span>
 </div>
 </div>
 ))}
 </div>
 ) : (
 <div className="px-4 py-6 text-center">
 <Receipt className="mx-auto h-8 w-8 text-[var(--color-text-placeholder)]" weight="thin" />
 <p className="mt-2 text-[11px] font-medium text-[var(--color-text-tertiary)]">No transactions yet</p>
 </div>
 )}
 </div>

 {/* Right: Available + Auto-settlement */}
 <div className="flex flex-col gap-3">
 <div className="flex-1 overflow-hidden rounded-2xl bg-[var(--color-surface)] p-4 ring-1 ring-[var(--color-border)]">
 <p className="text-[10px] font-semibold text-[var(--color-text-muted)]">Available</p>
 <p className="mt-2 text-[22px] font-bold leading-none tracking-[-0.03em] text-[var(--color-foreground)]">
 ${availableNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
 </p>
 <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">Ready to withdraw or settle to your bank</p>
 <div className="mt-3 flex gap-1.5">
 <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2 py-1">
 <span className="text-[10px] font-semibold text-[var(--color-text-secondary)]">USDC</span>
 </div>
 </div>
 </div>
 <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] p-4 ring-1 ring-[var(--color-border)]">
 <p className="text-[10px] font-semibold text-[var(--color-text-muted)]">Auto-settlement</p>
 <div className="mt-2 flex items-center gap-2">
 <span className="h-2 w-2 rounded-full bg-[var(--color-text-muted)]" />
 <p className="text-[12px] font-semibold text-[var(--color-text-tertiary)]">Not configured</p>
 </div>
 <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">Settle USDC to your bank automatically</p>
 </div>
 </div>
 </div>

 {/* Receive payment details */}
 {hasBase && (
 <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
 <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] p-4 ring-1 ring-[var(--color-border)]">
 <p className="text-[10px] font-bold text-[var(--color-text-muted)]">
 USDC on Base
 </p>
 <div className="mt-2 flex items-center justify-between gap-2">
 <code className="truncate text-[12px] text-[var(--color-foreground)]">
 {balance!.treasuryAddress}
 </code>
 <Button variant="ghost" size="sm" onClick={() => copyAddress(balance!.treasuryAddress!)} className="shrink-0">
 <Copy className="h-3.5 w-3.5" weight="bold" />
 {copied ? 'Copied' : 'Copy'}
 </Button>
 </div>
 </div>
 </div>
 )}

 {/* USD virtual account details */}
 {usdAccounts.length > 0 && (
 <div className="mt-3 space-y-2">
 <p className="text-[10px] font-bold text-[var(--color-text-muted)]">
 Wire / ACH
 </p>
 {usdAccounts.map((acct) => (
 <div
 key={acct.id}
 className="overflow-hidden rounded-2xl bg-[var(--color-surface)] p-4 ring-1 ring-[var(--color-border)]"
 >
 <div className="grid grid-cols-2 gap-3 text-[12px]">
 <div>
 <span className="text-[10px] text-[var(--color-text-placeholder)]">Account</span>
 <p className="font-mono font-medium text-[var(--color-foreground)]">{acct.accountNumber}</p>
 </div>
 {acct.routingNumber && (
 <div>
 <span className="text-[10px] text-[var(--color-text-placeholder)]">Routing</span>
 <p className="font-mono font-medium text-[var(--color-foreground)]">{acct.routingNumber}</p>
 </div>
 )}
 {acct.bankName && (
 <div>
 <span className="text-[10px] text-[var(--color-text-placeholder)]">Bank</span>
 <p className="font-medium text-[var(--color-foreground)]">{acct.bankName}</p>
 </div>
 )}
 {acct.accountType && (
 <div>
 <span className="text-[10px] text-[var(--color-text-placeholder)]">Type</span>
 <p className="font-medium text-[var(--color-foreground)]">{acct.accountType}</p>
 </div>
 )}
 </div>
 {acct.depositMessage && (
 <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">{acct.depositMessage}</p>
 )}
 </div>
 ))}
 </div>
 )}
 </div>
 );
}
