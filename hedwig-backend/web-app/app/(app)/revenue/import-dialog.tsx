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
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { hedwigApi } from '@/lib/api/client';
import { ArrowsDownUp, UploadSimple, SpinnerGap, CheckCircle, WarningCircle, Bank, FileText } from '@/components/ui/lucide-icons';
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

type ImportMode = 'document' | 'statement';

/* ─── Parsed transaction type from statement ─── */
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

export function ImportDialog({ open, onClose, onImported, accessToken }: ImportDialogProps) {
  const { toast } = useToast();
  const { currency, options: currencyOptions, formatNative } = useCurrency();
  const { activeWorkspace } = useWorkspaceContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>('document');

  /* ── Document state ── */
  type DocStep = 'upload' | 'analyzing' | 'preview';
  const [docStep, setDocStep] = useState<DocStep>('upload');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docDragOver, setDocDragOver] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, any> | null>(null);
  const [entryType, setEntryType] = useState<'expense' | 'credit'>('expense');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editCategory, setEditCategory] = useState<ExpenseCategory>('other');
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [docSubmitting, setDocSubmitting] = useState(false);

  /* ── Statement state ── */
  type StmtStep = 'upload' | 'parsing' | 'review' | 'confirming' | 'done';
  const [stmtStep, setStmtStep] = useState<StmtStep>('upload');
  const [stmtFile, setStmtFile] = useState<File | null>(null);
  const [stmtDragOver, setStmtDragOver] = useState(false);
  const [stmtData, setStmtData] = useState<StatementData | null>(null);
  const [editCategories, setEditCategories] = useState<Record<number, string>>({});
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set());
  const [stmtSubmitting, setStmtSubmitting] = useState(false);

  const isSubmitting = docSubmitting || stmtSubmitting;

  const resetAll = useCallback(() => {
    setMode('document');
    setDocStep('upload');
    setDocFile(null);
    setDocDragOver(false);
    setAnalysis(null);
    setEntryType('expense');
    setEditAmount('');
    setEditCurrency('USD');
    setEditCategory('other');
    setEditTitle('');
    setEditDate('');
    setEditNote('');
    setDocSubmitting(false);
    setStmtStep('upload');
    setStmtFile(null);
    setStmtDragOver(false);
    setStmtData(null);
    setEditCategories({});
    setSkippedRows(new Set());
    setStmtSubmitting(false);
  }, []);

  const handleClose = () => {
    if (isSubmitting) return;
    resetAll();
    onClose();
  };

  /* ═══ Document handler ═══ */
  const handleDocFileSelect = (f: File) => {
    const supported = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!supported.includes(f.type)) {
      toast({ type: 'error', title: 'Unsupported file', message: 'Please upload a PDF, PNG, JPG, or WebP file.' });
      return;
    }
    setDocFile(f);
    analyzeFile(f);
  };

  const analyzeFile = async (f: File) => {
    setDocStep('analyzing');
    try {
      const d = await hedwigApi.analyzeImportDocument(f, { accessToken: accessToken ?? undefined });
      setAnalysis(d);
      const suggestedType = d.suggestedEntryType === 'expense' ? 'expense' : 'credit';
      setEntryType(suggestedType);
      setEditAmount(d.amount ? String(d.amount) : '');
      setEditCurrency(String(d.currency || 'USD'));
      setEditCategory((d.category as any) || 'other');
      setEditTitle(String(d.suggestedTitle || d.summary || 'Imported document'));
      setEditDate(String(d.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
      setEditNote(String(d.notes || d.summary || ''));
      setDocStep('preview');
    } catch (err: any) {
      toast({ type: 'error', title: 'Analysis failed', message: err?.message || 'Network error. Please try again.' });
      setDocStep('upload');
      setDocFile(null);
    }
  };

  const handleDocDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDocDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleDocFileSelect(f);
  };

  const handleDocConfirm = async () => {
    if (!analysis) return;
    const amt = parseFloat(editAmount.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ type: 'error', title: 'Invalid amount', message: 'Enter a valid amount greater than 0.' });
      return;
    }
    setDocSubmitting(true);
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
      resetAll();
      onImported();
    } catch (err: any) {
      toast({ type: 'error', title: 'Import failed', message: err?.message || 'Network error.' });
    } finally {
      setDocSubmitting(false);
    }
  };

  /* ═══ Statement handler ═══ */
  const handleStmtFileSelect = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext || !['csv', 'ofx', 'qfx'].includes(ext)) {
      toast({ type: 'error', title: 'Unsupported file', message: 'Please upload a CSV, OFX, or QFX file.' });
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast({ type: 'error', title: 'File too large', message: 'Maximum file size is 20 MB.' });
      return;
    }
    setStmtFile(f);
    parseFile(f);
  };

  const parseFile = async (f: File) => {
    setStmtStep('parsing');
    try {
      const result = await hedwigApi.importStatementParse(f, { accessToken: accessToken ?? undefined }) as unknown as StatementData;
      setStmtData(result);
      setEditCategories({});
      setSkippedRows(new Set());
      setStmtStep('review');
    } catch (err: any) {
      toast({ type: 'error', title: 'Parse failed', message: err?.message || 'Could not parse this file.' });
      setStmtStep('upload');
      setStmtFile(null);
    }
  };

  const handleStmtDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setStmtDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleStmtFileSelect(f);
  };

  const toggleSkip = (idx: number) => {
    const next = new Set(skippedRows);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSkippedRows(next);
  };

  const setCategory = (idx: number, cat: string) => {
    setEditCategories((prev) => ({ ...prev, [idx]: cat }));
  };

  const handleStmtConfirm = async () => {
    if (!stmtData || !accessToken) return;

    const txnRows = stmtData.transactions.map((txn, idx) => ({
      id: `idx_${idx}`,
      type: txn.type,
      amount: txn.amount,
      currency: txn.currency,
      category: editCategories[idx] || undefined,
      description: txn.description,
      transactionDate: txn.transactionDate,
      matchedClientId: null,
      matchedProjectId: null,
      status: skippedRows.has(idx) ? 'skipped' : 'confirmed' as const,
    }));

    const confirmedCount = txnRows.filter((t) => t.status === 'confirmed').length;
    if (confirmedCount === 0) {
      toast({ type: 'error', title: 'Nothing to import', message: 'All transactions are skipped.' });
      return;
    }

    const statementId = `stm_${Date.now()}_${activeWorkspace?.id || 'personal'}`;
    setStmtSubmitting(true);
    setStmtStep('confirming');
    try {
      await hedwigApi.importStatementConfirm({ statementId, transactions: txnRows }, { accessToken });
      setStmtStep('done');
      toast({ type: 'success', title: 'Import complete', message: `${confirmedCount} transaction${confirmedCount !== 1 ? 's' : ''} imported.` });
    } catch (err: any) {
      toast({ type: 'error', title: 'Import failed', message: err?.message || 'Network error.' });
      setStmtSubmitting(false);
    }
  };

  /* ── Shared ── */
  const formatCurrency = (amount: number, currency: string) => {
    try { return formatNative(amount, currency); } catch { return `${amount.toFixed(2)} ${currency}`; }
  };

  const inputCls = 'w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-accent-soft)]';
  const labelCls = 'mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]';

  const selectedCurrency = currencyOptions.find((opt) => opt.code === editCurrency)
    ?? { code: editCurrency, label: editCurrency, symbol: editCurrency };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()} size="2xl">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import</DialogTitle>
          <DialogDescription>
            Upload a document (receipt, invoice) or a bank statement (CSV, OFX, QFX).
          </DialogDescription>
        </DialogHeader>

        {/* ── Mode tabs ── */}
        <div className="mx-6 mb-2 flex gap-1 rounded-xl bg-[var(--color-surface-secondary)] p-1">
          <button
            onClick={() => { if (!isSubmitting) setMode('document'); }}
            className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
              mode === 'document'
                ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-xs'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <FileText className="mr-1.5 inline-block h-4 w-4" weight="bold" />
            Document
          </button>
          <button
            onClick={() => { if (!isSubmitting) setMode('statement'); }}
            className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
              mode === 'statement'
                ? 'bg-[var(--color-surface)] text-[var(--color-foreground)] shadow-xs'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <Bank className="mr-1.5 inline-block h-4 w-4" weight="bold" />
            Bank Statement
          </button>
        </div>

        <DialogBody className="space-y-4">
          {/* ═══ Document mode ═══ */}
          {mode === 'document' && (
            <>
              {docStep === 'upload' && (
                <div
                  onDrop={handleDocDrop}
                  onDragOver={(e) => { e.preventDefault(); setDocDragOver(true); }}
                  onDragLeave={() => setDocDragOver(false)}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition ${
                    docDragOver ? 'border-[var(--color-primary)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-primary)]'
                  }`}
                >
                  <UploadSimple className="h-10 w-10 text-[var(--color-text-muted)]" weight="light" />
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Drop a file here or click to browse</p>
                    <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">PDF, PNG, JPG, WebP (max 10 MB)</p>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocFileSelect(f); e.target.value = ''; }} />
                </div>
              )}

              {docStep === 'analyzing' && (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <SpinnerGap className="h-8 w-8 animate-spin text-[var(--color-primary)]" weight="bold" />
                  <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Analyzing document…</p>
                  <p className="text-[12px] text-[var(--color-text-muted)]">Hedwig is reading your {docFile?.name}</p>
                </div>
              )}

              {docStep === 'preview' && analysis && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${
                      entryType === 'expense' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                    }`}>
                      <ArrowsDownUp className="h-3.5 w-3.5" weight="bold" />
                      {entryType === 'expense' ? 'Expense' : 'Earning'}
                    </span>
                    <button type="button" onClick={() => setEntryType(entryType === 'expense' ? 'credit' : 'expense')}
                      className="text-[12px] font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] transition">
                      Change to {entryType === 'expense' ? 'earning' : 'expense'}
                    </button>
                    {analysis.confidence && (
                      <span className="ml-auto text-[11px] text-[var(--color-text-muted)]">Confidence: {Math.round(analysis.confidence * 100)}%</span>
                    )}
                  </div>
                  {analysis.summary && (
                    <p className="rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2 text-[12px] text-[var(--color-text-secondary)] leading-relaxed">{analysis.summary}</p>
                  )}
                  <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-3">
                    <div>
                      <label className={labelCls}>Amount</label>
                      <div className="flex items-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs transition focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-accent-soft)]">
                        <span className="flex h-full items-center border-r border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-muted)]">{selectedCurrency.symbol}</span>
                        <input type="number" min="0" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)}
                          placeholder="0.00" className="flex-1 bg-transparent px-3 py-2.5 text-[13px] font-semibold text-[var(--color-foreground)] placeholder:text-[var(--color-text-muted)] focus:outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Currency</label>
                      <select value={editCurrency} onChange={(e) => setEditCurrency(e.target.value)} className={inputCls}>
                        {currencyOptions.map((opt) => (<option key={opt.code} value={opt.code}>{opt.code}</option>))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {entryType === 'expense' ? (
                      <div>
                        <label className={labelCls}>Category</label>
                        <select value={editCategory} onChange={(e) => setEditCategory(e.target.value as ExpenseCategory)} className={inputCls}>
                          {CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className={labelCls}>Title</label>
                        <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputCls} />
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Date</label>
                      <input type="date" value={editDate} max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setEditDate(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Note <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></label>
                    <input type="text" value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder={entryType === 'expense' ? 'What was this for?' : 'Where did this come from?'}
                      className={inputCls} />
                  </div>
                  <button type="button" onClick={() => { setDocStep('upload'); setDocFile(null); setAnalysis(null); }}
                    className="text-[12px] font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition">
                    Upload a different file
                  </button>
                </div>
              )}
            </>
          )}

          {/* ═══ Statement mode ═══ */}
          {mode === 'statement' && (
            <>
              {stmtStep === 'upload' && (
                <div
                  onDrop={handleStmtDrop}
                  onDragOver={(e) => { e.preventDefault(); setStmtDragOver(true); }}
                  onDragLeave={() => setStmtDragOver(false)}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition ${
                    stmtDragOver ? 'border-[var(--color-primary)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-primary)]'
                  }`}
                >
                  <Bank className="h-10 w-10 text-[var(--color-text-muted)]" weight="light" />
                  <div className="text-center">
                    <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Drop a bank statement here or click to browse</p>
                    <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">CSV, OFX, QFX (max 20 MB)</p>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".csv,.ofx,.qfx" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleStmtFileSelect(f); e.target.value = ''; }} />
                </div>
              )}

              {stmtStep === 'parsing' && (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <SpinnerGap className="h-8 w-8 animate-spin text-[var(--color-primary)]" weight="bold" />
                  <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Parsing statement…</p>
                  <p className="text-[12px] text-[var(--color-text-muted)]">Reading {stmtFile?.name}</p>
                </div>
              )}

              {stmtStep === 'review' && stmtData && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-4 py-3">
                    <FileText className="h-5 w-5 text-[var(--color-accent)]" weight="fill" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[var(--color-foreground)]">
                        {stmtData.bankName || 'Bank statement'}{stmtData.accountNumber ? ` · ${stmtData.accountNumber}` : ''}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-tertiary)]">
                        {stmtData.transactionCount} transactions{stmtData.startDate && stmtData.endDate ? ` · ${stmtData.startDate} to ${stmtData.endDate}` : ''}
                      </p>
                    </div>
                    <span className="rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)]">{stmtData.currency}</span>
                  </div>

                  {stmtData.aiSuggestions && (
                    <div className="rounded-xl border border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)] px-4 py-3">
                      <div className="flex items-center gap-2">
                        <WarningCircle className="h-4 w-4 text-[var(--color-accent)]" weight="fill" />
                        <p className="text-[12px] font-semibold text-[var(--color-accent)]">AI Analysis</p>
                      </div>
                      <p className="mt-1 text-[12px] text-[var(--color-text-secondary)] leading-relaxed">{stmtData.aiSuggestions.summary || 'Statement analyzed.'}</p>
                      {stmtData.aiSuggestions.largestTransactions?.length > 0 && (
                        <div className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">Largest: {stmtData.aiSuggestions.largestTransactions.join(', ')}</div>
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
                        {stmtData.transactions.map((txn, idx) => (
                          <tr key={idx} className={`transition-colors ${skippedRows.has(idx) ? 'opacity-40' : 'hover:bg-[var(--color-background)]'}`}>
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={!skippedRows.has(idx)} onChange={() => toggleSkip(idx)}
                                className="h-3.5 w-3.5 rounded border-[var(--color-border-input)] accent-[var(--color-primary)]" />
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-[var(--color-foreground)]">{txn.transactionDate}</td>
                            <td className="max-w-[200px] truncate px-2 py-2 text-[var(--color-foreground)]" title={txn.description}>{txn.description}</td>
                            <td className={`whitespace-nowrap px-2 py-2 font-medium tabular-nums ${txn.type === 'debit' ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                              {txn.type === 'debit' ? '-' : '+'}{formatCurrency(txn.amount, txn.currency)}
                            </td>
                            <td className="px-2 py-2">
                              {txn.type === 'debit' ? (
                                <select value={editCategories[idx] ?? ''} onChange={(e) => setCategory(idx, e.target.value)}
                                  className="w-full rounded-lg border border-[var(--color-border)] bg-transparent px-2 py-1 text-[11px] text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
                                  disabled={skippedRows.has(idx)}>
                                  {CATEGORY_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
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
                      {stmtData.transactions.length - skippedRows.size} of {stmtData.transactions.length} selected
                    </p>
                    <button type="button" onClick={() => { setStmtStep('upload'); setStmtFile(null); setStmtData(null); }}
                      className="text-[12px] font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition">
                      Upload a different file
                    </button>
                  </div>
                </div>
              )}

              {stmtStep === 'confirming' && (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <SpinnerGap className="h-8 w-8 animate-spin text-[var(--color-primary)]" weight="bold" />
                  <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Importing transactions…</p>
                </div>
              )}

              {stmtStep === 'done' && (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <CheckCircle className="h-10 w-10 text-[var(--color-success)]" weight="fill" />
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">Import complete</p>
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">
                    {stmtData ? stmtData.transactions.length - skippedRows.size : 0} transactions have been imported.
                  </p>
                </div>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {/* Document mode footer */}
          {mode === 'document' && (
            <>
              <Button variant="secondary" onClick={handleClose} disabled={docSubmitting}>Cancel</Button>
              {docStep === 'preview' && (
                <Button className="create-btn" onClick={handleDocConfirm} disabled={docSubmitting || !editAmount}>
                  {docSubmitting ? 'Importing…' : `Import ${entryType === 'expense' ? 'expense' : 'earning'}`}
                </Button>
              )}
            </>
          )}

          {/* Statement mode footer */}
          {mode === 'statement' && (
            <>
              {stmtStep === 'upload' && <Button variant="secondary" onClick={handleClose}>Cancel</Button>}
              {stmtStep === 'review' && (
                <>
                  <Button variant="secondary" onClick={handleClose} disabled={stmtSubmitting}>Cancel</Button>
                  <Button className="create-btn" onClick={handleStmtConfirm} disabled={stmtData?.transactions.length === skippedRows.size || stmtSubmitting}>
                    Import {stmtData ? stmtData.transactions.length - skippedRows.size : 0} transactions
                  </Button>
                </>
              )}
              {(stmtStep === 'confirming' || stmtStep === 'parsing') && (
                <Button variant="secondary" disabled>{stmtStep === 'parsing' ? 'Parsing…' : 'Importing…'}</Button>
              )}
              {stmtStep === 'done' && (
                <Button onClick={() => { resetAll(); onImported(); }}>Done</Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
