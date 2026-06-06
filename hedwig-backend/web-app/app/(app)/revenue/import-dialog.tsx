'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast-provider';
import { useCurrency } from '@/components/providers/currency-provider';
import { hedwigApi } from '@/lib/api/client';
import { ArrowsDownUp, UploadSimple, SpinnerGap } from '@/components/ui/lucide-icons';
import type { ExpenseCategory } from '@/lib/types/revenue';

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'software', label: 'Software' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'travel', label: 'Travel' },
  { value: 'operations', label: 'Operations' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'other', label: 'Other' },
];

type Step = 'upload' | 'analyzing' | 'preview';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  accessToken: string | null;
}

export function ImportDialog({ open, onClose, onImported, accessToken }: ImportDialogProps) {
  const { toast } = useToast();
  const { currency, options: currencyOptions, formatNative } = useCurrency();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [analysis, setAnalysis] = useState<Record<string, any> | null>(null);

  // Editable fields shown in preview
  const [entryType, setEntryType] = useState<'expense' | 'credit'>('expense');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editCategory, setEditCategory] = useState<ExpenseCategory>('other');
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setAnalysis(null);
    setEntryType('expense');
    setEditAmount('');
    setEditCurrency('USD');
    setEditCategory('other');
    setEditTitle('');
    setEditDate('');
    setEditNote('');
    setIsSubmitting(false);
    setDragOver(false);
  }, []);

  const handleClose = () => {
    if (isSubmitting) return;
    reset();
    onClose();
  };

  const handleFileSelect = (f: File) => {
    const supported = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!supported.includes(f.type)) {
      toast({ type: 'error', title: 'Unsupported file', message: 'Please upload a PDF, PNG, JPG, or WebP file.' });
      return;
    }
    setFile(f);
    analyzeFile(f);
  };

  const analyzeFile = async (f: File) => {
    setStep('analyzing');
    try {
      const d = await hedwigApi.analyzeImportDocument(f, { accessToken: accessToken ?? undefined });
      setAnalysis(d);

      // Pre-fill editable fields
      const suggestedType = d.suggestedEntryType === 'expense' ? 'expense' : 'credit';
      setEntryType(suggestedType);
      setEditAmount(d.amount ? String(d.amount) : '');
      setEditCurrency(String(d.currency || 'USD'));
      setEditCategory((d.category as any) || 'other');
      setEditTitle(String(d.suggestedTitle || d.summary || 'Imported document'));
      setEditDate(String(d.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
      setEditNote(String(d.notes || d.summary || ''));

      setStep('preview');
    } catch (err: any) {
      toast({ type: 'error', title: 'Analysis failed', message: err?.message || 'Network error. Please try again.' });
      setStep('upload');
      setFile(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleConfirm = async () => {
    if (!analysis) return;
    const amt = parseFloat(editAmount.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ type: 'error', title: 'Invalid amount', message: 'Enter a valid amount greater than 0.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await hedwigApi.confirmImportDocument({
        entryType,
        amount: amt,
        currency: editCurrency,
        category: entryType === 'expense' ? editCategory : undefined,
        title: entryType === 'credit' ? editTitle : undefined,
        suggestedTitle: analysis.suggestedTitle,
        date: editDate,
        note: editNote,
        classification: analysis.classification,
        issuer: analysis.issuer,
        issuerEmail: analysis.issuerEmail,
      }, { accessToken: accessToken ?? undefined });

      toast({
        type: 'success',
        title: entryType === 'expense' ? 'Expense recorded' : 'Credit recorded',
        message: `${formatNative(amt, editCurrency)} ${entryType === 'expense' ? 'expense' : 'earning'} saved.`,
      });
      reset();
      onImported();
    } catch (err: any) {
      toast({ type: 'error', title: 'Import failed', message: err?.message || 'Network error.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls =
    'w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-accent-soft)]';
  const labelCls = 'mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]';

  const selectedCurrency = currencyOptions.find((opt) => opt.code === editCurrency)
    ?? { code: editCurrency, label: editCurrency, symbol: editCurrency };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Import document</DialogTitle>
          <DialogDescription>
            Upload an invoice, receipt, bank statement, or any financial document. Hedwig will classify and import it automatically.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {step === 'upload' && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition ${
                dragOver ? 'border-[var(--color-primary)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-primary)]'
              }`}
            >
              <UploadSimple className="h-10 w-10 text-[var(--color-text-muted)]" weight="light" />
              <div className="text-center">
                <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Drop a file here or click to browse</p>
                <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">PDF, PNG, JPG, WebP (max 10 MB)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                  e.target.value = '';
                }}
              />
            </div>
          )}

          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <SpinnerGap className="h-8 w-8 animate-spin text-[var(--color-primary)]" weight="bold" />
              <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Analyzing document…</p>
              <p className="text-[12px] text-[var(--color-text-muted)]">Hedwig is reading your {file?.name}</p>
            </div>
          )}

          {step === 'preview' && analysis && (
            <div className="space-y-4">
              {/* Classification badge + type toggle */}
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${
                  entryType === 'expense'
                    ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                    : 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                }`}>
                  <ArrowsDownUp className="h-3.5 w-3.5" weight="bold" />
                  {entryType === 'expense' ? 'Expense' : 'Earning'}
                </span>

                <button
                  type="button"
                  onClick={() => setEntryType(entryType === 'expense' ? 'credit' : 'expense')}
                  className="text-[12px] font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] transition"
                >
                  Change to {entryType === 'expense' ? 'earning' : 'expense'}
                </button>

                {analysis.confidence && (
                  <span className="ml-auto text-[11px] text-[var(--color-text-muted)]">
                    Confidence: {Math.round(analysis.confidence * 100)}%
                  </span>
                )}
              </div>

              {analysis.summary && (
                <p className="rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2 text-[12px] text-[var(--color-text-secondary)] leading-relaxed">
                  {analysis.summary}
                </p>
              )}

              {/* Editable fields */}
              <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-3">
                <div>
                  <label className={labelCls}>Amount</label>
                  <div className="flex items-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs transition focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-accent-soft)]">
                    <span className="flex h-full items-center border-r border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-muted)]">
                      {selectedCurrency.symbol}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13px] font-semibold text-[var(--color-foreground)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Currency</label>
                  <select value={editCurrency} onChange={(e) => setEditCurrency(e.target.value)} className={inputCls}>
                    {currencyOptions.map((opt) => (
                      <option key={opt.code} value={opt.code}>{opt.code} - {opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {entryType === 'expense' ? (
                  <div>
                    <label className={labelCls}>Category</label>
                    <select value={editCategory} onChange={(e) => setEditCategory(e.target.value as ExpenseCategory)} className={inputCls}>
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className={labelCls}>Title</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Date</label>
                  <input
                    type="date"
                    value={editDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setEditDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Note <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder={entryType === 'expense' ? 'What was this for?' : 'Where did this come from?'}
                  className={inputCls}
                />
              </div>

              {/* Re-upload link */}
              <button
                type="button"
                onClick={() => { setStep('upload'); setFile(null); setAnalysis(null); }}
                className="text-[12px] font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition"
              >
                Upload a different file
              </button>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          {step === 'preview' && (
            <Button onClick={handleConfirm} disabled={isSubmitting || !editAmount}>
              {isSubmitting ? 'Importing…' : `Import ${entryType === 'expense' ? 'expense' : 'earning'}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
