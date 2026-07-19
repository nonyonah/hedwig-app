'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Envelope, Plus, Trash } from '@/components/ui/lucide-icons';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import type { Client } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { Button } from '@/components/ui/button';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { useCurrency } from '@/components/providers/currency-provider';
import { useToast } from '@/components/providers/toast-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { formatShortDate } from '@/lib/utils';

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
    if (filter === 'all') return clients;
    if (filter === 'new' || filter === 'active' || filter === 'lapsing' || filter === 'dormant') {
      return clients.filter((c) => c.segment === filter);
    }
    return clients.filter((c) => c.status === filter);
  }, [clients, filter]);

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
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_120px_110px_120px_120px_90px_44px] gap-3 border-b border-[var(--color-border)] px-5 py-2.5">
          <ColHead>Client</ColHead>
          <ColHead>Segment</ColHead>
          <ColHead>Status</ColHead>
          <ColHead right>Outstanding</ColHead>
          <ColHead right>Earnings</ColHead>
          <ColHead right>Last activity</ColHead>
          <span />
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <EmptyState text={filter === 'all' ? 'No clients yet.' : 'No clients match this filter.'} />
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {filtered.map((client) => {
              const s = CLIENT_STATUS[client.status] ?? CLIENT_STATUS.inactive;
              const segMeta = SEGMENT_META[client.segment];
              return (
                <div
                  key={client.id}
                  className="group grid grid-cols-[1fr_120px_110px_120px_120px_90px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--color-background)]"
                >
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
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${segMeta.bg} ${segMeta.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${segMeta.dot}`} />
                    {segMeta.label}
                  </span>
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                  <p className="text-right text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">
                    {formatAmount(client.outstandingUsd, { compact: true })}
                  </p>
                  <p className="text-right text-[13px] tabular-nums text-[var(--color-text-tertiary)]">
                    {formatAmount(client.totalBilledUsd, { compact: true })}
                  </p>
                  <p className="text-right text-[12px] text-[var(--color-text-muted)]">{formatShortDate(client.lastActivityAt)}</p>
                  <div className="flex justify-end">
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setClientToDelete(client)}
                        className="h-7 w-7 rounded-md text-[var(--color-border-input)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                        aria-label={`Delete ${client.name}`}
                        title="Delete client"
                      >
                        <Trash className="h-3.5 w-3.5" weight="bold" />
                      </Button>
                      {client.email && (
                        <Link
                          href={`/clients/${client.id}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-border-input)] transition-all hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                          aria-label={`Message ${client.name}`}
                          title="Message client"
                        >
                          <Envelope className="h-3.5 w-3.5" weight="bold" />
                        </Link>
                      )}
                      <Link
                        href={`/clients/${client.id}`}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-border-input)] transition-all hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-tertiary)]"
                      >
                        <ArrowRight className="h-3.5 w-3.5" weight="bold" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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

function ColHead({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <span className={`text-[11px] font-medium text-[var(--color-text-tertiary)] ${right ? 'text-right' : ''}`}>
      {children}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <p className="text-[13px] text-[var(--color-text-muted)]">{text}</p>
    </div>
  );
}
