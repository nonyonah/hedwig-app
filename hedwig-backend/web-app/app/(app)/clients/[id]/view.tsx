'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Buildings, ClockCountdown, Envelope, MapPin, NotePencil, PaperPlaneRight, Phone, Sparkle, Trash, Wallet } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DeleteDialog } from '@/components/data/delete-dialog';
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
import { cn, formatShortDate } from '@/lib/utils';
import { useToast } from '@/components/providers/toast-provider';
import { useCurrency } from '@/components/providers/currency-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { openPaymentDetail } from '@/lib/payments/open-detail';

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function buildSmsHref(phone?: string) {
  if (!phone) return null;
  const normalized = phone.replace(/[^\d+]/g, '');
  return normalized ? `sms:${normalized}` : null;
}

const CLIENT_STATUS = {
  active:   { label: 'Active',   bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]', dot: 'bg-[var(--color-success)]' },
  at_risk:  { label: 'At risk',  bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]', dot: 'bg-[var(--color-warning)]' },
  inactive: { label: 'Inactive', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]', dot: 'bg-[var(--color-text-muted)]' },
} as const;

const SEGMENT_PILL = {
  new:     { label: 'New',     bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-primary)]', dot: 'bg-[var(--color-primary)]' },
  active:  { label: 'Active',  bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]', dot: 'bg-[var(--color-success)]' },
  lapsing: { label: 'Lapsing', bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]', dot: 'bg-[var(--color-warning)]' },
  dormant: { label: 'Dormant', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]', dot: 'bg-[var(--color-text-muted)]' },
} as const;

const INV_STATUS = {
  draft:   { label: 'Draft',   bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
  sent:    { label: 'Sent',    bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-primary)]' },
  viewed:  { label: 'Viewed',  bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  paid:    { label: 'Paid',    bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  overdue: { label: 'Overdue', bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' },
} as const;

const PROJ_STATUS = {
  active:    { label: 'Active',    bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  paused:    { label: 'Paused',    bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
  completed: { label: 'Completed', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
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
    <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-surface-tertiary)]">
      <div className="flex items-center justify-between border-b border-[var(--color-surface-tertiary)] px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--color-foreground)]">{title}</h2>
          {typeof count === 'number' && (
            <span className="text-[12px] text-[var(--color-text-placeholder)]">{count}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ColHead({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-placeholder)]">{children}</th>;
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-[13px] text-[var(--color-text-muted)]">{text}</div>;
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
  const router = useRouter();
  const { toast } = useToast();
  const { formatAmount } = useCurrency();

  useAssistantPageContext('Client Detail', {
    clientName: initialClient.name,
    clientEmail: initialClient.email,
    projectsCount: projects.length,
    invoicesCount: invoices.length,
    contractsCount: contracts.length,
  });

  const [client, setClient] = useState(initialClient);
  const [editOpen, setEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messagePurpose, setMessagePurpose] = useState('');
  const [isDraftingMessage, setIsDraftingMessage] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
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

  const openMessage = () => {
    setMessageSubject(`Quick follow-up from Hedwig`);
    setMessageBody(`Hi ${client.name.split(' ')[0] || client.name},\n\n`);
    setMessagePurpose('');
    setMessageOpen(true);
  };

  const draftMessage = async () => {
    if (!accessToken) { toast({ type: 'error', title: 'Session expired' }); return; }
    setIsDraftingMessage(true);
    try {
      const draft = await hedwigApi.draftClientMessage(client.id, messagePurpose, { accessToken, disableMockFallback: true });
      setMessageSubject(draft.subject || messageSubject);
      setMessageBody(draft.body || messageBody);
      toast({ type: 'success', title: 'Draft ready', message: 'Review it before sending.' });
    } catch (err: any) {
      toast({ type: 'error', title: 'Could not draft message', message: err?.message || 'Please try again.' });
    } finally {
      setIsDraftingMessage(false);
    }
  };

  const sendMessage = async () => {
    if (!accessToken) { toast({ type: 'error', title: 'Session expired' }); return; }
    setIsSendingMessage(true);
    try {
      await hedwigApi.sendClientMessage(
        client.id,
        { subject: messageSubject.trim(), message: messageBody.trim() },
        { accessToken, disableMockFallback: true }
      );
      setMessageOpen(false);
      toast({ type: 'success', title: 'Message sent', message: `Email sent to ${client.email}.` });
    } catch (err: any) {
      toast({ type: 'error', title: 'Could not send message', message: err?.message || 'Please try again.' });
    } finally {
      setIsSendingMessage(false);
    }
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

  const deleteClient = async () => {
    if (!accessToken) {
      toast({ type: 'error', title: 'Session expired' });
      return;
    }
    setIsDeleting(true);
    try {
      await hedwigApi.deleteClient(client.id, { accessToken, disableMockFallback: true });
      toast({ type: 'success', title: 'Client deleted', message: `${client.name} was removed.` });
      router.replace('/clients');
    } catch (err: any) {
      toast({ type: 'error', title: 'Failed to delete client', message: err?.message || 'Please try again.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const s = CLIENT_STATUS[client.status] ?? CLIENT_STATUS.inactive;
  const seg = SEGMENT_PILL[client.segment] ?? SEGMENT_PILL.new;
  const smsHref = buildSmsHref(client.phone);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px]">
        <Link href="/clients" className="flex items-center gap-1.5 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-tertiary)]">
          <ArrowLeft className="h-3 w-3" weight="bold" />
          Clients
        </Link>
        <span className="text-[var(--color-border)]">/</span>
        <span className="text-[var(--color-text-tertiary)]">{client.name}</span>
      </div>

      {/* Record header */}
      <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-surface-tertiary)]">
        <div className="flex items-center justify-between border-b border-[var(--color-surface-tertiary)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[13px] font-bold text-white">
              {initials(client.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[15px] font-semibold text-[var(--color-foreground)]">{client.name}</h1>
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', s.bg, s.text)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
                  {s.label}
                </span>
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', seg.bg, seg.text)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', seg.dot)} />
                  {seg.label}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
                {client.company ? `${client.company} · ` : ''}
                {formatAmount(client.totalBilledUsd, { compact: true })} billed
                {client.outstandingUsd > 0 ? ` · ${formatAmount(client.outstandingUsd, { compact: true })} outstanding` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {client.email && (
              <button
                type="button"
                onClick={openMessage}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-[13px] font-semibold text-white transition duration-150 hover:bg-[var(--color-primary-dark)]"
              >
                <PaperPlaneRight className="h-3.5 w-3.5" weight="bold" />
                Message
              </button>
            )}
            {smsHref && (
              <Button size="sm" variant="secondary" asChild>
                <a href={smsHref}>
                  <Phone className="h-3.5 w-3.5" weight="bold" />
                  Text
                </a>
              </Button>
            )}
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--color-danger)] shadow-xs transition duration-150 hover:bg-[var(--color-danger-soft)]"
            >
              <Trash className="h-3.5 w-3.5" weight="bold" />
              Delete
            </button>
            <button
              type="button"
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--color-text-secondary)] shadow-xs transition duration-150 hover:bg-[var(--color-background)]"
            >
              <NotePencil className="h-3.5 w-3.5" weight="bold" />
              Edit
            </button>
          </div>
        </div>

        {/* Details rows */}
        <div className="divide-y divide-[var(--color-surface-secondary)] px-5">
          {[
            { label: 'Email',         value: client.email,   icon: <Envelope className="h-3.5 w-3.5" weight="regular" /> },
            { label: 'Company',       value: client.company,  icon: <Buildings className="h-3.5 w-3.5" weight="regular" /> },
            { label: 'Phone',         value: client.phone,    icon: <Phone className="h-3.5 w-3.5" weight="regular" /> },
            { label: 'Address',       value: client.address,  icon: <MapPin className="h-3.5 w-3.5" weight="regular" /> },
            { label: 'Wallet',        value: client.walletAddress ? `${client.walletAddress.slice(0, 8)}…${client.walletAddress.slice(-6)}` : null, icon: <Wallet className="h-3.5 w-3.5" weight="regular" /> },
            { label: 'Last activity', value: client.lastActivityAt ? formatShortDate(client.lastActivityAt) : null, icon: <ClockCountdown className="h-3.5 w-3.5" weight="regular" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex items-center gap-3 py-2.5">
              <div className="flex w-[120px] shrink-0 items-center gap-2 text-[var(--color-text-placeholder)]">
                {icon}
                <span className="text-[12px] text-[var(--color-text-muted)]">{label}</span>
              </div>
              <span className="text-[13px] text-[var(--color-text-secondary)]">
                {value || <span className="text-[var(--color-border-input)]">—</span>}
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
                  <tr className="border-b border-[var(--color-surface-tertiary)]">
                    <ColHead>Project</ColHead>
                    <ColHead>Status</ColHead>
                    <ColHead>Progress</ColHead>
                    <ColHead>Budget</ColHead>
                    <ColHead>Deadline</ColHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-surface-secondary)]">
                  {projects.map((p) => {
                    const ps = PROJ_STATUS[p.status] ?? PROJ_STATUS.active;
                    return (
                      <tr key={p.id} className="transition-colors hover:bg-[var(--color-background)]">
                        <td className="px-5 py-2.5">
                          <Link href={`/projects/${p.id}`} className="text-[13px] font-medium text-[var(--color-foreground)] transition-colors hover:text-[var(--color-primary)]">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-5 py-2.5">
                          <Pill bg={ps.bg} text={ps.text} label={ps.label} />
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-16 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
                              <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${p.progress}%` }} />
                            </div>
                            <span className="text-[12px] tabular-nums text-[var(--color-text-tertiary)]">{p.progress}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-2.5 text-[13px] tabular-nums text-[var(--color-text-tertiary)]">{formatAmount(p.budgetUsd, { compact: true })}</td>
                        <td className="px-5 py-2.5 text-[12px] text-[var(--color-text-muted)]">{formatShortDate(p.nextDeadlineAt)}</td>
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
                  <tr className="border-b border-[var(--color-surface-tertiary)]">
                    <ColHead>Invoice</ColHead>
                    <ColHead>Status</ColHead>
                    <ColHead>Amount</ColHead>
                    <ColHead>Due</ColHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-surface-secondary)]">
                  {invoices.map((inv) => {
                    const is = INV_STATUS[inv.status] ?? INV_STATUS.draft;
                    return (
                      <tr key={inv.id} className="transition-colors hover:bg-[var(--color-background)]">
                        <td className="px-5 py-2.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPaymentDetail('invoice', inv.id)}
                            className="text-[13px] font-medium text-[var(--color-foreground)] hover:text-[var(--color-primary)]"
                          >
                            {inv.number}
                          </Button>
                        </td>
                        <td className="px-5 py-2.5"><Pill bg={is.bg} text={is.text} label={is.label} /></td>
                        <td className="px-5 py-2.5 text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">{formatAmount(inv.amountUsd, { compact: true })}</td>
                        <td className="px-5 py-2.5 text-[12px] text-[var(--color-text-muted)]">{formatShortDate(inv.dueAt)}</td>
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
              <div className="divide-y divide-[var(--color-surface-secondary)]">
                {contracts.map((c) => {
                  const cs = c.status === 'signed'
                    ? { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' }
                    : c.status === 'review'
                    ? { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-primary)]' }
                    : { bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' };
                  return (
                    <Link key={c.id} href={`/contracts?contract=${c.id}`} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-[var(--color-background)]">
                      <div>
                        <p className="text-[13px] font-medium text-[var(--color-foreground)]">{c.title}</p>
                        {c.signedAt && <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Signed {formatShortDate(c.signedAt)}</p>}
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
              <div className="divide-y divide-[var(--color-surface-secondary)]">
                {paymentLinks.map((pl) => {
                  const ps = pl.status === 'paid'
                    ? { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' }
                    : pl.status === 'active'
                    ? { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-primary)]' }
                    : { bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' };
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => openPaymentDetail('payment-link', pl.id)}
                      className="w-full px-5 py-3 text-left transition-colors hover:bg-[var(--color-background)]"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-medium text-[var(--color-foreground)]">{pl.title}</p>
                        <Pill bg={ps.bg} text={ps.text} label={pl.status} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                        {formatAmount(pl.amountUsd, { compact: true })} · {pl.asset} on {pl.chain}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => !isSaving && setEditOpen(v)} size="2xl">
        <DialogContent>
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
                <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">
                  {label}{required && <span className="ml-0.5 text-[var(--color-danger)]">*</span>}
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

      <DeleteDialog
        open={deleteOpen}
        title="Delete client"
        description="This permanently removes the client from your roster."
        itemLabel={client.name}
        isDeleting={isDeleting}
        onConfirm={deleteClient}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteOpen(false);
        }}
      />

      <Dialog open={messageOpen} onOpenChange={(v) => !isSendingMessage && setMessageOpen(v)} size="2xl">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message {client.name}</DialogTitle>
            <DialogDescription>Send a branded Hedwig email through Resend. The client can reply directly to you.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3.5">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">What should Hedwig draft?</label>
              <div className="flex gap-2">
                <Input
                  value={messagePurpose}
                  onChange={(e) => setMessagePurpose(e.target.value)}
                  placeholder="Follow up about the invoice, ask for project feedback..."
                  disabled={isDraftingMessage || isSendingMessage}
                />
                <Button type="button" variant="secondary" onClick={draftMessage} disabled={isDraftingMessage || isSendingMessage}>
                  <Sparkle className="h-3.5 w-3.5" weight="fill" />
                  {isDraftingMessage ? 'Drafting…' : 'Draft'}
                </Button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Subject</label>
              <Input
                value={messageSubject}
                onChange={(e) => setMessageSubject(e.target.value)}
                placeholder="Subject"
                disabled={isSendingMessage}
                maxLength={160}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Message</label>
              <Textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder={`Hi ${client.name.split(' ')[0] || client.name},`}
                disabled={isSendingMessage}
                className="min-h-[180px]"
                maxLength={5000}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary" disabled={isSendingMessage}>Cancel</Button></DialogClose>
            <Button onClick={sendMessage} disabled={isSendingMessage || !messageSubject.trim() || !messageBody.trim()}>
              <PaperPlaneRight className="h-3.5 w-3.5" weight="bold" />
              {isSendingMessage ? 'Sending…' : 'Send email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
