'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, Plus } from '@/components/ui/lucide-icons';
import type { Client } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/components/providers/currency-provider';
import { useToast } from '@/components/providers/toast-provider';
import { formatCompactCurrency, formatShortDate } from '@/lib/utils';

const CLIENT_STATUS = {
  active:   { dot: 'bg-[#12b76a]', label: 'Active',   bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  at_risk:  { dot: 'bg-[#f59e0b]', label: 'At risk',  bg: 'bg-[#fffaeb]', text: 'text-[#92400e]' },
  inactive: { dot: 'bg-[#a4a7ae]', label: 'Inactive', bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
} as const;

const STATUS_FILTERS = ['all', 'active', 'at_risk', 'inactive'] as const;

export function ClientsClient({
  initialClients,
  accessToken
}: {
  initialClients: Client[];
  accessToken: string | null;
}) {
  const { currency } = useCurrency();
  const { toast } = useToast();

  const [clients, setClients] = useState(initialClients);
  const [filter, setFilter] = useState<string>('all');
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const totalOutstanding = useMemo(() => clients.reduce((s, c) => s + c.outstandingUsd, 0), [clients]);

  const filtered = useMemo(
    () => (filter === 'all' ? clients : clients.filter((c) => c.status === filter)),
    [clients, filter]
  );

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
    <div className="space-y-4">
      <div>
        <h1 className="text-[15px] font-semibold text-[#181d27]">Clients</h1>
        <p className="mt-0.5 text-[13px] text-[#a4a7ae]">Manage your client relationships and track outstanding work.</p>
      </div>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        {/* Unified header */}
        <div className="flex items-center gap-3 border-b border-[#f2f4f7] px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="text-[12px] font-medium text-[#717680]">{clients.length} clients</span>
            {totalOutstanding > 0 && (
              <>
                <span className="h-3 w-px shrink-0 bg-[#f2f4f7]" />
                <span className="truncate text-[12px] text-[#a4a7ae]">
                  {formatCompactCurrency(totalOutstanding, currency)} outstanding
                </span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {STATUS_FILTERS.map((s) => (
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
                {s === 'all' ? 'All' : s === 'at_risk' ? 'At risk' : CLIENT_STATUS[s as keyof typeof CLIENT_STATUS]?.label ?? s}
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
        <div className="grid grid-cols-[1fr_110px_120px_120px_90px_44px] gap-3 border-b border-[#f2f4f7] px-5 py-2">
          <ColHead>Client</ColHead>
          <ColHead>Status</ColHead>
          <ColHead right>Outstanding</ColHead>
          <ColHead right>Lifetime billed</ColHead>
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
              return (
                <div
                  key={client.id}
                  className="group grid grid-cols-[1fr_110px_120px_120px_90px_44px] items-center gap-3 px-5 py-3 transition-colors hover:bg-[#fafafa]"
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
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                  <p className="text-right text-[13px] font-semibold tabular-nums text-[#252b37]">
                    {formatCompactCurrency(client.outstandingUsd, currency)}
                  </p>
                  <p className="text-right text-[13px] tabular-nums text-[#8d9096]">
                    {formatCompactCurrency(client.totalBilledUsd, currency)}
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
