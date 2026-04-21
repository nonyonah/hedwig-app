'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle,
  FileText,
  FolderSimple,
  Receipt,
  Sparkle,
  Trash,
  UploadSimple,
  User,
  WarningCircle,
  X,
} from '@/components/ui/lucide-icons';
import type { ExternalDocument } from '@/lib/types/email-intelligence';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedDocument {
  documentType?: string;
  invoiceNumber?: string;
  issuer?: string;
  recipient?: string;
  amount?: number;
  currency?: string;
  issueDate?: string;
  dueDate?: string;
  lineItems?: { description: string; quantity?: number; unitPrice?: number; total?: number }[];
  confidence?: number;
}

interface DocumentSuggestion {
  id: string;
  entityType: string;
  suggestedName: string;
  confidenceScore: number;
  reason: string;
  approvalStatus: string;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 transition ${
        isDragging ? 'border-[#2563eb] bg-[#eff4ff]' : 'border-[#e9eaeb] bg-[#f9fafb] hover:border-[#c8cdd5] hover:bg-white'
      }`}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
        <UploadSimple className="h-5 w-5 text-[#717680]" />
      </span>
      <div className="text-center">
        <p className="text-[13px] font-semibold text-[#181d27]">Drop your invoice here</p>
        <p className="mt-0.5 text-[12px] text-[#a4a7ae]">PDF, PNG, JPG — up to 10 MB</p>
      </div>
      <span className="rounded-full border border-[#e9eaeb] bg-white px-4 py-1.5 text-[12px] font-semibold text-[#414651] shadow-xs">
        Browse files
      </span>
      <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

function LineItemsTable({ items = [] }: { items?: ParsedDocument['lineItems'] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e9eaeb]">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[#f2f4f7] bg-[#f9fafb]">
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Description</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Qty</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Unit price</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f9fafb]">
          {items.map((item, i) => (
            <tr key={i} className="bg-white">
              <td className="px-3 py-2.5 text-[#181d27]">{item.description}</td>
              <td className="px-3 py-2.5 text-right text-[#717680]">{item.quantity}</td>
              <td className="px-3 py-2.5 text-right text-[#717680]">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.unitPrice ?? 0)}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-[#181d27]">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.total ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  approved,
  rejected,
  onApprove,
  onReject,
}: {
  suggestion: DocumentSuggestion;
  approved: boolean;
  rejected: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const entityIcons: Record<string, React.FC<any>> = {
    client: User,
    project: FolderSimple,
    invoice: Receipt,
  };
  const Icon = entityIcons[suggestion.entityType] ?? User;
  const score = suggestion.confidenceScore;
  const confidenceColor = score >= 0.8 ? '#12b76a' : score >= 0.6 ? '#f79009' : '#f04438';
  const pct = Math.round(score * 100);

  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        approved
          ? 'border-[#abefc6] bg-[#f6fef9]'
          : rejected
          ? 'border-[#e9eaeb] bg-[#f9fafb] opacity-50'
          : 'border-[#e9eaeb] bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7]">
            <Icon className="h-4 w-4 text-[#717680]" />
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
                New {suggestion.entityType}
              </p>
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={{ color: confidenceColor, background: `${confidenceColor}18` }}
              >
                {pct}% match
              </span>
            </div>
            <p className="text-[13px] font-semibold text-[#181d27]">{suggestion.suggestedName}</p>
          </div>
        </div>

        {!rejected && (
          <div className="flex shrink-0 gap-1.5">
            {approved ? (
              <span className="flex items-center gap-1 rounded-full bg-[#ecfdf3] px-2.5 py-1 text-[11px] font-semibold text-[#027a48]">
                <Check className="h-3 w-3" /> Approved
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onApprove}
                  className="rounded-full bg-[#2563eb] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#1d4ed8]"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={onReject}
                  className="rounded-full border border-[#e9eaeb] bg-white px-3 py-1 text-[11px] font-semibold text-[#414651] hover:bg-[#f9fafb]"
                >
                  Skip
                </button>
              </>
            )}
          </div>
        )}
        {rejected && (
          <button type="button" onClick={onApprove} className="text-[11px] font-medium text-[#2563eb] hover:text-[#1d4ed8]">
            Undo
          </button>
        )}
      </div>

      <p className="mt-2.5 text-[12px] leading-relaxed text-[#717680]">{suggestion.reason}</p>
    </div>
  );
}

// ─── Main Modal ────────────────────────────────────────────────────────────────

type Step = 'upload' | 'review' | 'confirm';

export function ImportInvoiceModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (invoice: ExternalDocument) => void;
}) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedDocument | null>(null);
  const [suggestions, setSuggestions] = useState<DocumentSuggestion[]>([]);
  const [approvals, setApprovals] = useState<Record<string, 'approved' | 'rejected' | 'pending'>>({});
  const [isImporting, setIsImporting] = useState(false);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setIsExtracting(true);
    setExtractError(null);

    try {
      const form = new FormData();
      form.append('file', f);
      const resp = await fetch('/api/integrations/analyze-document', { method: 'POST', body: form });
      const json = await resp.json().catch(() => ({ success: false }));

      if (!json.success) {
        setExtractError(json.error ?? 'Could not extract data from this document.');
        setIsExtracting(false);
        return;
      }

      setParsed(json.data.parsed ?? {});
      setSuggestions(json.data.suggestions ?? []);
      setApprovals({});
      setStep('review');
    } catch {
      setExtractError('Network error — could not reach the extraction service.');
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const handleApprove = (id: string) =>
    setApprovals((prev) => ({ ...prev, [id]: prev[id] === 'approved' ? 'pending' : 'approved' }));
  const handleReject = (id: string) =>
    setApprovals((prev) => ({ ...prev, [id]: prev[id] === 'rejected' ? 'pending' : 'rejected' }));

  const handleImport = () => {
    setIsImporting(true);
    const result: ExternalDocument = {
      id: `doc_${Date.now()}`,
      userId: 'user_self',
      filename: file?.name ?? 'invoice.pdf',
      contentType: file?.type ?? 'application/pdf',
      sizeBytes: file?.size ?? 0,
      documentType: (parsed?.documentType as any) ?? 'invoice',
      source: 'manual_upload',
      status: 'imported',
      parsedData: parsed ? {
        invoiceNumber: parsed.invoiceNumber,
        issuer:        parsed.issuer,
        recipient:     parsed.recipient,
        amount:        parsed.amount,
        currency:      parsed.currency,
        issueDate:     parsed.issueDate,
        dueDate:       parsed.dueDate,
        lineItems:     parsed.lineItems,
        confidence:    parsed.confidence ?? 0,
        extractedAt:   new Date().toISOString(),
      } : undefined,
      createdAt: new Date().toISOString(),
    };
    setIsImporting(false);
    onImported(result);
  };

  const approvedCount = Object.values(approvals).filter((v) => v === 'approved').length;
  const pendingSuggestions = suggestions.filter((s) => (approvals[s.id] ?? 'pending') === 'pending');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f2f4f7] px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkle className="h-4 w-4 text-[#2563eb]" />
            <p className="text-[14px] font-semibold text-[#181d27]">Import Invoice</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-[#f2f4f7]"
          >
            <X className="h-4 w-4 text-[#717680]" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 border-b border-[#f2f4f7] px-6 py-3">
          {(['upload', 'review', 'confirm'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center">
              {i > 0 && <div className="mx-2 h-px w-6 bg-[#e9eaeb]" />}
              <div className="flex items-center gap-1.5">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    step === s
                      ? 'bg-[#2563eb] text-white'
                      : ['review', 'confirm'].indexOf(step) > ['review', 'confirm'].indexOf(s)
                      ? 'bg-[#12b76a] text-white'
                      : 'bg-[#f2f4f7] text-[#a4a7ae]'
                  }`}
                >
                  {['review', 'confirm'].indexOf(step) > ['review', 'confirm'].indexOf(s) ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={`text-[11px] font-semibold capitalize ${
                    step === s ? 'text-[#181d27]' : 'text-[#a4a7ae]'
                  }`}
                >
                  {s === 'upload' ? 'Upload' : s === 'review' ? 'Review data' : 'Suggestions'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <div className="p-6 space-y-4">
              {!isExtracting ? (
                <>
                  <UploadZone onFile={handleFile} />
                  {extractError && (
                    <div className="flex items-start gap-2 rounded-xl border border-[#fecdd3] bg-[#fff1f2] px-3 py-2.5">
                      <WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f04438]" />
                      <p className="text-[12px] text-[#b42318]">{extractError}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-4 py-12">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eff4ff]">
                    <Sparkle className="h-6 w-6 text-[#2563eb] animate-pulse" />
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-[#181d27]">Extracting invoice data…</p>
                    <p className="mt-0.5 text-[12px] text-[#a4a7ae]">Hedwig is reading {file?.name}</p>
                  </div>
                  <div className="h-1 w-48 overflow-hidden rounded-full bg-[#f2f4f7]">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-[#2563eb]" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Review extracted data ── */}
          {step === 'review' && parsed && (
            <div className="space-y-5 p-6">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[#12b76a]" />
                <p className="text-[13px] font-semibold text-[#181d27]">Data extracted successfully</p>
                {parsed.confidence !== undefined && (
                  <span className="ml-auto rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[10px] font-semibold text-[#027a48]">
                    {Math.round(parsed.confidence * 100)}% confidence
                  </span>
                )}
              </div>

              {/* Key fields grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  parsed.invoiceNumber ? { label: 'Invoice #', value: parsed.invoiceNumber } : null,
                  parsed.issuer       ? { label: 'Issuer',    value: parsed.issuer }       : null,
                  parsed.amount       ? { label: 'Amount',    value: new Intl.NumberFormat('en-US', { style: 'currency', currency: parsed.currency ?? 'USD', maximumFractionDigits: 0 }).format(parsed.amount) } : null,
                  parsed.dueDate      ? { label: 'Due date',  value: new Date(parsed.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } : null,
                ].filter(Boolean).map((item) => (
                  <div key={item!.label} className="rounded-xl bg-[#f9fafb] px-3 py-2.5">
                    <p className="text-[10px] font-medium text-[#a4a7ae]">{item!.label}</p>
                    <p className="mt-0.5 text-[12px] font-semibold text-[#181d27]">{item!.value}</p>
                  </div>
                ))}
              </div>

              {/* Line items */}
              {parsed.lineItems && parsed.lineItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Line items</p>
                  <LineItemsTable items={parsed.lineItems} />
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-[#eff4ff] px-3 py-2.5">
                  <Sparkle className="h-3.5 w-3.5 shrink-0 text-[#2563eb]" />
                  <p className="text-[12px] text-[#2563eb]">
                    We found {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} for linking this invoice. Review them in the next step.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Suggestions ── */}
          {step === 'confirm' && (
            <div className="space-y-4 p-6">
              <div className="flex items-start gap-2 rounded-xl border border-[#e9eaeb] bg-[#fafafa] px-3 py-3">
                <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#f79009]" />
                <p className="text-[12px] leading-relaxed text-[#414651]">
                  <strong>You decide what gets created.</strong> We found these potential records to link your invoice to. Approve only what you want — nothing is created without your confirmation.
                </p>
              </div>

              <div className="space-y-3">
                {suggestions.length === 0 ? (
                  <p className="py-4 text-center text-[12px] text-[#a4a7ae]">No suggestions — the document is ready to import.</p>
                ) : suggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s as any}
                    approved={(approvals[s.id] ?? 'pending') === 'approved'}
                    rejected={(approvals[s.id] ?? 'pending') === 'rejected'}
                    onApprove={() => handleApprove(s.id)}
                    onReject={() => handleReject(s.id)}
                  />
                ))}
              </div>

              {pendingSuggestions.length > 0 && (
                <p className="text-center text-[11px] text-[#a4a7ae]">
                  {pendingSuggestions.length} suggestion{pendingSuggestions.length !== 1 ? 's' : ''} still pending — approve or skip to continue.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#f2f4f7] px-6 py-4">
          {step === 'review' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setFile(null); setParsed(null); setSuggestions([]); setStep('upload'); }}
                className="flex items-center justify-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-4 py-2 text-[12px] font-semibold text-[#414651] transition hover:bg-[#f9fafb]"
              >
                <Trash className="h-3.5 w-3.5" />
                Replace
              </button>
              {suggestions.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep('confirm')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#2563eb] py-2 text-[12px] font-semibold text-white transition hover:bg-[#1d4ed8]"
                >
                  Review suggestions
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isImporting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#2563eb] py-2 text-[12px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  Import invoice
                </button>
              )}
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-2">
              {approvedCount > 0 && (
                <p className="text-center text-[11px] text-[#717680]">
                  {approvedCount} record{approvedCount !== 1 ? 's' : ''} will be created when you import.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('review')}
                  className="flex items-center justify-center rounded-full border border-[#e9eaeb] bg-white px-4 py-2 text-[12px] font-semibold text-[#414651] transition hover:bg-[#f9fafb]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isImporting || pendingSuggestions.length > 0}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#2563eb] py-2 text-[12px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Importing…
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Import invoice
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
