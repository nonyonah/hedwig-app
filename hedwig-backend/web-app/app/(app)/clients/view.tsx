'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlass, Plus, X } from '@/components/ui/lucide-icons';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import type { Client } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { Button } from '@/components/ui/button';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { useCurrency } from '@/components/providers/currency-provider';
import { useToast } from '@/components/providers/toast-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { formatShortDate } from '@/lib/utils';
import { Checkbox, Pagination, Table, type Selection } from '@heroui/react';

const PAGE_SIZE = 25;

const CLIENT_STATUS = {
  active:   { dot: 'bg-[var(--color-success)]', label: 'Active',   bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  at_risk:  { dot: 'bg-[var(--color-warning)]', label: 'At risk',  bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
  inactive: { dot: 'bg-[var(--color-text-muted)]', label: 'Inactive', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
} as const;

type ClientSegment = Client['segment'];

const SEGMENT_META: Record<ClientSegment, { label: string; sub: string; bg: string; text: string; dot: string }> = {
  new:     { label: 'New',     sub: 'recently added',         bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]', dot: 'bg-[var(--color-accent)]' },
  active:  { label: 'Active',  sub: 'engaged in last 30d',    bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]', dot: 'bg-[var(--color-success)]' },
  lapsing: { label: 'Lapsing', sub: '30–90d since activity',  bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]', dot: 'bg-[var(--color-warning)]' },
  dormant: { label: 'Dormant', sub: '90d+ inactive',          bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]', dot: 'bg-[var(--color-text-muted)]' },
};

const ALL_FILTERS = ['all', 'new', 'active', 'lapsing', 'dormant', 'at_risk'] as const;
type FilterKey = typeof ALL_FILTERS[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  all:     'All',
  new:     'New',
  active:  'Active',
  lapsing: 'Lapsing',
  dormant: 'Dormant',
  at_risk: 'At risk',
};

export function ClientsClient({
  initialClients,
  accessToken
}: {
  initialClients: Client[];
  accessToken: string | null;
}) {
  const router = useRouter();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspaceContext();

  useAssistantPageContext('Clients', {
    totalClients: initialClients.length,
  });

  const [clients, setClients] = useState(initialClients);

  useEffect(() => {
    setClients(initialClients);
  }, [initialClients]);

  useEffect(() => {
    if (!accessToken || !activeWorkspace?.id) return;

    const reload = async () => {
      try {
        const list = await hedwigApi.clients({
          accessToken,
          workspaceId: activeWorkspace.id,
        });
        setClients(list);
      } catch {
        // Keep current list on transient errors.
      }
    };

    const onWorkspaceChanged = () => {
      void reload();
    };

    window.addEventListener('hedwig:workspace-changed', onWorkspaceChanged);
    return () => window.removeEventListener('hedwig:workspace-changed', onWorkspaceChanged);
  }, [accessToken, activeWorkspace?.id]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const canCreate = !activeWorkspace || activeWorkspace.role !== 'member';

  useEffect(() => {
    const handler = (e: CustomEvent<Client>) => {
      setClients((prev) => [e.detail, ...prev]);
    };
    window.addEventListener('hedwig:client-created', handler as EventListener);
    return () => window.removeEventListener('hedwig:client-created', handler as EventListener);
  }, []);

  const segmentCounts = useMemo(() => {
    const counts: Record<ClientSegment, number> = { new: 0, active: 0, lapsing: 0, dormant: 0 };
    for (const c of clients) counts[c.segment]++;
    return counts;
  }, [clients]);

  const segmentRevenue = useMemo(() => {
    const totals: Record<ClientSegment, number> = { new: 0, active: 0, lapsing: 0, dormant: 0 };
    for (const c of clients) totals[c.segment] += c.totalBilledUsd;
    return totals;
  }, [clients]);

  const totalOutstanding = useMemo(() => clients.reduce((s, c) => s + c.outstandingUsd, 0), [clients]);

  const filtered = useMemo(() => {
    const byFilter = (c: Client) => {
      if (filter === 'all') return true;
      if (filter === 'new' || filter === 'active' || filter === 'lapsing' || filter === 'dormant') {
        return c.segment === filter;
      }
      return c.status === filter;
    };
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (!byFilter(c)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q)
        || (c.company?.toLowerCase() ?? '').includes(q)
        || c.email.toLowerCase().includes(q);
    });
  }, [clients, filter, search]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setPage(1);
  }, [filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);
  const selectedCount = selectedKeys === 'all' ? filtered.length : selectedKeys.size;

  const pageStart = (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, filtered.length);

  const handleDelete = async () => {
    if (!clientToDelete || !accessToken) return;
    setIsDeleting(true);
    try {
      await hedwigApi.deleteClient(clientToDelete.id, { accessToken, disableMockFallback: true });
      setClients((cur) => cur.filter((c) => c.id !== clientToDelete.id));
      toast({ type: 'success', title: 'Client deleted', message: `${clientToDelete.name} was removed.` });
      setClientToDelete(null);
    } catch (error: any) {
      toast({ type: 'error', title: 'Failed to delete client', message: error?.message || 'Please try again.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCount === 0 || !accessToken) return;
    setIsDeleting(true);
    const ids = selectedKeys === 'all' ? filtered.map((c) => c.id) : Array.from(selectedKeys).map(String);
    try {
      await Promise.all(ids.map((id) => hedwigApi.deleteClient(id, { accessToken, disableMockFallback: true }).catch(() => null)));
      const removed = new Set(ids);
      setClients((cur) => cur.filter((c) => !removed.has(c.id)));
      setSelectedKeys(new Set());
      toast({ type: 'success', title: `${ids.length} client${ids.length !== 1 ? 's' : ''} deleted` });
    } catch {
      toast({ type: 'error', title: 'Failed to delete clients', message: 'Please try again.' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Clients</h1>
        <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Manage your client relationships and track outstanding work.</p>
      </div>

      <AttachedStatGrid
        items={(['new', 'active', 'lapsing', 'dormant'] as ClientSegment[]).map((seg) => {
          const meta = SEGMENT_META[seg];
          return {
            id: seg,
            title: meta.label,
            value: String(segmentCounts[seg]),
            helper: segmentRevenue[seg] > 0
              ? (
                  <>
                    <span>{meta.sub}</span>
                    <span className="mt-1 block text-[var(--color-text-tertiary)]">{formatAmount(segmentRevenue[seg], { compact: true })} earned</span>
                  </>
                )
              : meta.sub,
            active: filter === seg,
            onClick: () => setFilter(filter === seg ? 'all' : seg),
          };
        })}
        className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
          {clients.length} client{clients.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1">
          <div className="relative mr-1">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-placeholder)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients"
              aria-label="Search clients"
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
          {ALL_FILTERS.map((s) => (
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
              {FILTER_LABELS[s]}
            </Button>
          ))}
          {canCreate && (
            <Button
              variant="default"
              size="sm"
              className="create-btn"
              onClick={() => window.dispatchEvent(new CustomEvent('hedwig:open-create-menu', { detail: { flow: 'client' } }))}
            >
              <Plus className="h-3.5 w-3.5" weight="bold" />
              New client
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Clients"
            className="min-w-[900px]"
            selectionMode="multiple"
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
          >
            <Table.Header>
              <Table.Column className="w-10 pr-0">
                <Checkbox slot="selection" aria-label="Select all clients" className="ml-3">
                  <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                </Checkbox>
              </Table.Column>
              <Table.Column isRowHeader className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Client</Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Segment</Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Status</Table.Column>
              <Table.Column className="text-right text-[11px] font-medium text-[var(--color-text-tertiary)]">Outstanding</Table.Column>
              <Table.Column className="text-right text-[11px] font-medium text-[var(--color-text-tertiary)]">Earnings</Table.Column>
              <Table.Column className="text-right text-[11px] font-medium text-[var(--color-text-tertiary)]">Last activity</Table.Column>
              <Table.Column />
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 py-16 text-center">
                  <p className="text-[13px] text-[var(--color-text-muted)]">
                    {filter === 'all' && !search ? 'No clients yet.' : 'No clients match your filters.'}
                  </p>
                </div>
              )}
            >
              {pageItems.map((client) => {
                const s = CLIENT_STATUS[client.status] ?? CLIENT_STATUS.inactive;
                const segMeta = SEGMENT_META[client.segment];
                return (
                  <Table.Row key={client.id} id={client.id} className="group hover:bg-[var(--color-background)]">
                    <Table.Cell className="pr-0">
                      <Checkbox slot="selection" aria-label={`Select ${client.name}`} className="ml-3">
                        <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                      </Checkbox>
                    </Table.Cell>
                    <Table.Cell>
                      <Link href={`/clients/${client.id}`} className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-secondary)] text-[11px] font-bold text-[var(--color-text-tertiary)]">
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-[var(--color-foreground)] transition-colors hover:text-[var(--color-accent)]">
                            {client.name}
                          </p>
                          {client.company && (
                            <p className="truncate text-[11px] text-[var(--color-text-muted)]">{client.company}</p>
                          )}
                        </div>
                      </Link>
                    </Table.Cell>
                    <Table.Cell>
                      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${segMeta.bg} ${segMeta.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${segMeta.dot}`} />
                        {segMeta.label}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                        {s.label}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="flex w-full justify-end text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">
                        {formatAmount(client.outstandingUsd, { compact: true })}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="flex w-full justify-end text-[13px] tabular-nums text-[var(--color-text-tertiary)]">
                        {formatAmount(client.totalBilledUsd, { compact: true })}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="flex w-full justify-end text-[12px] text-[var(--color-text-muted)]">{formatShortDate(client.lastActivityAt)}</span>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center justify-end">
                        <RowActionsMenu
                          items={[
                            ...(client.email ? [{ label: 'Message', onClick: () => router.push(`/clients/${client.id}`) }] : []),
                            { label: 'Open', onClick: () => router.push(`/clients/${client.id}`) },
                            { label: 'Delete', onClick: () => setClientToDelete(client), destructive: true },
                          ]}
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
                {filtered.length === 0 ? '0 clients' : `${pageStart}–${pageEnd} of ${filtered.length} clients`}
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
                  <Pagination.Next isDisabled={page === totalPages} onPress={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next
                    <Pagination.NextIcon />
                  </Pagination.Next>
                </Pagination.Item>
              </Pagination.Content>
            </Pagination>
          </Table.Footer>
        )}
      </Table>

      {selectedCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
          <p className="text-[12px] font-medium text-[var(--color-text-secondary)]">
            {selectedCount} client{selectedCount !== 1 ? 's' : ''} selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedKeys(new Set())}>Clear</Button>
            <Button variant="destructive" size="sm" disabled={isDeleting} onClick={() => void handleBulkDelete()}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      )}

      <DeleteDialog
        open={!!clientToDelete}
        title="Delete client"
        description="This removes the client from your roster."
        itemLabel={clientToDelete?.name}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onOpenChange={(open) => { if (!open && !isDeleting) setClientToDelete(null); }}
      />
    </div>
  );
}


