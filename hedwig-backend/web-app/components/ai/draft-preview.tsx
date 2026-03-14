import type { InvoiceDraft, PaymentLinkDraft } from '@/lib/models/entities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatShortDate } from '@/lib/utils';

interface DraftPreviewProps {
  invoiceDraft?: InvoiceDraft | null;
  paymentLinkDraft?: PaymentLinkDraft | null;
}

export function DraftPreview({ invoiceDraft, paymentLinkDraft }: DraftPreviewProps) {
  if (!invoiceDraft && !paymentLinkDraft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Draft preview</CardTitle>
          <CardDescription>Prompt-generated billing drafts appear here before confirmation.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-[15px] border border-dashed border-border bg-secondary/40 p-8 text-sm leading-6 text-muted-foreground">
            Start with a prompt like “Invoice Northstar Labs $2,100 for March milestone due next Friday.”
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>{invoiceDraft ? 'Invoice draft' : 'Payment link draft'}</CardTitle>
            <CardDescription>Preview, edit, and confirm before calling the shared Hedwig backend.</CardDescription>
          </div>
          <Badge variant="default">AI draft</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {invoiceDraft ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Stat label="Client" value={invoiceDraft.clientName} />
              <Stat label="Amount" value={formatCurrency(invoiceDraft.amountUsd)} />
              <Stat label="Due" value={formatShortDate(invoiceDraft.dueAt)} />
            </div>
            <div className="space-y-3 rounded-[15px] border border-[#e9eaeb] bg-[#fcfcfd] p-4">
              {invoiceDraft.lineItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-semibold text-foreground">{formatCurrency(item.amountUsd)}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {paymentLinkDraft ? (
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Title" value={paymentLinkDraft.title} />
            <Stat label="Amount" value={formatCurrency(paymentLinkDraft.amountUsd)} />
            <Stat label="Asset" value={paymentLinkDraft.asset} />
            <Stat label="Chain" value={paymentLinkDraft.chain} />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button>Edit draft</Button>
          <Button variant="secondary">Confirm and continue</Button>
          <Button variant="ghost">Discard</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[15px] border border-[#e9eaeb] bg-[#fcfcfd] p-4 shadow-xs">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#717680]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
