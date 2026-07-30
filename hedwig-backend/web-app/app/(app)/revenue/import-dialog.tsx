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
import { ArrowsDownUp, UploadSimple, CheckCircle, WarningCircle, FileText, CaretDown } from '@/components/ui/lucide-icons';
import { Button as HButton, Dropdown, Label, Table } from '@heroui/react';
import { Loader } from '@/components/ui/loader';
import { DateInput } from '@/components/ui/date-input';
import type { ExpenseCategory } from '@/lib/types/revenue';

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'software', label: 'Software' },
  { value: 'contractors', label: 'Contractors' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'travel', label: 'Travel' },
  { value: 'meals', label: 'Meals' },
  { value: 'office', label: 'Office' },
  { value: 'operations', label: 'Operations' },
  { value: 'taxes', label: 'Taxes' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'health', label: 'Health' },
  { value: 'education', label: 'Education' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'rent', label: 'Rent' },
  { value: 'personal_care', label: 'Personal Care' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'Auto-detect' },
  ...CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
];

type Flow = 'document' | 'statement' | null;

/* ─── Parsed transaction type from statement ─── */
interface ParsedTransaction {
  id: string;
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
  statementId: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  /* ── Shared step + detected flow ── */
  type Step = 'upload' | 'choose-type' | 'processing' | 'preview-doc' | 'review-stmt' | 'confirming' | 'done';
  const [step, setStep] = useState<Step>('upload');
  const [flow, setFlow] = useState<Flow>(null);
  const [file, setFile] = useState<File | null>(null);

  /* ── Document state ── */
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
  const [stmtData, setStmtData] = useState<StatementData | null>(null);
  const [editCategories, setEditCategories] = useState<Record<number, string>>({});
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set());
  const [stmtSubmitting, setStmtSubmitting] = useState(false);

  const isSubmitting = docSubmitting || stmtSubmitting;

  const resetAll = useCallback(() => {
    setStep('upload');
    setFlow(null);
    setFile(null);
    setDragOver(false);
    setAnalysis(null);
    setEntryType('expense');
    setEditAmount('');
    setEditCurrency('USD');
    setEditCategory('other');
    setEditTitle('');
    setEditDate('');
    setEditNote('');
    setDocSubmitting(false);
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

  /* ═══ File detection — routes to document or statement flow ═══ */
  const handleFileSelect = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!ext) {
      toast({ type: 'error', title: 'Unsupported file', message: 'Could not detect file type.' });
      return;
    }
    const stmtExts = ['csv', 'ofx', 'qfx'];
    const imageExts = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];

    if (stmtExts.includes(ext)) {
      if (f.size > 20 * 1024 * 1024) {
        toast({ type: 'error', title: 'File too large', message: 'Maximum file size for statements is 20 MB.' });
        return;
      }
      setFile(f);
      parseFile(f);
    } else if (imageExts.includes(ext)) {
      if (f.size > 20 * 1024 * 1024) {
        toast({ type: 'error', title: 'File too large', message: 'Maximum file size is 20 MB.' });
        return;
      }
      setFile(f);
      setStep('choose-type');
    } else {
      toast({ type: 'error', title: 'Unsupported file', message: 'Please upload a document (PDF, PNG, JPG, WebP) or bank statement (CSV, OFX, QFX).' });
    }
  };

  /* ═══ Document (receipt) flow ═══ */
  const analyzeFile = async (f: File) => {
    setFlow('document');
    setStep('processing');
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
      setStep('preview-doc');
    } catch (err: any) {
      toast({ type: 'error', title: 'Analysis failed', message: err?.message || 'Network error. Please try again.' });
      resetAll();
    }
  };

  const handleDocConfirm = async () => {
    if (!analysis) return;
    const amt = parseFloat(editAmount.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ type: 'error', title: 'Invalid amount', message: 'Enter a valid amount greater than 0.' });
      return;
    }
    setDocSubmitting(true);
    setStep('confirming');
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
      setStep('done');
      toast({
        type: 'success',
        title: entryType === 'expense' ? 'Expense recorded' : 'Credit recorded',
        message: `${formatNative(amt, editCurrency)} ${entryType === 'expense' ? 'expense' : 'earning'} saved.`,
      });
    } catch (err: any) {
      toast({ type: 'error', title: 'Import failed', message: err?.message || 'Network error.' });
      setStep('preview-doc');
      setDocSubmitting(false);
    }
  };

  /* ═══ Statement (bank CSV/OFX/QFX) flow ═══ */
  const parseFile = async (f: File) => {
    setFlow('statement');
    setStep('processing');
    try {
      const resp = await hedwigApi.importStatementParse(f, { accessToken: accessToken ?? undefined }) as any;
      // Async job flow for PDF/images — poll until complete
      if (resp.jobId) {
        const result = await pollJob(resp.jobId);
        setStmtData(result);
      } else {
        setStmtData(resp as unknown as StatementData);
      }
      setEditCategories({});
      setSkippedRows(new Set());
      setStep('review-stmt');
    } catch (err: any) {
      toast({ type: 'error', title: 'Parse failed', message: err?.message || 'Could not parse this file.' });
      resetAll();
    }
  };

  const pollJob = async (jobId: string): Promise<StatementData> => {
    const maxAttempts = 300; // 300 * 2s = 10 min timeout
    for (let i = 0; i < maxAttempts; i++) {
      const status = await hedwigApi.getStatementJob(jobId, { accessToken: accessToken ?? undefined }) as any;
      if (status.status === 'complete' || status.status === 'partial') {
        return status.result as StatementData;
      }
      if (status.status === 'failed') {
        throw new Error(status.error || 'Statement processing failed');
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('Statement processing timed out. Please try again.');
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
      id: txn.id,
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

    setStmtSubmitting(true);
    setStep('confirming');
    try {
      await hedwigApi.importStatementConfirm({ statementId: stmtData.statementId, transactions: txnRows }, { accessToken });
      setStep('done');
      toast({ type: 'success', title: 'Import complete', message: `${confirmedCount} transaction${confirmedCount !== 1 ? 's' : ''} imported.` });
    } catch (err: any) {
      toast({ type: 'error', title: 'Import failed', message: err?.message || 'Network error.' });
      setStep('review-stmt');
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
            Upload a receipt, invoice, or bank statement (CSV, OFX, QFX).
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* ═══ Upload step (shared) ═══ */}
          {step === 'upload' && (
            <div
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition ${
                dragOver ? 'border-[var(--color-primary)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-primary)]'
              }`}
            >
              <UploadSimple className="h-10 w-10 text-[var(--color-text-muted)]" weight="light" />
              <div className="text-center">
                <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Drop a file here or click to browse</p>
                <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">Documents: PDF, PNG, JPG, WebP &middot; Statements: CSV, OFX, QFX</p>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.ofx,.qfx" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }} />
            </div>
          )}

          {/* ═══ Choose file type ═══ */}
          {step === 'choose-type' && file && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-secondary)] px-4 py-3">
                <FileText className="h-5 w-5 text-[var(--color-accent)]" weight="fill" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{file.name}</p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)]">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              </div>
              <p className="text-[13px] text-[var(--color-text-secondary)]">What kind of file is this?</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => analyzeFile(file)}
                  className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-center transition hover:border-[var(--color-primary)] hover:bg-[var(--color-accent-soft)]">
                  <span className="text-[14px] font-semibold text-[var(--color-foreground)]">Receipt or Invoice</span>
                  <span className="text-[12px] text-[var(--color-text-tertiary)]">Extract a single expense or earning</span>
                </button>
                <button type="button" onClick={() => parseFile(file)}
                  className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-center transition hover:border-[var(--color-primary)] hover:bg-[var(--color-accent-soft)]">
                  <span className="text-[14px] font-semibold text-[var(--color-foreground)]">Bank Statement</span>
                  <span className="text-[12px] text-[var(--color-text-tertiary)]">Import multiple transactions</span>
                </button>
              </div>
              <button type="button" onClick={resetAll}
                className="text-[12px] font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition">
                Choose a different file
              </button>
            </div>
          )}

          {/* ═══ Processing ═══ */}
          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader size={32} />
              <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">
                {flow === 'document' ? 'Analyzing document…' : 'Parsing statement…'}
              </p>
              <p className="text-[12px] text-[var(--color-text-muted)]">Reading {file?.name}</p>
            </div>
          )}

          {/* ═══ Document preview ═══ */}
          {step === 'preview-doc' && analysis && (
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
                  <Dropdown>
                    <HButton variant="secondary" className="flex h-10 w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-medium text-[var(--color-foreground)]" aria-label="Select currency">
                      <span>{editCurrency}</span>
                      <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
                    </HButton>
                    <Dropdown.Popover className="min-w-[120px]">
                      <Dropdown.Menu selectedKeys={new Set([editCurrency])} selectionMode="single" onSelectionChange={(keys) => { const k = [...keys][0]; if (k) setEditCurrency(k as string); }}>
                        {currencyOptions.map((opt) => (<Dropdown.Item key={opt.code} id={opt.code} textValue={opt.code}><Label>{opt.code}</Label></Dropdown.Item>))}
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {entryType === 'expense' ? (
                  <div>
                    <label className={labelCls}>Category</label>
                    <Dropdown>
                      <HButton variant="secondary" className="flex h-10 w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-medium text-[var(--color-foreground)]" aria-label="Select category">
                        <span>{CATEGORIES.find((c) => c.value === editCategory)?.label || 'Select'}</span>
                        <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
                      </HButton>
                      <Dropdown.Popover className="min-w-[180px]">
                        <Dropdown.Menu selectedKeys={new Set([editCategory])} selectionMode="single" onSelectionChange={(keys) => { const k = [...keys][0]; if (k) setEditCategory(k as ExpenseCategory); }}>
                          {CATEGORIES.map((c) => (<Dropdown.Item key={c.value} id={c.value} textValue={c.label}><Label>{c.label}</Label></Dropdown.Item>))}
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown>
                  </div>
                ) : (
                  <div>
                    <label className={labelCls}>Title</label>
                    <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputCls} />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Date</label>
                <DateInput value={editDate}
                  onChange={(v) => setEditDate(v)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Note <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></label>
                <input type="text" value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder={entryType === 'expense' ? 'What was this for?' : 'Where did this come from?'}
                  className={inputCls} />
              </div>
              <button type="button" onClick={resetAll}
                className="text-[12px] font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition">
                Upload a different file
              </button>
            </div>
          )}

          {/* ═══ Statement review ═══ */}
          {step === 'review-stmt' && stmtData && (
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

              <Table>
                <Table.ScrollContainer className="max-h-[360px]">
                  <Table.Content aria-label="Statement preview">
                    <Table.Header>
                      <Table.Column className="w-8" />
                      <Table.Column isRowHeader className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Date</Table.Column>
                      <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Description</Table.Column>
                      <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Amount</Table.Column>
                      <Table.Column className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Category</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {stmtData.transactions.map((txn, idx) => (
                        <Table.Row key={idx} className={`${skippedRows.has(idx) ? 'opacity-40' : 'hover:bg-[var(--color-background)]'}`}>
                          <Table.Cell>
                            <input type="checkbox" checked={!skippedRows.has(idx)} onChange={() => toggleSkip(idx)}
                              className="h-3.5 w-3.5 rounded border-[var(--color-border-input)] accent-[var(--color-primary)]" />
                          </Table.Cell>
                          <Table.Cell className="whitespace-nowrap text-[var(--color-foreground)]">{txn.transactionDate}</Table.Cell>
                          <Table.Cell className="max-w-[200px] truncate text-[var(--color-foreground)]"><span title={txn.description}>{txn.description}</span></Table.Cell>
                          <Table.Cell className={`whitespace-nowrap font-medium tabular-nums ${txn.type === 'debit' ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                            {txn.type === 'debit' ? '-' : '+'}{formatCurrency(txn.amount, txn.currency)}
                          </Table.Cell>
                          <Table.Cell>
                            {txn.type === 'debit' ? (
                              <Dropdown>
                                <HButton variant="secondary" isDisabled={skippedRows.has(idx)}
                                  className="flex h-7 w-full min-w-[120px] items-center justify-between rounded-lg border border-[var(--color-border)] bg-transparent px-2 text-[11px] font-medium text-[var(--color-foreground)]"
                                  aria-label="Select category">
                                  <span>{CATEGORY_OPTIONS.find((o) => o.value === (editCategories[idx] ?? ''))?.label || 'Auto-detect'}</span>
                                  <CaretDown className="h-2.5 w-2.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
                                </HButton>
                                <Dropdown.Popover className="min-w-[160px]">
                                  <Dropdown.Menu selectedKeys={new Set([editCategories[idx] ?? ''])} selectionMode="single" onSelectionChange={(keys) => { const k = [...keys][0]; setCategory(idx, (k as string) || ''); }}>
                                    {CATEGORY_OPTIONS.map((opt) => (<Dropdown.Item key={opt.value} id={opt.value} textValue={opt.label}><Label>{opt.label}</Label></Dropdown.Item>))}
                                  </Dropdown.Menu>
                                </Dropdown.Popover>
                              </Dropdown>
                            ) : (
                              <span className="text-[11px] text-[var(--color-text-tertiary)]">Income</span>
                            )}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>

              <div className="flex items-center justify-between">
                <p className="text-[12px] text-[var(--color-text-tertiary)]">
                  {stmtData.transactions.length - skippedRows.size} of {stmtData.transactions.length} selected
                </p>
                <button type="button" onClick={resetAll}
                  className="text-[12px] font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition">
                  Upload a different file
                </button>
              </div>
            </div>
          )}

          {/* ═══ Confirming ═══ */}
          {step === 'confirming' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader size={32} />
              <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">
                {flow === 'document' ? 'Importing document…' : 'Importing transactions…'}
              </p>
            </div>
          )}

          {/* ═══ Done ═══ */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <CheckCircle className="h-10 w-10 text-[var(--color-success)]" weight="fill" />
              <p className="text-[13px] font-semibold text-[var(--color-foreground)]">Import complete</p>
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                {flow === 'document'
                  ? 'Your document has been saved.'
                  : stmtData
                    ? `${stmtData.transactions.length - skippedRows.size} transactions have been imported.`
                    : ''}
              </p>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          )}

          {step === 'preview-doc' && (
            <>
              <Button variant="secondary" onClick={handleClose} disabled={docSubmitting}>Cancel</Button>
              <Button className="create-btn" onClick={handleDocConfirm} disabled={docSubmitting || !editAmount}>
                {docSubmitting ? 'Importing…' : `Import ${entryType === 'expense' ? 'expense' : 'earning'}`}
              </Button>
            </>
          )}

          {step === 'review-stmt' && (
            <>
              <Button variant="secondary" onClick={handleClose} disabled={stmtSubmitting}>Cancel</Button>
              <Button className="create-btn" onClick={handleStmtConfirm} disabled={stmtData?.transactions.length === skippedRows.size || stmtSubmitting}>
                Import {stmtData ? stmtData.transactions.length - skippedRows.size : 0} transactions
              </Button>
            </>
          )}

          {(step === 'processing' || step === 'confirming') && (
            <Button variant="secondary" disabled>Processing…</Button>
          )}

          {step === 'done' && (
            <Button onClick={() => { resetAll(); onImported(); }}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
