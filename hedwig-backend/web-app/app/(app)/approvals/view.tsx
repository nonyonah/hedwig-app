'use client';

import { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlass, X } from '@/components/ui/lucide-icons';
import { Checkbox, Pagination, Table, type Selection } from '@heroui/react';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { Button } from '@/components/ui/button';
import { hedwigApi } from '@/lib/api/client';

type Approval = {
  id: string;
  type: string;
  status: string;
  amount: number | string;
  currency: string;
  merchant_name?: string | null;
  reason: string;
  created_at?: string;
  expires_at?: string;
};

const PAGE_SIZE = 25;

const APPROVAL_STATUS = {
  PENDING: { dot: 'bg-[var(--color-warning)]', label: 'Pending', bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
  APPROVED: { dot: 'bg-[var(--color-success)]', label: 'Approved', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  DECLINED: { dot: 'bg-[var(--color-danger)]', label: 'Declined', bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' },
  EXPIRED: { dot: 'bg-[var(--color-text-muted)]', label: 'Expired', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
} as const;

const STATUS_FILTERS = ['all', 'PENDING', 'APPROVED', 'DECLINED', 'EXPIRED'] as const;

function StatusPill({ status }: { status: string }) {
  const s = (APPROVAL_STATUS as Record<string, { dot: string; label: string; bg: string; text: string }>)[
    status
  ] ?? {
    dot: 'bg-[var(--color-text-muted)]',
    label: status,
    bg: 'bg-[var(--color-surface-tertiary)]',
    text: 'text-[var(--color-text-tertiary)]',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function ApprovalsClient({
  accessToken,
  initialApprovals,
}: {
  accessToken: string | null;
  initialApprovals: Approval[];
}) {
  const [items, setItems] = useState<Approval[]>(initialApprovals);
  const [filter, setFilter] = useState<string>('PENDING');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Client-side refresh on mount (same pattern as contracts).
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const refresh = async () => {
      setIsRefreshing(true);
      try {
        const live = await hedwigApi.approvals({ accessToken, disableMockFallback: true });
        // Never clobber server-rendered rows with an empty passive refresh.
        if (!cancelled && (live.length > 0 || initialApprovals.length === 0)) setItems(live);
      } catch {
        // Keep server-provided approvals if refresh fails.
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const opts = { accessToken: accessToken ?? '', disableMockFallback: true };

  const refresh = async () => setItems(await hedwigApi.approvals(opts));

  const decide = async (id: string, approve: boolean) => {
    await hedwigApi.decideApproval(id, approve, opts);
    await refresh();
  };

  const pending = useMemo(() => items.filter((a) => a.status === 'PENDING'), [items]);
  const pendingTotal = useMemo(() => pending.reduce((s, a) => s + Number(a.amount ?? 0), 0), [pending]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((a) => {
      if (filter !== 'all' && a.status !== filter) return false;
      if (!q) return true;
      return (a.merchant_name ?? '').toLowerCase().includes(q);
    });
  }, [items, filter, search]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setPage(1);
  }, [filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Approvals</h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
          Agent spend held by policy waits for your decision here.
        </p>
      </div>

      <AttachedStatGrid
        items={[
          { id: 'pending', title: 'Pending', value: String(pending.length), helper: 'Awaiting decision' },
          { id: 'value', title: 'Pending value', value: `${pendingTotal} USDC`, helper: 'Held by policy' },
          {
            id: 'decided',
            title: 'Decided',
            value: String(items.length - pending.length),
            helper: 'Approved, declined or expired',
          },
        ]}
        className="grid-cols-1 md:grid-cols-3"
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
            {items.length} request{items.length !== 1 ? 's' : ''}
          </span>
          {pending.length > 0 && (
            <span className="text-[12px] text-[var(--color-text-muted)]">
              · {pending.length} pending{isRefreshing ? ' · syncing…' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative mr-1">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-placeholder)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search approvals"
              aria-label="Search approvals"
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
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              variant="ghost"
              size="sm"
              onClick={() => setFilter(s)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                filter === s
                  ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {s === 'all' ? 'All' : (APPROVAL_STATUS as Record<string, { label: string }>)[s]?.label ?? s}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Approvals"
            className="min-w-[500px]"
            selectionMode="multiple"
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
          >
            <Table.Header>
              <Table.Column className="w-10 pr-0">
                <Checkbox slot="selection" aria-label="Select all" className="ml-3"><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control></Checkbox>
              </Table.Column>
              <Table.Column isRowHeader className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
                Request
              </Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Status</Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Amount</Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Type</Table.Column>
              <Table.Column />
            </Table.Header>
            <Table.Body renderEmptyState={() => (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 py-16 text-center">
                  <p className="text-[13px] text-[var(--color-text-muted)]">No approvals match your filters.</p>
                </div>
              )}>
              {pageItems.map((a) => (
                <Table.Row key={a.id} id={a.id} className="hover:bg-[var(--color-background)]">
                  <Table.Cell className="pr-0">
                    <Checkbox slot="selection" aria-label={`Select ${a.merchant_name ?? a.id}`} className="ml-3"><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control></Checkbox>
                  </Table.Cell>
                  <Table.Cell>
                    <p className="text-[13px] font-semibold text-[var(--color-foreground)]">
                      {a.merchant_name ?? 'Unknown merchant'}
                    </p>
                    <p className="text-[12px] text-[var(--color-text-tertiary)]">
                      {String(a.reason).toLowerCase().replace(/_/g, ' ')}
                    </p>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusPill status={a.status} />
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-[13px]">
                      {a.amount} {a.currency}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-[13px]">{a.type}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex justify-end gap-2">
                      {a.status === 'PENDING' && (
                        <>
                          <Button size="sm" onClick={() => decide(a.id, true)}>
                            Approve
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => decide(a.id, false)}>
                            Decline
                          </Button>
                        </>
                      )}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
        {filtered.length > PAGE_SIZE && (
          <Table.Footer>
            <Pagination size="sm">
              <Pagination.Summary>
                {filtered.length === 0
                  ? '0 requests'
                  : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} requests`}
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
    </div>
  );
}
