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
import { hedwigApi } from '@/lib/api/client';
import { UploadSimple, SpinnerGap, CheckCircle, WarningCircle, Bank, FileText } from '@/components/ui/lucide-icons';
import { useCurrency } from '@/components/providers/currency-provider';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

type Step = 'upload' | 'parsing' | 'review' | 'confirming' | 'done';

interface ParsedTransaction {
  transactionDate: string;
  description: string;
  originalDescription: string;
  amount: number;
  currency: string;
  type: 'debit' | 'credit';
  runningBalance: number | null;
  reference: string | null;
  bankName: string | null;
}

interface StatementData {
  bankName: string | null;
  accountNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  currency: string;
  transactionCount: number;
  transactions: ParsedTransaction[];
  aiSuggestions: Record<string, any> | null;
}

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  accessToken: string | null;
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'Auto-detect' },
  { value: 'software', label: 'Software' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'travel', label: 'Travel' },
  { value: 'operations', label: 'Operations' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'other', label: 'Other' },
];

export function StatementImportDialog({ open, onClose, onImported, accessToken }: ImportDialogProps) {
  const { toast } = useToast();
  const { formatNative } = useCurrency();
  const { activeWorkspace } = useWorkspaceContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [data, setData] = useState<StatementData | null>(null);
  const [editCategories, setEditCategories] = useState<Record<number, string>>({});
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setData(null);
    setEditCategories({});
    setSkippedRows(new Set());
    setIsSubmitting(false);
    setDragOver(false);
  }, []);

  const handleClose = () => {
    if (isSubmitting) return;
    reset();
    onClose();
  };

  const handleFileSelect = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext || !['csv', 'ofx', 'qfx'].includes(ext)) {
      toast({ type: 'error', title: 'Unsupported file', message: 'Please upload a CSV, OFX, or QFX file.' });
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast({ type: 'error', title: 'File too large', message: 'Maximum file size is 20 MB.' });
      return;
    }
    setFile(f);
    parseFile(f);
  };

  const parseFile = async (f: File) => {
    setStep('parsing');
    try {
      const result = await hedwigApi.importStatementParse(f, { accessToken: accessToken ?? undefined }) as unknown as StatementData;
      setData(result);
      setEditCategories({});
      setSkippedRows(new Set());
      setStep('review');
    } catch (err: any) {
      toast({ type: 'error', title: 'Parse failed', message: err?.message || 'Could not parse this file.' });
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

  const toggleSkip = (idx: number) => {
    const next = new Set(skippedRows);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSkippedRows(next);
  };

  const setCategory = (idx: number, cat: string) => {
    setEditCategories((prev) => ({ ...prev, [idx]: cat }));
  };

  const handleConfirm = async () => {
    if (!data || !accessToken) return;

    const txnRows = data.transactions.map((txn, idx) => ({
      id: `idx_${idx}`,
      type: txn.type,
      amount: txn.amount,
      currency: txn.currency,
      category: editCategories[idx] || undefined,
      description: txn.description,
      transactionDate: txn.transactionDate,
      matchedClientId: null,
      matchedProjectId: null,
      status: skippedRows.has(idx) ? 'skipped' : 'confirmed',
    }));

    const confirmedCount = txnRows.filter((t) => t.status === 'confirmed').length;
    if (confirmedCount === 0) {
      toast({ type: 'error', title: 'Nothing to import', message: 'All transactions are skipped.' });
      return;
    }

    const statementId = `stm_${Date.now()}_${activeWorkspace?.id || 'personal'}`;

    setIsSubmitting(true);
    setStep('confirming');
    try {
      await hedwigApi.importStatementConfirm({ statementId, transactions: txnRows }, { accessToken });
      setStep('done');
      toast({
        type: 'success',
        title: 'Import complete',
        message: `${confirmedCount} transaction${confirmedCount !== 1 ? 's' : ''} imported.`,
      });
    } catch (err: any) {
      toast({ type: 'error', title: 'Import failed', message: err?.message || 'Network error.' });
      setIsSubmitting(false);
    }
  };

  const acceptedFormats = '.csv,.ofx,.qfx';

  const formatCurrency = (amount: number, currency: string) => {
    try {
      return formatNative(amount, currency);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()} size="2xl">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import bank statement</DialogTitle>
          <DialogDescription>
            Upload a CSV, OFX, or QFX bank statement. Hedwig will parse transactions and help you categorize them.
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
              <Bank className="h-10 w-10 text-[var(--color-text-muted)]" weight="light" />
              <div className="text-center">
                <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Drop a bank statement here or click to browse</p>
                <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">CSV, OFX, QFX (max 20 MB)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptedFormats}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                  e.target.value = '';
                }}
              />
            </div>
          )}

          {step === 'parsing' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <SpinnerGap className="h-8 w-8 animate-spin text-[var(--color-primary)]" weight="bold" />
              <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Parsing statement…</p>
              <p className="text-[12px] text-[var(--color-text-muted)]">Reading {file?.name}</p>
            </div>
          )}

          {step === 'review' && data && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-4 py-3">
                <FileText className="h-5 w-5 text-[var(--color-accent)]" weight="fill" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">
                    {data.bankName || 'Bank statement'}
                    {data.accountNumber ? ` · ${data.accountNumber}` : ''}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)]">
                    {data.transactionCount} transactions
                    {data.startDate && data.endDate ? ` · ${data.startDate} to ${data.endDate}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)]">
                  {data.currency}
                </span>
              </div>

              {data.aiSuggestions && (
                <div className="rounded-xl border border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <WarningCircle className="h-4 w-4 text-[var(--color-accent)]" weight="fill" />
                    <p className="text-[12px] font-semibold text-[var(--color-accent)]">AI Analysis</p>
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--color-text-secondary)] leading-relaxed">
                    {data.aiSuggestions.summary || 'Statement analyzed.'}
                  </p>
                  {data.aiSuggestions.largestTransactions?.length > 0 && (
                    <div className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">
                      Largest: {data.aiSuggestions.largestTransactions.join(', ')}
                    </div>
                  )}
                </div>
              )}

              <div className="max-h-[360px] overflow-auto rounded-xl border border-[var(--color-border)]">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-[var(--color-surface)]">
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="w-8 px-3 py-2" />
                      <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Date</th>
                      <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Description</th>
                      <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Amount</th>
                      <th className="w-32 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-surface-secondary)]">
                    {data.transactions.map((txn, idx) => (
                      <tr key={idx} className={`transition-colors ${skippedRows.has(idx) ? 'opacity-40' : 'hover:bg-[var(--color-background)]'}`}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!skippedRows.has(idx)}
                            onChange={() => toggleSkip(idx)}
                            className="h-3.5 w-3.5 rounded border-[var(--color-border-input)] accent-[var(--color-primary)]"
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-[var(--color-foreground)]">{txn.transactionDate}</td>
                        <td className="max-w-[200px] truncate px-2 py-2 text-[var(--color-foreground)]" title={txn.description}>
                          {txn.description}
                        </td>
                        <td className={`whitespace-nowrap px-2 py-2 font-medium tabular-nums ${
                          txn.type === 'debit' ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'
                        }`}>
                          {txn.type === 'debit' ? '-' : '+'}{formatCurrency(txn.amount, txn.currency)}
                        </td>
                        <td className="px-2 py-2">
                          {txn.type === 'debit' ? (
                            <select
                              value={editCategories[idx] ?? ''}
                              onChange={(e) => setCategory(idx, e.target.value)}
                              className="w-full rounded-lg border border-[var(--color-border)] bg-transparent px-2 py-1 text-[11px] text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
                              disabled={skippedRows.has(idx)}
                            >
                              {CATEGORY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[11px] text-[var(--color-text-tertiary)]">Income</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[12px] text-[var(--color-text-tertiary)]">
                  {data.transactions.length - skippedRows.size} of {data.transactions.length} selected
                  {data.aiSuggestions?.categories && (
                    <span className="ml-2">
                      · {Math.round(data.aiSuggestions.categories.software || 0).toFixed(0)}% software
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => { setStep('upload'); setFile(null); setData(null); }}
                  className="text-[12px] font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition"
                >
                  Upload a different file
                </button>
              </div>
            </div>
          )}

          {step === 'confirming' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <SpinnerGap className="h-8 w-8 animate-spin text-[var(--color-primary)]" weight="bold" />
              <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Importing transactions…</p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <CheckCircle className="h-10 w-10 text-[var(--color-success)]" weight="fill" />
              <p className="text-[13px] font-semibold text-[var(--color-foreground)]">Import complete</p>
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                {data ? data.transactions.length - skippedRows.size : 0} transactions have been imported.
              </p>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
          )}
          {step === 'review' && (
            <>
              <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={data?.transactions.length === skippedRows.size || isSubmitting}>
                Import {data ? data.transactions.length - skippedRows.size : 0} transactions
              </Button>
            </>
          )}
          {(step === 'confirming' || step === 'parsing') && (
            <Button variant="secondary" disabled>
              {step === 'parsing' ? 'Parsing…' : 'Importing…'}
            </Button>
          )}
          {step === 'done' && (
            <Button onClick={() => { reset(); onImported(); }}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
