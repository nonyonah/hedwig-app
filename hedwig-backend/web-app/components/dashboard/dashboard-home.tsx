'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button as HButton, Dropdown, Label } from '@heroui/react';
import { ArrowDown, ArrowUp, Bank, CaretDown, CaretLeft, CaretRight } from '@/components/ui/lucide-icons';
import { AccountIcon } from '@/components/wallet/account-icon';
import { hedwigApi } from '@/lib/api/client';

type LedgerRow = {
  date: string;
  description?: string;
  account?: string;
  debit?: number | string | null;
  credit?: number | string | null;
};

type VaRow = {
  id?: string;
  currency?: string;
  label?: string | null;
  balance_usd?: number | string | null;
  balance?: number | string | null;
  status?: string;
  account_number_masked?: string | null;
  bank_name?: string | null;
};

const RANGES = [
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
] as const;

const num = (v: unknown) => Number(v ?? 0) || 0;

const compactUsd = (v: number) =>
  `$${Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : v.toFixed(0)}`;

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function letterColor(name: string) {
  const palette = [
    'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
    'bg-[var(--color-success-soft)] text-[var(--color-success)]',
    'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  ];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
  return palette[h % palette.length];
}

function vaBalance(a: VaRow) {
  return num(a.balance_usd ?? a.balance);
}

function vaName(a: VaRow, i: number) {
  return a.label || `${a.currency ?? 'Account'}${a.account_number_masked ? ` ••••${a.account_number_masked.slice(-4)}` : ''}` || `Account ${i + 1}`;
}

export function DashboardHome({
  accessToken,
  formatAmount,
  walletUsd,
  usdAccountUsd,
}: {
  accessToken: string | null;
  formatAmount: (n: number, opts?: { compact?: boolean }) => string;
  walletUsd: number;
  usdAccountUsd: number;
}) {
  const [accounts, setAccounts] = useState<VaRow[]>([]);
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState<string>('all');
  const [range, setRange] = useState<(typeof RANGES)[number]['value']>('30d');
  const [monthOffset, setMonthOffset] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      hedwigApi.virtualAccounts({ accessToken, disableMockFallback: true }).catch(() => []),
      hedwigApi.ledger({ range: '90d', pageSize: 500 }, { accessToken, disableMockFallback: true }).catch(() => null),
    ])
      .then(([vas, ledger]) => {
        if (cancelled) return;
        setAccounts(Array.isArray(vas) ? vas : []);
        setEntries(((ledger?.entries ?? []) as unknown) as LedgerRow[]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const rangeDays = RANGES.find((r) => r.value === range)?.days ?? 30;
  const selected = accounts.find((a, i) => (a.id ?? `${a.currency}-${i}`) === accountId);

  const scopedEntries = useMemo(() => {
    if (accountId === 'all' || !selected) return entries;
    const needle = `${selected.currency ?? ''} ${selected.label ?? ''}`.toLowerCase();
    const hit = entries.filter((e) => `${e.account ?? ''}`.toLowerCase().includes(needle.trim().split(' ')[0]));
    return hit.length > 0 ? hit : entries;
  }, [entries, accountId, selected]);

  const windowEntries = useMemo(() => {
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return scopedEntries.filter((e) => new Date(e.date).getTime() >= cutoff);
  }, [scopedEntries, rangeDays]);

  const endTotal = useMemo(() => {
    if (selected) return vaBalance(selected);
    const vaSum = accounts.reduce((s, a) => s + vaBalance(a), 0);
    return vaSum > 0 ? vaSum + walletUsd : walletUsd + usdAccountUsd;
  }, [accounts, selected, walletUsd, usdAccountUsd]);

  const { inTotal, outTotal } = useMemo(
    () => ({
      inTotal: windowEntries.reduce((s, e) => s + num(e.credit), 0),
      outTotal: windowEntries.reduce((s, e) => s + num(e.debit), 0),
    }),
    [windowEntries]
  );

  const series = useMemo(() => {
    const days: { key: string; label: string; net: number }[] = [];
    const today = new Date();
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      days.push({ key: dayKey(d), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), net: 0 });
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    for (const e of windowEntries) {
      const row = byKey.get(dayKey(new Date(e.date)));
      if (row) row.net += num(e.credit) - num(e.debit);
    }
    const totalNet = days.reduce((s, d) => s + d.net, 0);
    let running = endTotal - totalNet;
    return days.map((d) => {
      running += d.net;
      return { ...d, balance: Math.max(0, Math.round(running * 100) / 100) };
    });
  }, [windowEntries, rangeDays, endTotal]);

  const months = useMemo(() => {
    const map = new Map<string, { key: string; label: string; rows: LedgerRow[] }>();
    for (const e of scopedEntries) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map.has(key)) {
        map.set(key, { key, label: d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), rows: [] });
      }
      map.get(key)!.rows.push(e);
    }
    return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [scopedEntries]);
  const activeMonth = months[Math.min(monthOffset, Math.max(0, months.length - 1))] ?? null;
  const monthOut = (activeMonth?.rows ?? []).filter((e) => num(e.debit) > 0);
  const monthOutTotal = monthOut.reduce((s, e) => s + num(e.debit), 0);
  const topOutflows = useMemo(() => {
    const byDesc = new Map<string, number>();
    for (const e of monthOut) byDesc.set(e.description || 'Unknown', (byDesc.get(e.description || 'Unknown') ?? 0) + num(e.debit));
    return [...byDesc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [monthOutTotal]);

  const timeline = useMemo(() => [...scopedEntries].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 8), [scopedEntries]);
  const shownAccounts = accounts.slice(0, 4);

  return (
    <div className="flex flex-col gap-6">
      {/* Balance label + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-[var(--color-foreground)]">Balance</h2>
        <div className="flex items-center gap-2">
          <Dropdown>
            <HButton
              variant="secondary"
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[var(--color-foreground)]"
              aria-label="Filter by account"
            >
              <span>{selected ? vaName(selected, 0) : 'All accounts'}</span>
              <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
            </HButton>
            <Dropdown.Popover className="min-w-[200px]">
              <Dropdown.Menu
                selectionMode="single"
                selectedKeys={new Set([accountId])}
                onSelectionChange={(keys) => {
                  const key = [...keys][0];
                  if (key) setAccountId(String(key));
                }}
              >
                <Dropdown.Item key="all" id="all" textValue="All accounts">
                  <Label>All accounts</Label>
                </Dropdown.Item>
                {accounts.map((a, i) => {
                  const id = a.id ?? `${a.currency}-${i}`;
                  return (
                    <Dropdown.Item key={id} id={id} textValue={vaName(a, i)}>
                      <Label>{vaName(a, i)}</Label>
                    </Dropdown.Item>
                  );
                })}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
          <Dropdown>
            <HButton
              variant="secondary"
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-[var(--color-foreground)]"
              aria-label="Filter by timeframe"
            >
              <span>{RANGES.find((r) => r.value === range)?.label}</span>
              <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
            </HButton>
            <Dropdown.Popover className="min-w-[160px]">
              <Dropdown.Menu
                selectionMode="single"
                selectedKeys={new Set([range])}
                onSelectionChange={(keys) => {
                  const key = [...keys][0];
                  if (key) setRange(key as typeof range);
                }}
              >
                {RANGES.map((r) => (
                  <Dropdown.Item key={r.value} id={r.value} textValue={r.label}>
                    <Label>{r.label}</Label>
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      </div>

      {/* Balance chart card */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 pb-3 pt-5">
        <p className="text-[13px] text-[var(--color-text-tertiary)]">{selected ? vaName(selected, 0) : 'All accounts'}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-[30px] font-bold tracking-[-0.02em] text-[var(--color-foreground)]">{formatAmount(endTotal)}</p>
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-success)]">
            <ArrowDown className="h-3.5 w-3.5" /> {formatAmount(inTotal, { compact: true })}
          </span>
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-danger)]">
            <ArrowUp className="h-3.5 w-3.5" /> {formatAmount(outTotal, { compact: true })}
          </span>
        </div>
        <div className="mt-2 w-full min-w-0">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="homeBalanceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.6} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={48} tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} dy={6} />
              <YAxis
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                tickFormatter={(v: number) => compactUsd(v)}
              />
              <Tooltip
                formatter={(v) => [formatAmount(Number(v)), 'Balance']}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  fontSize: 12,
                }}
              />
              <Area type="monotone" dataKey="balance" stroke="var(--color-accent)" strokeWidth={2} fill="url(#homeBalanceFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Bank accounts + Money movement */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-[var(--color-foreground)]">Bank accounts</h2>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2">
            {loading ? (
              <p className="py-6 text-center text-[13px] text-[var(--color-text-tertiary)]">Loading accounts…</p>
            ) : shownAccounts.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-[var(--color-text-tertiary)]">No accounts yet.</p>
            ) : (
              shownAccounts.map((a, i) => (
                <div key={a.id ?? `${a.currency}-${i}`} className="flex items-center gap-3 border-b border-[var(--color-border)] py-4 last:border-0">
                  <AccountIcon currency={a.currency ?? 'USD'} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)]">{vaName(a, i)}</p>
                    <p className="text-[12px] text-[var(--color-text-tertiary)]">
                      {a.currency ?? ''}{a.account_number_masked ? ` ••••${a.account_number_masked.slice(-4)}` : a.bank_name ? ` · ${a.bank_name}` : ''}
                    </p>
                  </div>
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{formatAmount(vaBalance(a))}</p>
                </div>
              ))
            )}
            {accounts.length > shownAccounts.length && (
              <div className="py-3 text-[13px] text-[var(--color-text-tertiary)]">
                And{' '}
                <Link href="/accounts" className="font-semibold text-[var(--color-foreground)] underline underline-offset-2">
                  {accounts.length - shownAccounts.length} more account{accounts.length - shownAccounts.length === 1 ? '' : 's'}
                </Link>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[var(--color-foreground)]">Money movement</h2>
            <div className="flex items-center gap-1 text-[13px] font-medium text-[var(--color-foreground)]">
              <button
                type="button"
                aria-label="Previous month"
                disabled={monthOffset >= months.length - 1}
                onClick={() => setMonthOffset((o) => o + 1)}
                className="rounded p-1 transition hover:bg-[var(--color-surface-secondary)] disabled:opacity-30"
              >
                <CaretLeft className="h-3.5 w-3.5" weight="bold" />
              </button>
              <span className="min-w-[76px] text-center">{activeMonth?.label ?? '—'}</span>
              <button
                type="button"
                aria-label="Next month"
                disabled={monthOffset <= 0}
                onClick={() => setMonthOffset((o) => Math.max(0, o - 1))}
                className="rounded p-1 transition hover:bg-[var(--color-surface-secondary)] disabled:opacity-30"
              >
                <CaretRight className="h-3.5 w-3.5" weight="bold" />
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
            <p className="text-[13px] text-[var(--color-text-tertiary)]">Total outflows</p>
            <p className="mt-1 text-[22px] font-bold tracking-[-0.01em] text-[var(--color-foreground)]">-{formatAmount(monthOutTotal)}</p>
            <p className="mb-1 mt-5 text-[13px] text-[var(--color-text-tertiary)]">Top outflows</p>
            {topOutflows.length === 0 ? (
              <p className="py-4 text-[13px] text-[var(--color-text-tertiary)]">No outflows this month.</p>
            ) : (
              topOutflows.map(([name, amount]) => (
                <div key={name} className="flex items-center gap-3 py-2.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${letterColor(name)}`}>
                    {name.charAt(0).toUpperCase()}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-foreground)]">{name}</p>
                  <p className="text-[13px] font-medium text-[var(--color-foreground)]">-{formatAmount(amount)}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Timeline */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--color-foreground)]">Timeline</h2>
          <Link href="/transactions" className="text-[12px] font-medium text-[var(--color-accent)] hover:underline">
            View all
          </Link>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2">
          {loading ? (
            <p className="py-6 text-center text-[13px] text-[var(--color-text-tertiary)]">Loading activity…</p>
          ) : timeline.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--color-text-tertiary)]">No recent activity.</p>
          ) : (
            timeline.map((e, i) => {
              const out = num(e.debit) > 0;
              const amount = out ? num(e.debit) : num(e.credit);
              return (
                <div key={`${e.date}-${i}`} className="flex items-center gap-3 border-b border-[var(--color-border)] py-3 last:border-0">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${out ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-[var(--color-success-soft)] text-[var(--color-success)]'}`}>
                    {out ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[var(--color-foreground)]">{e.description || 'Transaction'}</p>
                    <p className="text-[12px] text-[var(--color-text-tertiary)]">
                      {new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {e.account ? ` · ${e.account}` : ''}
                    </p>
                  </div>
                  <p className={`text-[13px] font-semibold ${out ? 'text-[var(--color-foreground)]' : 'text-[var(--color-success)]'}`}>
                    {out ? '-' : '+'}{formatAmount(amount)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
