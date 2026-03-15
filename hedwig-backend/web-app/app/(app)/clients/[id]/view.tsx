'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Buildings, CheckCircle, CreditCard, Envelope, MapPin, NotePencil, Phone, Wallet, Warning } from '@phosphor-icons/react/dist/ssr';
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

/* ── Helpers ────────────────────────────────────────────────────── */
function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const STATUS_STYLES: Record<Client['status'], string> = {
  active:   'bg-[#dcfce7] text-[#15803d]',
  at_risk:  'bg-[#fef9c3] text-[#854d0e]',
  inactive: 'bg-[#f4f4f5] text-[#71717a]'
};
const STATUS_LABEL: Record<Client['status'], string> = {
  active: 'Active', at_risk: 'At risk', inactive: 'Inactive'
};

const INV_STATUS_STYLES: Record<Invoice['status'], string> = {
  draft:   'bg-[#f4f4f5] text-[#71717a]',
  sent:    'bg-[#dbeafe] text-[#1d4ed8]',
  paid:    'bg-[#dcfce7] text-[#15803d]',
  overdue: 'bg-[#fee2e2] text-[#dc2626]'
};

const PROJ_STATUS_STYLES: Record<Project['status'], string> = {
  active:    'bg-[#dbeafe] text-[#1d4ed8]',
  paused:    'bg-[#fef9c3] text-[#854d0e]',
  completed: 'bg-[#dcfce7] text-[#15803d]'
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize', className)}>
      {label}
    </span>
  );
}

function DetailRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-[#f2f4f7] last:border-0">
      <div className="flex items-center gap-2 min-w-[130px]">
        {icon && <span className="text-[#a4a7ae]">{icon}</span>}
        <span className="text-[13px] text-[#717680]">{label}</span>
      </div>
      <span className="text-[13px] font-medium text-[#181d27] text-right break-all">
        {value || <span className="text-[#d0d5dd]">—</span>}
      </span>
    </div>
  );
}

function SectionCard({
  title,
  action,
  children,
  className
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl bg-white ring-1 ring-[#e9eaeb]', className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#f2f4f7]">
        <h2 className="text-[14px] font-semibold text-[#181d27]">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-5 py-8 text-center text-[13px] text-[#a4a7ae]">{text}</div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
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
    address: initialClient.address || '',
    walletAddress: initialClient.walletAddress || ''
  });

  const updateField = (field: keyof typeof form, value: string) =>
    setForm((cur) => ({ ...cur, [field]: value }));

  const openEdit = () => {
    setForm({
      name: client.name,
      email: client.email,
      company: client.company || '',
      phone: client.phone || '',
      address: client.address || '',
      walletAddress: client.walletAddress || ''
    });
    setEditOpen(true);
  };

  const saveClient = async () => {
    if (!accessToken) {
      toast({ type: 'error', title: 'Session expired', message: 'Please sign in again.' });
      return;
    }
    setIsSaving(true);
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
      setEditOpen(false);
      toast({ type: 'success', title: 'Client updated' });
    } catch (err: any) {
      toast({ type: 'error', title: 'Failed to update', message: err?.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[13px]">
        <Link href="/clients" className="flex items-center gap-1.5 text-[#717680] hover:text-[#414651] transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" weight="bold" />
          Clients
        </Link>
        <span className="text-[#d0d5dd]">/</span>
        <span className="font-medium text-[#181d27]">{client.name}</span>
      </div>

      {/* Page hero */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#2563eb] text-white text-[18px] font-bold shadow-sm">
            {initials(client.name)}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[22px] font-semibold text-[#181d27] leading-tight">{client.name}</h1>
              <Badge label={STATUS_LABEL[client.status]} className={STATUS_STYLES[client.status]} />
            </div>
            {client.company && (
              <p className="mt-0.5 text-[14px] text-[#717680]">{client.company}</p>
            )}
          </div>
        </div>
        <Button size="sm" onClick={openEdit}>
          <NotePencil className="h-4 w-4" weight="bold" />
          Edit
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Outstanding', value: formatCompactCurrency(client.outstandingUsd), icon: <Warning className="h-4 w-4 text-[#f59e0b]" weight="fill" />, highlight: client.outstandingUsd > 0 },
          { label: 'Lifetime billed', value: formatCompactCurrency(client.totalBilledUsd), icon: <CreditCard className="h-4 w-4 text-[#2563eb]" weight="fill" />, highlight: false },
          { label: 'Projects', value: `${projects.length}`, icon: <Buildings className="h-4 w-4 text-[#717680]" weight="fill" />, highlight: false },
          { label: 'Last activity', value: formatShortDate(client.lastActivityAt), icon: <CheckCircle className="h-4 w-4 text-[#717680]" weight="fill" />, highlight: false }
        ].map((m) => (
          <div key={m.label} className="rounded-xl bg-white ring-1 ring-[#e9eaeb] px-4 py-3.5">
            <div className="flex items-center gap-2 mb-1">{m.icon}<span className="text-[12px] text-[#717680]">{m.label}</span></div>
            <p className={cn('text-[20px] font-semibold', m.highlight ? 'text-[#dc2626]' : 'text-[#181d27]')}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* Details card */}
          <SectionCard
            title="Details"
            action={
              <button onClick={openEdit} className="text-[13px] font-medium text-[#2563eb] hover:text-[#1d4ed8] transition-colors">
                Edit
              </button>
            }
          >
            <div className="px-5">
              <DetailRow label="Name" value={client.name} icon={<Buildings className="h-3.5 w-3.5" weight="regular" />} />
              <DetailRow label="Email" value={client.email} icon={<Envelope className="h-3.5 w-3.5" weight="regular" />} />
              <DetailRow label="Company" value={client.company} icon={<Buildings className="h-3.5 w-3.5" weight="regular" />} />
              <DetailRow label="Phone" value={client.phone} icon={<Phone className="h-3.5 w-3.5" weight="regular" />} />
              <DetailRow label="Address" value={client.address} icon={<MapPin className="h-3.5 w-3.5" weight="regular" />} />
              <DetailRow label="Wallet" value={client.walletAddress ? `${client.walletAddress.slice(0, 8)}…${client.walletAddress.slice(-6)}` : null} icon={<Wallet className="h-3.5 w-3.5" weight="regular" />} />
            </div>
          </SectionCard>

          {/* Projects */}
          <SectionCard title={`Projects (${projects.length})`}>
            {projects.length === 0 ? (
              <EmptyRow text="No projects linked to this client yet." />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#f2f4f7]">
                    {['Project', 'Status', 'Progress', 'Budget', 'Next deadline'].map((h) => (
                      <th key={h} className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#a4a7ae]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f4f7]">
                  {projects.map((p) => (
                    <tr key={p.id} className="hover:bg-[#fafafa] transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/projects/${p.id}`} className="text-[13px] font-medium text-[#181d27] hover:text-[#2563eb] transition-colors">
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Badge label={p.status} className={PROJ_STATUS_STYLES[p.status]} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-[#f2f4f7] overflow-hidden">
                            <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${p.progress}%` }} />
                          </div>
                          <span className="text-[12px] text-[#717680]">{p.progress}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-[#414651]">{formatCompactCurrency(p.budgetUsd)}</td>
                      <td className="px-5 py-3 text-[13px] text-[#414651]">{formatShortDate(p.nextDeadlineAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          {/* Invoices */}
          <SectionCard title={`Invoices (${invoices.length})`}>
            {invoices.length === 0 ? (
              <EmptyRow text="No invoices for this client yet." />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#f2f4f7]">
                    {['Invoice', 'Status', 'Amount', 'Due'].map((h) => (
                      <th key={h} className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#a4a7ae]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f4f7]">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#fafafa] transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/payments?invoice=${inv.id}`} className="text-[13px] font-medium text-[#181d27] hover:text-[#2563eb] transition-colors">
                          {inv.number}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Badge label={inv.status} className={INV_STATUS_STYLES[inv.status]} />
                      </td>
                      <td className="px-5 py-3 text-[13px] font-medium text-[#181d27]">{formatCompactCurrency(inv.amountUsd)}</td>
                      <td className="px-5 py-3 text-[13px] text-[#414651]">{formatShortDate(inv.dueAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          {/* Contracts */}
          <SectionCard title={`Contracts (${contracts.length})`}>
            {contracts.length === 0 ? (
              <EmptyRow text="No contracts yet." />
            ) : (
              <div className="divide-y divide-[#f2f4f7]">
                {contracts.map((c) => (
                  <Link key={c.id} href={`/contracts?contract=${c.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-[#fafafa] transition-colors">
                    <div>
                      <p className="text-[13px] font-medium text-[#181d27]">{c.title}</p>
                      {c.signedAt && <p className="text-[12px] text-[#a4a7ae] mt-0.5">Signed {formatShortDate(c.signedAt)}</p>}
                    </div>
                    <Badge
                      label={c.status}
                      className={c.status === 'signed' ? 'bg-[#dcfce7] text-[#15803d]' : c.status === 'review' ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-[#f4f4f5] text-[#71717a]'}
                    />
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Payment links */}
          <SectionCard title={`Payment links (${paymentLinks.length})`}>
            {paymentLinks.length === 0 ? (
              <EmptyRow text="No payment links yet." />
            ) : (
              <div className="divide-y divide-[#f2f4f7]">
                {paymentLinks.map((pl) => (
                  <div key={pl.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-medium text-[#181d27]">{pl.title}</p>
                      <Badge
                        label={pl.status}
                        className={pl.status === 'paid' ? 'bg-[#dcfce7] text-[#15803d]' : pl.status === 'active' ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-[#f4f4f5] text-[#71717a]'}
                      />
                    </div>
                    <p className="mt-0.5 text-[12px] text-[#a4a7ae]">{formatCompactCurrency(pl.amountUsd)} · {pl.asset} on {pl.chain}</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => !isSaving && setEditOpen(v)}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit client</DialogTitle>
            <DialogDescription>Update the contact details for {client.name}.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {[
              { label: 'Full name', field: 'name' as const, placeholder: 'Jane Smith', required: true },
              { label: 'Email', field: 'email' as const, placeholder: 'jane@example.com', required: true },
              { label: 'Company', field: 'company' as const, placeholder: 'Acme Corp' },
              { label: 'Phone', field: 'phone' as const, placeholder: '+1 555 000 0000' },
              { label: 'Address', field: 'address' as const, placeholder: '123 Main St, New York' },
              { label: 'Wallet address', field: 'walletAddress' as const, placeholder: '0x…' }
            ].map(({ label, field, placeholder, required }) => (
              <div key={field}>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">
                  {label} {required && <span className="text-[#f04438]">*</span>}
                </label>
                <Input
                  placeholder={placeholder}
                  value={form[field]}
                  onChange={(e) => updateField(field, e.target.value)}
                  disabled={isSaving}
                />
              </div>
            ))}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" disabled={isSaving}>Cancel</Button>
            </DialogClose>
            <Button onClick={saveClient} disabled={isSaving || !form.name.trim() || !form.email.trim()}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
