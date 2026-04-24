'use client';

import { FileText, Receipt } from '@/components/ui/lucide-icons';
import type { ExtractedInvoiceData, ImportedDocument } from '@/lib/types/import-review';

const formatAmount = (amount?: number, currency?: string) => {
  if (!amount) return 'Not detected';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
};

export function DocumentImportSummary({
  document,
  extractedInvoice,
}: {
  document: ImportedDocument;
  extractedInvoice?: ExtractedInvoiceData;
}) {
  return (
    <div className="rounded-[28px] border border-[#e9eaeb] bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.08),_transparent_45%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
            <Receipt className="h-5 w-5 text-[#2563eb]" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#98a2b3]">Imported document</p>
            <h3 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#181d27]">{document.filename}</h3>
            <p className="mt-1 text-[12px] text-[#717680]">
              Detected as invoice · {(document.size_bytes / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#344054] ring-1 ring-[#e9eaeb]">
          User approval required
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <>
          <SummaryCell label="Issuer" value={extractedInvoice?.issuer_name || 'Not detected'} />
          <SummaryCell label="Invoice number" value={extractedInvoice?.invoice_number || 'Not detected'} />
          <SummaryCell label="Amount" value={formatAmount(extractedInvoice?.amount_total, extractedInvoice?.currency)} />
          <SummaryCell label="Due date" value={extractedInvoice?.due_date || 'Not detected'} />
        </>
      </div>

      <div className="mt-4 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-[#f2f4f7]">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#717680]" />
          <p className="text-[12px] font-semibold text-[#181d27]">Extracted summary</p>
        </div>
        <p className="mt-2 text-[12px] leading-5 text-[#667085]">
          {extractedInvoice?.notes || 'Invoice details, line items, dates, and counterparties are ready for review.'}
        </p>
      </div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/90 px-4 py-3 ring-1 ring-[#f2f4f7]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#98a2b3]">{label}</p>
      <p className="mt-1 text-[13px] font-semibold text-[#181d27]">{value}</p>
    </div>
  );
}
