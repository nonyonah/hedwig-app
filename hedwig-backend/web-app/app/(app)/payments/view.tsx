'use client';

import { useState } from 'react';
import type { InvoiceDraft, PaymentLinkDraft, Invoice, PaymentLink } from '@/lib/models/entities';
import { DraftPreview } from '@/components/ai/draft-preview';
import { PromptComposer } from '@/components/ai/prompt-composer';
import { EntityTable } from '@/components/data/entity-table';
import { PageHeader } from '@/components/data/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCompactCurrency, formatShortDate } from '@/lib/utils';

export function PaymentsClient({ invoices, paymentLinks }: { invoices: Invoice[]; paymentLinks: PaymentLink[] }) {
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft | null>(null);
  const [paymentLinkDraft, setPaymentLinkDraft] = useState<PaymentLinkDraft | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payments"
        title="Invoices, payment links, and AI billing actions"
        description="Collect stablecoins or bank payments through the same workflow, with AI drafting built directly into operations."
      />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <PromptComposer onDraft={({ invoiceDraft, paymentLinkDraft }) => {
          setInvoiceDraft(invoiceDraft ?? null);
          setPaymentLinkDraft(paymentLinkDraft ?? null);
        }} />
        <DraftPreview invoiceDraft={invoiceDraft} paymentLinkDraft={paymentLinkDraft} />
      </div>
      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payment-links">Payment links</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <EntityTable
            title="Invoice pipeline"
            columns={['Number', 'Status', 'Amount', 'Due']}
            rows={invoices.map((invoice) => [
              { value: invoice.number },
              { value: invoice.status, badge: true, tone: invoice.status === 'paid' ? 'success' : invoice.status === 'overdue' ? 'warning' : 'neutral' },
              { value: formatCompactCurrency(invoice.amountUsd) },
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
              { value: formatCompactCurrency(link.amountUsd) },
              { value: `${link.chain} • ${link.asset}` }
            ])}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
