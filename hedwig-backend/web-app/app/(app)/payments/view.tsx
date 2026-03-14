'use client';

import { useMemo, useState } from 'react';
import { Cards, CreditCard, Info, Sparkle, Wallet } from '@phosphor-icons/react/dist/ssr';
import type { InvoiceDraft, PaymentLinkDraft, Invoice, PaymentLink } from '@/lib/models/entities';
import { DraftPreview } from '@/components/ai/draft-preview';
import { PageHeader } from '@/components/data/page-header';
import { PromptComposer } from '@/components/ai/prompt-composer';
import { EntityTable } from '@/components/data/entity-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrency } from '@/components/providers/currency-provider';
import { formatCompactCurrency, formatShortDate } from '@/lib/utils';

export function PaymentsClient({
  invoices,
  paymentLinks,
  highlightedInvoiceId
}: {
  invoices: Invoice[];
  paymentLinks: PaymentLink[];
  highlightedInvoiceId?: string | null;
}) {
  const { currency } = useCurrency();
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft | null>(null);
  const [paymentLinkDraft, setPaymentLinkDraft] = useState<PaymentLinkDraft | null>(null);
  const [focus, setFocus] = useState<'collect' | 'drafts'>('collect');

  const highlightedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === highlightedInvoiceId) ?? null,
    [highlightedInvoiceId, invoices]
  );
  const highlightedInvoiceIndex = useMemo(
    () => invoices.findIndex((invoice) => invoice.id === highlightedInvoiceId),
    [highlightedInvoiceId, invoices]
  );

  const stats = useMemo(() => {
    const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid').reduce((sum, invoice) => sum + invoice.amountUsd, 0);
    const outstanding = invoices.filter((invoice) => invoice.status !== 'paid').reduce((sum, invoice) => sum + invoice.amountUsd, 0);
    const activeLinks = paymentLinks.filter((link) => link.status === 'active').length;

    return { paidInvoices, outstanding, activeLinks };
  }, [invoices, paymentLinks]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payments"
        title="Invoices, payment links, and billing ops"
        description="Collect stablecoins or bank payments through one workflow, with AI assisting creation instead of replacing the review step."
        actions={
          <div className="inline-flex rounded-[15px] border border-[#e9eaeb] bg-white p-1 shadow-xs">
            <button
              className={`rounded-[15px] px-5 py-2.5 text-sm font-semibold ${focus === 'collect' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              onClick={() => setFocus('collect')}
              type="button"
            >
              Collect
            </button>
            <button
              className={`rounded-[15px] px-5 py-2.5 text-sm font-semibold ${focus === 'drafts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              onClick={() => setFocus('drafts')}
              type="button"
            >
              Drafts
            </button>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <PaymentStatCard icon={<Cards className="h-5 w-5 text-[#72706b]" weight="bold" />} label="Outstanding invoices" value={formatCompactCurrency(stats.outstanding, currency)} detail="Still awaiting payment" />
        <PaymentStatCard icon={<Wallet className="h-5 w-5 text-[#72706b]" weight="bold" />} label="Paid invoice volume" value={formatCompactCurrency(stats.paidInvoices, currency)} detail="Captured through invoice flows" />
        <PaymentStatCard icon={<CreditCard className="h-5 w-5 text-[#72706b]" weight="bold" />} label="Active payment links" value={`${stats.activeLinks}`} detail="Ready to share with clients" />
        <PaymentStatCard icon={<Sparkle className="h-5 w-5 text-[#72706b]" weight="bold" />} label="AI billing assist" value={focus === 'collect' ? 'Live' : 'Draft mode'} detail="Prompt-based creation in workflow" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <PromptComposer onDraft={({ invoiceDraft, paymentLinkDraft }) => {
          setInvoiceDraft(invoiceDraft ?? null);
          setPaymentLinkDraft(paymentLinkDraft ?? null);
        }} />
        <DraftPreview invoiceDraft={invoiceDraft} paymentLinkDraft={paymentLinkDraft} />
      </div>

      {highlightedInvoice ? (
        <div className="flex items-start gap-3 rounded-[15px] border border-[#d5d7da] bg-[#fcfcfd] px-4 py-3 text-[#414651] shadow-soft">
          <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[#72706b]" weight="bold" />
          <div>
            <p className="text-sm font-semibold text-foreground">Opened from calendar</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Invoice <span className="font-medium text-foreground">{highlightedInvoice.number}</span> is due on{' '}
              <span className="font-medium text-foreground">{formatShortDate(highlightedInvoice.dueAt)}</span>.
            </p>
          </div>
        </div>
      ) : null}

      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payment-links">Payment links</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <EntityTable
            highlightedRowIndex={highlightedInvoiceIndex >= 0 ? highlightedInvoiceIndex : null}
            title="Invoice pipeline"
            columns={['Number', 'Status', 'Amount', 'Due']}
            rows={invoices.map((invoice) => [
              { value: invoice.number },
              { value: invoice.status, badge: true, tone: invoice.status === 'paid' ? 'success' : invoice.status === 'overdue' ? 'warning' : 'neutral' },
              { value: formatCompactCurrency(invoice.amountUsd, currency) },
              { value: formatShortDate(invoice.dueAt) }
            ])}
          />
        </TabsContent>
        <TabsContent value="payment-links">
          <EntityTable
            title="Payment link inventory"
            columns={['Title', 'Status', 'Amount', 'Settlement asset']}
            rows={paymentLinks.map((link) => [
              { value: link.title },
              { value: link.status, badge: true, tone: link.status === 'paid' ? 'success' : 'neutral' },
              { value: formatCompactCurrency(link.amountUsd, currency) },
              { value: `${link.chain} • ${link.asset}` }
            ])}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PaymentStatCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[15px] border border-[#e9eaeb] bg-white p-4 shadow-xs">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="mt-2.5 text-[1.28rem] font-semibold tracking-[-0.03em] text-foreground">{value}</div>
      <p className="mt-1.5 text-[0.88rem] text-muted-foreground">{detail}</p>
    </div>
  );
}
