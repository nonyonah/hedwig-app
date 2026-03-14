'use client';

import { useState } from 'react';
import { Briefcase, CreditCard, FileText, NotePencil, UserCircle } from '@phosphor-icons/react/dist/ssr';
import { ListCard } from '@/components/data/list-card';
import { MetricCard } from '@/components/data/metric-card';
import { PageHeader } from '@/components/data/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { hedwigApi } from '@/lib/api/client';
import type { Client, Contract, Invoice, PaymentLink, Project } from '@/lib/models/entities';
import { formatCompactCurrency } from '@/lib/utils';

export function ClientDetailClient({
  initialClient,
  projects,
  invoices,
  paymentLinks,
  contracts,
  accessToken
}: {
  initialClient: Client;
  projects: Project[];
  invoices: Invoice[];
  paymentLinks: PaymentLink[];
  contracts: Contract[];
  accessToken: string | null;
}) {
  const [client, setClient] = useState(initialClient);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: initialClient.name,
    email: initialClient.email,
    company: initialClient.company || '',
    phone: initialClient.phone || '',
    address: initialClient.address || '',
    walletAddress: initialClient.walletAddress || ''
  });

  const updateField = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const resetForm = () => {
    setForm({
      name: client.name,
      email: client.email,
      company: client.company || '',
      phone: client.phone || '',
      address: client.address || '',
      walletAddress: client.walletAddress || ''
    });
    setIsEditing(false);
    setFeedback(null);
  };

  const saveClient = async () => {
    if (!accessToken) {
      setFeedback('Missing session token. Please sign in again.');
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const updated = await hedwigApi.updateClient(
        client.id,
        {
          name: form.name.trim(),
          email: form.email.trim(),
          company: form.company.trim() || undefined,
          phone: form.phone.trim() || undefined,
          address: form.address.trim() || undefined,
          walletAddress: form.walletAddress.trim() || undefined
        },
        { accessToken, disableMockFallback: true }
      );

      setClient(updated);
      setIsEditing(false);
      setFeedback('Client details updated.');
    } catch (error: any) {
      setFeedback(error?.message || 'Failed to update client.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Client detail"
        title={client.name}
        description={`A full operating view for ${client.company ?? client.name}: active work, contracts, invoices, and payment links.`}
        actions={
          <Button size="sm" type="button" variant={isEditing ? 'secondary' : 'default'} onClick={() => (isEditing ? resetForm() : setIsEditing(true))}>
            <NotePencil className="h-4 w-4" weight="bold" />
            {isEditing ? 'Cancel edit' : 'Edit client'}
          </Button>
        }
      />

      {feedback ? (
        <div className="rounded-[15px] border border-[#d5d7da] bg-[#fcfcfd] px-4 py-3 text-sm text-[#414651] shadow-soft">
          {feedback}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard icon={<CreditCard className="h-5 w-5 text-[#72706b]" weight="bold" />} label="Outstanding" value={formatCompactCurrency(client.outstandingUsd)} />
        <MetricCard icon={<Briefcase className="h-5 w-5 text-[#72706b]" weight="bold" />} label="Lifetime billed" value={formatCompactCurrency(client.totalBilledUsd)} />
        <MetricCard icon={<UserCircle className="h-5 w-5 text-[#72706b]" weight="bold" />} label="Email" value={client.email} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="grid gap-6 xl:grid-cols-3">
          <ListCard
            title="Projects"
            items={projects.map((project) => ({
              id: project.id,
              title: project.name,
              subtitle: `${project.progress}% complete`,
              meta: project.contract ? 'Contract linked' : undefined,
              href: `/projects/${project.id}`
            }))}
          />
          <ListCard
            title="Invoices"
            items={invoices.map((invoice) => ({
              id: invoice.id,
              title: invoice.number,
              subtitle: invoice.status,
              meta: formatCompactCurrency(invoice.amountUsd),
              href: `/payments?invoice=${invoice.id}`
            }))}
          />
          <ListCard
            title="Contracts and payment links"
            items={[
              ...contracts.map((contract) => ({
                id: contract.id,
                title: contract.title,
                subtitle: contract.status,
                href: `/contracts?contract=${contract.id}`
              })),
              ...paymentLinks.map((link) => ({
                id: link.id,
                title: link.title,
                subtitle: `${link.chain} • ${link.asset}`,
                meta: formatCompactCurrency(link.amountUsd),
                href: '/payments'
              }))
            ]}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Client profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <Input disabled={!isEditing || isSaving} onChange={(event) => updateField('name', event.target.value)} value={form.name} />
              <Input disabled={!isEditing || isSaving} onChange={(event) => updateField('email', event.target.value)} value={form.email} />
              <Input disabled={!isEditing || isSaving} onChange={(event) => updateField('company', event.target.value)} placeholder="Company" value={form.company} />
              <Input disabled={!isEditing || isSaving} onChange={(event) => updateField('phone', event.target.value)} placeholder="Phone" value={form.phone} />
              <Input disabled={!isEditing || isSaving} onChange={(event) => updateField('address', event.target.value)} placeholder="Address" value={form.address} />
              <Input disabled={!isEditing || isSaving} onChange={(event) => updateField('walletAddress', event.target.value)} placeholder="Wallet address" value={form.walletAddress} />
            </div>
            {isEditing ? (
              <div className="flex flex-wrap gap-3">
                <Button disabled={isSaving} size="sm" type="button" onClick={saveClient}>
                  {isSaving ? 'Saving...' : 'Save changes'}
                </Button>
                <Button disabled={isSaving} size="sm" type="button" variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            ) : null}
            {!isEditing ? (
              <p className="text-sm text-muted-foreground">
                This profile is now reading live backend data, so edits here stay aligned with projects, invoices, payment links, and contracts.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
