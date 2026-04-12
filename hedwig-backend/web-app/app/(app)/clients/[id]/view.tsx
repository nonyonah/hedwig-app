'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Buildings, Envelope, MapPin, NotePencil, Phone, Wallet } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { hedwigApi } from '@/lib/api/client';
import type { Client, Contract, Invoice, PaymentLink, Project } from '@/lib/models/entities';
import { cn, formatCompactCurrency, formatShortDate } from '@/lib/utils';
import { useToast } from '@/components/providers/toast-provider';

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

const CLIENT_STATUS = {
  active:   { label: 'Active',   bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]', dot: 'bg-[#12b76a]' },
  at_risk:  { label: 'At risk',  bg: 'bg-[#fffaeb]', text: 'text-[#92400e]', dot: 'bg-[#f59e0b]' },
  inactive: { label: 'Inactive', bg: 'bg-[#f2f4f7]', text: 'text-[#717680]', dot: 'bg-[#a4a7ae]' },
} as const;

const INV_STATUS = {
  draft:   { label: 'Draft',   bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
  sent:    { label: 'Sent',    bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
  viewed:  { label: 'Viewed',  bg: 'bg-[#f0f9ff]', text: 'text-[#0e7490]' },
  paid:    { label: 'Paid',    bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  overdue: { label: 'Overdue', bg: 'bg-[#fff1f0]', text: 'text-[#b42318]' },
} as const;

const PROJ_STATUS = {
  active:    { label: 'Active',    bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  paused:    { label: 'Paused',    bg: 'bg-[#fffaeb]', text: 'text-[#92400e]' },
  completed: { label: 'Completed', bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
} as const;

function Pill({ bg, text, label }: { bg: string; text: string; label: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', bg, text)}>
      {label}
    </span>
  );
}

function SectionCard({ title, count, action, children }: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#f2f4f7]">
      <div className="flex items-center justify-between border-b border-[#f2f4f7] px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[#181d27]">{title}</h2>
          {typeof count === 'number' && (
            <span className="text-[12px] text-[#c1c5cd]">{count}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ColHead({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">{children}</th>;
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-[13px] text-[#a4a7ae]">{text}</div>;
}

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
  const { toast } = useToast();
  const [client, setClient] = useState(initialClient);
  const [editOpen, setEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: initialClient.name,
    email: initialClient.email,
    company: initialClient.company || '',
    phone: initialClient.phone || '',
    address: initialClient.address || ''
  });

  const updateField = (field: keyof typeof form, value: string) =>
    setForm((cur) => ({ ...cur, [field]: value }));

  const openEdit = () => {
    setForm({ name: client.name, email: client.email, company: client.company || '', phone: client.phone || '', address: client.address || '' });
    setEditOpen(true);
  };

  const saveClient = async () => {
    if (!accessToken) { toast({ type: 'error', title: 'Session expired' }); return; }
    setIsSaving(true);
    try {
      const updated = await hedwigApi.updateClient(
        client.id,
        { name: form.name.trim(), email: form.email.trim(), company: form.company.trim() || undefined, phone: form.phone.trim() || undefined, address: form.address.trim() || undefined },
        { accessToken, disableMockFallback: true }
      );
      setClient(updated);
      setEditOpen(false);
      toast({ type: 'success', title: 'Client updated' });
    } catch (err: any) {
      toast({ type: 'error', title: 'Failed to update', message: err?.message });
    } finally {
      setIsSaving(false);
    }
  };

  const s = CLIENT_STATUS[client.status] ?? CLIENT_STATUS.inactive;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px]">
        <Link href="/clients" className="flex items-center gap-1.5 text-[#a4a7ae] transition-colors hover:text-[#525866]">
          <ArrowLeft className="h-3 w-3" weight="bold" />
          Clients
        </Link>
        <span className="text-[#e9eaeb]">/</span>
        <span className="text-[#525866]">{client.name}</span>
      </div>

      {/* Record header */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#f2f4f7]">
        <div className="flex items-center justify-between border-b border-[#f2f4f7] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2563eb] text-[13px] font-bold text-white">
              {initials(client.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold text-[#181d27]">{client.name}</h1>
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', s.bg, s.text)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
                  {s.label}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-[#a4a7ae]">
                {client.company ? `${client.company} · ` : ''}
                {formatCompactCurrency(client.totalBilledUsd)} billed
                {client.outstandingUsd > 0 ? ` · ${formatCompactCurrency(client.outstandingUsd)} outstanding` : ''}
              </p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={openEdit}>
            <NotePencil className="h-3.5 w-3.5" weight="bold" />
            Edit
          </Button>
        </div>

        {/* Details rows */}
        <div className="divide-y divide-[#f9fafb] px-5">
          {[
            { label: 'Email',   value: client.email,   icon: <Envelope className="h-3.5 w-3.5" weight="regular" /> },
            { label: 'Company', value: client.company,  icon: <Buildings className="h-3.5 w-3.5" weight="regular" /> },
            { label: 'Phone',   value: client.phone,    icon: <Phone className="h-3.5 w-3.5" weight="regular" /> },
            { label: 'Address', value: client.address,  icon: <MapPin className="h-3.5 w-3.5" weight="regular" /> },
            { label: 'Wallet',  value: client.walletAddress ? `${client.walletAddress.slice(0, 8)}…${client.walletAddress.slice(-6)}` : null, icon: <Wallet className="h-3.5 w-3.5" weight="regular" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex items-center gap-3 py-2.5">
              <div className="flex w-[120px] shrink-0 items-center gap-2 text-[#c1c5cd]">
                {icon}
                <span className="text-[12px] text-[#a4a7ae]">{label}</span>
              </div>
              <span className="text-[13px] text-[#414651]">
                {value || <span className="text-[#d0d5dd]">—</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column: related records */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Projects */}
          <SectionCard title="Projects" count={projects.length}>
            {projects.length === 0 ? (
              <EmptyRow text="No projects linked to this client." />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#f2f4f7]">
                    <ColHead>Project</ColHead>
                    <ColHead>Status</ColHead>
                    <ColHead>Progress</ColHead>
                    <ColHead>Budget</ColHead>
                    <ColHead>Deadline</ColHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f9fafb]">
                  {projects.map((p) => {
                    const ps = PROJ_STATUS[p.status] ?? PROJ_STATUS.active;
                    return (
                      <tr key={p.id} className="transition-colors hover:bg-[#fafafa]">
                        <td className="px-5 py-2.5">
                          <Link href={`/projects/${p.id}`} className="text-[13px] font-medium text-[#252b37] transition-colors hover:text-[#2563eb]">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-5 py-2.5">
                          <Pill bg={ps.bg} text={ps.text} label={ps.label} />
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-16 overflow-hidden rounded-full bg-[#f2f4f7]">
                              <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${p.progress}%` }} />
                            </div>
                            <span className="text-[12px] tabular-nums text-[#8d9096]">{p.progress}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-[13px] tabular-nums text-[#8d9096]">{formatCompactCurrency(p.budgetUsd)}</td>
                        <td className="px-5 py-2.5 text-[12px] text-[#a4a7ae]">{formatShortDate(p.nextDeadlineAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </SectionCard>

          {/* Invoices */}
          <SectionCard title="Invoices" count={invoices.length}>
            {invoices.length === 0 ? (
              <EmptyRow text="No invoices for this client yet." />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#f2f4f7]">
                    <ColHead>Invoice</ColHead>
                    <ColHead>Status</ColHead>
                    <ColHead>Amount</ColHead>
                    <ColHead>Due</ColHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f9fafb]">
                  {invoices.map((inv) => {
                    const is = INV_STATUS[inv.status] ?? INV_STATUS.draft;
                    return (
                      <tr key={inv.id} className="transition-colors hover:bg-[#fafafa]">
                        <td className="px-5 py-2.5">
                          <Link href={`/payments?invoice=${inv.id}`} className="text-[13px] font-medium text-[#252b37] transition-colors hover:text-[#2563eb]">
                            {inv.number}
                          </Link>
                        </td>
                        <td className="px-5 py-2.5"><Pill bg={is.bg} text={is.text} label={is.label} /></td>
                        <td className="px-5 py-2.5 text-[13px] font-semibold tabular-nums text-[#252b37]">{formatCompactCurrency(inv.amountUsd)}</td>
                        <td className="px-5 py-2.5 text-[12px] text-[#a4a7ae]">{formatShortDate(inv.dueAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          {/* Contracts */}
          <SectionCard title="Contracts" count={contracts.length}>
            {contracts.length === 0 ? (
              <EmptyRow text="No contracts yet." />
            ) : (
              <div className="divide-y divide-[#f9fafb]">
                {contracts.map((c) => {
                  const cs = c.status === 'signed'
                    ? { bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' }
                    : c.status === 'review'
                    ? { bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' }
                    : { bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' };
                  return (
                    <Link key={c.id} href={`/contracts?contract=${c.id}`} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[#fafafa]">
                      <div>
                        <p className="text-[13px] font-medium text-[#252b37]">{c.title}</p>
                        {c.signedAt && <p className="mt-0.5 text-[11px] text-[#a4a7ae]">Signed {formatShortDate(c.signedAt)}</p>}
                      </div>
                      <Pill bg={cs.bg} text={cs.text} label={c.status} />
                    </Link>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Payment links */}
          <SectionCard title="Payment links" count={paymentLinks.length}>
            {paymentLinks.length === 0 ? (
              <EmptyRow text="No payment links yet." />
            ) : (
              <div className="divide-y divide-[#f9fafb]">
                {paymentLinks.map((pl) => {
                  const ps = pl.status === 'paid'
                    ? { bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' }
                    : pl.status === 'active'
                    ? { bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' }
                    : { bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' };
                  return (
                    <div key={pl.id} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-medium text-[#252b37]">{pl.title}</p>
                        <Pill bg={ps.bg} text={ps.text} label={pl.status} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#a4a7ae]">
                        {formatCompactCurrency(pl.amountUsd)} · {pl.asset} on {pl.chain}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => !isSaving && setEditOpen(v)}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Edit client</DialogTitle>
            <DialogDescription>Update contact details for {client.name}.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3.5">
            {([
              { label: 'Full name', field: 'name' as const, placeholder: 'Jane Smith', required: true as boolean },
              { label: 'Email', field: 'email' as const, placeholder: 'jane@example.com', required: true as boolean },
              { label: 'Company', field: 'company' as const, placeholder: 'Acme Corp', required: false as boolean },
              { label: 'Phone', field: 'phone' as const, placeholder: '+1 555 000 0000', required: false as boolean },
              { label: 'Address', field: 'address' as const, placeholder: '123 Main St, New York', required: false as boolean }
            ]).map(({ label, field, placeholder, required }) => (
              <div key={field}>
                <label className="mb-1.5 block text-[12px] font-semibold text-[#525866]">
                  {label}{required && <span className="ml-0.5 text-[#f04438]">*</span>}
                </label>
                <Input placeholder={placeholder} value={form[field]} onChange={(e) => updateField(field, e.target.value)} disabled={isSaving} />
              </div>
            ))}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary" disabled={isSaving}>Cancel</Button></DialogClose>
            <Button onClick={saveClient} disabled={isSaving || !form.name.trim() || !form.email.trim()}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
