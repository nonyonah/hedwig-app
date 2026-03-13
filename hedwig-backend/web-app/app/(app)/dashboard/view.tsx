'use client';

import { useState } from 'react';
import type { InvoiceDraft, PaymentLinkDraft } from '@/lib/models/entities';
import { PromptComposer } from '@/components/ai/prompt-composer';
import { DraftPreview } from '@/components/ai/draft-preview';

export function DashboardClient({ children }: { children: React.ReactNode }) {
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft | null>(null);
  const [paymentLinkDraft, setPaymentLinkDraft] = useState<PaymentLinkDraft | null>(null);

  return (
    <div className="space-y-6">
      {children}
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <PromptComposer
          onDraft={({ invoiceDraft, paymentLinkDraft }) => {
            setInvoiceDraft(invoiceDraft ?? null);
            setPaymentLinkDraft(paymentLinkDraft ?? null);
          }}
        />
        <DraftPreview invoiceDraft={invoiceDraft} paymentLinkDraft={paymentLinkDraft} />
      </div>
    </div>
  );
}
