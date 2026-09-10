'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, Copy, Check } from '@/components/ui/lucide-icons';
import { openMoneyAction } from '@/components/money/money-action-dialogs';
import { AccountIcon } from '@/components/wallet/account-icon';
import { Button } from '@/components/ui/button';
import { TransferStatusPill } from '@/components/ledger/transfer-status-pill';
import { normalizeTransferStatus } from '@/lib/utils/transfer-status';
import { hedwigApi } from '@/lib/api/client';

type AccountTx = {
  id: string;
  event_type: string;
  direction: string;
  amount?: number | string | null;
  amount_usd?: number | string | null;
  currency?: string | null;
  occurred_at?: string;
  source?: string | null;
};

type AccountDetail = {
  account: {
    id: string;
    currency: string;
    account_type: string;
    provider: string;
    status: string;
    label?: string | null;
    balance: number;
    balance_usd: number;
    account_number_masked?: string | null;
    bank_name?: string | null;
    address?: string | null;
    created_at?: string;
  };
  transactions: AccountTx[];
};

const RANGES = [
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '1y', label: '1 Year' },
] as const;

const prettyEvent = (t: string) =>
  t
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Payment-outcome status for a virtual-account timeline event (all currencies). */
const eventStatus = (t: AccountTx) => {
  const e = t.event_type ?? '';
  if (/(refunded|reversed|refund)/.test(e)) return 'reversed' as const;
  if (/(imported|created|reviewing|pending)/.test(e) && !/(paid|settled|received|expensed|matched)/.test(e)) return 'pending' as const;
  if (/(failed|expired|skipped)/.test(e)) return 'failed' as const;
  return normalizeTransferStatus('successful');
};

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-2.5">
      <span className="text-[13px] text-[var(--color-text-tertiary)]">{label}</span>
      <span className={`text-[13px] font-medium text-[var(--color-foreground)] ${mono ? 'font-mono text-[12px]' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function AddressRow({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };
  const short = address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-2.5">
      <span className="text-[13px] text-[var(--color-text-tertiary)]">Address</span>
      <button
        type="button"
        onClick={copy}
        title={address}
        className="flex items-center gap-1.5 font-mono text-[12px] font-medium text-[var(--color-foreground)] hover:text-[var(--color-text-tertiary)]"
      >
        <Image src="/icons/networks/base.png" alt="Base" width={16} height={16} className="rounded-full" />
        {short}
        {copied ? <Check className="h-3.5 w-3.5 text-[var(--color-success)]" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function AccountDetailClient({
  accessToken,
  workspaceId,
  accountId,
  initialDetail,
}: {
  accessToken: string | null;
  workspaceId?: string | null;
  accountId: string;
  initialDetail: AccountDetail | null;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<AccountDetail | null>(initialDetail);
  const [range, setRange] = useState<string>('30d');
  const [points, setPoints] = useState<Array<{ date: string; value: number }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const opts = { accessToken: accessToken ?? '', workspaceId, disableMockFallback: true };

  const refresh = useCallback(async () => {
    const d = await hedwigApi.virtualAccountDetail(accountId, opts);
    setDetail(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, workspaceId, accountId]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const run = async () => {
      setLoadingHistory(true);
      try {
        const h = await hedwigApi.virtualAccountHistory(accountId, range, {
          accessToken,
          workspaceId,
          disableMockFallback: true,
        });
        if (!cancelled && Array.isArray(h?.points)) setPoints(h.points);
      } catch {
        // Keep the chart empty on failure.
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    };
    void run();
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [accessToken, workspaceId, accountId, range, refresh]);

  const account = detail?.account;
  const transactions = useMemo(() => detail?.transactions ?? [], [detail]);

  const chartData = useMemo(() => {
    if (points.length > 0) return points;
    // Flat fallback at the current balance so the card never looks broken.
    const today = new Date().toISOString().slice(0, 10);
    return [{ date: today, value: Number(account?.balance ?? 0) }];
  }, [points, account]);

  if (!account) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/accounts')}>
          <ArrowLeft className="h-3.5 w-3.5" weight="bold" /> Accounts
        </Button>
        <p className="text-[13px] text-[var(--color-text-tertiary)]">Account not found.</p>
      </div>
    );
  }

  const title = account.label ?? `${account.currency} ${account.account_type}`;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.push('/accounts')} className="w-fit">
        <ArrowLeft className="h-3.5 w-3.5" weight="bold" /> Accounts
      </Button>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Balance + chart card */}
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] text-[var(--color-text-tertiary)]">{title} Balance</p>
              <p className="mt-1 text-[28px] font-bold tracking-tight text-[var(--color-foreground)]">
                {account.currency} {Number(account.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <div className="mt-3 flex gap-1">
                {RANGES.map((r) => (
                  <Button
                    key={r.value}
                    variant="ghost"
                    size="sm"
                    onClick={() => setRange(r.value)}
                    className={`rounded-full px-3 py-1 text-[12px] font-medium ${
                      range === r.value
                        ? 'bg-[var(--color-foreground)] text-[var(--color-surface)]'
                        : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)]'
                    }`}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => openMoneyAction('send')}>
                Send
              </Button>
            </div>
          </div>
          <div className="mt-2 h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="acctBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 shadow-lg">
                        <p className="text-[11px] text-[var(--color-text-tertiary)]">{label}</p>
                        <p className="text-[13px] font-semibold">
                          {account.currency} {Number(payload[0].value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  fill="url(#acctBalance)"
                  isAnimationActive={!loadingHistory}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Account info card */}
        <div id="account-info" className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
            <AccountIcon currency={account.currency} />
            <div>
              <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{title}</p>
              <p className="text-[12px] capitalize text-[var(--color-text-tertiary)]">
                {account.account_type} · {account.status.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            <InfoRow label="Currency" value={account.currency} />
            <InfoRow label="Type" value={account.account_type} />
            {account.bank_name && <InfoRow label="Bank" value={account.bank_name} />}
            {account.account_number_masked && <InfoRow label="Account" value={`•••• ${account.account_number_masked}`} mono />}
            {account.address && <AddressRow address={account.address} />}
            <InfoRow
              label="Balance (USD)"
              value={`$${Number(account.balance_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            />
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">Recent Transactions</span>
          <Link href="/revenue/transactions" className="text-[12px] font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-foreground)]">
            View all →
          </Link>
        </div>
        {transactions.length === 0 ? (
          <p className="px-5 pb-8 pt-2 text-center text-[13px] text-[var(--color-text-tertiary)]">No recent transactions</p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {transactions.slice(0, 20).map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{prettyEvent(t.event_type)}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">
                    {t.occurred_at ? new Date(t.occurred_at).toLocaleDateString() : ''}
                    {t.source ? ` · ${t.source}` : ''}
                  </p>
                  <div className="mt-1"><TransferStatusPill status={eventStatus(t)} /></div>
                </div>
                <span
                  className={`text-[13px] font-semibold ${
                    t.direction === 'in' ? 'text-[var(--color-success)]' : t.direction === 'out' ? 'text-[var(--color-danger)]' : ''
                  }`}
                >
                  {t.direction === 'in' ? '+' : t.direction === 'out' ? '−' : ''}
                  {t.currency ?? ''} {Number(t.amount ?? t.amount_usd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
