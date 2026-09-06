'use client';

import { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlass, X } from '@/components/ui/lucide-icons';
import { Checkbox, Pagination, Table, type Selection } from '@heroui/react';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { Button } from '@/components/ui/button';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import { hedwigApi } from '@/lib/api/client';

type Card = {
  id: string;
  status: string;
  last4?: string | null;
  brand?: string | null;
  funding_address?: string | null;
};

const PAGE_SIZE = 25;

const CARD_STATUS = {
  ACTIVE: { dot: 'bg-[var(--color-success)]', label: 'Active', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  FROZEN: { dot: 'bg-[var(--color-warning)]', label: 'Frozen', bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
  PENDING_FUNDING: { dot: 'bg-[var(--color-accent)]', label: 'Pending funding', bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
} as const;

const STATUS_FILTERS = ['all', 'ACTIVE', 'FROZEN', 'PENDING_FUNDING'] as const;

function StatusPill({ status }: { status: string }) {
  const s = (CARD_STATUS as Record<string, { dot: string; label: string; bg: string; text: string }>)[
    status
  ] ?? {
    dot: 'bg-[var(--color-text-muted)]',
    label: status.replace(/_/g, ' '),
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

export function CardsClient({
  accessToken,
  workspaceId,
  initialCards,
}: {
  accessToken: string | null;
  workspaceId?: string | null;
  initialCards: Card[];
}) {
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const opts = { accessToken: accessToken ?? '', workspaceId, disableMockFallback: true };

  // Client-side refresh on mount (same pattern as contracts).
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const refresh = async () => {
      setIsRefreshing(true);
      try {
        const live = await hedwigApi.cards({ accessToken, workspaceId, disableMockFallback: true });
        // Never clobber server-rendered rows with an empty passive refresh.
        if (!cancelled && (live.length > 0 || initialCards.length === 0)) setCards(live);
      } catch {
        // Keep server-provided cards if refresh fails.
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const refresh = async () => setCards(await hedwigApi.cards(opts));

  const handleIssue = async () => {
    setWorking(true);
    setError('');
    try {
      await hedwigApi.issueCard(opts);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not start card issuance.');
    } finally {
      setWorking(false);
    }
  };

  const handleFreeze = async (id: string, frozen: boolean) => {
    await hedwigApi.setCardFrozen(id, frozen, opts);
    await refresh();
  };

  const activeCount = useMemo(() => cards.filter((c) => c.status === 'ACTIVE').length, [cards]);
  const frozenCount = useMemo(() => cards.filter((c) => c.status === 'FROZEN').length, [cards]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (!q) return true;
      return `${c.brand ?? ''} ${c.last4 ?? ''}`.toLowerCase().includes(q);
    });
  }, [cards, filter, search]);

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Cards</h1>
          <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
            Stablecoin-backed cards funded from your wallet. One card shared across agents.
          </p>
        </div>
        <Button onClick={handleIssue} disabled={working}>
          {working ? 'Issuing…' : 'Issue card'}
        </Button>
      </div>

      <AttachedStatGrid
        items={[
          { id: 'total', title: 'Total', value: String(cards.length), helper: 'Cards' },
          { id: 'active', title: 'Active', value: String(activeCount), helper: 'Ready to spend' },
          { id: 'frozen', title: 'Frozen', value: String(frozenCount), helper: 'Paused by you' },
        ]}
        className="grid-cols-1 md:grid-cols-3"
      />

      {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
            {cards.length} card{cards.length !== 1 ? 's' : ''}
          </span>
          {activeCount > 0 && (
            <span className="text-[12px] text-[var(--color-text-muted)]">
              · {activeCount} active{isRefreshing ? ' · syncing…' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative mr-1">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-placeholder)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cards"
              aria-label="Search cards"
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
              {s === 'all' ? 'All' : (CARD_STATUS as Record<string, { label: string }>)[s]?.label ?? s}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Cards"
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
                Card
              </Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Status</Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
                Funded by
              </Table.Column>
              <Table.Column />
            </Table.Header>
            <Table.Body renderEmptyState={() => (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 py-16 text-center">
                  <p className="text-[13px] text-[var(--color-text-muted)]">No cards match your filters.</p>
                </div>
              )}>
              {pageItems.map((c) => (
                <Table.Row key={c.id} id={c.id} className="hover:bg-[var(--color-background)]">
                  <Table.Cell className="pr-0">
                    <Checkbox slot="selection" aria-label={`Select card ${c.last4 ?? c.id}`} className="ml-3"><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control></Checkbox>
                  </Table.Cell>
                  <Table.Cell>
                    <p className="text-[13px] font-semibold text-[var(--color-foreground)]">
                      {c.brand ?? 'Card'} {c.last4 ? `•••• ${c.last4}` : ''}
                    </p>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusPill status={c.status} />
                  </Table.Cell>
                  <Table.Cell>
                    <span className="font-mono text-[12px] text-[var(--color-text-tertiary)]">
                      {c.funding_address ?? '—'}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex justify-end">
                      <RowActionsMenu
                        items={
                          c.status === 'ACTIVE'
                            ? [{ label: 'Freeze card', onClick: () => handleFreeze(c.id, true) }]
                            : c.status === 'FROZEN'
                              ? [{ label: 'Unfreeze card', onClick: () => handleFreeze(c.id, false) }]
                              : []
                        }
                      />
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
                  ? '0 cards'
                  : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} cards`}
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
