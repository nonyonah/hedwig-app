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
  FileText,
  LinkSimple,
  Trash,
  X,
  Info
} from '@phosphor-icons/react/dist/ssr';
import type { Invoice, PaymentLink } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { PageHeader } from '@/components/data/page-header';
import { Button } from '@/components/ui/button';
import { UniversalCreationBox } from '@/components/payments/universal-creation-box';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import type { RowActionItem } from '@/components/data/row-actions-menu';
import { useToast } from '@/components/providers/toast-provider';
import { useCurrency } from '@/components/providers/currency-provider';
import { formatCompactCurrency, formatShortDate } from '@/lib/utils';
import { backendConfig } from '@/lib/auth/config';

/* ─── status helpers ─── */
const INV_STATUS: Record<Invoice['status'], { dot: string; label: string; bg: string; text: string }> = {
  draft:   { dot: 'bg-[#a4a7ae]', label: 'Draft',   bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
  sent:    { dot: 'bg-[#2563eb]', label: 'Sent',    bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
  paid:    { dot: 'bg-[#12b76a]', label: 'Paid',    bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  overdue: { dot: 'bg-[#f04438]', label: 'Overdue', bg: 'bg-[#fff1f0]', text: 'text-[#b42318]' },
};

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

function MultiChainStack({ size = 16 }: { size?: number }) {
  return (
    <div className="flex items-center pl-0.5">
      <Image
        src="/icons/networks/base.png"
        alt="Base"
        width={size}
        height={size}
        className="rounded-full ring-1 ring-white"
      />
      <Image
        src="/icons/networks/solana.png"
        alt="Solana"
        width={size}
        height={size}
        className="-ml-1 rounded-full ring-1 ring-white"
      />
    </div>
  );
}

function MultiChainInline({ muted = false }: { muted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <MultiChainStack size={14} />
      <span className={muted ? 'text-[#717680]' : 'text-[#344054]'}>Base &amp; Solana</span>
    </span>
  );
}

/* ─── component ─── */
export function PaymentsClient({
  accessToken,
  invoices,
  paymentLinks,
  highlightedInvoiceId
}: {
  accessToken: string | null;
  invoices: Invoice[];
  paymentLinks: PaymentLink[];
  highlightedInvoiceId?: string | null;
}) {
  const { currency } = useCurrency();
  const { toast } = useToast();

  const [showCreationBox, setShowCreationBox] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState(invoices);
  const [paymentLinkItems, setPaymentLinkItems] = useState(paymentLinks);
  const [activeTab, setActiveTab] = useState<'invoices' | 'payment-links'>('invoices');
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [linkFilter, setLinkFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedPaymentLink, setSelectedPaymentLink] = useState<PaymentLink | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string; kind: 'invoice' | 'payment-link' } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const highlightedInvoice = useMemo(
    () => invoiceItems.find((inv) => inv.id === highlightedInvoiceId) ?? null,
    [highlightedInvoiceId, invoiceItems]
  );

  const stats = useMemo(() => {
    const paid = invoiceItems.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amountUsd, 0);
    const outstanding = invoiceItems.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.amountUsd, 0);
    const activeLinks = paymentLinkItems.filter((l) => l.status === 'active').length;
    return { paid, outstanding, activeLinks };
  }, [invoiceItems, paymentLinkItems]);

  const filteredInvoices = useMemo(
    () => (invoiceFilter === 'all' ? invoiceItems : invoiceItems.filter((i) => i.status === invoiceFilter)),
    [invoiceItems, invoiceFilter]
  );
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

  const invoiceActions = (inv: Invoice): RowActionItem[] => {
    const items: RowActionItem[] = [
      { label: 'Copy link', onClick: () => copyText(`${backendConfig.publicPagesUrl}/invoice/${inv.id}`, 'Invoice link copied') }
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
      { label: 'Copy link', onClick: () => copyText(`${backendConfig.publicPagesUrl}/pay/${link.id}`, 'Payment link copied') }
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payments"
        title="Invoices & payment links"
        description="Collect stablecoins or bank payments through one workflow."
        actions={
          <Button onClick={() => setShowCreationBox(true)}>
            <FileText className="h-4 w-4" weight="bold" /> New
          </Button>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
        <StatItem
          icon={<CurrencyDollar className="h-4 w-4 text-[#f04438]" weight="bold" />}
          label="Outstanding"
          value={formatCompactCurrency(stats.outstanding, currency)}
          sub="awaiting payment"
          accent="text-[#f04438]"
        />
        <StatItem
          icon={<CheckCircle className="h-4 w-4 text-[#12b76a]" weight="bold" />}
          label="Total collected"
          value={formatCompactCurrency(stats.paid, currency)}
          sub="from paid invoices"
          accent="text-[#12b76a]"
        />
        <StatItem
          icon={<LinkSimple className="h-4 w-4 text-[#2563eb]" weight="bold" />}
          label="Active links"
          value={`${stats.activeLinks}`}
          sub="ready to share"
          accent="text-[#2563eb]"
        />
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
        {/* Tab bar */}
        <div className="flex items-center border-b border-[#e9eaeb] px-5">
          <TabBtn active={activeTab === 'invoices'} onClick={() => setActiveTab('invoices')}>
            Invoices
            <CountBadge n={invoiceItems.length} />
          </TabBtn>
          <TabBtn active={activeTab === 'payment-links'} onClick={() => setActiveTab('payment-links')}>
            Payment links
            <CountBadge n={paymentLinkItems.length} />
          </TabBtn>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 border-b border-[#f2f4f7] px-5 py-2.5">
          {activeTab === 'invoices'
            ? (['all', 'draft', 'sent', 'paid', 'overdue'] as const).map((s) => (
                <FilterChip key={s} active={invoiceFilter === s} onClick={() => setInvoiceFilter(s)}>
                  {s === 'all' ? 'All' : INV_STATUS[s]?.label ?? s}
                </FilterChip>
              ))
            : (['all', 'active', 'paid', 'expired'] as const).map((s) => (
                <FilterChip key={s} active={linkFilter === s} onClick={() => setLinkFilter(s)}>
                  {s === 'all' ? 'All' : LINK_STATUS[s]?.label ?? s}
                </FilterChip>
              ))}
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[1fr_120px_110px_100px_44px] gap-3 border-b border-[#f2f4f7] px-5 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
            {activeTab === 'invoices' ? 'Invoice' : 'Title'}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Status</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Amount</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
            {activeTab === 'invoices' ? 'Due' : 'Chain'}
          </span>
          <span />
        </div>

        {/* Rows */}
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
                    onClick={() => { setSelectedPaymentLink(null); setSelectedInvoice(inv); }}
                    className={`group grid cursor-pointer grid-cols-[1fr_120px_110px_100px_44px] items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fafafa] ${selectedInvoice?.id === inv.id ? 'bg-[#f5f8ff]' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[#181d27]">
                        {inv.title || inv.number}
                      </p>
                      <p className="flex items-center gap-2 text-[11px] text-[#a4a7ae]">
                        <span>{inv.number} · Due {formatShortDate(inv.dueAt)}</span>
                        <span className="text-[#d0d5dd]">•</span>
                        <MultiChainStack size={12} />
                      </p>
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
        ) : filteredLinks.length === 0 ? (
          <EmptyState icon={<LinkSimple className="h-8 w-8 text-[#d0d5dd]" weight="duotone" />} text="No payment links match this filter." />
        ) : (
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
                    <p className="flex items-center gap-2 text-[11px] text-[#a4a7ae]">
                      <span>{link.asset}</span>
                      <span className="text-[#d0d5dd]">•</span>
                      <MultiChainStack size={12} />
                    </p>
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
        )}
      </div>

      {/* Detail side panel */}
      {hasPanel && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
            onClick={() => { setSelectedInvoice(null); setSelectedPaymentLink(null); }}
          />

          {/* Panel */}
          <div className="fixed inset-y-0 right-0 z-50 flex w-[440px] flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-[#e9eaeb]">
            {selectedInvoice ? (
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
        </>
      )}

      {/* Creation box dialog */}
      <Dialog open={showCreationBox} onOpenChange={setShowCreationBox}>
        <DialogContent className="max-w-[540px] overflow-visible p-0">
          <DialogHeader>
            <DialogTitle>New invoice or payment link</DialogTitle>
            <DialogDescription>Describe what you need — the AI detects invoice vs. payment link automatically.</DialogDescription>
          </DialogHeader>
          <UniversalCreationBox
            accessToken={accessToken}
            onCreated={({ invoice, paymentLink }) => {
              setShowCreationBox(false);
              if (invoice) {
                setInvoiceItems((cur) => [invoice, ...cur]);
                setActiveTab('invoices');
                setSelectedInvoice(invoice);
              } else if (paymentLink) {
                setPaymentLinkItems((cur) => [paymentLink, ...cur]);
                setActiveTab('payment-links');
                setSelectedPaymentLink(paymentLink);
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.kind === 'invoice' ? 'invoice' : 'payment link'}`}
        description="This permanently removes the record from your billing workspace."
        itemLabel={deleteTarget?.label}
        isDeleting={isDeleting || isActionLoading}
        onConfirm={handleDelete}
        onOpenChange={(open) => { if (!open && !isDeleting && !isActionLoading) setDeleteTarget(null); }}
      />

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
          className="w-full text-[#b42318] hover:bg-[#fff1f0] hover:text-[#b42318]"
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
          className="w-full text-[#b42318] hover:bg-[#fff1f0] hover:text-[#b42318]"
          onClick={onDelete}
        >
          <Trash className="h-4 w-4" /> Delete link
        </Button>
      </div>
    </>
  );
}

/* ─── shared panel subcomponents ─── */
function PanelHeader({ label, id, onClose }: { label: string; id: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-[#e9eaeb] px-6 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">{label}</p>
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
function StatItem({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[12px] font-medium text-[#717680]">{label}</span>
      </div>
      <p className={`text-[22px] font-bold tracking-[-0.03em] ${accent}`}>{value}</p>
      <p className="mt-1 text-[11px] text-[#a4a7ae]">{sub}</p>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-1 py-3.5 text-[13px] font-semibold transition-colors mr-5 ${
        active
          ? 'border-[#2563eb] text-[#2563eb]'
          : 'border-transparent text-[#717680] hover:text-[#344054]'
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
      className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
        active
          ? 'bg-[#eff4ff] text-[#2563eb]'
          : 'text-[#717680] hover:bg-[#f2f4f7] hover:text-[#344054]'
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
