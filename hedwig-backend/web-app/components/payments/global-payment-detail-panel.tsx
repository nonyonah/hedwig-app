'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowSquareOut,
  BellSimple,
  BellSlash,
  CheckCircle,
  CopySimple,
  DownloadSimple,
  Envelope,
  Repeat,
  Trash,
  X,
} from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { ClientPortal } from '@/components/ui/client-portal';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { ContextualSuggestions } from '@/components/assistant/contextual-suggestions';
import { useCurrency } from '@/components/providers/currency-provider';
import { useToast } from '@/components/providers/toast-provider';
import { hedwigApi } from '@/lib/api/client';
import { backendConfig } from '@/lib/auth/config';
import type { Invoice, PaymentLink, RecurringInvoice } from '@/lib/models/entities';
import { formatShortDate } from '@/lib/utils';

type DetailKind = 'invoice' | 'payment-link' | 'recurring';

type OpenPayload = {
  kind: DetailKind;
  id: string;
};

const INV_STATUS: Record<Invoice['status'], { dot: string; label: string; bg: string; text: string }> = {
  draft: { dot: 'bg-[#a4a7ae]', label: 'Draft', bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
  sent: { dot: 'bg-[#2563eb]', label: 'Sent', bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
  viewed: { dot: 'bg-[#2563eb]', label: 'Viewed', bg: 'bg-[#eff4ff]', text: 'text-[#717680]' },
  paid: { dot: 'bg-[#12b76a]', label: 'Paid', bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  overdue: { dot: 'bg-[#f04438]', label: 'Overdue', bg: 'bg-[#fff1f0]', text: 'text-[#b42318]' },
};

const LINK_STATUS: Record<PaymentLink['status'], { dot: string; label: string; bg: string; text: string }> = {
  active: { dot: 'bg-[#12b76a]', label: 'Active', bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  paid: { dot: 'bg-[#2563eb]', label: 'Paid', bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
  expired: { dot: 'bg-[#a4a7ae]', label: 'Expired', bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
};

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

export function GlobalPaymentDetailPanel({ accessToken }: { accessToken?: string | null }) {
  const { toast } = useToast();
  const [openTarget, setOpenTarget] = useState<OpenPayload | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [recurring, setRecurring] = useState<RecurringInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string; kind: 'invoice' | 'payment-link' } | null>(null);
  const [emailTarget, setEmailTarget] = useState<{ id: string; kind: 'invoice' | 'payment-link'; current?: string } | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  const loadData = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const [payments, recurringItems] = await Promise.all([
        hedwigApi.payments({ accessToken, disableMockFallback: true }).catch(() => ({ invoices: [], paymentLinks: [] })),
        hedwigApi.recurringInvoices({ accessToken, disableMockFallback: true }).catch(() => []),
      ]);
      setInvoices(payments.invoices || []);
      setPaymentLinks(payments.paymentLinks || []);
      setRecurring(recurringItems || []);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const handler = (event: Event) => {
      const payload = (event as CustomEvent<OpenPayload>).detail;
      if (!payload?.id || !payload?.kind) return;
      setOpenTarget(payload);
    };
    window.addEventListener('hedwig:open-payment-detail', handler);
    return () => window.removeEventListener('hedwig:open-payment-detail', handler);
  }, []);

  useEffect(() => {
    if (openTarget) void loadData();
  }, [openTarget, loadData]);

  const selectedInvoice = useMemo(
    () => (openTarget?.kind === 'invoice' ? invoices.find((item) => item.id === openTarget.id) ?? null : null),
    [openTarget, invoices]
  );
  const selectedPaymentLink = useMemo(
    () => (openTarget?.kind === 'payment-link' ? paymentLinks.find((item) => item.id === openTarget.id) ?? null : null),
    [openTarget, paymentLinks]
  );
  const selectedRecurring = useMemo(
    () => (openTarget?.kind === 'recurring' ? recurring.find((item) => item.id === openTarget.id) ?? null : null),
    [openTarget, recurring]
  );

  const close = () => {
    setOpenTarget(null);
    setDeleteTarget(null);
    setEmailTarget(null);
  };

  const copyText = async (value: string, title: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ type: 'success', title, message: 'Copied to clipboard.' });
    } catch {
      toast({ type: 'error', title: 'Copy failed', message: 'Please try again.' });
    }
  };

  const markAsPaid = async (doc: Invoice | PaymentLink, kind: 'invoice' | 'payment-link') => {
    if (!accessToken) return;
    setIsActionLoading(true);
    try {
      await hedwigApi.updateDocumentStatus(doc.id, 'PAID', { accessToken, disableMockFallback: true });
      if (kind === 'invoice') {
        setInvoices((cur) => cur.map((item) => (item.id === doc.id ? { ...item, status: 'paid' } : item)));
      } else {
        setPaymentLinks((cur) => cur.map((item) => (item.id === doc.id ? { ...item, status: 'paid' } : item)));
      }
      toast({ type: 'success', title: 'Marked as paid' });
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed', message: e?.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const sendReminder = async (doc: Invoice | PaymentLink) => {
    if (!accessToken) return;
    setIsActionLoading(true);
    try {
      await hedwigApi.remindDocument(doc.id, { accessToken, disableMockFallback: true });
      toast({ type: 'success', title: 'Reminder sent', message: 'The client reminder was sent.' });
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed', message: e?.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const toggleReminders = async (doc: Invoice | PaymentLink, kind: 'invoice' | 'payment-link', enabled: boolean) => {
    if (!accessToken) return;
    setIsActionLoading(true);
    try {
      await hedwigApi.toggleDocumentReminders(doc.id, enabled, { accessToken, disableMockFallback: true });
      if (kind === 'invoice') {
        setInvoices((cur) => cur.map((item) => (item.id === doc.id ? { ...item, remindersEnabled: enabled } : item)));
      } else {
        setPaymentLinks((cur) => cur.map((item) => (item.id === doc.id ? { ...item, remindersEnabled: enabled } : item)));
      }
      toast({ type: 'success', title: enabled ? 'Reminders enabled' : 'Reminders disabled' });
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed', message: e?.message });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !accessToken) return;
    setIsActionLoading(true);
    try {
      await hedwigApi.deleteDocument(deleteTarget.id, { accessToken, disableMockFallback: true });
      if (deleteTarget.kind === 'invoice') {
        setInvoices((cur) => cur.filter((item) => item.id !== deleteTarget.id));
      } else {
        setPaymentLinks((cur) => cur.filter((item) => item.id !== deleteTarget.id));
      }
      toast({ type: 'success', title: `${deleteTarget.kind === 'invoice' ? 'Invoice' : 'Payment link'} deleted`, message: `${deleteTarget.label} was removed.` });
      setDeleteTarget(null);
      setOpenTarget(null);
    } catch (e: any) {
      toast({ type: 'error', title: 'Delete failed', message: e?.message || 'Please try again.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const openEmailDialog = (id: string, kind: 'invoice' | 'payment-link', current?: string) => {
    setEmailInput(current ?? '');
    setEmailTarget({ id, kind, current });
  };

  const saveRecipientEmail = async () => {
    if (!emailTarget || !accessToken) return;
    setIsSavingEmail(true);
    try {
      const email = emailInput.trim().toLowerCase();
      await hedwigApi.updateDocumentRecipientEmail(emailTarget.id, email, { accessToken, disableMockFallback: true });
      if (emailTarget.kind === 'invoice') {
        setInvoices((cur) => cur.map((item) => (item.id === emailTarget.id ? { ...item, clientEmail: email } : item)));
      } else {
        setPaymentLinks((cur) => cur.map((item) => (item.id === emailTarget.id ? { ...item, clientEmail: email } : item)));
      }
      toast({ type: 'success', title: 'Email saved', message: 'Recipient email updated.' });
      setEmailTarget(null);
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed', message: e?.message || 'Please try again.' });
    } finally {
      setIsSavingEmail(false);
    }
  };

  if (!openTarget) return null;

  const publicInvoiceUrl = selectedInvoice ? `${backendConfig.publicPagesUrl}/invoice/${selectedInvoice.id}` : '';
  const publicLinkUrl = selectedPaymentLink ? `${backendConfig.publicPagesUrl}/pay/${selectedPaymentLink.id}` : '';

  return (
    <ClientPortal>
      <div className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={close} />
      <div className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full max-w-[440px] flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-[#e9eaeb] animate-in slide-in-from-right-full duration-300 ease-out">
        {isLoading ? (
          <>
            <PanelHeader label="Payment detail" id="Loading..." onClose={close} />
            <div className="flex-1 px-6 py-5 text-[13px] text-[#a4a7ae]">Loading details...</div>
          </>
        ) : selectedInvoice ? (
          <InvoicePanel
            invoice={selectedInvoice}
            publicUrl={publicInvoiceUrl}
            isLoading={isActionLoading}
            onClose={close}
            onMarkPaid={() => markAsPaid(selectedInvoice, 'invoice')}
            onReminder={() => sendReminder(selectedInvoice)}
            onToggleReminders={(v) => toggleReminders(selectedInvoice, 'invoice', v)}
            onCopyLink={() => copyText(publicInvoiceUrl, 'Invoice link copied')}
            onEmail={() => openEmailDialog(selectedInvoice.id, 'invoice', selectedInvoice.clientEmail)}
            onDelete={() => setDeleteTarget({ id: selectedInvoice.id, label: selectedInvoice.number, kind: 'invoice' })}
          />
        ) : selectedPaymentLink ? (
          <PaymentLinkPanel
            link={selectedPaymentLink}
            publicUrl={publicLinkUrl}
            isLoading={isActionLoading}
            onClose={close}
            onMarkPaid={() => markAsPaid(selectedPaymentLink, 'payment-link')}
            onReminder={() => sendReminder(selectedPaymentLink)}
            onToggleReminders={(v) => toggleReminders(selectedPaymentLink, 'payment-link', v)}
            onCopyLink={() => copyText(publicLinkUrl, 'Payment link copied')}
            onEmail={() => openEmailDialog(selectedPaymentLink.id, 'payment-link', selectedPaymentLink.clientEmail)}
            onDelete={() => setDeleteTarget({ id: selectedPaymentLink.id, label: selectedPaymentLink.title, kind: 'payment-link' })}
          />
        ) : selectedRecurring ? (
          <RecurringPanel item={selectedRecurring} onClose={close} />
        ) : (
          <>
            <PanelHeader label="Payment detail" id={openTarget.id} onClose={close} />
            <div className="flex-1 px-6 py-5 text-[13px] text-[#a4a7ae]">This record could not be found.</div>
          </>
        )}
      </div>

      <DeleteDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.kind === 'invoice' ? 'invoice' : 'payment link'}`}
        description="This permanently removes the record from your billing workspace."
        itemLabel={deleteTarget?.label}
        isDeleting={isActionLoading}
        onConfirm={handleDelete}
        onOpenChange={(open) => {
          if (!open && !isActionLoading) setDeleteTarget(null);
        }}
      />

      {emailTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEmailTarget(null)} />
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.18)] ring-1 ring-[#e9eaeb]">
            <div className="flex items-center justify-between border-b border-[#f2f4f7] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eff4ff]">
                  <Envelope className="h-4 w-4 text-[#717680]" weight="bold" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[#181d27]">
                    {emailTarget.current ? 'Change recipient email' : 'Add recipient email'}
                  </p>
                  <p className="text-[11px] text-[#a4a7ae]">
                    {emailTarget.kind === 'invoice' ? 'Invoice' : 'Payment link'} recipient
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEmailTarget(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#a4a7ae] transition-colors hover:bg-[#f2f4f7]"
              >
                <X className="h-4 w-4" weight="bold" />
              </button>
            </div>
            <div className="px-5 py-4">
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">
                Email address
              </label>
              <input
                type="email"
                autoFocus
                placeholder="client@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveRecipientEmail();
                }}
                className="w-full rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[14px] text-[#181d27] placeholder-[#a4a7ae] focus:border-[#2563eb] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#f2f4f7] px-5 py-4">
              <Button variant="outline" onClick={() => setEmailTarget(null)} disabled={isSavingEmail}>Cancel</Button>
              <Button onClick={saveRecipientEmail} disabled={isSavingEmail || !emailInput.trim()}>
                {isSavingEmail ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ClientPortal>
  );
}

function InvoicePanel({
  invoice,
  publicUrl,
  isLoading,
  onClose,
  onMarkPaid,
  onReminder,
  onToggleReminders,
  onCopyLink,
  onEmail,
  onDelete,
}: {
  invoice: Invoice;
  publicUrl: string;
  isLoading: boolean;
  onClose: () => void;
  onMarkPaid: () => void;
  onReminder: () => void;
  onToggleReminders: (v: boolean) => void;
  onCopyLink: () => void;
  onEmail: () => void;
  onDelete: () => void;
}) {
  const { formatAmount } = useCurrency();
  const s = INV_STATUS[invoice.status];
  return (
    <>
      <PanelHeader label={invoice.title || 'Invoice'} id={invoice.number} onClose={onClose} />
      <PanelHero amount={formatAmount(invoice.amountUsd, { compact: true })} status={<StatusPill {...s} />} />
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 px-6 py-4">
          <ContextualSuggestions
            title="For this invoice"
            description="Only high-confidence invoice suggestions appear here."
            query={{ invoiceId: invoice.id, types: ['invoice_reminder', 'calendar_event'], limit: 2 }}
          />
          <div className="divide-y divide-[#f2f4f7]">
            <PanelRow label="Invoice number" value={invoice.number} />
            <PanelRow label="Due date" value={formatShortDate(invoice.dueAt)} />
            {invoice.viewedAt ? <PanelRow label="First viewed" value={formatShortDate(invoice.viewedAt)} /> : null}
            <PanelRow label="Recipient" value={invoice.clientEmail || 'Not set'} />
            <PanelRow label="Auto-reminders" value={invoice.remindersEnabled === false ? 'Off' : 'On'} />
            <PanelRow label="Public page" value={publicUrl} mono />
          </div>
        </div>
      </div>
      <div className="space-y-2 border-t border-[#e9eaeb] px-6 py-5">
        {invoice.status !== 'paid' && (
          <Button className="w-full" disabled={isLoading} onClick={onMarkPaid}>
            <CheckCircle className="h-4 w-4" weight="bold" /> Mark as paid
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onCopyLink}>
            <CopySimple className="h-4 w-4" /> Copy link
          </Button>
          <Button variant="secondary" asChild>
            <Link href={publicUrl} target="_blank" rel="noreferrer">
              <ArrowSquareOut className="h-4 w-4" /> Open page
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onEmail}>
            <Envelope className="h-4 w-4" /> Email
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`${publicUrl}?print=1`} target="_blank" rel="noreferrer">
              <DownloadSimple className="h-4 w-4" /> PDF
            </Link>
          </Button>
        </div>
        {invoice.status !== 'paid' && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onReminder} disabled={isLoading}>
              <BellSimple className="h-4 w-4" /> Reminder
            </Button>
            <Button variant="secondary" onClick={() => onToggleReminders(invoice.remindersEnabled === false)} disabled={isLoading}>
              {invoice.remindersEnabled === false ? <BellSimple className="h-4 w-4" /> : <BellSlash className="h-4 w-4" />}
              {invoice.remindersEnabled === false ? 'Enable auto' : 'Disable auto'}
            </Button>
          </div>
        )}
        <Button variant="ghost" className="w-full text-[#717680] hover:bg-[#fff1f0] hover:text-[#717680]" onClick={onDelete}>
          <Trash className="h-4 w-4" /> Delete invoice
        </Button>
      </div>
    </>
  );
}

function PaymentLinkPanel({
  link,
  publicUrl,
  isLoading,
  onClose,
  onMarkPaid,
  onReminder,
  onToggleReminders,
  onCopyLink,
  onEmail,
  onDelete,
}: {
  link: PaymentLink;
  publicUrl: string;
  isLoading: boolean;
  onClose: () => void;
  onMarkPaid: () => void;
  onReminder: () => void;
  onToggleReminders: (v: boolean) => void;
  onCopyLink: () => void;
  onEmail: () => void;
  onDelete: () => void;
}) {
  const { formatAmount } = useCurrency();
  const s = LINK_STATUS[link.status];
  return (
    <>
      <PanelHeader label="Payment link" id={link.title} onClose={onClose} />
      <PanelHero amount={formatAmount(link.amountUsd, { compact: true })} status={<StatusPill {...s} />} />
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-[#f2f4f7] px-6 py-2">
          <PanelRow label="Title" value={link.title} />
          <PanelRow label="Asset" value={link.asset} />
          <PanelRow label="Network" value={link.chain} />
          <PanelRow label="Recipient" value={link.clientEmail || 'Not set'} />
          <PanelRow label="Auto-reminders" value={link.remindersEnabled === false ? 'Off' : 'On'} />
          <PanelRow label="Public page" value={publicUrl} mono />
        </div>
      </div>
      <div className="space-y-2 border-t border-[#e9eaeb] px-6 py-5">
        {link.status === 'active' && (
          <Button className="w-full" disabled={isLoading} onClick={onMarkPaid}>
            <CheckCircle className="h-4 w-4" weight="bold" /> Mark as paid
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onCopyLink}>
            <CopySimple className="h-4 w-4" /> Copy link
          </Button>
          <Button variant="secondary" asChild>
            <Link href={publicUrl} target="_blank" rel="noreferrer">
              <ArrowSquareOut className="h-4 w-4" /> Open page
            </Link>
          </Button>
        </div>
        <Button variant="secondary" className="w-full" onClick={onEmail}>
          <Envelope className="h-4 w-4" /> {link.clientEmail ? 'Change recipient email' : 'Add recipient email'}
        </Button>
        {link.status === 'active' && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onReminder} disabled={isLoading}>
              <BellSimple className="h-4 w-4" /> Reminder
            </Button>
            <Button variant="secondary" onClick={() => onToggleReminders(link.remindersEnabled === false)} disabled={isLoading}>
              {link.remindersEnabled === false ? <BellSimple className="h-4 w-4" /> : <BellSlash className="h-4 w-4" />}
              {link.remindersEnabled === false ? 'Enable auto' : 'Disable auto'}
            </Button>
          </div>
        )}
        <Button variant="ghost" className="w-full text-[#717680] hover:bg-[#fff1f0] hover:text-[#717680]" onClick={onDelete}>
          <Trash className="h-4 w-4" /> Delete link
        </Button>
      </div>
    </>
  );
}

function RecurringPanel({ item, onClose }: { item: RecurringInvoice; onClose: () => void }) {
  const { formatAmount } = useCurrency();
  return (
    <>
      <PanelHeader label="Recurring template" id={item.title || 'Recurring invoice'} onClose={onClose} />
      <div className="border-b border-[#e9eaeb] bg-[#f8f9fc] px-6 py-5">
        <p className="mb-1 text-[11px] font-medium text-[#a4a7ae]">Amount per cycle</p>
        <p className="mb-3 text-[32px] font-bold leading-none tracking-[-0.03em] text-[#181d27]">
          {formatAmount(item.amountUsd, { compact: true })}
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fdf4ff] px-2.5 py-1 text-[11px] font-semibold text-[#717680]">
          <Repeat className="h-3 w-3" /> {FREQ_LABELS[item.frequency] || item.frequency}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-[#f2f4f7] px-6 py-2">
          <PanelRow label="Status" value={item.status.charAt(0).toUpperCase() + item.status.slice(1)} />
          <PanelRow label="Frequency" value={FREQ_LABELS[item.frequency] || item.frequency} />
          <PanelRow label="Next due date" value={item.status === 'cancelled' ? 'Cancelled' : formatShortDate(item.nextDueDate)} />
          <PanelRow label="Client" value={item.clientName || item.clientEmail || 'No client assigned'} />
          <PanelRow label="Invoices generated" value={`${item.generatedCount}`} />
          <PanelRow label="Auto-send" value={item.autoSend ? 'Enabled' : 'Disabled'} />
        </div>
      </div>
      <div className="border-t border-[#e9eaeb] px-6 py-5">
        <Button variant="secondary" className="w-full" asChild>
          <Link href={`/payments?recurring=${item.id}`}>
            <ArrowSquareOut className="h-4 w-4" /> Open in Payments
          </Link>
        </Button>
      </div>
    </>
  );
}

function StatusPill({ dot, label, bg, text }: { dot: string; label: string; bg: string; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${bg} ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function PanelHeader({ label, id, onClose }: { label: string; id: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-[#e9eaeb] px-6 py-4">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">{label}</p>
        <p className="mt-0.5 max-w-[320px] truncate text-[16px] font-bold leading-tight text-[#181d27]">{id}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#717680] transition-colors hover:bg-[#f2f4f7] hover:text-[#344054]"
      >
        <X className="h-4 w-4" weight="bold" />
      </button>
    </div>
  );
}

function PanelHero({ amount, status }: { amount: string; status: React.ReactNode }) {
  return (
    <div className="border-b border-[#e9eaeb] bg-[#f8f9fc] px-6 py-5">
      <p className="mb-1 text-[11px] font-medium text-[#a4a7ae]">Amount</p>
      <p className="mb-3 text-[32px] font-bold leading-none tracking-[-0.03em] text-[#181d27]">{amount}</p>
      {status}
    </div>
  );
}

function PanelRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="py-3.5">
      <p className="mb-0.5 text-[11px] font-medium text-[#a4a7ae]">{label}</p>
      <p className={`text-[13px] font-semibold text-[#344054] ${mono ? 'break-all font-mono text-[11px]' : ''}`}>{value}</p>
    </div>
  );
}
