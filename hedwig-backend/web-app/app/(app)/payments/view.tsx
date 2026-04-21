'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
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
import { RecurringInvoicesSection } from '@/components/payments/recurring-invoices-section';
import { ImportInvoiceModal } from '@/components/email/import-invoice-modal';
import { hedwigApi } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { ClientPortal } from '@/components/ui/client-portal';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import type { RowActionItem } from '@/components/data/row-actions-menu';
import { useToast } from '@/components/providers/toast-provider';
import { useCurrency } from '@/components/providers/currency-provider';
import { formatCompactCurrency, formatShortDate } from '@/lib/utils';
import { backendConfig } from '@/lib/auth/config';
import { canUseFeature } from '@/lib/billing/feature-gates';
import { ProLockCard } from '@/components/billing/pro-lock-card';

/* ─── status helpers ─── */
const INV_STATUS: Record<Invoice['status'], { dot: string; label: string; bg: string; text: string }> = {
  draft:   { dot: 'bg-[#a4a7ae]', label: 'Draft',   bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
  sent:    { dot: 'bg-[#2563eb]', label: 'Sent',    bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
  viewed:  { dot: 'bg-[#2563eb]', label: 'Viewed',  bg: 'bg-[#eff4ff]', text: 'text-[#717680]' },
  paid:    { dot: 'bg-[#12b76a]', label: 'Paid',    bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  overdue: { dot: 'bg-[#f04438]', label: 'Overdue', bg: 'bg-[#fff1f0]', text: 'text-[#b42318]' },
};

const RECURRING_TEMPLATE_PREFIX = 'rtpl_';

const LINK_STATUS: Record<PaymentLink['status'], { dot: string; label: string; bg: string; text: string }> = {
  active:  { dot: 'bg-[#12b76a]', label: 'Active',  bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  paid:    { dot: 'bg-[#2563eb]', label: 'Paid',    bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
  expired: { dot: 'bg-[#a4a7ae]', label: 'Expired', bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
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
  { src: '/icons/networks/celo.png',     alt: 'Celo' },
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
      <span className={muted ? 'text-[#717680]' : 'text-[#344054]'}>5 networks</span>
    </span>
  );
}

/* ─── component ─── */
export function PaymentsClient({
  accessToken,
  invoices,
  paymentLinks,
  highlightedInvoiceId,
  recurringInvoices = [],
  clients = [],
  billing,
}: {
  accessToken: string | null;
  invoices: Invoice[];
  paymentLinks: PaymentLink[];
  highlightedInvoiceId?: string | null;
  recurringInvoices?: RecurringInvoice[];
  clients?: Client[];
  billing: BillingStatusSummary | null;
}) {
  const { currency } = useCurrency();
  const { toast } = useToast();
  const canUseRecurringAutomation = canUseFeature('recurring_invoice_automation', billing);

  const [invoiceItems, setInvoiceItems] = useState(invoices);
  const [paymentLinkItems, setPaymentLinkItems] = useState(paymentLinks);
  const [showImportModal, setShowImportModal] = useState(false);

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

  const highlightedInvoice = useMemo(
    () => invoiceItems.find((inv) => inv.id === highlightedInvoiceId) ?? null,
    [highlightedInvoiceId, invoiceItems]
  );

  const stats = useMemo(() => {
    const paid = allInvoiceItems.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amountUsd, 0);
    const outstanding = allInvoiceItems.filter((i) => i.status !== 'paid' && !i.id.startsWith(RECURRING_TEMPLATE_PREFIX)).reduce((s, i) => s + i.amountUsd, 0);
    const activeLinks = paymentLinkItems.filter((l) => l.status === 'active').length;
    return { paid, outstanding, activeLinks };
  }, [allInvoiceItems, paymentLinkItems]);

  const filteredInvoices = useMemo(() => {
    if (invoiceFilter === 'all') return allInvoiceItems;
    if (invoiceFilter === 'imported') return allInvoiceItems.filter((i) => !!i.source);
    return allInvoiceItems.filter((i) => i.status === invoiceFilter);
  }, [allInvoiceItems, invoiceFilter]);
  const filteredLinks = useMemo(
    () => (linkFilter === 'all' ? paymentLinkItems : paymentLinkItems.filter((l) => l.status === linkFilter)),
    [paymentLinkItems, linkFilter]
  );

  const publicInvoiceUrl = selectedInvoice ? `${backendConfig.publicPagesUrl}/invoice/${selectedInvoice.id}` : '';
  const publicLinkUrl = selectedPaymentLink ? `${backendConfig.publicPagesUrl}/pay/${selectedPaymentLink.id}` : '';

  /* ── handlers ── */
  const handleDelete = async () => {
    if (!deleteTarget || !accessToken) return;
    setIsDeleting(true);
    try {
      await hedwigApi.deleteDocument(deleteTarget.id, { accessToken, disableMockFallback: true });
      if (deleteTarget.kind === 'invoice') {
        setInvoiceItems((cur) => cur.filter((i) => i.id !== deleteTarget.id));
        if (selectedInvoice?.id === deleteTarget.id) setSelectedInvoice(null);
      } else {
        setPaymentLinkItems((cur) => cur.filter((l) => l.id !== deleteTarget.id));
        if (selectedPaymentLink?.id === deleteTarget.id) setSelectedPaymentLink(null);
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

  const markAsPaid = async (doc: Invoice | PaymentLink, kind: 'invoice' | 'payment-link') => {
    if (!accessToken) return;
    setIsActionLoading(true);
    try {
      await hedwigApi.updateDocumentStatus(doc.id, 'PAID', { accessToken, disableMockFallback: true });
      if (kind === 'invoice') {
        setInvoiceItems((cur) => cur.map((i) => (i.id === doc.id ? { ...i, status: 'paid' } : i)));
        if (selectedInvoice?.id === doc.id) setSelectedInvoice((c) => (c ? { ...c, status: 'paid' } : c));
      } else {
        setPaymentLinkItems((cur) => cur.map((l) => (l.id === doc.id ? { ...l, status: 'paid' } : l)));
        if (selectedPaymentLink?.id === doc.id) setSelectedPaymentLink((c) => (c ? { ...c, status: 'paid' } : c));
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
        setInvoiceItems((cur) => cur.map((i) => (i.id === doc.id ? { ...i, remindersEnabled: enabled } : i)));
        if (selectedInvoice?.id === doc.id) setSelectedInvoice((c) => (c ? { ...c, remindersEnabled: enabled } : c));
      } else {
        setPaymentLinkItems((cur) => cur.map((l) => (l.id === doc.id ? { ...l, remindersEnabled: enabled } : l)));
        if (selectedPaymentLink?.id === doc.id) setSelectedPaymentLink((c) => (c ? { ...c, remindersEnabled: enabled } : c));
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
      } else {
        setPaymentLinkItems((cur) => cur.map((l) => l.id === emailTarget.id ? { ...l, clientEmail: emailInput.trim().toLowerCase() } : l));
        if (selectedPaymentLink?.id === emailTarget.id) setSelectedPaymentLink((c) => c ? { ...c, clientEmail: emailInput.trim().toLowerCase() } : c);
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
      { label: 'Copy link', onClick: () => copyText(`${backendConfig.publicPagesUrl}/invoice/${inv.id}`, 'Invoice link copied') },
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
      { label: 'Copy link', onClick: () => copyText(`${backendConfig.publicPagesUrl}/pay/${link.id}`, 'Payment link copied') },
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
          <h1 className="text-[15px] font-semibold text-[#181d27]">Payments</h1>
          <p className="mt-0.5 text-[13px] text-[#a4a7ae]">Invoice clients and collect payments in one workflow.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowImportModal(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#414651] shadow-xs transition hover:bg-[#f9fafb]"
        >
          <UploadSimple className="h-3.5 w-3.5" />
          Import invoice
        </button>
      </div>
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
        <div className="flex flex-col bg-white px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-medium text-[#717680]">Outstanding</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]">
              <CurrencyDollar className="h-3.5 w-3.5 text-[#717680]" weight="regular" />
            </div>
          </div>
          <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">{formatCompactCurrency(stats.outstanding, currency)}</p>
          <p className="mt-1.5 text-[11px] text-[#a4a7ae]">Awaiting payment</p>
        </div>
        <div className="flex flex-col bg-white px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-medium text-[#717680]">Collected</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]">
              <CheckCircle className="h-3.5 w-3.5 text-[#717680]" weight="regular" />
            </div>
          </div>
          <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">{formatCompactCurrency(stats.paid, currency)}</p>
          <p className="mt-1.5 text-[11px] text-[#a4a7ae]">From paid invoices</p>
        </div>
        <div className="flex flex-col bg-white px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-medium text-[#717680]">Active links</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]">
              <LinkSimple className="h-3.5 w-3.5 text-[#717680]" weight="regular" />
            </div>
          </div>
          <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">{stats.activeLinks}</p>
          <p className="mt-1.5 text-[11px] text-[#a4a7ae]">Ready to share</p>
        </div>
      </div>

      {/* Highlighted invoice banner */}
      {highlightedInvoice && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#d5d7da] bg-[#fcfcfd] px-4 py-3 text-[#414651]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#717680]" weight="bold" />
          <p className="text-[13px]">
            Opened from calendar — invoice{' '}
            <span className="font-semibold text-[#181d27]">{highlightedInvoice.number}</span> is due on{' '}
            <span className="font-semibold text-[#181d27]">{formatShortDate(highlightedInvoice.dueAt)}</span>.
          </p>
        </div>
      )}

      {/* Main card */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        {/* Unified header */}
        <div className="flex items-center gap-3 border-b border-[#f2f4f7] px-5 py-3">
          <span className="text-[12px] font-medium text-[#717680]">{allInvoiceItems.length + paymentLinkItems.length} records</span>
          {(stats.outstanding > 0 || stats.paid > 0) && (
            <>
              <span className="h-3 w-px shrink-0 bg-[#f2f4f7]" />
              <span className="truncate text-[12px] text-[#a4a7ae]">
                {formatCompactCurrency(stats.outstanding, currency)} outstanding · {formatCompactCurrency(stats.paid, currency)} collected
                {stats.activeLinks > 0 ? ` · ${stats.activeLinks} active link${stats.activeLinks > 1 ? 's' : ''}` : ''}
              </span>
            </>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex items-center border-b border-[#f2f4f7] px-5">
          <TabBtn active={activeTab === 'invoices'} onClick={() => setActiveTab('invoices')}>
            Invoices
            <CountBadge n={allInvoiceItems.length} />
          </TabBtn>
          <TabBtn active={activeTab === 'payment-links'} onClick={() => setActiveTab('payment-links')}>
            Payment links
            <CountBadge n={paymentLinkItems.length} />
          </TabBtn>
          <TabBtn active={activeTab === 'recurring'} onClick={() => setActiveTab('recurring')}>
            <Repeat className="h-3.5 w-3.5" />
            Recurring
            <CountBadge n={canUseRecurringAutomation ? recurringInvoices.length : 0} />
            {!canUseRecurringAutomation ? (
              <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[10px] font-semibold text-[#717680]">
                Pro
              </span>
            ) : null}
          </TabBtn>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1 border-b border-[#f2f4f7] px-5 py-2">
          {activeTab === 'invoices'
            ? (['all', 'draft', 'sent', 'viewed', 'paid', 'overdue', 'imported'] as const).map((s) => (
                <FilterChip key={s} active={invoiceFilter === s} onClick={() => setInvoiceFilter(s)}>
                  {s === 'all' ? 'All' : s === 'imported' ? 'Imported' : INV_STATUS[s as keyof typeof INV_STATUS]?.label ?? s}
                </FilterChip>
              ))
            : activeTab === 'payment-links'
            ? (['all', 'active', 'paid', 'expired'] as const).map((s) => (
                <FilterChip key={s} active={linkFilter === s} onClick={() => setLinkFilter(s)}>
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
          <div className="grid grid-cols-[1fr_120px_110px_100px_44px] gap-3 border-b border-[#f2f4f7] px-5 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">
              {activeTab === 'invoices' ? 'Invoice' : 'Title'}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">Status</span>
            <span className="text-right text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">Amount</span>
            <span className="text-right text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">
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
              onRowClick={(r) => setSelectedRecurring(r)}
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
            <EmptyState icon={<FileText className="h-8 w-8 text-[#d0d5dd]" weight="duotone" />} text="No invoices match this filter." />
          ) : (
            <div className="divide-y divide-[#f9fafb]">
              {filteredInvoices.map((inv) => {
                const s = INV_STATUS[inv.status];
                return (
                  <div
                    key={inv.id}
                    onClick={() => {
                      if (inv.id.startsWith(RECURRING_TEMPLATE_PREFIX)) {
                        const r = recurringInvoices.find((ri) => ri.id === inv.recurringInvoiceId);
                        if (r) { setSelectedRecurring(r); setSelectedInvoice(null); setSelectedPaymentLink(null); }
                        return;
                      }
                      setSelectedRecurring(null); setSelectedPaymentLink(null); setSelectedInvoice(inv);
                    }}
                    className={`group grid cursor-pointer grid-cols-[1fr_120px_110px_100px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fafafa] ${selectedInvoice?.id === inv.id ? 'bg-[#f5f8ff]' : ''}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold text-[#181d27]">
                          {inv.title || inv.number}
                        </p>
                        {inv.recurringInvoiceId && (
                          <span className="shrink-0 rounded-full bg-[#fdf4ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#717680]">Recurring</span>
                        )}
                        {inv.source && (
                          <span className="shrink-0 rounded-full bg-[#f0fdf4] px-1.5 py-0.5 text-[10px] font-semibold text-[#15803d]">Imported</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#a4a7ae]">
                        <span>{inv.number} · Due {formatShortDate(inv.dueAt)}</span>
                        <span className="text-[#d0d5dd]">•</span>
                        <MultiChainStack size={12} />
                      </div>
                    </div>
                    <StatusPill {...s} />
                    <p className="text-right text-[13px] font-semibold tabular-nums text-[#181d27]">
                      {formatCompactCurrency(inv.amountUsd, currency)}
                    </p>
                    <p className="text-right text-[12px] text-[#717680]">{formatShortDate(inv.dueAt)}</p>
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu items={invoiceActions(inv)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : activeTab === 'payment-links' && filteredLinks.length === 0 ? (
          <EmptyState icon={<LinkSimple className="h-8 w-8 text-[#d0d5dd]" weight="duotone" />} text="No payment links match this filter." />
        ) : activeTab === 'payment-links' ? (
          <div className="divide-y divide-[#f9fafb]">
            {filteredLinks.map((link) => {
              const s = LINK_STATUS[link.status];
              return (
                <div
                  key={link.id}
                  onClick={() => { setSelectedInvoice(null); setSelectedPaymentLink(link); }}
                  className={`group grid cursor-pointer grid-cols-[1fr_120px_110px_100px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fafafa] ${selectedPaymentLink?.id === link.id ? 'bg-[#f5f8ff]' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[#181d27]">{link.title}</p>
                    <div className="flex items-center gap-2 text-[11px] text-[#a4a7ae]">
                      <span>{link.asset}</span>
                      <span className="text-[#d0d5dd]">•</span>
                      <MultiChainStack size={12} />
                    </div>
                  </div>
                  <StatusPill {...s} />
                  <p className="text-right text-[13px] font-semibold tabular-nums text-[#181d27]">
                    {formatCompactCurrency(link.amountUsd, currency)}
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
          <div className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-[440px] flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-[#e9eaeb] animate-in slide-in-from-right-full duration-300 ease-out">
            {selectedRecurring ? (
              <RecurringPanel
                item={selectedRecurring}
                currency={currency}
                onClose={() => setSelectedRecurring(null)}
              />
            ) : selectedInvoice ? (
              <InvoicePanel
                invoice={selectedInvoice}
                publicUrl={publicInvoiceUrl}
                currency={currency}
                isLoading={isActionLoading}
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
                currency={currency}
                isLoading={isActionLoading}
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

      {/* Recipient email dialog */}
      {emailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
                onClick={() => setEmailTarget(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#a4a7ae] hover:bg-[#f2f4f7] transition-colors"
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
                onKeyDown={(e) => { if (e.key === 'Enter') saveRecipientEmail(); }}
                className="w-full rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[14px] text-[#181d27] placeholder-[#a4a7ae] focus:border-[#2563eb] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#f2f4f7] px-5 py-4">
              <Button variant="outline" onClick={() => setEmailTarget(null)} disabled={isSavingEmail}>Cancel</Button>
              <Button onClick={saveRecipientEmail} disabled={isSavingEmail || !emailInput.trim()}>
                {isSavingEmail ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <ImportInvoiceModal
          onClose={() => setShowImportModal(false)}
          onImported={(doc) => {
            toast({ type: 'success', title: 'Invoice imported', message: `${doc.filename} has been extracted and is ready for review.` });
            setShowImportModal(false);
          }}
        />
      )}

    </div>
  );
}

/* ─── Invoice detail panel ─── */
function InvoicePanel({
  invoice, publicUrl, currency, isLoading,
  onClose, onMarkPaid, onReminder, onToggleReminders, onCopyLink, onDelete
}: {
  invoice: Invoice; publicUrl: string; currency: any; isLoading: boolean;
  onClose: () => void; onMarkPaid: () => void; onReminder: () => void;
  onToggleReminders: (v: boolean) => void; onCopyLink: () => void; onDelete: () => void;
}) {
  const s = INV_STATUS[invoice.status];
  return (
    <>
      <PanelHeader label={invoice.title || 'Invoice'} id={invoice.number} onClose={onClose} />
      <PanelHero amount={formatCompactCurrency(invoice.amountUsd, currency)} status={<StatusPill {...s} />} />
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-[#f2f4f7] px-6 py-2">
          <PanelRow label="Invoice number" value={invoice.number} />
          <PanelRow label="Due date" value={formatShortDate(invoice.dueAt)} />
          {invoice.viewedAt ? <PanelRow label="First viewed" value={formatShortDate(invoice.viewedAt)} /> : null}
          {invoice.recurringInvoiceId && (
            <PanelCustomRow
              label="Recurring"
              value={
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fdf4ff] px-2.5 py-1 text-[11px] font-semibold text-[#717680]">
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
      <div className="border-t border-[#e9eaeb] px-6 py-5 space-y-2">
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
        <Button variant="secondary" className="w-full" asChild>
          <Link href={`${publicUrl}?print=1`} target="_blank" rel="noreferrer">
            <DownloadSimple className="h-4 w-4" /> Download PDF
          </Link>
        </Button>
        {invoice.status !== 'paid' && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onReminder} disabled={isLoading}>
              <BellSimple className="h-4 w-4" /> Send reminder
            </Button>
            <Button variant="secondary" onClick={() => onToggleReminders(invoice.remindersEnabled === false)} disabled={isLoading}>
              {invoice.remindersEnabled === false ? <BellSimple className="h-4 w-4" /> : <BellSlash className="h-4 w-4" />}
              {invoice.remindersEnabled === false ? 'Enable auto' : 'Disable auto'}
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full text-[#717680] hover:bg-[#fff1f0] hover:text-[#717680]"
          onClick={onDelete}
        >
          <Trash className="h-4 w-4" /> Delete invoice
        </Button>
      </div>
    </>
  );
}

/* ─── Payment link detail panel ─── */
function PaymentLinkPanel({
  link, publicUrl, currency, isLoading,
  onClose, onMarkPaid, onReminder, onToggleReminders, onCopyLink, onDelete
}: {
  link: PaymentLink; publicUrl: string; currency: any; isLoading: boolean;
  onClose: () => void; onMarkPaid: () => void; onReminder: () => void;
  onToggleReminders: (v: boolean) => void; onCopyLink: () => void; onDelete: () => void;
}) {
  const s = LINK_STATUS[link.status];
  return (
    <>
      <PanelHeader label="Payment link" id={link.title} onClose={onClose} />
      <PanelHero amount={formatCompactCurrency(link.amountUsd, currency)} status={<StatusPill {...s} />} />
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-[#f2f4f7] px-6 py-2">
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
      <div className="border-t border-[#e9eaeb] px-6 py-5 space-y-2">
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
        <Button variant="secondary" className="w-full" asChild>
          <Link href={`${publicUrl}?print=1`} target="_blank" rel="noreferrer">
            <DownloadSimple className="h-4 w-4" /> Download PDF
          </Link>
        </Button>
        {link.status === 'active' && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onReminder} disabled={isLoading}>
              <BellSimple className="h-4 w-4" /> Send reminder
            </Button>
            <Button variant="secondary" onClick={() => onToggleReminders(link.remindersEnabled === false)} disabled={isLoading}>
              {link.remindersEnabled === false ? <BellSimple className="h-4 w-4" /> : <BellSlash className="h-4 w-4" />}
              {link.remindersEnabled === false ? 'Enable auto' : 'Disable auto'}
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full text-[#717680] hover:bg-[#fff1f0] hover:text-[#717680]"
          onClick={onDelete}
        >
          <Trash className="h-4 w-4" /> Delete link
        </Button>
      </div>
    </>
  );
}

/* ─── Recurring invoice detail panel ─── */
const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual',
};

function RecurringPanel({
  item, currency, onClose
}: {
  item: RecurringInvoice; currency: any; onClose: () => void;
}) {
  return (
    <>
      <PanelHeader label="Recurring template" id={item.title || 'Recurring invoice'} onClose={onClose} />
      <div className="border-b border-[#e9eaeb] bg-[#f8f9fc] px-6 py-5">
        <p className="text-[11px] font-medium text-[#a4a7ae] mb-1">Amount per cycle</p>
        <p className="text-[32px] font-bold tracking-[-0.03em] text-[#181d27] leading-none mb-3">
          {formatCompactCurrency(item.amountUsd, currency)}
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[#fdf4ff] text-[#717680]">
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
          {item.autoSend !== undefined && (
            <PanelRow label="Auto-send" value={item.autoSend ? 'Enabled' : 'Disabled'} />
          )}
        </div>
      </div>
      <div className="border-t border-[#e9eaeb] px-6 py-5">
        <p className="text-[11px] text-[#a4a7ae]">
          Manage this template from the <button className="font-semibold text-[#717680] hover:underline" onClick={onClose}>Recurring tab</button> above.
        </p>
      </div>
    </>
  );
}

/* ─── shared panel subcomponents ─── */
function PanelHeader({ label, id, onClose }: { label: string; id: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-[#e9eaeb] px-6 py-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#c1c5cd]">{label}</p>
        <p className="mt-0.5 text-[16px] font-bold text-[#181d27] leading-tight truncate max-w-[320px]">{id}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#717680] transition-colors hover:bg-[#f2f4f7] hover:text-[#344054]"
      >
        <X className="h-4 w-4" weight="bold" />
      </button>
    </div>
  );
}

function PanelHero({ amount, status }: { amount: string; status: React.ReactNode }) {
  return (
    <div className="border-b border-[#e9eaeb] bg-[#f8f9fc] px-6 py-5">
      <p className="text-[11px] font-medium text-[#a4a7ae] mb-1">Amount</p>
      <p className="text-[32px] font-bold tracking-[-0.03em] text-[#181d27] leading-none mb-3">{amount}</p>
      {status}
    </div>
  );
}

function PanelRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="py-3.5">
      <p className="text-[11px] font-medium text-[#a4a7ae] mb-0.5">{label}</p>
      <p className={`text-[13px] font-semibold text-[#344054] ${mono ? 'break-all font-mono text-[11px]' : ''}`}>{value}</p>
    </div>
  );
}

function PanelCustomRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3.5">
      <p className="mb-0.5 text-[11px] font-medium text-[#a4a7ae]">{label}</p>
      <div className="text-[13px] font-semibold text-[#344054]">{value}</div>
    </div>
  );
}

/* ─── misc small components ─── */
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-1 py-3 text-[13px] font-medium transition-colors mr-5 ${
        active
          ? 'border-[#2563eb] text-[#181d27]'
          : 'border-transparent text-[#a4a7ae] hover:text-[#535862]'
      }`}
    >
      {children}
    </button>
  );
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[10px] font-semibold text-[#717680]">
      {n}
    </span>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
        active
          ? 'bg-[#f5f5f5] text-[#181d27]'
          : 'text-[#8d9096] hover:bg-[#f9fafb] hover:text-[#414651]'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {icon}
      <p className="text-[13px] text-[#a4a7ae]">{text}</p>
    </div>
  );
}
