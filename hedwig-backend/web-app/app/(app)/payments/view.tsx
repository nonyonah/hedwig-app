'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import {
  ArrowSquareOut,
  BellSimple,
  BellSlash,
  CheckCircle,
  CopySimple,
  CurrencyDollar,
  DownloadSimple,
  Envelope,
  FileText,
  LinkSimple,
  Repeat,
  Trash,
  UploadSimple,
  X,
  Info
} from '@/components/ui/lucide-icons';
import type { Invoice, PaymentLink, RecurringInvoice, Client } from '@/lib/models/entities';
import type { BillingStatusSummary } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { RecurringInvoicesSection } from '@/components/payments/recurring-invoices-section';
import { hedwigApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { ClientPortal } from '@/components/ui/client-portal';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import type { RowActionItem } from '@/components/data/row-actions-menu';
import { useToast } from '@/components/providers/toast-provider';
import { useCurrency } from '@/components/providers/currency-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { formatShortDate } from '@/lib/utils';
import { backendConfig } from '@/lib/auth/config';
import { canUseFeature } from '@/lib/billing/feature-gates';
import { ProLockCard } from '@/components/billing/pro-lock-card';
import { ContextualSuggestions } from '@/components/assistant/contextual-suggestions';
import { openPaymentDetail } from '@/lib/payments/open-detail';

/* ─── status helpers ─── */
const INV_STATUS: Record<Invoice['status'], { dot: string; label: string; bg: string; text: string }> = {
  draft:   { dot: 'bg-[var(--color-text-muted)]', label: 'Draft',   bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
  sent:    { dot: 'bg-[var(--color-accent)]', label: 'Sent',    bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  viewed:  { dot: 'bg-[var(--color-accent)]', label: 'Viewed',  bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-text-tertiary)]' },
  paid:    { dot: 'bg-[var(--color-success)]', label: 'Paid',    bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  overdue: { dot: 'bg-[var(--color-danger)]', label: 'Overdue', bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' },
};

const RECURRING_TEMPLATE_PREFIX = 'rtpl_';

const LINK_STATUS: Record<PaymentLink['status'], { dot: string; label: string; bg: string; text: string }> = {
  active:  { dot: 'bg-[var(--color-success)]', label: 'Active',  bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  paid:    { dot: 'bg-[var(--color-accent)]', label: 'Paid',    bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  expired: { dot: 'bg-[var(--color-text-muted)]', label: 'Expired', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
};

function StatusPill({ dot, label, bg, text }: { dot: string; label: string; bg: string; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${bg} ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

const ALL_CHAINS = [
  { src: '/icons/networks/base.png',     alt: 'Base' },
  { src: '/icons/networks/arbitrum.png', alt: 'Arbitrum' },
  { src: '/icons/networks/polygon.png',  alt: 'Polygon' },
  { src: '/icons/networks/optimism.png', alt: 'Optimism' },
  // Celo temporarily disabled.
  { src: '/icons/networks/solana.png',   alt: 'Solana' },
];

function MultiChainStack({ size = 16 }: { size?: number }) {
  return (
    <div className="flex items-center pl-0.5">
      {ALL_CHAINS.map((chain, i) => (
        <Image
          key={chain.alt}
          src={chain.src}
          alt={chain.alt}
          width={size}
          height={size}
          className={`rounded-full ring-1 ring-white${i > 0 ? ' -ml-1' : ''}`}
        />
      ))}
    </div>
  );
}

function MultiChainInline({ muted = false }: { muted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <MultiChainStack size={14} />
      <span className={muted ? 'text-[var(--color-text-tertiary)]' : 'text-[var(--color-text-secondary)]'}>5 networks</span>
    </span>
  );
}

/* ─── component ─── */
export function PaymentsClient({
  accessToken,
  invoices,
  paymentLinks,
  highlightedInvoiceId,
  highlightedPaymentLinkId,
  highlightedRecurringId,
  createAction,
  recurringInvoices = [],
  clients = [],
  billing,
}: {
  accessToken: string | null;
  invoices: Invoice[];
  paymentLinks: PaymentLink[];
  highlightedInvoiceId?: string | null;
  highlightedPaymentLinkId?: string | null;
  highlightedRecurringId?: string | null;
  createAction?: 'invoice' | 'payment-link';
  recurringInvoices?: RecurringInvoice[];
  clients?: Client[];
  billing: BillingStatusSummary | null;
}) {
  const posthog = usePostHog();
  const { formatAmount } = useCurrency();
  const { toast } = useToast();

  useAssistantPageContext('Payments', {
    invoicesCount: invoices.length,
    paymentLinksCount: paymentLinks.length,
    recurringCount: recurringInvoices.length,
  });

  useEffect(() => {
    if (!createAction) return;
    const timer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('hedwig:open-create-menu', {
        detail: { flow: createAction },
      }));
      const url = new URL(window.location.href);
      url.searchParams.delete('create');
      window.history.replaceState({}, '', url.toString());
    }, 100);
    return () => clearTimeout(timer);
  }, [createAction]);

  const canUseRecurringAutomation = canUseFeature('recurring_invoice_automation', billing);

  const [invoiceItems, setInvoiceItems] = useState(invoices);
  const [paymentLinkItems, setPaymentLinkItems] = useState(paymentLinks);

  // Map active/paused recurring templates into invoice rows (prefixed IDs so we know they're templates)
  const recurringTemplateRows = useMemo((): Invoice[] =>
    recurringInvoices
      .filter((r) => r.status === 'active' || r.status === 'paused')
      .map((r) => ({
        id: `${RECURRING_TEMPLATE_PREFIX}${r.id}`,
        clientId: r.clientId ?? '',
        title: r.title,
        status: 'draft' as const,
        amountUsd: r.amountUsd,
        dueAt: r.nextDueDate,
        number: `REC-${r.id.slice(-6).toUpperCase()}`,
        remindersEnabled: false,
        recurringInvoiceId: r.id,
        clientEmail: r.clientEmail,
      })),
    [recurringInvoices]
  );

  const allInvoiceItems = useMemo(() => {
    const templateIds = new Set(recurringTemplateRows.map((r) => r.recurringInvoiceId));
    // Only show template rows for recurring invoices that haven't generated a real document yet
    const existingRecurringIds = new Set(invoiceItems.filter((i) => i.recurringInvoiceId).map((i) => i.recurringInvoiceId));
    const unseenTemplates = recurringTemplateRows.filter((r) => !existingRecurringIds.has(r.recurringInvoiceId));
    return [...invoiceItems, ...unseenTemplates];
  }, [invoiceItems, recurringTemplateRows]);
  const [activeTab, setActiveTab] = useState<'invoices' | 'payment-links' | 'recurring'>('invoices');
  const [selectedRecurring, setSelectedRecurring] = useState<RecurringInvoice | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [linkFilter, setLinkFilter] = useState('all');
  const [recurringFilter, setRecurringFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedPaymentLink, setSelectedPaymentLink] = useState<PaymentLink | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string; kind: 'invoice' | 'payment-link' } | null>(null);
  const [emailTarget, setEmailTarget] = useState<{ id: string; kind: 'invoice' | 'payment-link'; current?: string } | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [markPaidTarget, setMarkPaidTarget] = useState<{ doc: Invoice | PaymentLink; kind: 'invoice' | 'payment-link' } | null>(null);
  const [markPaidVia, setMarkPaidVia] = useState<'crypto' | 'bank_transfer' | 'cash' | 'other'>('bank_transfer');
  const [markPaidReference, setMarkPaidReference] = useState('');

  const highlightedInvoice = useMemo(
    () => invoiceItems.find((inv) => inv.id === highlightedInvoiceId) ?? null,
    [highlightedInvoiceId, invoiceItems]
  );

  useEffect(() => {
    if (highlightedInvoiceId) {
      const invoice = invoiceItems.find((inv) => inv.id === highlightedInvoiceId) ?? null;
      if (invoice) {
        setActiveTab('invoices');
        setSelectedRecurring(null);
        setSelectedPaymentLink(null);
        setSelectedInvoice(null);
        openPaymentDetail('invoice', invoice.id);
      }
      return;
    }

    if (highlightedPaymentLinkId) {
      const paymentLink = paymentLinkItems.find((link) => link.id === highlightedPaymentLinkId) ?? null;
      if (paymentLink) {
        setActiveTab('payment-links');
        setSelectedRecurring(null);
        setSelectedInvoice(null);
        setSelectedPaymentLink(null);
        openPaymentDetail('payment-link', paymentLink.id);
      }
      return;
    }

    if (highlightedRecurringId) {
      const recurring = recurringInvoices.find((item) => item.id === highlightedRecurringId) ?? null;
      if (recurring) {
        setActiveTab('recurring');
        setSelectedInvoice(null);
        setSelectedPaymentLink(null);
        setSelectedRecurring(null);
        openPaymentDetail('recurring', recurring.id);
      }
    }
  }, [highlightedInvoiceId, highlightedPaymentLinkId, highlightedRecurringId, invoiceItems, paymentLinkItems, recurringInvoices]);

  const stats = useMemo(() => {
    const paid = allInvoiceItems.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amountUsd, 0);
    const outstanding = allInvoiceItems.filter((i) => i.status !== 'paid' && !i.id.startsWith(RECURRING_TEMPLATE_PREFIX)).reduce((s, i) => s + i.amountUsd, 0);
    const activeLinks = paymentLinkItems.filter((l) => l.status === 'active').length;
    return { paid, outstanding, activeLinks };
  }, [allInvoiceItems, paymentLinkItems]);

  const filteredInvoices = useMemo(() => {
    if (invoiceFilter === 'all') return allInvoiceItems;
    return allInvoiceItems.filter((i) => i.status === invoiceFilter);
  }, [allInvoiceItems, invoiceFilter]);
  const filteredLinks = useMemo(
    () => (linkFilter === 'all' ? paymentLinkItems : paymentLinkItems.filter((l) => l.status === linkFilter)),
    [paymentLinkItems, linkFilter]
  );

  const publicInvoiceUrl = selectedInvoice ? `${backendConfig.publicPagesUrl}/invoice/${selectedInvoice.id}` : '';
  const publicLinkUrl = selectedPaymentLink ? `${backendConfig.publicPagesUrl}/pay/${selectedPaymentLink.id}` : '';
  const capturePaymentEvent = (event: string, properties: Record<string, unknown> = {}) => {
    posthog?.capture(event, {
      source: 'web_payments',
      ...properties,
    });
  };

  /* ── handlers ── */
  const handleDelete = async () => {
    if (!deleteTarget || !accessToken) return;
    setIsDeleting(true);
    try {
      await hedwigApi.deleteDocument(deleteTarget.id, { accessToken, disableMockFallback: true });
      if (deleteTarget.kind === 'invoice') {
        setInvoiceItems((cur) => cur.filter((i) => i.id !== deleteTarget.id));
        if (selectedInvoice?.id === deleteTarget.id) setSelectedInvoice(null);
        capturePaymentEvent('invoice_deleted', {
          invoice_id: deleteTarget.id,
        });
      } else {
        setPaymentLinkItems((cur) => cur.filter((l) => l.id !== deleteTarget.id));
        if (selectedPaymentLink?.id === deleteTarget.id) setSelectedPaymentLink(null);
        capturePaymentEvent('payment_link_deleted', {
          payment_link_id: deleteTarget.id,
        });
      }
      toast({ type: 'success', title: `${deleteTarget.kind === 'invoice' ? 'Invoice' : 'Payment link'} deleted`, message: `${deleteTarget.label} was removed.` });
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ type: 'error', title: 'Delete failed', message: e?.message || 'Please try again.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const copyText = async (value: string, title: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ type: 'success', title, message: 'Copied to clipboard.' });
    } catch {
      toast({ type: 'error', title: 'Copy failed', message: 'Please try again.' });
    }
  };

  const markAsPaid = (doc: Invoice | PaymentLink, kind: 'invoice' | 'payment-link') => {
    capturePaymentEvent(kind === 'payment-link' ? 'payment_link_mark_paid_started' : 'invoice_mark_paid_started', {
      [kind === 'payment-link' ? 'payment_link_id' : 'invoice_id']: doc.id,
      amount: doc.amountUsd,
      status: doc.status,
    });
    setMarkPaidTarget({ doc, kind });
    setMarkPaidVia('bank_transfer');
    setMarkPaidReference('');
  };

  const confirmMarkAsPaid = async () => {
    if (!markPaidTarget || !accessToken) return;
    const { doc, kind } = markPaidTarget;
    setIsActionLoading(true);
    try {
      await hedwigApi.updateDocumentStatus(doc.id, 'PAID', {
        accessToken,
        disableMockFallback: true,
        paidVia: markPaidVia,
        reference: markPaidReference.trim() || null,
      });
      if (kind === 'invoice') {
        setInvoiceItems((cur) => cur.map((i) => (i.id === doc.id ? { ...i, status: 'paid' } : i)));
        if (selectedInvoice?.id === doc.id) setSelectedInvoice((c) => (c ? { ...c, status: 'paid' } : c));
        capturePaymentEvent('invoice_paid', {
          invoice_id: doc.id,
          amount: doc.amountUsd,
          currency: 'USD',
          manual_mark_paid: true,
          paid_via: markPaidVia,
        });
      } else {
        setPaymentLinkItems((cur) => cur.map((l) => (l.id === doc.id ? { ...l, status: 'paid' } : l)));
        if (selectedPaymentLink?.id === doc.id) setSelectedPaymentLink((c) => (c ? { ...c, status: 'paid' } : c));
        capturePaymentEvent('payment_link_paid', {
          payment_link_id: doc.id,
          amount: doc.amountUsd,
          currency: 'USDC',
          manual_mark_paid: true,
          paid_via: markPaidVia,
        });
      }
      toast({ type: 'success', title: 'Marked as paid' });
      setMarkPaidTarget(null);
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
      if ('asset' in doc) {
        capturePaymentEvent('payment_link_reminder_sent', {
          payment_link_id: doc.id,
          status: doc.status,
          has_recipient_email: Boolean(doc.clientEmail),
        });
      } else {
        capturePaymentEvent('invoice_reminder_sent', {
          invoice_id: doc.id,
          status: doc.status,
          has_recipient_email: Boolean(doc.clientEmail),
        });
      }
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
        setInvoiceItems((cur) => cur.map((i) => (i.id === doc.id ? { ...i, remindersEnabled: enabled } : i)));
        if (selectedInvoice?.id === doc.id) setSelectedInvoice((c) => (c ? { ...c, remindersEnabled: enabled } : c));
        capturePaymentEvent('invoice_reminders_toggled', {
          invoice_id: doc.id,
          enabled,
        });
      } else {
        setPaymentLinkItems((cur) => cur.map((l) => (l.id === doc.id ? { ...l, remindersEnabled: enabled } : l)));
        if (selectedPaymentLink?.id === doc.id) setSelectedPaymentLink((c) => (c ? { ...c, remindersEnabled: enabled } : c));
        capturePaymentEvent('payment_link_reminders_toggled', {
          payment_link_id: doc.id,
          enabled,
        });
      }
      toast({ type: 'success', title: enabled ? 'Reminders enabled' : 'Reminders disabled' });
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed', message: e?.message });
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
      await hedwigApi.updateDocumentRecipientEmail(emailTarget.id, emailInput, { accessToken, disableMockFallback: true });
      if (emailTarget.kind === 'invoice') {
        setInvoiceItems((cur) => cur.map((i) => i.id === emailTarget.id ? { ...i, clientEmail: emailInput.trim().toLowerCase() } : i));
        if (selectedInvoice?.id === emailTarget.id) setSelectedInvoice((c) => c ? { ...c, clientEmail: emailInput.trim().toLowerCase() } : c);
        capturePaymentEvent('invoice_recipient_email_saved', {
          invoice_id: emailTarget.id,
          had_previous_email: Boolean(emailTarget.current),
        });
      } else {
        setPaymentLinkItems((cur) => cur.map((l) => l.id === emailTarget.id ? { ...l, clientEmail: emailInput.trim().toLowerCase() } : l));
        if (selectedPaymentLink?.id === emailTarget.id) setSelectedPaymentLink((c) => c ? { ...c, clientEmail: emailInput.trim().toLowerCase() } : c);
        capturePaymentEvent('payment_link_recipient_email_saved', {
          payment_link_id: emailTarget.id,
          had_previous_email: Boolean(emailTarget.current),
        });
      }
      toast({ type: 'success', title: 'Email saved', message: 'Recipient email updated.' });
      setEmailTarget(null);
    } catch (e: any) {
      toast({ type: 'error', title: 'Failed', message: e?.message || 'Please try again.' });
    } finally {
      setIsSavingEmail(false);
    }
  };

  const invoiceActions = (inv: Invoice): RowActionItem[] => {
    const items: RowActionItem[] = [
      {
        label: 'Copy link',
        onClick: () => {
          capturePaymentEvent('invoice_shared', {
            invoice_id: inv.id,
            status: inv.status,
            method: 'copy',
          });
          copyText(`${backendConfig.publicPagesUrl}/invoice/${inv.id}`, 'Invoice link copied');
        },
      },
      { label: inv.clientEmail ? 'Change recipient email' : 'Add recipient email', onClick: () => openEmailDialog(inv.id, 'invoice', inv.clientEmail) },
    ];
    if (inv.status !== 'paid') {
      items.push(
        { label: 'Mark as paid', onClick: () => markAsPaid(inv, 'invoice') },
        { label: 'Send reminder', onClick: () => sendReminder(inv) },
        { label: inv.remindersEnabled === false ? 'Enable auto-reminders' : 'Disable auto-reminders', onClick: () => toggleReminders(inv, 'invoice', inv.remindersEnabled === false) }
      );
    }
    items.push({ label: 'Delete', onClick: () => setDeleteTarget({ id: inv.id, label: inv.number, kind: 'invoice' }), destructive: true });
    return items;
  };

  const linkActions = (link: PaymentLink): RowActionItem[] => {
    const items: RowActionItem[] = [
      {
        label: 'Copy link',
        onClick: () => {
          capturePaymentEvent('payment_link_shared', {
            payment_link_id: link.id,
            status: link.status,
            method: 'copy',
          });
          copyText(`${backendConfig.publicPagesUrl}/pay/${link.id}`, 'Payment link copied');
        },
      },
      { label: link.clientEmail ? 'Change recipient email' : 'Add recipient email', onClick: () => openEmailDialog(link.id, 'payment-link', link.clientEmail) },
    ];
    if (link.status !== 'paid') {
      items.push(
        { label: 'Mark as paid', onClick: () => markAsPaid(link, 'payment-link') },
        { label: 'Send reminder', onClick: () => sendReminder(link) },
        { label: link.remindersEnabled === false ? 'Enable auto-reminders' : 'Disable auto-reminders', onClick: () => toggleReminders(link, 'payment-link', link.remindersEnabled === false) }
      );
    }
    items.push({ label: 'Delete', onClick: () => setDeleteTarget({ id: link.id, label: link.title, kind: 'payment-link' }), destructive: true });
    return items;
  };

  const hasPanel = !!selectedInvoice || !!selectedPaymentLink;

  /* ─── render ─── */
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Payments</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">Invoice clients and collect payments in one workflow.</p>
        </div>
      </div>
      <AttachedStatGrid
        items={[
          {
            id: 'outstanding',
            title: 'Outstanding',
            value: formatAmount(stats.outstanding, { compact: true }),
            helper: 'Awaiting payment',
            icon: CurrencyDollar,
          },
          {
            id: 'collected',
            title: 'Collected',
            value: formatAmount(stats.paid, { compact: true }),
            helper: 'From paid invoices',
            icon: CheckCircle,
          },
          {
            id: 'active-links',
            title: 'Active links',
            value: String(stats.activeLinks),
            helper: 'Ready to share',
            icon: LinkSimple,
          },
        ]}
        className="grid-cols-1 md:grid-cols-3"
      />

      <div className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-[var(--color-text-secondary)] shadow-xs">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" weight="bold" />
        <p className="text-[13px] text-[var(--color-text-tertiary)]">
          Need to move funds out? You can access and manage your available balance from the Hedwig mobile app.
        </p>
      </div>

      {/* Highlighted invoice banner */}
      {highlightedInvoice && (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-3 text-[var(--color-text-secondary)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" weight="bold" />
          <p className="text-[13px]">
            Opened from calendar — invoice{' '}
            <span className="font-semibold text-[var(--color-text-primary)]">{highlightedInvoice.number}</span> is due on{' '}
            <span className="font-semibold text-[var(--color-text-primary)]">{formatShortDate(highlightedInvoice.dueAt)}</span>.
          </p>
        </div>
      )}

      <ContextualSuggestions
        title="Payments to review"
        description="Hedwig surfaces invoice follow-up suggestions here only when action is clear."
        query={{ types: ['invoice_reminder'], limit: 2 }}
      />

      {/* Main card */}
      <div className="overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] shadow-xs">
        {/* Unified header */}
        <div className="flex items-center gap-3 border-b border-[var(--color-surface-tertiary)] px-5 py-3">
          <span className="text-[12px] font-medium text-[var(--color-text-tertiary)]">{allInvoiceItems.length + paymentLinkItems.length} records</span>
          {(stats.outstanding > 0 || stats.paid > 0) && (
            <>
              <span className="h-3 w-px shrink-0 bg-[var(--color-surface-tertiary)]" />
              <span className="truncate text-[12px] text-[var(--color-text-muted)]">
                {formatAmount(stats.outstanding, { compact: true })} outstanding · {formatAmount(stats.paid, { compact: true })} collected
                {stats.activeLinks > 0 ? ` · ${stats.activeLinks} active link${stats.activeLinks > 1 ? 's' : ''}` : ''}
              </span>
            </>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex items-end gap-1 border-b border-[var(--color-border-light)] px-5">
          <TabBtn
            active={activeTab === 'invoices'}
            onClick={() => {
              setActiveTab('invoices');
              capturePaymentEvent('invoices_tab_opened', {
                total_count: allInvoiceItems.length,
              });
            }}
          >
            Invoices
            <CountBadge n={allInvoiceItems.length} />
          </TabBtn>
          <TabBtn
            active={activeTab === 'payment-links'}
            onClick={() => {
              setActiveTab('payment-links');
              capturePaymentEvent('payment_links_tab_opened', {
                active_count: stats.activeLinks,
                total_count: paymentLinkItems.length,
              });
            }}
          >
            Payment links
            <CountBadge n={paymentLinkItems.length} />
          </TabBtn>
          <TabBtn active={activeTab === 'recurring'} onClick={() => setActiveTab('recurring')}>
            <Repeat className="h-3.5 w-3.5" />
            Recurring
            <CountBadge n={canUseRecurringAutomation ? recurringInvoices.length : 0} />
            {!canUseRecurringAutomation ? (
              <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-tertiary)]">
                Pro
              </span>
            ) : null}
          </TabBtn>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1 border-b border-[var(--color-surface-tertiary)] px-5 py-2">
          {activeTab === 'invoices'
            ? (['all', 'draft', 'sent', 'viewed', 'paid', 'overdue'] as const).map((s) => (
                <FilterChip
                  key={s}
                  active={invoiceFilter === s}
                  onClick={() => {
                    setInvoiceFilter(s);
                    capturePaymentEvent('invoice_filtered', {
                      filter: s,
                      result_count: s === 'all' ? allInvoiceItems.length : allInvoiceItems.filter((i) => i.status === s).length,
                    });
                  }}
                >
                  {s === 'all' ? 'All' : INV_STATUS[s as keyof typeof INV_STATUS]?.label ?? s}
                </FilterChip>
              ))
            : activeTab === 'payment-links'
            ? (['all', 'active', 'paid', 'expired'] as const).map((s) => (
                <FilterChip
                  key={s}
                  active={linkFilter === s}
                  onClick={() => {
                    setLinkFilter(s);
                    capturePaymentEvent('payment_link_filtered', {
                      filter: s,
                      result_count: s === 'all' ? paymentLinkItems.length : paymentLinkItems.filter((l) => l.status === s).length,
                    });
                  }}
                >
                  {s === 'all' ? 'All' : LINK_STATUS[s]?.label ?? s}
                </FilterChip>
              ))
            : (['all', 'active', 'paused'] as const).map((s) => (
                <FilterChip key={s} active={recurringFilter === s} onClick={() => setRecurringFilter(s)}>
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </FilterChip>
              ))}
        </div>

        {/* Table header — hidden on recurring tab (it has its own headers) */}
        {activeTab !== 'recurring' && (
          <div className="grid grid-cols-[1fr_120px_110px_100px_44px] gap-3 border-b border-[var(--color-surface-tertiary)] px-5 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              {activeTab === 'invoices' ? 'Invoice' : 'Title'}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Status</span>
            <span className="text-right text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Amount</span>
            <span className="text-right text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              {activeTab === 'invoices' ? 'Due' : 'Chain'}
            </span>
            <span />
          </div>
        )}

        {/* Recurring tab content */}
        {activeTab === 'recurring' && (
          canUseRecurringAutomation ? (
            <RecurringInvoicesSection
              initialItems={recurringInvoices}
              clients={clients}
              accessToken={accessToken}
              asTabContent
              statusFilter={recurringFilter}
              onRowClick={(r) => openPaymentDetail('recurring', r.id)}
            />
          ) : (
            <div className="p-5">
              <ProLockCard
                title="Recurring automation is on Pro"
                description="Automatically schedule invoices and keep client billing on track."
                href="/pricing"
                compact
              />
            </div>
          )
        )}

        {/* Rows — invoices/payment-links tabs only */}
        {activeTab === 'invoices' ? (
          filteredInvoices.length === 0 ? (
            <EmptyState icon={<FileText className="h-8 w-8 text-[var(--color-border-input)]" weight="duotone" />} text="No invoices match this filter." />
          ) : (
            <div className="divide-y divide-[var(--color-surface-secondary)]">
              {filteredInvoices.map((inv) => {
                const s = INV_STATUS[inv.status];
                return (
                  <div
                    key={inv.id}
                    onClick={() => {
                      if (inv.id.startsWith(RECURRING_TEMPLATE_PREFIX)) {
                        const r = recurringInvoices.find((ri) => ri.id === inv.recurringInvoiceId);
                        if (r) {
                          setSelectedRecurring(null);
                          setSelectedInvoice(null);
                          setSelectedPaymentLink(null);
                          openPaymentDetail('recurring', r.id);
                        }
                        return;
                      }
                      setSelectedRecurring(null);
                      setSelectedPaymentLink(null);
                      setSelectedInvoice(null);
                      capturePaymentEvent('invoice_viewed', {
                        invoice_id: inv.id,
                        status: inv.status,
                        surface: 'invoices_table',
                      });
                      openPaymentDetail('invoice', inv.id);
                    }}
                    className={`group grid cursor-pointer grid-cols-[1fr_120px_110px_100px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--color-background)] ${selectedInvoice?.id === inv.id ? 'bg-[var(--color-accent-soft)]' : ''}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                          {inv.title || inv.number}
                        </p>
                        {inv.recurringInvoiceId && (
                          <span className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-tertiary)]">Recurring</span>
                        )}
                        {inv.source && (
                          <span className="shrink-0 rounded-full bg-[var(--color-success-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">Imported</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                        <span>{inv.number} · Due {formatShortDate(inv.dueAt)}</span>
                        <span className="text-[var(--color-border-input)]">•</span>
                        <MultiChainStack size={12} />
                      </div>
                    </div>
                    <StatusPill {...s} />
                    <p className="text-right text-[13px] font-semibold tabular-nums text-[var(--color-text-primary)]">
                      {formatAmount(inv.amountUsd, { compact: true })}
                    </p>
                    <p className="text-right text-[12px] text-[var(--color-text-tertiary)]">{formatShortDate(inv.dueAt)}</p>
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu items={invoiceActions(inv)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : activeTab === 'payment-links' && filteredLinks.length === 0 ? (
          <EmptyState icon={<LinkSimple className="h-8 w-8 text-[var(--color-border-input)]" weight="duotone" />} text="No payment links match this filter." />
        ) : activeTab === 'payment-links' ? (
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {filteredLinks.map((link) => {
              const s = LINK_STATUS[link.status];
              return (
                <div
                  key={link.id}
                  onClick={() => {
                    setSelectedInvoice(null);
                    setSelectedPaymentLink(null);
                    capturePaymentEvent('payment_link_opened', {
                      payment_link_id: link.id,
                      status: link.status,
                      surface: 'payment_links_table',
                    });
                    openPaymentDetail('payment-link', link.id);
                  }}
                  className={`group grid cursor-pointer grid-cols-[1fr_120px_110px_100px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--color-background)] ${selectedPaymentLink?.id === link.id ? 'bg-[var(--color-accent-soft)]' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{link.title}</p>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                      <span>{link.asset}</span>
                      <span className="text-[var(--color-border-input)]">•</span>
                      <MultiChainStack size={12} />
                    </div>
                  </div>
                  <StatusPill {...s} />
                  <p className="text-right text-[13px] font-semibold tabular-nums text-[var(--color-text-primary)]">
                    {formatAmount(link.amountUsd, { compact: true })}
                  </p>
                  <div className="flex justify-end">
                    <MultiChainStack size={16} />
                  </div>
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu items={linkActions(link)} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Detail side panel */}
      {(hasPanel || !!selectedRecurring) && (
        <ClientPortal>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm animate-in fade-in-0 duration-200"
            onClick={() => { setSelectedInvoice(null); setSelectedPaymentLink(null); setSelectedRecurring(null); }}
          />

          {/* Panel */}
          <div className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-[440px] flex-col overflow-hidden bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)] animate-in slide-in-from-right-full duration-300 ease-out">
            {selectedRecurring ? (
              <RecurringPanel
                item={selectedRecurring}
                onClose={() => setSelectedRecurring(null)}
              />
            ) : selectedInvoice ? (
              <InvoicePanel
                invoice={selectedInvoice}
                publicUrl={publicInvoiceUrl}
                isLoading={isActionLoading}
                accessToken={accessToken}
                onClose={() => setSelectedInvoice(null)}
                onMarkPaid={() => markAsPaid(selectedInvoice, 'invoice')}
                onReminder={() => sendReminder(selectedInvoice)}
                onToggleReminders={(v) => toggleReminders(selectedInvoice, 'invoice', v)}
                onCopyLink={() => copyText(publicInvoiceUrl, 'Invoice link copied')}
                onDelete={() => setDeleteTarget({ id: selectedInvoice.id, label: selectedInvoice.number, kind: 'invoice' })}
              />
            ) : selectedPaymentLink ? (
              <PaymentLinkPanel
                link={selectedPaymentLink}
                publicUrl={publicLinkUrl}
                isLoading={isActionLoading}
                accessToken={accessToken}
                onClose={() => setSelectedPaymentLink(null)}
                onMarkPaid={() => markAsPaid(selectedPaymentLink, 'payment-link')}
                onReminder={() => sendReminder(selectedPaymentLink)}
                onToggleReminders={(v) => toggleReminders(selectedPaymentLink, 'payment-link', v)}
                onCopyLink={() => copyText(publicLinkUrl, 'Payment link copied')}
                onDelete={() => setDeleteTarget({ id: selectedPaymentLink.id, label: selectedPaymentLink.title, kind: 'payment-link' })}
              />
            ) : null}
          </div>
        </ClientPortal>
      )}

      <DeleteDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.kind === 'invoice' ? 'invoice' : 'payment link'}`}
        description="This permanently removes the record from your billing workspace."
        itemLabel={deleteTarget?.label}
        isDeleting={isDeleting || isActionLoading}
        onConfirm={handleDelete}
        onOpenChange={(open) => { if (!open && !isDeleting && !isActionLoading) setDeleteTarget(null); }}
      />

      {/* Mark-as-paid dialog */}
      <Dialog open={!!markPaidTarget} onOpenChange={(v) => !isActionLoading && (v || setMarkPaidTarget(null))} size="md">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as paid</DialogTitle>
            <DialogDescription>
              Tell us how this {markPaidTarget?.kind === 'invoice' ? 'invoice' : 'payment link'} was paid.
              The reference appears on your revenue activity feed.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <p className="mb-2 text-[12px] font-semibold text-[var(--color-text-secondary)]">Payment method</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { code: 'bank_transfer', label: 'Bank transfer' },
                  { code: 'crypto',        label: 'Crypto' },
                  { code: 'cash',          label: 'Cash' },
                  { code: 'other',         label: 'Other' },
                ] as const).map((opt) => (
                  <Button
                    key={opt.code}
                    variant="outline"
                    size="sm"
                    onClick={() => setMarkPaidVia(opt.code)}
                    className={`rounded-xl px-3 py-2 text-left text-[12px] ${
                      markPaidVia === opt.code
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-semibold'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-input)]'
                    }`}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]">
                Reference (optional)
              </label>
              <Input
                placeholder="Bank reference, txn id, or note"
                value={markPaidReference}
                onChange={(e) => setMarkPaidReference(e.target.value.slice(0, 200))}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" disabled={isActionLoading}>Cancel</Button>
            </DialogClose>
            <Button onClick={confirmMarkAsPaid} disabled={isActionLoading}>
              {isActionLoading ? 'Saving…' : 'Confirm payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recipient email dialog */}
      {emailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEmailTarget(null)} />
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-[0_24px_64px_rgba(0,0,0,0.18)] ring-1 ring-[var(--color-border)]">
            <div className="flex items-center justify-between border-b border-[var(--color-surface-tertiary)] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
                  <Envelope className="h-4 w-4 text-[var(--color-text-tertiary)]" weight="bold" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                    {emailTarget.current ? 'Change recipient email' : 'Add recipient email'}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {emailTarget.kind === 'invoice' ? 'Invoice' : 'Payment link'} recipient
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEmailTarget(null)}
                className="h-8 w-8 rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tertiary)]"
              >
                <X className="h-4 w-4" weight="bold" />
              </Button>
            </div>
            <div className="px-5 py-4">
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Email address
              </label>
              <input
                type="email"
                autoFocus
                placeholder="client@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveRecipientEmail(); }}
                className="w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-[14px] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-surface-tertiary)] px-5 py-4">
              <Button variant="outline" onClick={() => setEmailTarget(null)} disabled={isSavingEmail}>Cancel</Button>
              <Button onClick={saveRecipientEmail} disabled={isSavingEmail || !emailInput.trim()}>
                {isSavingEmail ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* ─── Invoice detail panel ─── */
function InvoicePanel({
  invoice, publicUrl, isLoading, accessToken,
  onClose, onMarkPaid, onReminder, onToggleReminders, onCopyLink, onDelete
}: {
  invoice: Invoice; publicUrl: string; isLoading: boolean; accessToken: string | null;
  onClose: () => void; onMarkPaid: () => void; onReminder: () => void;
  onToggleReminders: (v: boolean) => void; onCopyLink: () => void; onDelete: () => void;
}) {
  const { formatAmount } = useCurrency();
  const s = INV_STATUS[invoice.status];
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);

  const handleUploadToDrive = async () => {
    if (!accessToken) return;
    setIsUploadingToDrive(true);
    try {
      const resp = await fetch('/api/integrations/composio/drive/upload-from-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ documentId: invoice.id, documentType: 'INVOICE' }),
      });
      const payload = await resp.json();
      if (!payload.success) {
        console.error('Drive upload failed', payload.error);
      }
    } catch {
      console.error('Drive upload failed (network)');
    } finally {
      setIsUploadingToDrive(false);
    }
  };

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

          <div className="divide-y divide-[var(--color-surface-tertiary)]">
          <PanelRow label="Invoice number" value={invoice.number} />
          <PanelRow label="Due date" value={formatShortDate(invoice.dueAt)} />
          {invoice.viewedAt ? <PanelRow label="First viewed" value={formatShortDate(invoice.viewedAt)} /> : null}
          {invoice.recurringInvoiceId && (
            <PanelCustomRow
              label="Recurring"
              value={
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-tertiary)]">
                  <span>&#x21bb;</span> Auto-generated
                </span>
              }
            />
          )}
          <PanelCustomRow
            label="Settlement networks"
            value={<MultiChainInline />}
          />
          <PanelRow label="Auto-reminders" value={invoice.remindersEnabled === false ? 'Off' : 'On'} />
          <PanelRow label="Public page" value={publicUrl} mono />
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--color-border)] px-6 py-5 space-y-2">
        {invoice.status !== 'paid' && (
          <>
            <p className="rounded-xl bg-[var(--color-accent-soft)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
              Got paid by bank transfer or off-platform? Tap <span className="font-semibold">Mark as paid</span> once the funds land so this invoice shows up in your revenue tracking.
            </p>
            <button type="button" disabled={isLoading} onClick={onMarkPaid} className="w-full justify-center bg-[var(--color-accent)] text-white rounded-full px-4 py-2 text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
              <CheckCircle className="h-4 w-4" weight="bold" /> Mark as paid
            </button>
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCopyLink} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50">
            <CopySimple className="h-4 w-4" /> Copy link
          </button>
          <Link href={publicUrl} target="_blank" rel="noreferrer" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50">
            <ArrowSquareOut className="h-4 w-4" /> Open page
          </Link>
        </div>
        <Link href={`${publicUrl}?print=1`} target="_blank" rel="noreferrer" className="w-full justify-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50">
          <DownloadSimple className="h-4 w-4" /> Download PDF
        </Link>
        <button type="button" onClick={() => void handleUploadToDrive()} disabled={isUploadingToDrive} className="w-full justify-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50">
          <UploadSimple className="h-4 w-4" /> {isUploadingToDrive ? 'Uploading…' : 'Upload to Google Drive'}
        </button>
        {invoice.status !== 'paid' && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onReminder} disabled={isLoading} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50">
              <BellSimple className="h-4 w-4" /> Send reminder
            </button>
            <button type="button" onClick={() => onToggleReminders(invoice.remindersEnabled === false)} disabled={isLoading} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50">
              {invoice.remindersEnabled === false ? <BellSimple className="h-4 w-4" /> : <BellSlash className="h-4 w-4" />}
              {invoice.remindersEnabled === false ? 'Enable auto' : 'Disable auto'}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="w-full justify-center rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-tertiary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-danger-soft)] disabled:opacity-50"
        >
          <Trash className="h-4 w-4" /> Delete invoice
        </button>
      </div>
    </>
  );
}

/* ─── Payment link detail panel ─── */
function PaymentLinkPanel({
  link, publicUrl, isLoading, accessToken,
  onClose, onMarkPaid, onReminder, onToggleReminders, onCopyLink, onDelete
}: {
  link: PaymentLink; publicUrl: string; isLoading: boolean; accessToken: string | null;
  onClose: () => void; onMarkPaid: () => void; onReminder: () => void;
  onToggleReminders: (v: boolean) => void; onCopyLink: () => void; onDelete: () => void;
}) {
  const { formatAmount } = useCurrency();
  const s = LINK_STATUS[link.status];
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);

  const handleUploadToDrive = async () => {
    if (!accessToken) return;
    setIsUploadingToDrive(true);
    try {
      const resp = await fetch('/api/integrations/composio/drive/upload-from-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ documentId: link.id, documentType: 'PAYMENT_LINK' }),
      });
      const payload = await resp.json();
      if (!payload.success) {
        console.error('Drive upload failed', payload.error);
      }
    } catch {
      console.error('Drive upload failed (network)');
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  return (
    <>
      <PanelHeader label="Payment link" id={link.title} onClose={onClose} />
      <PanelHero amount={formatAmount(link.amountUsd, { compact: true })} status={<StatusPill {...s} />} />
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-[var(--color-surface-tertiary)] px-6 py-2">
          <PanelRow label="Title" value={link.title} />
          <PanelRow label="Asset" value={link.asset} />
          <PanelCustomRow
            label="Settlement networks"
            value={<MultiChainInline />}
          />
          <PanelRow label="Auto-reminders" value={link.remindersEnabled === false ? 'Off' : 'On'} />
          <PanelRow label="Public page" value={publicUrl} mono />
        </div>
      </div>
      <div className="border-t border-[var(--color-border)] px-6 py-5 space-y-2">
        {link.status === 'active' && (
          <>
            <p className="rounded-xl bg-[var(--color-accent-soft)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
              Got paid by bank transfer or off-platform? Tap <span className="font-semibold">Mark as paid</span> once the funds land so this link shows up in your revenue tracking.
            </p>
            <button type="button" disabled={isLoading} onClick={onMarkPaid} className="w-full justify-center bg-[var(--color-accent)] text-white rounded-full px-4 py-2 text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
              <CheckCircle className="h-4 w-4" weight="bold" /> Mark as paid
            </button>
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onCopyLink} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50">
            <CopySimple className="h-4 w-4" /> Copy link
          </button>
          <Link href={publicUrl} target="_blank" rel="noreferrer" className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50">
            <ArrowSquareOut className="h-4 w-4" /> Open page
          </Link>
        </div>
        <Link href={`${publicUrl}?print=1`} target="_blank" rel="noreferrer" className="w-full justify-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50">
          <DownloadSimple className="h-4 w-4" /> Download PDF
        </Link>
        <button type="button" onClick={() => void handleUploadToDrive()} disabled={isUploadingToDrive} className="w-full justify-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50">
          <UploadSimple className="h-4 w-4" /> {isUploadingToDrive ? 'Uploading…' : 'Upload to Google Drive'}
        </button>
        {link.status === 'active' && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onReminder} disabled={isLoading} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50">
              <BellSimple className="h-4 w-4" /> Send reminder
            </button>
            <button type="button" onClick={() => onToggleReminders(link.remindersEnabled === false)} disabled={isLoading} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-background)] disabled:opacity-50">
              {link.remindersEnabled === false ? <BellSimple className="h-4 w-4" /> : <BellSlash className="h-4 w-4" />}
              {link.remindersEnabled === false ? 'Enable auto' : 'Disable auto'}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="w-full justify-center rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-text-tertiary)] inline-flex items-center gap-1.5 hover:bg-[var(--color-danger-soft)] disabled:opacity-50"
        >
          <Trash className="h-4 w-4" /> Delete link
        </button>
      </div>
    </>
  );
}

/* ─── Recurring invoice detail panel ─── */
const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual',
};

function RecurringPanel({
  item, onClose
}: {
  item: RecurringInvoice; onClose: () => void;
}) {
  const { formatAmount } = useCurrency();
  return (
    <>
      <PanelHeader label="Recurring template" id={item.title || 'Recurring invoice'} onClose={onClose} />
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-6 py-5">
        <p className="text-[11px] font-medium text-[var(--color-text-muted)] mb-1">Amount per cycle</p>
        <p className="text-[32px] font-bold tracking-[-0.03em] text-[var(--color-text-primary)] leading-none mb-3">
          {formatAmount(item.amountUsd, { compact: true })}
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]">
          <Repeat className="h-3 w-3" /> {FREQ_LABELS[item.frequency] || item.frequency}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-[var(--color-surface-tertiary)] px-6 py-2">
          <PanelRow label="Status" value={item.status.charAt(0).toUpperCase() + item.status.slice(1)} />
          <PanelRow label="Frequency" value={FREQ_LABELS[item.frequency] || item.frequency} />
          <PanelRow label="Next due date" value={item.status === 'cancelled' ? 'Cancelled' : formatShortDate(item.nextDueDate)} />
          <PanelRow label="Client" value={item.clientName || item.clientEmail || 'No client assigned'} />
          <PanelRow label="Invoices generated" value={`${item.generatedCount}`} />
          {item.autoSend !== undefined && (
            <PanelRow label="Auto-send" value={item.autoSend ? 'Enabled' : 'Disabled'} />
          )}
        </div>
      </div>
      <div className="border-t border-[var(--color-border)] px-6 py-5">
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Manage this template from the <button className="font-semibold text-[var(--color-text-tertiary)] hover:underline" onClick={onClose}>Recurring tab</button> above.
        </p>
      </div>
    </>
  );
}

/* ─── shared panel subcomponents ─── */
function PanelHeader({ label, id, onClose }: { label: string; id: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">{label}</p>
        <p className="mt-0.5 text-[16px] font-bold text-[var(--color-text-primary)] leading-tight truncate max-w-[320px]">{id}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="h-8 w-8 rounded-full text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-secondary)]"
      >
        <X className="h-4 w-4" weight="bold" />
      </Button>
    </div>
  );
}

function PanelHero({ amount, status }: { amount: string; status: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-6 py-5">
      <p className="text-[11px] font-medium text-[var(--color-text-muted)] mb-1">Amount</p>
      <p className="text-[32px] font-bold tracking-[-0.03em] text-[var(--color-text-primary)] leading-none mb-3">{amount}</p>
      {status}
    </div>
  );
}

function PanelRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="py-3.5">
      <p className="text-[11px] font-medium text-[var(--color-text-muted)] mb-0.5">{label}</p>
      <p className={`text-[13px] font-semibold text-[var(--color-text-secondary)] ${mono ? 'break-all font-mono text-[11px]' : ''}`}>{value}</p>
    </div>
  );
}

function PanelCustomRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3.5">
      <p className="mb-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">{label}</p>
      <div className="text-[13px] font-semibold text-[var(--color-text-secondary)]">{value}</div>
    </div>
  );
}

/* ─── misc small components ─── */
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px mr-5 flex items-center gap-2 border-b-2 px-1 py-3 text-[13px] font-semibold transition-colors',
        active
          ? 'border-[var(--color-primary)] text-[var(--color-foreground)]'
          : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
      )}
    >
      {children}
    </button>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-tertiary)]">
      {n}
    </span>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
        active
          ? 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]'
          : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-secondary)]'
      }`}
    >
      {children}
    </Button>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {icon}
      <p className="text-[13px] text-[var(--color-text-muted)]">{text}</p>
    </div>
  );
}
