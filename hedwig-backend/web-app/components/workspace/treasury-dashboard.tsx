'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Buildings, Copy, Receipt, ArrowSquareOut, Lock, Warning, ArrowsClockwise } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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
  balanceUsdc: string;
  balanceUsd: string;
  reservedUsdc: string;
  availableUsdc: string;
  recentTransactions: TreasuryTx[];
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
    case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    case 'failed': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'pending_convert': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

function typeIcon(type: string) {
  switch (type) {
    case 'inflow': return <ArrowDown className="h-4 w-4 text-emerald-500" weight="bold" />;
    case 'payroll_out': return <ArrowUp className="h-4 w-4 text-amber-500" weight="bold" />;
    case 'manual_transfer': return <ArrowRight className="h-4 w-4 text-blue-500" weight="bold" />;
    default: return <Receipt className="h-4 w-4" weight="bold" />;
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'ngn_account': return 'NGN account';
    case 'usd_account': return 'USD account';
    case 'direct_crypto': return 'Direct crypto';
    case 'manual': return 'Manual';
    case 'invoice': return 'Invoice payment';
    case 'payment_link': return 'Payment link';
    default: return source;
  }
}

interface UsdAccount {
  id: string;
  accountNumber: string;
  routingNumber?: string;
  bankName?: string;
  depositMessage?: string;
  accountType?: string;
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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface)] p-6">
          <div className="h-5 w-24 animate-pulse rounded bg-[var(--color-surface-tertiary)]" />
          <div className="mt-4 h-10 w-48 animate-pulse rounded bg-[var(--color-surface-tertiary)]" />
        </div>
        <div className="rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface)] p-6">
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-[var(--color-surface-tertiary)]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error === 'pending') {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Treasury balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Lock className="h-10 w-10 text-amber-500" weight="thin" />
              <p className="text-[14px] font-medium text-[var(--color-foreground)]">
                Treasury wallet is being set up
              </p>
              <p className="max-w-sm text-[13px] text-[var(--color-text-tertiary)]">
                Your treasury wallet is being created. This usually takes a few seconds. 
                Check back shortly.
              </p>
              <Button variant="outline" size="sm" onClick={fetchData}>
                <ArrowsClockwise className="h-3.5 w-3.5" weight="bold" /> Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <Warning className="h-10 w-10 text-red-500" weight="thin" />
              <p className="text-[14px] font-medium text-[var(--color-foreground)]">
                Failed to load treasury
              </p>
              <p className="text-[13px] text-[var(--color-text-tertiary)]">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchData}>
                <ArrowsClockwise className="h-3.5 w-3.5" weight="bold" /> Try again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const availableUsd = balance ? (parseFloat(balance.balanceUsdc) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
  const reservedUsd = balance ? (parseFloat(balance.reservedUsdc) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
  const hasReserved = parseFloat(balance?.reservedUsdc || '0') > 0;
  const hasTransactions = (balance?.recentTransactions?.length || 0) > 0;

  return (
    <div className="space-y-4">
      {/* Balance card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Treasury balance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[36px] font-bold leading-tight tracking-tight text-[var(--color-foreground)]">
            ${availableUsd}
          </p>
          {hasReserved && (
            <p className="mt-1.5 text-[13px] text-[var(--color-text-tertiary)]">
              <span className="font-medium text-amber-600 dark:text-amber-400">${reservedUsd}</span> reserved for payroll
            </p>
          )}
        </CardContent>
      </Card>

      {/* Zero state — show account details */}
      {!hasTransactions && (
        <Card>
          <CardHeader>
            <CardTitle>Receive payments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[13px] text-[var(--color-text-tertiary)]">
              Share these details with your client to receive your first payment.
            </p>

            {/* Treasury wallet address */}
            {balance?.treasuryAddress && (
              <div className="mt-4 rounded-lg bg-[var(--color-surface-tertiary)] px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-placeholder)]">
                  USDC on Base
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <code className="text-[12px] text-[var(--color-foreground)] break-all">
                    {balance.treasuryAddress}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyAddress(balance.treasuryAddress!)}
                    className="shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5" weight="bold" />
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}

            {/* USD virtual account details */}
            {usdAccounts.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-placeholder)]">
                  Wire / ACH
                </p>
                {usdAccounts.map((acct) => (
                  <div
                    key={acct.id}
                    className="rounded-lg border border-[var(--color-border-light)] px-4 py-3"
                  >
                    <div className="grid grid-cols-2 gap-2 text-[13px]">
                      <div>
                        <span className="text-[var(--color-text-placeholder)]">Account</span>
                        <p className="font-mono font-medium text-[var(--color-foreground)]">{acct.accountNumber}</p>
                      </div>
                      {acct.routingNumber && (
                        <div>
                          <span className="text-[var(--color-text-placeholder)]">Routing</span>
                          <p className="font-mono font-medium text-[var(--color-foreground)]">{acct.routingNumber}</p>
                        </div>
                      )}
                      {acct.bankName && (
                        <div>
                          <span className="text-[var(--color-text-placeholder)]">Bank</span>
                          <p className="font-medium text-[var(--color-foreground)]">{acct.bankName}</p>
                        </div>
                      )}
                      {acct.accountType && (
                        <div>
                          <span className="text-[var(--color-text-placeholder)]">Type</span>
                          <p className="font-medium text-[var(--color-foreground)]">{acct.accountType}</p>
                        </div>
                      )}
                    </div>
                    {acct.depositMessage && (
                      <p className="mt-2 text-[12px] text-[var(--color-text-tertiary)]">
                        {acct.depositMessage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transaction list */}
      {hasTransactions && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Recent transactions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[var(--color-border-light)]">
              {balance!.recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 px-5 py-3.5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)]">
                    {typeIcon(tx.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[var(--color-foreground)]">
                      {sourceLabel(tx.source)}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-placeholder)]">
                      {timeAgo(tx.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-semibold text-[var(--color-foreground)]">
                      ${tx.usdAmount}
                    </p>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor(tx.status)}`}
                    >
                      {tx.status === 'pending_convert' ? 'Converting' : tx.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legacy Solana balance indicator (if present) */}
      {balance && (balance as any).usdcSolBalance > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] text-[var(--color-text-tertiary)]">
              Legacy balances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 text-[12px]">
              {(balance as any).usdcSolBalance > 0 && (
                <span className="rounded-md bg-[var(--color-surface-tertiary)] px-2 py-1">
                  Solana: ${(balance as any).usdcSolBalance.toLocaleString()}
                </span>
              )}
              {(balance as any).solBalance > 0 && (
                <span className="rounded-md bg-[var(--color-surface-tertiary)] px-2 py-1">
                  {(balance as any).solBalance.toFixed(4)} SOL
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
