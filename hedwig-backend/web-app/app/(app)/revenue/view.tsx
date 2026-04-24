'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  CurrencyDollar,
  DownloadSimple,
  FileText,
  FolderSimple,
  Minus,
  NotePencil,
  Plus,
  Receipt,
  Trash,
  UsersThree,
  Warning,
} from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { ExportDialog } from '@/components/export/export-dialog';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import { useToast } from '@/components/providers/toast-provider';
import { useCurrency } from '@/components/providers/currency-provider';
import { formatCompactCurrency, formatShortDate } from '@/lib/utils';
import { hedwigApi } from '@/lib/api/client';
import type { Invoice, Client } from '@/lib/models/entities';
import type {
  RevenueSummary,
  ExpenseRecord,
  ExpenseCategory,
  ClientRevenueBreakdown,
  ProjectRevenueBreakdown,
  ActivityEvent,
  PaymentSourceBreakdown,
} from '@/lib/types/revenue';

/* ─── types ─── */
type RevenueRange = '7d' | '30d' | '90d' | '1y';

const RANGE_LABELS: Record<RevenueRange, string> = {
  '7d': '7D',
  '30d': '30D',
  '90d': '90D',
  '1y': '1 Year',
};
const RANGES: RevenueRange[] = ['7d', '30d', '90d', '1y'];

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  software: 'Software',
  equipment: 'Equipment',
  marketing: 'Marketing',
  travel: 'Travel',
  operations: 'Operations',
  contractor: 'Contractor',
  subscriptions: 'Subscriptions',
  other: 'Other',
};

const CATEGORY_COLORS: Record<ExpenseCategory, { bg: string; text: string }> = {
  software:      { bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
  equipment:     { bg: 'bg-[#f5f3ff]', text: 'text-[#7c3aed]' },
  marketing:     { bg: 'bg-[#fff7ed]', text: 'text-[#c2410c]' },
  travel:        { bg: 'bg-[#f0fdf4]', text: 'text-[#15803d]' },
  operations:    { bg: 'bg-[#f2f4f7]', text: 'text-[#414651]' },
  contractor:    { bg: 'bg-[#fdf4ff]', text: 'text-[#7e22ce]' },
  subscriptions: { bg: 'bg-[#eff4ff]', text: 'text-[#1d4ed8]' },
  other:         { bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
};

const ACTIVITY_COLORS: Record<ActivityEvent['type'], { dot: string; bg: string }> = {
  invoice_paid:    { dot: 'bg-[#12b76a]', bg: 'bg-[#ecfdf3]' },
  payment_received:{ dot: 'bg-[#12b76a]', bg: 'bg-[#ecfdf3]' },
  invoice_sent:    { dot: 'bg-[#2563eb]', bg: 'bg-[#eff4ff]' },
  invoice_created: { dot: 'bg-[#2563eb]', bg: 'bg-[#eff4ff]' },
  invoice_overdue: { dot: 'bg-[#f04438]', bg: 'bg-[#fff1f0]' },
  expense_added:   { dot: 'bg-[#f79009]', bg: 'bg-[#fffaeb]' },
};

const INV_STATUS = {
  draft:   { dot: 'bg-[#a4a7ae]', label: 'Draft',   bg: 'bg-[#f2f4f7]', text: 'text-[#717680]' },
  sent:    { dot: 'bg-[#2563eb]', label: 'Sent',    bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
  viewed:  { dot: 'bg-[#2563eb]', label: 'Viewed',  bg: 'bg-[#eff4ff]', text: 'text-[#717680]' },
  paid:    { dot: 'bg-[#12b76a]', label: 'Paid',    bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
  overdue: { dot: 'bg-[#f04438]', label: 'Overdue', bg: 'bg-[#fff1f0]', text: 'text-[#b42318]' },
} as const;

/* ─── helpers ─── */
function StatusPill({ status }: { status: keyof typeof INV_STATUS }) {
  const s = INV_STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function CategoryPill({ category }: { category: ExpenseCategory }) {
  const c = CATEGORY_COLORS[category];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.bg} ${c.text}`}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

function formatTimeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ─── expense dialog ─── */
interface ExpenseFormState {
  amount: string;
  currency: string;
  category: ExpenseCategory;
  date: string;
  note: string;
  projectId: string;
  clientId: string;
}

const EMPTY_FORM: ExpenseFormState = {
  amount: '',
  currency: 'USD',
  category: 'other',
  date: new Date().toISOString().slice(0, 10),
  note: '',
  projectId: '',
  clientId: '',
};

function ExpenseDialog({
  open,
  editing,
  clients,
  onSave,
  onClose,
  isSaving,
}: {
  open: boolean;
  editing: ExpenseRecord | null;
  clients: Pick<Client, 'id' | 'name'>[];
  onSave: (form: ExpenseFormState) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<ExpenseFormState>(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm(
        editing
          ? {
              amount: String(editing.amount),
              currency: editing.currency,
              category: editing.category,
              date: editing.date.slice(0, 10),
              note: editing.note,
              projectId: editing.projectId ?? '',
              clientId: editing.clientId ?? '',
            }
          : EMPTY_FORM,
      );
    }
  }, [open, editing]);

  const set = (field: keyof ExpenseFormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = () => {
    const amount = parseFloat(form.amount.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return;
    onSave(form);
  };

  const inputCls =
    'w-full rounded-xl border border-[#e9eaeb] px-3 py-2.5 text-[13px] text-[#181d27] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#eff4ff]';
  const labelCls = 'mb-1.5 block text-[12px] font-semibold text-[#414651]';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit expense' : 'Add expense'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Update this expense record.' : 'Record a business expense to track against your revenue.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Amount + Currency */}
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div>
              <label className={labelCls}>Amount</label>
              <div className="flex items-center overflow-hidden rounded-xl border border-[#e9eaeb] bg-white shadow-xs transition focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#eff4ff]">
                <span className="flex h-full items-center border-r border-[#e9eaeb] bg-[#f9fafb] px-3 py-2.5 text-[13px] font-semibold text-[#a4a7ae]">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => set('amount', e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent px-3 py-2.5 text-[13px] font-semibold text-[#181d27] placeholder:text-[#a4a7ae] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={inputCls}>
                <option value="USD">USD</option>
                <option value="USDC">USDC</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          {/* Category + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <select
                value={form.category}
                onChange={(e) => set('category', e.target.value as ExpenseCategory)}
                className={inputCls}
              >
                {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => (
                  <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input
                type="date"
                value={form.date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set('date', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className={labelCls}>Note <span className="font-normal text-[#a4a7ae]">(optional)</span></label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="What was this expense for?"
              className={inputCls}
            />
          </div>

          {/* Client */}
          {clients.length > 0 && (
            <div>
              <label className={labelCls}>Link to client <span className="font-normal text-[#a4a7ae]">(optional)</span></label>
              <select value={form.clientId} onChange={(e) => set('clientId', e.target.value)} className={inputCls}>
                <option value="">No client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !form.amount}>
            {isSaving ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── main component ─── */
export function RevenueClient({
  accessToken,
  initialSummary,
  initialExpenses,
  clientBreakdown,
  projectBreakdown,
  activityFeed,
  paymentSources,
  invoices,
  clients,
}: {
  accessToken: string | null;
  initialSummary: RevenueSummary;
  initialExpenses: ExpenseRecord[];
  clientBreakdown: ClientRevenueBreakdown[];
  projectBreakdown: ProjectRevenueBreakdown[];
  activityFeed: ActivityEvent[];
  paymentSources: PaymentSourceBreakdown[];
  invoices: Invoice[];
  clients: Client[];
}) {
  const { currency } = useCurrency();
  const { toast } = useToast();

  const [range, setRange] = useState<RevenueRange>('30d');
  const [summary, setSummary] = useState<RevenueSummary>(initialSummary);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(initialExpenses);
  const [clientsByRevenue, setClientsByRevenue] = useState<ClientRevenueBreakdown[]>(clientBreakdown);
  const [projectsByRevenue, setProjectsByRevenue] = useState<ProjectRevenueBreakdown[]>(projectBreakdown);
  const [sourceBreakdown, setSourceBreakdown] = useState<PaymentSourceBreakdown[]>(paymentSources);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [isRefreshingRange, setIsRefreshingRange] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const apiOpts = { accessToken };

  const refreshRangeData = useCallback(async (nextRange: RevenueRange) => {
    if (!accessToken) {
      setRange(nextRange);
      return;
    }

    setRange(nextRange);
    setIsRefreshingRange(true);

    try {
      const [nextSummary, nextBreakdown, nextPaymentSources] = await Promise.all([
        hedwigApi.revenueSummary(nextRange, apiOpts),
        hedwigApi.revenueBreakdown(nextRange, apiOpts),
        hedwigApi.revenuePaymentSources(nextRange, apiOpts),
      ]);

      if (!mounted.current) return;

      setSummary(nextSummary);
      setClientsByRevenue(Array.isArray((nextBreakdown as any)?.clients) ? (nextBreakdown as any).clients : []);
      setProjectsByRevenue(Array.isArray((nextBreakdown as any)?.projects) ? (nextBreakdown as any).projects : []);
      setSourceBreakdown(Array.isArray(nextPaymentSources) ? nextPaymentSources : []);
    } catch {
      if (!mounted.current) return;
      toast({
        type: 'error',
        title: 'Could not update revenue range',
        message: 'The latest revenue breakdown could not be loaded.',
      });
    } finally {
      if (mounted.current) setIsRefreshingRange(false);
    }
  }, [accessToken, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveExpense = useCallback(async (form: ExpenseFormState) => {
    setIsSavingExpense(true);
    try {
      const amt = parseFloat(form.amount);
      const payload = {
        amount: amt,
        currency: form.currency,
        convertedAmountUsd: amt,
        category: form.category,
        note: form.note,
        projectId: form.projectId || undefined,
        clientId: form.clientId || undefined,
        date: form.date ? new Date(form.date).toISOString() : undefined,
      };

      if (editingExpense) {
        const updated = await hedwigApi.updateExpense(editingExpense.id, payload, apiOpts);
        if (!mounted.current) return;
        const raw = (updated as any)?.data ?? updated;
        setExpenses((prev) =>
          prev.map((e) =>
            e.id === editingExpense.id
              ? {
                  ...e,
                  amount: amt,
                  currency: form.currency,
                  convertedAmountUsd: amt,
                  category: form.category,
                  date: new Date(form.date).toISOString(),
                  note: form.note,
                  clientId: form.clientId || null,
                  updatedAt: raw?.updated_at ?? new Date().toISOString(),
                }
              : e,
          ),
        );
        toast({ type: 'success', title: 'Expense updated', message: 'The expense has been saved.' });
      } else {
        const created = await hedwigApi.createExpense(payload, apiOpts);
        if (!mounted.current) return;
        const raw = (created as any)?.data ?? created;
        const newExpense: ExpenseRecord = {
          id: raw?.id ?? `exp_${Date.now()}`,
          amount: amt,
          currency: form.currency,
          convertedAmountUsd: amt,
          category: form.category as ExpenseCategory,
          date: raw?.date ?? new Date(form.date).toISOString(),
          note: form.note,
          clientId: raw?.client_id ?? form.clientId ?? null,
          projectId: raw?.project_id ?? form.projectId ?? null,
          sourceType: 'manual',
          createdAt: raw?.created_at ?? new Date().toISOString(),
          updatedAt: raw?.updated_at ?? new Date().toISOString(),
        };
        setExpenses((prev) => [newExpense, ...prev]);
        toast({ type: 'success', title: 'Expense added', message: `$${amt.toLocaleString()} recorded.` });
      }
    } catch {
      if (!mounted.current) return;
      toast({ type: 'error', title: 'Failed to save expense', message: 'Please try again.' });
    } finally {
      if (mounted.current) {
        setIsSavingExpense(false);
        setShowExpenseDialog(false);
        setEditingExpense(null);
      }
    }
  }, [editingExpense, toast, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteExpense = useCallback(async () => {
    if (!deletingExpenseId) return;
    try {
      await hedwigApi.deleteExpense(deletingExpenseId, apiOpts);
      if (!mounted.current) return;
      setExpenses((prev) => prev.filter((e) => e.id !== deletingExpenseId));
      toast({ type: 'success', title: 'Expense deleted', message: 'The expense has been removed.' });
    } catch {
      if (!mounted.current) return;
      toast({ type: 'error', title: 'Failed to delete expense', message: 'Please try again.' });
    } finally {
      if (mounted.current) setDeletingExpenseId(null);
    }
  }, [deletingExpenseId, toast, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAddExpense = () => { setEditingExpense(null); setShowExpenseDialog(true); };
  const openEditExpense = (exp: ExpenseRecord) => { setEditingExpense(exp); setShowExpenseDialog(true); };

  /* derived */
  const unpaidInvoices = invoices.filter((inv) => inv.status === 'sent' || inv.status === 'viewed');
  const overdueInvoices = invoices.filter((inv) => inv.status === 'overdue');
  const paidInvoices = invoices.filter((inv) => inv.status === 'paid').slice(0, 3);

  const netTrend: 'up' | 'down' | 'neutral' =
    summary.revenueDeltaPct > 0 ? 'up' : summary.revenueDeltaPct < 0 ? 'down' : 'neutral';

  const totalExpensesDisplay = expenses.reduce((s, e) => s + e.convertedAmountUsd, 0);
  const netRevenueDisplay = summary.paidRevenue - totalExpensesDisplay;

  const clientForId = (id: string | null) => clients.find((c) => c.id === id);

  return (
    <div className="flex flex-col gap-6">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[15px] font-semibold text-[#181d27]">Revenue</h1>
          <p className="mt-0.5 text-[13px] text-[#a4a7ae]">Operational financial dashboard — what is happening with your money right now.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 mt-0.5">
          <Button variant="secondary" onClick={() => setShowExportDialog(true)}>
            <DownloadSimple className="h-4 w-4" weight="bold" />
            Export
          </Button>
        </div>
        <ExportDialog open={showExportDialog} onOpenChange={setShowExportDialog} clients={clients} />
      </div>

      {/* ── Range filter ── */}
      <div className="flex items-center gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => refreshRangeData(r)}
            disabled={isRefreshingRange && range === r}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition duration-100 ease-linear ${
              range === r
                ? 'bg-[#181d27] text-white'
                : 'text-[#717680] hover:bg-[#f2f4f7] hover:text-[#344054]'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb] sm:grid-cols-6">
        {/* Total Revenue */}
        <div className="flex flex-col bg-white px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium text-[#717680]">Total revenue</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]">
              <CurrencyDollar className="h-3.5 w-3.5 text-[#717680]" weight="regular" />
            </div>
          </div>
          <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">
            {formatCompactCurrency(summary.totalRevenue, currency)}
          </p>
          <div className="mt-1.5 flex items-center gap-1">
            {netTrend === 'up' && <ArrowUpRight className="h-3 w-3 text-[#12b76a]" weight="bold" />}
            {netTrend === 'down' && <ArrowDownRight className="h-3 w-3 text-[#f04438]" weight="bold" />}
            <p className="text-[11px] text-[#a4a7ae]">
              {summary.revenueDeltaPct >= 0 ? '+' : ''}{summary.revenueDeltaPct.toFixed(0)}% vs prev period
            </p>
          </div>
        </div>

        {/* Paid */}
        <Link href="/payments" className="flex flex-col bg-white px-5 py-4 transition duration-100 ease-linear hover:bg-[#fafafa]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium text-[#717680]">Paid</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]">
              <CheckCircle className="h-3.5 w-3.5 text-[#717680]" weight="regular" />
            </div>
          </div>
          <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">
            {formatCompactCurrency(summary.paidRevenue, currency)}
          </p>
          <p className="mt-1.5 text-[11px] text-[#a4a7ae]">Collected</p>
        </Link>

        {/* Pending */}
        <Link href="/payments" className="flex flex-col bg-white px-5 py-4 transition duration-100 ease-linear hover:bg-[#fafafa]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium text-[#717680]">Pending</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]">
              <Receipt className="h-3.5 w-3.5 text-[#717680]" weight="regular" />
            </div>
          </div>
          <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">
            {formatCompactCurrency(summary.pendingRevenue, currency)}
          </p>
          <p className="mt-1.5 text-[11px] text-[#a4a7ae]">Awaiting payment</p>
        </Link>

        {/* Overdue */}
        <Link href="/payments" className="flex flex-col bg-white px-5 py-4 transition duration-100 ease-linear hover:bg-[#fafafa]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium text-[#717680]">Overdue</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fff1f0]">
              <Warning className="h-3.5 w-3.5 text-[#f04438]" weight="regular" />
            </div>
          </div>
          <p className={`text-[22px] font-bold tracking-[-0.03em] leading-none ${summary.overdueRevenue > 0 ? 'text-[#b42318]' : 'text-[#181d27]'}`}>
            {formatCompactCurrency(summary.overdueRevenue, currency)}
          </p>
          <p className="mt-1.5 text-[11px] text-[#a4a7ae]">
            {overdueInvoices.length} invoice{overdueInvoices.length !== 1 ? 's' : ''}
          </p>
        </Link>

        {/* Expenses */}
        <div className="flex flex-col bg-white px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium text-[#717680]">Expenses</p>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f5f5]">
              <FileText className="h-3.5 w-3.5 text-[#717680]" weight="regular" />
            </div>
          </div>
          <p className="text-[22px] font-bold tracking-[-0.03em] leading-none text-[#181d27]">
            {formatCompactCurrency(totalExpensesDisplay, currency)}
          </p>
          <p className="mt-1.5 text-[11px] text-[#a4a7ae]">{expenses.length} recorded</p>
        </div>

        {/* Net Revenue */}
        <div className="flex flex-col bg-white px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-medium text-[#717680]">Net revenue</p>
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${netRevenueDisplay >= 0 ? 'bg-[#ecfdf3]' : 'bg-[#fff1f0]'}`}>
              {netRevenueDisplay >= 0
                ? <ArrowUpRight className="h-3.5 w-3.5 text-[#12b76a]" weight="bold" />
                : <ArrowDownRight className="h-3.5 w-3.5 text-[#f04438]" weight="bold" />
              }
            </div>
          </div>
          <p className={`text-[22px] font-bold tracking-[-0.03em] leading-none ${netRevenueDisplay >= 0 ? 'text-[#181d27]' : 'text-[#b42318]'}`}>
            {formatCompactCurrency(netRevenueDisplay, currency)}
          </p>
          <p className="mt-1.5 text-[11px] text-[#a4a7ae]">Paid minus expenses</p>
        </div>
      </div>

      {/* ── Invoice Status + Revenue Breakdown ── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Invoice Status */}
        <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
          <div className="flex items-center justify-between border-b border-[#f5f5f5] px-5 py-4">
            <h2 className="text-[15px] font-semibold text-[#181d27]">Invoice status</h2>
            <Link href="/payments" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2563eb] hover:text-[#1d4ed8]">
              All invoices <ArrowRight className="h-3.5 w-3.5" weight="bold" />
            </Link>
          </div>

          {/* Unpaid */}
          <div className="border-b border-[#f5f5f5] px-5 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
              Unpaid ({unpaidInvoices.length})
            </p>
            {unpaidInvoices.length === 0 ? (
              <p className="py-1 text-[13px] text-[#a4a7ae]">No unpaid invoices</p>
            ) : (
              <div className="space-y-1">
                {unpaidInvoices.slice(0, 3).map((inv) => (
                  <Link key={inv.id} href="/payments" className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-[#fafafa]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#181d27]">{inv.number}</p>
                      <p className="text-[11px] text-[#a4a7ae]">Due {formatShortDate(inv.dueAt)}</p>
                    </div>
                    <div className="ml-3 flex items-center gap-2 shrink-0">
                      <span className="text-[13px] font-semibold text-[#181d27]">
                        {formatCompactCurrency(inv.amountUsd, currency)}
                      </span>
                      <StatusPill status={inv.status} />
                      <ArrowRight className="h-3.5 w-3.5 text-[#d5d7da]" weight="bold" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Overdue */}
          <div className="border-b border-[#f5f5f5] px-5 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
              Overdue ({overdueInvoices.length})
            </p>
            {overdueInvoices.length === 0 ? (
              <p className="py-1 text-[13px] text-[#a4a7ae]">No overdue invoices</p>
            ) : (
              <div className="space-y-1">
                {overdueInvoices.slice(0, 3).map((inv) => (
                  <Link key={inv.id} href="/payments" className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-[#fafafa]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#181d27]">{inv.number}</p>
                      <p className="text-[11px] text-[#f04438]">Was due {formatShortDate(inv.dueAt)}</p>
                    </div>
                    <div className="ml-3 flex items-center gap-2 shrink-0">
                      <span className="text-[13px] font-semibold text-[#b42318]">
                        {formatCompactCurrency(inv.amountUsd, currency)}
                      </span>
                      <StatusPill status="overdue" />
                      <ArrowRight className="h-3.5 w-3.5 text-[#d5d7da]" weight="bold" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recently Paid */}
          <div className="px-5 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
              Recently paid
            </p>
            {paidInvoices.length === 0 ? (
              <p className="py-1 text-[13px] text-[#a4a7ae]">No paid invoices yet</p>
            ) : (
              <div className="space-y-1">
                {paidInvoices.map((inv) => (
                  <Link key={inv.id} href="/payments" className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-[#fafafa]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#181d27]">{inv.number}</p>
                      <p className="text-[11px] text-[#a4a7ae]">Paid {formatShortDate(inv.dueAt)}</p>
                    </div>
                    <div className="ml-3 flex items-center gap-2 shrink-0">
                      <span className="text-[13px] font-semibold text-[#027a48]">
                        {formatCompactCurrency(inv.amountUsd, currency)}
                      </span>
                      <StatusPill status="paid" />
                      <ArrowRight className="h-3.5 w-3.5 text-[#d5d7da]" weight="bold" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </article>

        {/* Revenue Breakdown */}
        <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
          <div className="border-b border-[#f5f5f5] px-5 py-4">
            <h2 className="text-[15px] font-semibold text-[#181d27]">Revenue breakdown</h2>
          </div>

          {/* By Client */}
          <div className="border-b border-[#f5f5f5] px-5 py-3">
            <div className="flex items-center gap-2 mb-3">
              <UsersThree className="h-3.5 w-3.5 text-[#a4a7ae]" weight="regular" />
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">By client</p>
            </div>
            <div className="space-y-3">
              {clientsByRevenue.map((c) => (
                <div key={c.clientId}>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#181d27]">{c.company || c.clientName}</p>
                    </div>
                    <div className="ml-3 flex items-center gap-2 shrink-0">
                      <span className="text-[13px] font-semibold text-[#181d27]">
                        {formatCompactCurrency(c.totalRevenue, currency)}
                      </span>
                      <span className="w-9 text-right text-[11px] text-[#a4a7ae]">{c.shareOfTotal.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-[#f2f4f7]">
                    <div
                      className="h-full rounded-full bg-[#2563eb] transition-all"
                      style={{ width: `${c.shareOfTotal}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By Project */}
          <div className="px-5 py-3">
            <div className="flex items-center gap-2 mb-3">
              <FolderSimple className="h-3.5 w-3.5 text-[#a4a7ae]" weight="regular" />
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">By project</p>
            </div>
            <div className="space-y-2">
              {projectsByRevenue.map((p, i) => (
                <div key={p.projectId} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-[11px] font-semibold text-[#c1c5cd]">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#181d27]">{p.projectName}</p>
                    <p className="text-[11px] text-[#a4a7ae]">{p.clientName}</p>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold text-[#181d27]">
                    {formatCompactCurrency(p.totalRevenue, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>

      {/* ── Expense Tracking ── */}
      <article className="overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
        <div className="flex items-center justify-between border-b border-[#f5f5f5] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[#181d27]">Expenses</h2>
            <p className="mt-0.5 text-[13px] text-[#717680]">
              {expenses.length > 0
                ? `${expenses.length} expense${expenses.length !== 1 ? 's' : ''} · ${formatCompactCurrency(totalExpensesDisplay, currency)} total`
                : 'No expenses recorded yet'}
            </p>
          </div>
          <Button onClick={openAddExpense}>
            <Plus className="h-4 w-4" weight="bold" />
            Add expense
          </Button>
        </div>

        {expenses.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5f5f5]">
              <FileText className="h-5 w-5 text-[#a4a7ae]" weight="regular" />
            </div>
            <p className="text-[14px] font-semibold text-[#414651]">No expenses yet</p>
            <p className="text-[13px] text-[#a4a7ae]">
              Track your business costs to see your true net revenue.
            </p>
            <Button variant="secondary" onClick={openAddExpense}>
              <Plus className="h-4 w-4" weight="bold" />
              Add first expense
            </Button>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_100px_110px_44px] border-b border-[#f5f5f5] bg-[#fafafa] px-5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Description</p>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Category</p>
              <p className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Amount</p>
              <p className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Date</p>
              <p />
            </div>

            {/* Table rows */}
            <div className="divide-y divide-[#f9fafb]">
              {expenses.map((exp) => {
                const linkedClient = clientForId(exp.clientId);
                const actions = [
                  {
                    label: 'Edit',
                    icon: NotePencil,
                    onClick: () => openEditExpense(exp),
                  },
                  {
                    label: 'Delete',
                    icon: Trash,
                    variant: 'danger' as const,
                    onClick: () => setDeletingExpenseId(exp.id),
                  },
                ];
                return (
                  <div key={exp.id} className="grid grid-cols-[1fr_120px_100px_110px_44px] items-center px-5 py-3.5 hover:bg-[#fafafa]">
                    <div className="min-w-0 pr-4">
                      <p className="truncate text-[13px] font-semibold text-[#181d27]">
                        {exp.note || CATEGORY_LABELS[exp.category]}
                      </p>
                      {linkedClient && (
                        <p className="mt-0.5 text-[11px] text-[#a4a7ae]">{linkedClient.name}</p>
                      )}
                    </div>
                    <div>
                      <CategoryPill category={exp.category} />
                    </div>
                    <p className="text-right text-[13px] font-semibold text-[#181d27]">
                      {formatCompactCurrency(exp.convertedAmountUsd, currency)}
                    </p>
                    <p className="text-right text-[12px] text-[#717680]">
                      {formatShortDate(exp.date)}
                    </p>
                    <div className="flex justify-end">
                      <RowActionsMenu items={actions} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </article>

      {/* ── Activity Feed + Payment Sources ── */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">

        {/* Recent Activity */}
        <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
          <div className="border-b border-[#f5f5f5] px-5 py-4">
            <h2 className="text-[15px] font-semibold text-[#181d27]">Recent activity</h2>
            <p className="mt-0.5 text-[13px] text-[#717680]">Latest financial events from your account.</p>
          </div>
          {activityFeed.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <p className="text-[13px] font-semibold text-[#414651]">No recent activity</p>
              <p className="text-[12px] text-[#a4a7ae]">Activity appears here as invoices are paid and expenses are added.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#f9fafb]">
              {activityFeed.map((evt) => {
                const colors = ACTIVITY_COLORS[evt.type];
                return (
                  <div key={evt.id} className="flex items-start gap-3 px-5 py-4 hover:bg-[#fafafa]">
                    <div className={`mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${colors.bg}`}>
                      <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#181d27]">{evt.title}</p>
                      <p className="mt-0.5 text-[12px] text-[#717680]">{evt.description}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {evt.amount !== undefined && (
                        <p className="text-[13px] font-semibold text-[#181d27]">
                          {formatCompactCurrency(evt.amount, currency)}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-[#a4a7ae]">{formatTimeAgo(evt.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        {/* Payment Sources */}
        <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-[#e9eaeb]">
          <div className="border-b border-[#f5f5f5] px-5 py-4">
            <h2 className="text-[15px] font-semibold text-[#181d27]">Payment sources</h2>
            <p className="mt-0.5 text-[13px] text-[#717680]">Where your revenue comes from.</p>
          </div>
          {sourceBreakdown.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
              <p className="text-[13px] font-semibold text-[#414651]">No payment sources yet</p>
              <p className="text-[12px] text-[#a4a7ae]">Revenue sources appear as invoices and payment links are collected.</p>
            </div>
          ) : (
          <div className="flex flex-1 flex-col justify-center px-5 py-5 gap-4">
            {sourceBreakdown.map((src) => (
              <div key={src.source}>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-[#181d27]">{src.label}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#181d27]">
                      {formatCompactCurrency(src.amount, currency)}
                    </span>
                    <span className="w-8 text-right text-[11px] font-semibold text-[#a4a7ae]">
                      {src.shareOfTotal.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f2f4f7]">
                  <div
                    className="h-full rounded-full bg-[#2563eb] transition-all"
                    style={{ width: `${src.shareOfTotal}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-[#a4a7ae]">{src.count} transaction{src.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
          )}

          {/* Footer: net revenue callout */}
          <div className="border-t border-[#f5f5f5] px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-[#717680]">Net revenue this period</p>
              <p className={`text-[16px] font-bold tracking-[-0.02em] ${netRevenueDisplay >= 0 ? 'text-[#027a48]' : 'text-[#b42318]'}`}>
                {formatCompactCurrency(netRevenueDisplay, currency)}
              </p>
            </div>
          </div>
        </article>
      </div>

      {/* ── Dialogs ── */}
      <ExpenseDialog
        open={showExpenseDialog}
        editing={editingExpense}
        clients={clients}
        onSave={handleSaveExpense}
        onClose={() => { setShowExpenseDialog(false); setEditingExpense(null); }}
        isSaving={isSavingExpense}
      />

      <DeleteDialog
        open={!!deletingExpenseId}
        title="Delete expense"
        description="This expense will be permanently removed. This cannot be undone."
        onConfirm={handleDeleteExpense}
        onOpenChange={(o) => { if (!o) setDeletingExpenseId(null); }}
      />
    </div>
  );
}
