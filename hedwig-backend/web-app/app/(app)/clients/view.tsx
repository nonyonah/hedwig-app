'use client';

import { useMemo, useState } from 'react';
import { Plus, UserPlus, UsersThree } from '@phosphor-icons/react/dist/ssr';
import type { Client } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import type { CreateClientInput } from '@/lib/api/client';
import { EntityTable } from '@/components/data/entity-table';
import { MetricCard } from '@/components/data/metric-card';
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

const emptyClient: CreateClientInput = {
  name: '',
  email: '',
  phone: '',
  company: '',
  address: '',
  walletAddress: ''
};

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
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<CreateClientInput>(emptyClient);

  const activeClients = useMemo(() => clients.filter((c) => c.status === 'active').length, [clients]);
  const totalOutstanding = useMemo(() => clients.reduce((s, c) => s + c.outstandingUsd, 0), [clients]);
  const lifetimeBilled = useMemo(() => clients.reduce((s, c) => s + c.totalBilledUsd, 0), [clients]);

  const updateField = (field: keyof CreateClientInput, value: string) =>
    setForm((cur) => ({ ...cur, [field]: value }));

  const resetForm = () => {
    setForm(emptyClient);
    setIsCreating(false);
  };

  const handleCreateClient = async () => {
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
        {
          ...form,
          name: form.name.trim(),
          email: form.email?.trim() || undefined,
          phone: form.phone?.trim() || undefined,
          company: form.company?.trim() || undefined,
          address: form.address?.trim() || undefined,
          walletAddress: form.walletAddress?.trim() || undefined
        },
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Clients"
        title="Client relationships tied directly to revenue"
        description="Track who you work with, what they owe, and how active each account is without leaving the operating surface."
        actions={
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4" weight="bold" />
            New client
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard
          icon={<UsersThree className="h-5 w-5 text-[#717680]" weight="regular" />}
          label="Active clients"
          value={`${activeClients}`}
        />
        <MetricCard
          icon={<UserPlus className="h-5 w-5 text-[#717680]" weight="regular" />}
          label="Outstanding"
          value={formatCompactCurrency(totalOutstanding, currency)}
        />
        <MetricCard
          icon={<UsersThree className="h-5 w-5 text-[#717680]" weight="regular" />}
          label="Lifetime billed"
          value={formatCompactCurrency(lifetimeBilled, currency)}
        />
      </div>

      <EntityTable
        title="Client roster"
        columns={['Client', 'Status', 'Outstanding', 'Lifetime billed', 'Last activity']}
        rows={clients.map((client) => [
          { value: client.name, href: `/clients/${client.id}` },
          {
            value: client.status.replace('_', ' '),
            badge: true,
            tone: client.status === 'active' ? 'success' : client.status === 'at_risk' ? 'warning' : 'neutral'
          },
          { value: formatCompactCurrency(client.outstandingUsd, currency) },
          { value: formatCompactCurrency(client.totalBilledUsd, currency) },
          { value: formatShortDate(client.lastActivityAt) }
        ])}
      />

      {/* ── New client dialog ─────────────────────────────── */}
      <Dialog open={isCreating} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New client</DialogTitle>
            <DialogDescription>Add a client to link to projects and invoices.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">
                  Client name <span className="text-[#f04438]">*</span>
                </label>
                <Input
                  placeholder="e.g. Aisha Bello"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Email</label>
                <Input
                  type="email"
                  placeholder="client@example.com"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Phone</label>
                <Input
                  placeholder="+234 800 000 0000"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Company</label>
                <Input
                  placeholder="Company name"
                  value={form.company}
                  onChange={(e) => updateField('company', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Address</label>
                <Input
                  placeholder="City, Country"
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Wallet address</label>
                <Input
                  placeholder="0x… or sol…"
                  value={form.walletAddress}
                  onChange={(e) => updateField('walletAddress', e.target.value)}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" disabled={isSubmitting}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleCreateClient} disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
