'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlass, X } from '@/components/ui/lucide-icons';
import { Checkbox, Pagination, Table, type Selection } from '@heroui/react';
import { AccountIcon } from '@/components/wallet/account-icon';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { useCurrency } from '@/components/providers/currency-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { Button } from '@/components/ui/button';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import { hedwigApi } from '@/lib/api/client';
import { CreateAccountDialog } from './create-account-dialog';

import type { WalletAccount, WalletAsset } from '@/lib/models/entities';
import { useWalletData } from '@/lib/hooks/use-wallet-data';
import { openMoneyAction } from '@/components/money/money-action-dialogs';

const PAGE_SIZE = 25;

type UnifiedAccount = {
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
  created_at?: string;
};

type AccountsSummary = {
  available_usd: number;
  pending_deposits_usd: number;
  pending_deposit_count: number;
  pending_transfers_usd: number;
  pending_transfer_count: number;
};

const TYPE_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  stablecoin: { label: 'Stablecoin', bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  checking: { label: 'Checking', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  savings: { label: 'Savings', bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
  payroll: { label: 'Payroll', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
};

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: 'Active', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  pending: { label: 'Pending', bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
  provisioning: { label: 'Provisioning', bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  frozen: { label: 'Frozen', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
};

const TYPE_FILTERS = ['all', 'stablecoin', 'checking', 'savings', 'payroll'] as const;

function Pill({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${bg} ${text}`}>
      {label}
    </span>
  );
}

export function WalletView({
  initialWalletData,
  accessToken,
  workspaceId,
  initialAccounts,
  initialSummary,
}: {
  initialWalletData: { walletAccounts: WalletAccount[]; walletAssets: WalletAsset[] };
  accessToken: string | null;
  workspaceId?: string | null;
  initialAccounts: UnifiedAccount[];
  initialSummary: AccountsSummary;
}) {
  const router = useRouter();
  const { formatAmount } = useCurrency();

  const walletQuery = useWalletData(initialWalletData as never, accessToken);
  const walletData = walletQuery.data as { walletAccounts: WalletAccount[]; walletAssets: WalletAsset[] };

  useAssistantPageContext('Accounts', {
    accountsCount: initialAccounts.length,
    availableUsd: initialSummary.available_usd,
  });

  const [accounts, setAccounts] = useState<UnifiedAccount[]>(initialAccounts);
  const [summary, setSummary] = useState<AccountsSummary>(initialSummary);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const opts = { accessToken: accessToken ?? '', workspaceId, disableMockFallback: true };

  const refresh = async () => {
    const [list, sum] = await Promise.all([hedwigApi.virtualAccounts(opts), hedwigApi.virtualAccountsSummary(opts)]);
    setAccounts(list);
    setSummary(sum);
  };

  // Client-side refresh on mount (same pattern as contracts).
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const run = async () => {
      setIsRefreshing(true);
      try {
        const [live, sum] = await Promise.all([
          hedwigApi.virtualAccounts({ accessToken, workspaceId, disableMockFallback: true }),
          hedwigApi.virtualAccountsSummary({ accessToken, workspaceId, disableMockFallback: true }),
        ]);
        if (!cancelled && (live.length > 0 || initialAccounts.length === 0)) setAccounts(live);
        if (!cancelled) setSummary(sum);
      } catch {
        // Keep server-provided data if refresh fails.
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, workspaceId]);

  // Deep-link (?action=) forwards to the global money-action dialogs.
  useEffect(() => {
    const action = new URLSearchParams(window.location.search).get('action');
    if (!action) return;
    if (action === 'send' || action === 'receive' || action === 'withdraw' || action === 'fund') {
      openMoneyAction(action);
    }
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  // The stablecoin row mirrors the live wallet (Base USDC), not the cached
  // ledger snapshot — the wallet is the source of truth.
  const baseUsdc = useMemo(() => {
    const assets = walletData?.walletAssets ?? [];
    return assets
      .filter((a) => a.chain === 'Base' && a.symbol.toUpperCase() === 'USDC')
      .reduce((s, a) => s + Number(a.balance ?? 0), 0);
  }, [walletData]);

  const displayedAccounts = useMemo(
    () =>
      accounts.map((a) =>
        a.currency === 'USDC' && a.account_type === 'stablecoin' && baseUsdc > 0
          ? { ...a, balance: baseUsdc, balance_usd: baseUsdc }
          : a
      ),
    [accounts, baseUsdc]
  );

  const displayedSummary = useMemo(() => {
    const row = accounts.find((a) => a.currency === 'USDC' && a.account_type === 'stablecoin');
    if (!row || baseUsdc <= 0) return summary;
    return { ...summary, available_usd: summary.available_usd - Number(row.balance_usd ?? 0) + baseUsdc };
  }, [accounts, summary, baseUsdc]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return displayedAccounts.filter((a) => {
      if (filter !== 'all' && a.account_type !== filter) return false;
      if (!q) return true;
      return `${a.label ?? ''} ${a.currency} ${a.bank_name ?? ''}`.toLowerCase().includes(q);
    });
  }, [accounts, filter, search]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setPage(1);
  }, [filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const typeStyle = (t: string) =>
    TYPE_STYLE[t] ?? { label: t, bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' };
  const statusStyle = (s: string) =>
    STATUS_STYLE[s] ?? { label: s, bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Accounts</h1>
          <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
            Virtual accounts and wallets in one place. Balances in USD.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>New account</Button>
      </div>

      <AttachedStatGrid
        items={[
          {
            id: 'available',
            title: 'Available balance',
            value: formatAmount(displayedSummary.available_usd, { compact: true }),
            helper: `Across ${accounts.length} account${accounts.length === 1 ? '' : 's'}`,
          },
          {
            id: 'pending-in',
            title: 'Pending deposits',
            value: formatAmount(displayedSummary.pending_deposits_usd, { compact: true }),
            helper: 'Unpaid invoices awaiting payment',
          },
          {
            id: 'pending-out',
            title: 'Pending transfers',
            value: formatAmount(displayedSummary.pending_transfers_usd, { compact: true }),
            helper: 'Orders still in flight',
          },
        ]}
        className="grid-cols-1 md:grid-cols-3"
      />

      <CreateAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        accessToken={accessToken}
        workspaceId={workspaceId}
        onCreated={refresh}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
            {accounts.length} account{accounts.length !== 1 ? 's' : ''}
          </span>
          {isRefreshing && <span className="text-[12px] text-[var(--color-text-muted)]">· syncing…</span>}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative mr-1">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-placeholder)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts"
              aria-label="Search accounts"
              className="h-8 w-[180px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] pl-8 pr-7 text-[12px] text-[var(--color-foreground)] placeholder:text-[var(--color-text-placeholder)] transition focus:border-[var(--color-primary)] focus:outline-none sm:w-[200px]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-text-tertiary)] transition hover:text-[var(--color-foreground)]"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {TYPE_FILTERS.map((t) => (
            <Button
              key={t}
              variant="ghost"
              size="sm"
              onClick={() => setFilter(t)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                filter === t
                  ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {t === 'all' ? 'All' : (TYPE_STYLE[t]?.label ?? t)}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Accounts"
            className="min-w-[500px]"
            selectionMode="multiple"
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
          >
            <Table.Header>
              <Table.Column className="w-10 pr-0">
                <Checkbox aria-label="Select all" slot="selection" className="ml-3">
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
              </Table.Column>
              <Table.Column isRowHeader className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
                Account
              </Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Balance</Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Type</Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Status</Table.Column>
              <Table.Column />
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 py-16 text-center">
                  <p className="text-[13px] text-[var(--color-text-muted)]">No accounts match your filters.</p>
                </div>
              )}
            >
              {pageItems.map((a) => {
                const t = typeStyle(a.account_type);
                const s = statusStyle(a.status);
                return (
                  <Table.Row key={a.id} id={a.id} className="hover:bg-[var(--color-background)]">
                    <Table.Cell className="pr-0">
                      <Checkbox aria-label={`Select ${a.label ?? a.currency} account`} slot="selection" className="ml-3">
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox>
                    </Table.Cell>
                    <Table.Cell>
                      <Link href={`/wallet/${a.id}`} className="group flex items-center gap-3">
                        <AccountIcon currency={a.currency} />
                        <span>
                          <span className="block text-[13px] font-semibold text-[var(--color-foreground)] group-hover:text-[var(--color-text-tertiary)]">
                            {a.label ?? `${a.currency} ${t.label}`}
                          </span>
                          <span className="block text-[12px] text-[var(--color-text-tertiary)]">
                            {a.account_number_masked ? `•••• ${a.account_number_masked}` : a.currency}
                            {a.bank_name ? ` · ${a.bank_name}` : ''}
                          </span>
                        </span>
                      </Link>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="text-[13px] font-semibold">
                        {a.currency} {a.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <Pill label={t.label} bg={t.bg} text={t.text} />
                    </Table.Cell>
                    <Table.Cell>
                      <Pill label={s.label} bg={s.bg} text={s.text} />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu
                          items={[{ label: 'View details', onClick: () => router.push(`/wallet/${a.id}`) }]}
                        />
                      </div>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        {filtered.length > PAGE_SIZE && (
          <Table.Footer>
            <Pagination size="sm">
              <Pagination.Summary>
                {filtered.length === 0
                  ? '0 accounts'
                  : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} accounts`}
              </Pagination.Summary>
              <Pagination.Content>
                <Pagination.Item>
                  <Pagination.Previous isDisabled={page === 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>
                    <Pagination.PreviousIcon />
                    Previous
                  </Pagination.Previous>
                </Pagination.Item>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const startPage = Math.min(Math.max(1, page - 2), Math.max(1, totalPages - 4));
                  const p = startPage + i;
                  return (
                    <Pagination.Item key={p}>
                      <Pagination.Link isActive={p === page} onPress={() => setPage(p)}>
                        {p}
                      </Pagination.Link>
                    </Pagination.Item>
                  );
                })}
                <Pagination.Item>
                  <Pagination.Next
                    isDisabled={page === totalPages}
                    onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                    <Pagination.NextIcon />
                  </Pagination.Next>
                </Pagination.Item>
              </Pagination.Content>
            </Pagination>
          </Table.Footer>
        )}
      </Table>

      {/* Money dialogs live globally (see MoneyActionDialogs) — the top-bar
          Move money menu and ?action= links open them in place. */}
    </div>
  );
}
