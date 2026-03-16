'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, Plus, UserPlus, UsersThree } from '@phosphor-icons/react/dist/ssr';
import type { Client } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import type { CreateClientInput } from '@/lib/api/client';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { PageHeader } from '@/components/data/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCurrency } from '@/components/providers/currency-provider';
import { useToast } from '@/components/providers/toast-provider';
import { formatCompactCurrency, formatShortDate } from '@/lib/utils';

const CLIENT_STATUS = {
  active:   { dot: 'bg-[#12b76a]', label: 'Active',   bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  at_risk:  { dot: 'bg-[#f59e0b]', label: 'At risk',  bg: 'bg-[#fffaeb]', text: 'text-[#92400e]' },
  inactive: { dot: 'bg-[#a4a7ae]', label: 'Inactive', bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
} as const;

const STATUS_FILTERS = ['all', 'active', 'at_risk', 'inactive'] as const;

const emptyClient: CreateClientInput = { name: '', email: '', phone: '', company: '', address: '' };

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
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<CreateClientInput>(emptyClient);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeCount = useMemo(() => clients.filter((c) => c.status === 'active').length, [clients]);
  const totalOutstanding = useMemo(() => clients.reduce((s, c) => s + c.outstandingUsd, 0), [clients]);
  const lifetimeBilled = useMemo(() => clients.reduce((s, c) => s + c.totalBilledUsd, 0), [clients]);

  const filtered = useMemo(
    () => (filter === 'all' ? clients : clients.filter((c) => c.status === filter)),
    [clients, filter]
  );

  const updateField = (field: keyof CreateClientInput, value: string) =>
    setForm((cur) => ({ ...cur, [field]: value }));

  const resetForm = () => { setForm(emptyClient); setIsCreating(false); };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast({ type: 'error', title: 'Name required', message: 'Client name cannot be empty.' });
      return;
    }
    if (!accessToken) {
      toast({ type: 'error', title: 'Session expired', message: 'Please sign in again.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await hedwigApi.createClient(
        { ...form, name: form.name.trim(), email: form.email?.trim() || undefined, phone: form.phone?.trim() || undefined, company: form.company?.trim() || undefined, address: form.address?.trim() || undefined },
        { accessToken, disableMockFallback: true }
      );
      setClients((cur) => [created, ...cur]);
      resetForm();
      toast({ type: 'success', title: 'Client added', message: `${created.name} was added to your roster.` });
    } catch (error: any) {
      toast({ type: 'error', title: 'Failed to create client', message: error?.message || 'Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

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
      <PageHeader
        eyebrow="Clients"
        title="Client relationships"
        description="Track who you work with, what they owe, and how active each account is."
        actions={
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4" weight="bold" />
            New client
          </Button>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
        <StatItem icon={<UsersThree className="h-4 w-4 text-[#2563eb]" weight="bold" />} label="Active clients" value={`${activeCount}`} sub="currently active" accent="text-[#181d27]" />
        <StatItem icon={<UserPlus className="h-4 w-4 text-[#f04438]" weight="bold" />} label="Outstanding" value={formatCompactCurrency(totalOutstanding, currency)} sub="awaiting payment" accent="text-[#f04438]" />
        <StatItem icon={<UsersThree className="h-4 w-4 text-[#12b76a]" weight="bold" />} label="Lifetime billed" value={formatCompactCurrency(lifetimeBilled, currency)} sub="total across all clients" accent="text-[#12b76a]" />
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e9eaeb] px-5 py-4">
          <div>
            <p className="text-[15px] font-semibold text-[#181d27]">Client roster</p>
            <p className="text-[12px] text-[#a4a7ae] mt-0.5">{clients.length} client{clients.length !== 1 ? 's' : ''} total</p>
          </div>
          <div className="flex items-center gap-2">
            {STATUS_FILTERS.map((s) => (
              <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
                {s === 'all' ? 'All' : CLIENT_STATUS[s as keyof typeof CLIENT_STATUS]?.label ?? s}
              </FilterChip>
            ))}
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
          <EmptyState text="No clients match this filter." />
        ) : (
          <div className="divide-y divide-[#f9fafb]">
            {filtered.map((client) => {
              const s = CLIENT_STATUS[client.status] ?? CLIENT_STATUS.inactive;
              return (
                <div key={client.id} className="group grid grid-cols-[1fr_110px_120px_120px_90px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fafafa]">
                  <Link href={`/clients/${client.id}`} className="min-w-0 flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eff4ff] text-[12px] font-bold text-[#2563eb]">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[#181d27] hover:text-[#2563eb] transition-colors">{client.name}</p>
                      {client.company && <p className="truncate text-[11px] text-[#a4a7ae]">{client.company}</p>}
                    </div>
                  </Link>
                  <StatusPill dot={s.dot} label={s.label} bg={s.bg} text={s.text} />
                  <p className="text-right text-[13px] font-semibold tabular-nums text-[#181d27]">{formatCompactCurrency(client.outstandingUsd, currency)}</p>
                  <p className="text-right text-[13px] tabular-nums text-[#717680]">{formatCompactCurrency(client.totalBilledUsd, currency)}</p>
                  <p className="text-right text-[12px] text-[#a4a7ae]">{formatShortDate(client.lastActivityAt)}</p>
                  <div className="flex justify-end gap-1">
                    <Link href={`/clients/${client.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#a4a7ae] opacity-0 transition-all hover:bg-[#f2f4f7] hover:text-[#344054] group-hover:opacity-100">
                      <ArrowRight className="h-4 w-4" weight="bold" />
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

      <Dialog open={isCreating} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New client</DialogTitle>
            <DialogDescription>Add a client to link to projects and invoices.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Client name <span className="text-[#f04438]">*</span></label>
                <Input placeholder="e.g. Aisha Bello" value={form.name} onChange={(e) => updateField('name', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Email</label>
                <Input type="email" placeholder="client@example.com" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Phone</label>
                <Input placeholder="+234 800 000 0000" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Company</label>
                <Input placeholder="Company name" value={form.company} onChange={(e) => updateField('company', e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Address</label>
                <Input placeholder="City, Country" value={form.address} onChange={(e) => updateField('address', e.target.value)} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary" disabled={isSubmitting}>Cancel</Button></DialogClose>
            <Button onClick={handleCreate} disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create client'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── shared sub-components ── */
function StatusPill({ dot, label, bg, text }: { dot: string; label: string; bg: string; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${bg} ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function StatItem({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-[12px] font-medium text-[#717680]">{label}</span></div>
      <p className={`text-[22px] font-bold tracking-[-0.03em] ${accent}`}>{value}</p>
      <p className="mt-1 text-[11px] text-[#a4a7ae]">{sub}</p>
    </div>
  );
}

function ColHead({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <span className={`text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae] ${right ? 'text-right' : ''}`}>{children}</span>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${active ? 'bg-[#eff4ff] text-[#2563eb]' : 'text-[#717680] hover:bg-[#f2f4f7] hover:text-[#344054]'}`}>
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <UsersThree className="h-8 w-8 text-[#d0d5dd]" weight="duotone" />
      <p className="text-[13px] text-[#a4a7ae]">{text}</p>
    </div>
  );
}
