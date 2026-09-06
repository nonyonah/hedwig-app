'use client';

import { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlass, X } from '@/components/ui/lucide-icons';
import { Checkbox, Pagination, Table, type Selection } from '@heroui/react';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { Button } from '@/components/ui/button';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import { hedwigApi } from '@/lib/api/client';
import { CreateAgentDialog } from './create-dialog';

type Agent = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  created_at?: string;
  policy?: {
    monthly_cap: number;
    per_transaction_cap: number;
    limit_period: string;
    merchant_allowlist: string[];
    allow_new_vendors: boolean;
    requires_approval_above: number;
  } | null;
};

const PAGE_SIZE = 25;

const AGENT_STATUS = {
  ACTIVE: { dot: 'bg-[var(--color-success)]', label: 'Active', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  SUSPENDED: { dot: 'bg-[var(--color-warning)]', label: 'Suspended', bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
  REVOKED: { dot: 'bg-[var(--color-danger)]', label: 'Revoked', bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' },
} as const;

const STATUS_FILTERS = ['all', 'ACTIVE', 'SUSPENDED', 'REVOKED'] as const;

function StatusPill({ status }: { status: string }) {
  const s = (AGENT_STATUS as Record<string, { dot: string; label: string; bg: string; text: string }>)[
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

export function AgentsClient({
  accessToken,
  workspaceId,
  initialAgents,
}: {
  accessToken: string | null;
  workspaceId?: string | null;
  initialAgents: Agent[];
}) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Client-side refresh on mount (same pattern as contracts): the browser
  // goes through the /api/backend rewrite, independent of the SSR fetch.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const refresh = async () => {
      setIsRefreshing(true);
      try {
        const live = await hedwigApi.agents({ accessToken, workspaceId, disableMockFallback: true });
        // Never clobber server-rendered rows with an empty passive refresh.
        if (!cancelled && (live.length > 0 || initialAgents.length === 0)) setAgents(live);
      } catch {
        // Keep server-provided agents if refresh fails.
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [accessToken, workspaceId]);

  const opts = { accessToken: accessToken ?? '', workspaceId, disableMockFallback: true };

  const refresh = async () => {
    const list = await hedwigApi.agents(opts);
    setAgents(list);
  };

  const handleStatus = async (id: string, status: string) => {
    await hedwigApi.updateAgent(id, { status }, opts);
    await refresh();
  };

  const activeCount = useMemo(() => agents.filter((a) => a.status === 'ACTIVE').length, [agents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (filter !== 'all' && a.status !== filter) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q);
    });
  }, [agents, filter, search]);

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
          <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Agents</h1>
          <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
            Each agent spends within its own deterministic policy. Amounts in USDC.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>New agent</Button>
      </div>

      <AttachedStatGrid
        items={[
          { id: 'total', title: 'Total', value: String(agents.length), helper: 'Agents' },
          { id: 'active', title: 'Active', value: String(activeCount), helper: 'Can spend' },
          {
            id: 'caps',
            title: 'Monthly caps',
            value: `${agents.reduce((s, a) => s + Number(a.policy?.monthly_cap ?? 0), 0)} USDC`,
            helper: 'Combined',
          },
        ]}
        className="grid-cols-1 md:grid-cols-3"
      />

      <CreateAgentDialog
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
            {agents.length} agent{agents.length !== 1 ? 's' : ''}
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
              placeholder="Search agents"
              aria-label="Search agents"
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
              {s === 'all' ? 'All' : (AGENT_STATUS as Record<string, { label: string }>)[s]?.label ?? s}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Agents"
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
                Agent
              </Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Status</Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
                Monthly cap
              </Table.Column>
              <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
                Per transaction
              </Table.Column>
              <Table.Column />
            </Table.Header>
            <Table.Body renderEmptyState={() => (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 py-16 text-center">
                  <p className="text-[13px] text-[var(--color-text-muted)]">No agents match your filters.</p>
                </div>
              )}>
              {pageItems.map((a) => (
                <Table.Row key={a.id} id={a.id} className="hover:bg-[var(--color-background)]">
                  <Table.Cell className="pr-0">
                    <Checkbox slot="selection" aria-label={`Select ${a.name}`} className="ml-3"><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control></Checkbox>
                  </Table.Cell>
                  <Table.Cell>
                    <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{a.name}</p>
                    <p className="text-[12px] text-[var(--color-text-tertiary)]">
                      {a.policy
                        ? `${a.policy.limit_period} · approval above ${a.policy.requires_approval_above} USDC`
                        : 'No policy'}
                    </p>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusPill status={a.status} />
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-[13px]">{a.policy ? `${a.policy.monthly_cap} USDC` : '—'}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-[13px]">{a.policy ? `${a.policy.per_transaction_cap} USDC` : '—'}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex justify-end">
                      <RowActionsMenu
                        items={
                          a.status === 'ACTIVE'
                            ? [{ label: 'Pause agent', onClick: () => handleStatus(a.id, 'SUSPENDED') }]
                            : a.status === 'SUSPENDED'
                              ? [
                                  { label: 'Resume agent', onClick: () => handleStatus(a.id, 'ACTIVE') },
                                  {
                                    label: 'Revoke agent',
                                    onClick: () => handleStatus(a.id, 'REVOKED'),
                                    destructive: true,
                                  },
                                ]
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
                  ? '0 agents'
                  : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} agents`}
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
