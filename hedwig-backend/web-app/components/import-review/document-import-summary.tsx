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
 <div className="rounded-[28px] border border-[var(--color-border)] bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.08),_transparent_45%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-sm">
 <div className="flex items-start justify-between gap-4">
 <div className="flex items-start gap-3">
 <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-surface)] shadow-xs ring-1 ring-[var(--color-border)]">
 <Receipt className="h-5 w-5 text-[var(--color-accent)]" />
 </span>
 <div>
 <p className="text-[11px] font-semibold text-[var(--color-text-placeholder)]">Imported document</p>
 <h3 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[var(--color-foreground)]">{document.filename}</h3>
 <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">
 Detected as invoice · {(document.size_bytes / 1024 / 1024).toFixed(1)} MB
 </p>
 </div>
 </div>
 <span className="inline-flex items-center rounded-full bg-[var(--color-surface)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] ring-1 ring-[var(--color-border)]">
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

 <div className="mt-4 rounded-2xl bg-[var(--color-surface)]/80 px-4 py-3 ring-1 ring-[var(--color-surface-tertiary)]">
 <div className="flex items-center gap-2">
 <FileText className="h-4 w-4 text-[var(--color-text-tertiary)]" />
 <p className="text-[12px] font-semibold text-[var(--color-foreground)]">Extracted summary</p>
 </div>
 <p className="mt-2 text-[12px] leading-5 text-[var(--color-text-muted)]">
 {extractedInvoice?.notes || 'Invoice details, line items, dates, and counterparties are ready for review.'}
 </p>
 </div>
 </div>
 );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
 return (
 <div className="rounded-2xl bg-[var(--color-surface)]/90 px-4 py-3 ring-1 ring-[var(--color-surface-tertiary)]">
 <p className="text-[10px] font-semibold text-[var(--color-text-placeholder)]">{label}</p>
 <p className="mt-1 text-[13px] font-semibold text-[var(--color-foreground)]">{value}</p>
 </div>
 );
}
