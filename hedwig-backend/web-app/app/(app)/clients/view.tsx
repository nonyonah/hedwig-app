'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, Plus } from '@/components/ui/lucide-icons';
import type { Client } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { Button } from '@/components/ui/button';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { useCurrency } from '@/components/providers/currency-provider';
import { useToast } from '@/components/providers/toast-provider';
import { formatShortDate } from '@/lib/utils';

const CLIENT_STATUS = {
  active:   { dot: 'bg-[#12b76a]', label: 'Active',   bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  at_risk:  { dot: 'bg-[#f59e0b]', label: 'At risk',  bg: 'bg-[#fffaeb]', text: 'text-[#92400e]' },
  inactive: { dot: 'bg-[#a4a7ae]', label: 'Inactive', bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
} as const;

type ClientSegment = 'new' | 'active' | 'recurring' | 'inactive';

function getClientSegment(client: Client): ClientSegment {
  if (client.totalBilledUsd === 0) return 'new';
  if (client.status === 'active' && client.outstandingUsd > 0) return 'recurring';
  if (client.status === 'active') return 'active';
  return 'inactive';
}

const SEGMENT_META: Record<ClientSegment, { label: string; sub: string }> = {
  new:       { label: 'New',       sub: 'never invoiced' },
  active:    { label: 'Active',    sub: 'no outstanding' },
  recurring: { label: 'Recurring', sub: 'outstanding work' },
  inactive:  { label: 'Inactive',  sub: 'no recent activity' },
};

const ALL_FILTERS = ['all', 'new', 'active', 'recurring', 'inactive', 'at_risk'] as const;
type FilterKey = typeof ALL_FILTERS[number];

const FILTER_LABELS: Record<FilterKey, string> = {
  all:       'All',
  new:       'New',
  active:    'Active',
  recurring: 'Recurring',
  inactive:  'Inactive',
  at_risk:   'At risk',
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

  const [clients, setClients] = useState(initialClients);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const segmentCounts = useMemo(() => {
    const counts = { new: 0, active: 0, recurring: 0, inactive: 0 };
    for (const c of clients) counts[getClientSegment(c)]++;
    return counts;
  }, [clients]);

  const segmentRevenue = useMemo(() => {
    const totals = { new: 0, active: 0, recurring: 0, inactive: 0 };
    for (const c of clients) totals[getClientSegment(c)] += c.totalBilledUsd;
    return totals;
  }, [clients]);

  const totalOutstanding = useMemo(() => clients.reduce((s, c) => s + c.outstandingUsd, 0), [clients]);

  const filtered = useMemo(() => {
    if (filter === 'all') return clients;
    if (filter === 'new' || filter === 'active' || filter === 'recurring' || filter === 'inactive') {
      return clients.filter((c) => getClientSegment(c) === filter);
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
    <div className="space-y-5">
      <div>
        <h1 className="text-[15px] font-semibold text-[#181d27]">Clients</h1>
        <p className="mt-0.5 text-[13px] text-[#a4a7ae]">Manage your client relationships and track outstanding work.</p>
      </div>

      <AttachedStatGrid
        items={(['new', 'active', 'recurring', 'inactive'] as ClientSegment[]).map((seg) => {
          const meta = SEGMENT_META[seg];
          return {
            id: seg,
            title: meta.label,
            value: String(segmentCounts[seg]),
            helper: segmentRevenue[seg] > 0
              ? (
                  <>
                    <span>{meta.sub}</span>
                    <span className="mt-1 block text-[#717680]">{formatAmount(segmentRevenue[seg], { compact: true })} earned</span>
                  </>
                )
              : meta.sub,
            active: filter === seg,
            onClick: () => setFilter(filter === seg ? 'all' : seg),
          };
        })}
        className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
      />

      {/* Table */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        {/* Unified header */}
        <div className="flex items-center gap-3 border-b border-[#f2f4f7] px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="text-[12px] font-medium text-[#717680]">{clients.length} clients</span>
            {totalOutstanding > 0 && (
              <>
                <span className="h-3 w-px shrink-0 bg-[#f2f4f7]" />
                <span className="truncate text-[12px] text-[#a4a7ae]">
                  {formatAmount(totalOutstanding, { compact: true })} outstanding
                </span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 flex-wrap justify-end">
            {ALL_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  filter === s
                    ? 'bg-[#f5f5f5] text-[#181d27]'
                    : 'text-[#8d9096] hover:bg-[#f9fafb] hover:text-[#414651]'
                }`}
              >
                {FILTER_LABELS[s]}
              </button>
            ))}
            <div className="mx-1 h-4 w-px bg-[#f2f4f7]" />
            <Button
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent('hedwig:open-create-menu', { detail: { flow: 'client' } }))}
            >
              <Plus className="h-3.5 w-3.5" weight="bold" />
              New client
            </Button>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_120px_110px_120px_120px_90px_44px] gap-3 border-b border-[#f2f4f7] px-5 py-2">
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
          <div className="divide-y divide-[#f9fafb]">
            {filtered.map((client) => {
              const s = CLIENT_STATUS[client.status] ?? CLIENT_STATUS.inactive;
              const seg = getClientSegment(client);
              const segMeta = SEGMENT_META[seg];
              return (
                <div
                  key={client.id}
                  className="group grid grid-cols-[1fr_120px_110px_120px_120px_90px_44px] items-center gap-3 px-5 py-3 transition-colors hover:bg-[#fafafa]"
                >
                  <Link href={`/clients/${client.id}`} className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f5f5f5] text-[11px] font-bold text-[#8d9096]">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[#252b37] transition-colors hover:text-[#2563eb]">
                        {client.name}
                      </p>
                      {client.company && (
                        <p className="truncate text-[11px] text-[#a4a7ae]">{client.company}</p>
                      )}
                    </div>
                  </Link>
                  <span className="inline-flex w-fit items-center rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[11px] font-semibold text-[#717680]">
                    {segMeta.label}
                  </span>
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                  <p className="text-right text-[13px] font-semibold tabular-nums text-[#252b37]">
                    {formatAmount(client.outstandingUsd, { compact: true })}
                  </p>
                  <p className="text-right text-[13px] tabular-nums text-[#8d9096]">
                    {formatAmount(client.totalBilledUsd, { compact: true })}
                  </p>
                  <p className="text-right text-[12px] text-[#a4a7ae]">{formatShortDate(client.lastActivityAt)}</p>
                  <div className="flex justify-end">
                    <Link
                      href={`/clients/${client.id}`}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[#d0d5dd] opacity-0 transition-all hover:bg-[#f5f5f5] hover:text-[#717680] group-hover:opacity-100"
                    >
                      <ArrowRight className="h-3.5 w-3.5" weight="bold" />
                    </Link>
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
    <span className={`text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd] ${right ? 'text-right' : ''}`}>
      {children}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <p className="text-[13px] text-[#a4a7ae]">{text}</p>
    </div>
  );
}
