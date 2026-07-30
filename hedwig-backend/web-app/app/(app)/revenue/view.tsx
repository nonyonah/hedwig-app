'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarBlank,
  CaretDown,
  ChartBar,
  CheckCircle,
  Coins,
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
import { Button as HButton, Dropdown, Label, Table } from '@heroui/react';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogDescription,
 DialogBody,
 DialogFooter,
} from '@/components/ui/dialog';
import { DeleteDialog } from '@/components/data/delete-dialog';
import { RowActionsMenu } from '@/components/data/row-actions-menu';
import { useToast } from '@/components/providers/toast-provider';
import { useCurrency } from '@/components/providers/currency-provider';
import { useAssistantPageContext } from '@/lib/hooks/use-assistant-page-context';
import { formatShortDate } from '@/lib/utils';
import { hedwigApi } from '@/lib/api/client';
import { ContextualSuggestions } from '@/components/assistant/contextual-suggestions';
import { normalizeExpenseRecord } from '@/lib/revenue-analytics';
import { ImportDialog } from './import-dialog';
import type { Invoice, Client } from '@/lib/models/entities';
import { openPaymentDetail } from '@/lib/payments/open-detail';
import type {
 RevenueSummary,
 ExpenseRecord,
 ExpenseCategory,
 ClientRevenueBreakdown,
 ProjectRevenueBreakdown,
 ActivityEvent,
 PaymentSourceBreakdown,
 RevenueMetrics,
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
  contractors: 'Contractors',
  marketing: 'Marketing',
  travel: 'Travel',
  meals: 'Meals',
  office: 'Office',
  operations: 'Operations',
  taxes: 'Taxes',
  subscriptions: 'Subscriptions',
  shopping: 'Shopping',
  entertainment: 'Entertainment',
  groceries: 'Groceries',
  utilities: 'Utilities',
  health: 'Health',
  education: 'Education',
  transportation: 'Transportation',
  rent: 'Rent',
  personal_care: 'Personal Care',
  other: 'Other',
};

const CATEGORY_COLORS: Record<ExpenseCategory, { bg: string; text: string }> = {
  software: { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  contractors: { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  marketing: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
  travel: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  meals: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  office: { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  operations: { bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-secondary)]' },
  taxes: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
  subscriptions: { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-primary-dark)]' },
  shopping: { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  entertainment: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
  groceries: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  utilities: { bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-secondary)]' },
  health: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
  education: { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  transportation: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
  rent: { bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-secondary)]' },
  personal_care: { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  other: { bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
};

const ACTIVITY_COLORS: Record<ActivityEvent['type'], { dot: string; bg: string }> = {
 invoice_paid: { dot: 'bg-[var(--color-success)]', bg: 'bg-[var(--color-success-soft)]' },
 payment_received:{ dot: 'bg-[var(--color-success)]', bg: 'bg-[var(--color-success-soft)]' },
 payment_link_paid:{ dot: 'bg-[var(--color-success)]', bg: 'bg-[var(--color-success-soft)]' },
 invoice_sent: { dot: 'bg-[var(--color-accent)]', bg: 'bg-[var(--color-accent-soft)]' },
 invoice_created: { dot: 'bg-[var(--color-accent)]', bg: 'bg-[var(--color-accent-soft)]' },
 payment_link_active:{ dot: 'bg-[var(--color-accent)]', bg: 'bg-[var(--color-accent-soft)]' },
 invoice_overdue: { dot: 'bg-[var(--color-danger)]', bg: 'bg-[var(--color-danger-soft)]' },
 expense_added: { dot: 'bg-[var(--color-warning)]', bg: 'bg-[var(--color-warning-soft)]' },
};
const DEFAULT_ACTIVITY_COLORS = { dot: 'bg-[var(--color-text-muted)]', bg: 'bg-[var(--color-surface-tertiary)]' };

const INV_STATUS = {
 draft: { dot: 'bg-[var(--color-text-muted)]', label: 'Draft', bg: 'bg-[var(--color-surface-tertiary)]', text: 'text-[var(--color-text-tertiary)]' },
 sent: { dot: 'bg-[var(--color-accent)]', label: 'Sent', bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
 viewed: { dot: 'bg-[var(--color-accent)]', label: 'Viewed', bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-text-tertiary)]' },
 paid: { dot: 'bg-[var(--color-success)]', label: 'Paid', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
 overdue: { dot: 'bg-[var(--color-danger)]', label: 'Overdue', bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' },
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
 const c = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other;
 const label = CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other;
 return (
 <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.bg} ${c.text}`}>
 {label}
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

interface CreditFormState {
 amount: string;
 currency: string;
 date: string;
 title: string;
 note: string;
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

const EMPTY_CREDIT_FORM: CreditFormState = {
 amount: '',
 currency: 'USD',
 date: new Date().toISOString().slice(0, 10),
 title: '',
 note: '',
 clientId: '',
};

function ExpenseDialog({
 open,
 editing,
 clients,
 currencyOptions,
 defaultCurrency,
 onSave,
 onClose,
 isSaving,
}: {
 open: boolean;
 editing: ExpenseRecord | null;
 clients: Pick<Client, 'id' | 'name'>[];
 currencyOptions: Array<{ code: string; label: string; symbol: string; flag?: string }>;
 defaultCurrency: string;
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
 : { ...EMPTY_FORM, currency: defaultCurrency },
 );
 }
 }, [defaultCurrency, open, editing]);

 const set = (field: keyof ExpenseFormState, value: string) =>
 setForm((prev) => ({ ...prev, [field]: value }));

 const handleSave = () => {
 const amount = parseFloat(form.amount.replace(/[^0-9.]/g, ''));
 if (!Number.isFinite(amount) || amount <= 0) return;
 onSave(form);
 };

 const inputCls =
 'w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-[13px] text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]';
 const labelCls = 'mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]';
 const selectedCurrency = currencyOptions.find((option) => option.code === form.currency)
 ?? { code: form.currency, label: form.currency, symbol: form.currency };
 const currencyChoices = currencyOptions.some((option) => option.code === form.currency)
 ? currencyOptions
 : [{ code: form.currency, label: form.currency, symbol: form.currency }, ...currencyOptions];

 return (
 <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="2xl">
 <DialogContent>
 <DialogHeader>
 <DialogTitle>{editing ? 'Edit expense' : 'Add expense'}</DialogTitle>
 <DialogDescription>
 {editing ? 'Update this expense record.' : 'Record a business expense to track against your revenue.'}
 </DialogDescription>
 </DialogHeader>

 <DialogBody className="space-y-4">
  {/* Amount + Currency */}
  <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-3">
  <div>
  <label className={labelCls}>Amount</label>
  <div className="flex items-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs transition focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent-soft)]">
  <span className="flex h-full items-center border-r border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-muted)]">
  {selectedCurrency.symbol}
  </span>
  <Input
  type="number"
  min="0"
  step="0.01"
  value={form.amount}
  onChange={(e) => set('amount', e.target.value)}
  placeholder="0.00"
  className="flex-1 bg-transparent px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none border-0 shadow-none focus-visible:ring-0"
  />
  </div>
  </div>
  <div>
  <label className={labelCls}>Currency</label>
  <Dropdown>
    <HButton
      variant="secondary"
      className="flex h-10 w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-medium text-[var(--color-text-primary)]"
      aria-label="Select currency"
    >
      <span>{currencyChoices.find((o) => o.code === form.currency)?.code || form.currency} - {currencyChoices.find((o) => o.code === form.currency)?.label || form.currency}</span>
      <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
    </HButton>
    <Dropdown.Popover className="min-w-[200px]">
      <Dropdown.Menu
        selectedKeys={new Set([form.currency])}
        selectionMode="single"
        onSelectionChange={(keys) => {
          const key = [...keys][0];
          if (key) set('currency', key as string);
        }}
      >
        {currencyChoices.map((option) => (
          <Dropdown.Item key={option.code} id={option.code} textValue={`${option.code} - ${option.label}`}>
            <Label>{option.code} - {option.label}</Label>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown.Popover>
  </Dropdown>
  </div>
  </div>

  {/* Category + Date */}
  <div className="grid grid-cols-2 gap-3">
  <div>
  <label className={labelCls}>Category</label>
  <Dropdown>
    <HButton
      variant="secondary"
      className="flex h-10 w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-medium text-[var(--color-text-primary)]"
      aria-label="Select category"
    >
      <span>{CATEGORY_LABELS[form.category as ExpenseCategory] || 'Select category'}</span>
      <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
    </HButton>
    <Dropdown.Popover className="min-w-[200px]">
      <Dropdown.Menu
        selectedKeys={new Set([form.category])}
        selectionMode="single"
        onSelectionChange={(keys) => {
          const key = [...keys][0];
          if (key) set('category', key as ExpenseCategory);
        }}
      >
        {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => (
          <Dropdown.Item key={cat} id={cat} textValue={CATEGORY_LABELS[cat]}>
            <Label>{CATEGORY_LABELS[cat]}</Label>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown.Popover>
  </Dropdown>
  </div>
 <div>
 <label className={labelCls}>Date</label>
  <DateInput
  value={form.date}
  onChange={(v) => set('date', v)}
  className={inputCls}
  />
  </div>
  </div>

  {/* Note */}
  <div>
  <label className={labelCls}>Note <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></label>
  <Input
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
  <label className={labelCls}>Link to client <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></label>
  <Dropdown>
    <HButton
      variant="secondary"
      className="flex h-10 w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-medium text-[var(--color-text-primary)]"
      aria-label="Select client"
    >
      <span>{form.clientId ? (clients.find((c) => c.id === form.clientId)?.name || 'No client') : 'No client'}</span>
      <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
    </HButton>
    <Dropdown.Popover className="min-w-[240px]">
      <Dropdown.Menu
        selectedKeys={form.clientId ? new Set([form.clientId]) : new Set([''])}
        selectionMode="single"
        onSelectionChange={(keys) => {
          const key = [...keys][0];
          set('clientId', (key as string) || '');
        }}
      >
        <Dropdown.Item key="" id="" textValue="No client">
          <Label>No client</Label>
        </Dropdown.Item>
        {clients.map((c) => (
          <Dropdown.Item key={c.id} id={c.id} textValue={c.name}>
            <Label>{c.name}</Label>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown.Popover>
  </Dropdown>
  </div>
  )}
 </DialogBody>

 <DialogFooter>
 <Button variant="secondary" onClick={onClose} disabled={isSaving}>
 Cancel
 </Button>
 <Button className="create-btn" onClick={handleSave} disabled={isSaving || !form.amount}>
 {isSaving ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

function CreditDialog({
 open,
 clients,
 currencyOptions,
 defaultCurrency,
 onSave,
 onClose,
 isSaving,
}: {
 open: boolean;
 clients: Pick<Client, 'id' | 'name'>[];
 currencyOptions: Array<{ code: string; label: string; symbol: string; flag?: string }>;
 defaultCurrency: string;
 onSave: (form: CreditFormState) => void;
 onClose: () => void;
 isSaving: boolean;
}) {
 const [form, setForm] = useState<CreditFormState>(EMPTY_CREDIT_FORM);

 useEffect(() => {
 if (open) setForm({ ...EMPTY_CREDIT_FORM, currency: defaultCurrency });
 }, [defaultCurrency, open]);

 const set = (field: keyof CreditFormState, value: string) =>
 setForm((prev) => ({ ...prev, [field]: value }));

 const handleSave = () => {
 const amount = parseFloat(form.amount.replace(/[^0-9.]/g, ''));
 if (!Number.isFinite(amount) || amount <= 0) return;
 onSave(form);
 };

 const inputCls =
 'w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-[13px] text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]';
 const labelCls = 'mb-1.5 block text-[12px] font-semibold text-[var(--color-text-secondary)]';
 const selectedCurrency = currencyOptions.find((option) => option.code === form.currency)
 ?? { code: form.currency, label: form.currency, symbol: form.currency };
 const currencyChoices = currencyOptions.some((option) => option.code === form.currency)
 ? currencyOptions
 : [{ code: form.currency, label: form.currency, symbol: form.currency }, ...currencyOptions];

 return (
 <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="2xl">
 <DialogContent>
 <DialogHeader>
 <DialogTitle>Record credit</DialogTitle>
 <DialogDescription>
 Add money received as paid revenue for bookkeeping.
 </DialogDescription>
 </DialogHeader>

 <DialogBody className="space-y-4">
 <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-3">
 <div>
 <label className={labelCls}>Amount</label>
 <div className="flex items-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs transition focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent-soft)]">
 <span className="flex h-full items-center border-r border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-muted)]">
 {selectedCurrency.symbol}
 </span>
 <Input
 type="number"
 min="0"
 step="0.01"
 value={form.amount}
 onChange={(e) => set('amount', e.target.value)}
 placeholder="0.00"
 className="flex-1 bg-transparent px-3 py-2.5 text-[13px] font-semibold text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none border-0 shadow-none focus-visible:ring-0"
 />
 </div>
 </div>
  <div>
  <label className={labelCls}>Currency</label>
  <Dropdown>
    <HButton
      variant="secondary"
      className="flex h-10 w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-medium text-[var(--color-text-primary)]"
      aria-label="Select currency"
    >
      <span>{currencyChoices.find((o) => o.code === form.currency)?.code || form.currency} - {currencyChoices.find((o) => o.code === form.currency)?.label || form.currency}</span>
      <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
    </HButton>
    <Dropdown.Popover className="min-w-[200px]">
      <Dropdown.Menu
        selectedKeys={new Set([form.currency])}
        selectionMode="single"
        onSelectionChange={(keys) => {
          const key = [...keys][0];
          if (key) set('currency', key as string);
        }}
      >
        {currencyChoices.map((option) => (
          <Dropdown.Item key={option.code} id={option.code} textValue={`${option.code} - ${option.label}`}>
            <Label>{option.code} - {option.label}</Label>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown.Popover>
  </Dropdown>
  </div>
  </div>

  <div className="grid grid-cols-2 gap-3">
  <div>
  <label className={labelCls}>Title</label>
  <Input
  type="text"
  value={form.title}
  onChange={(e) => set('title', e.target.value)}
  placeholder="Client transfer"
  className={inputCls}
  />
  </div>
 <div>
 <label className={labelCls}>Date</label>
  <DateInput
  value={form.date}
  onChange={(v) => set('date', v)}
  className={inputCls}
  />
  </div>
  </div>

  <div>
  <label className={labelCls}>Note <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></label>
  <Input
  type="text"
  value={form.note}
  onChange={(e) => set('note', e.target.value)}
  placeholder="Where did this credit come from?"
  className={inputCls}
  />
  </div>

  {clients.length > 0 && (
  <div>
  <label className={labelCls}>Link to client <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></label>
  <Dropdown>
    <HButton
      variant="secondary"
      className="flex h-10 w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] font-medium text-[var(--color-text-primary)]"
      aria-label="Select client"
    >
      <span>{form.clientId ? (clients.find((c) => c.id === form.clientId)?.name || 'No client') : 'No client'}</span>
      <CaretDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" weight="bold" />
    </HButton>
    <Dropdown.Popover className="min-w-[240px]">
      <Dropdown.Menu
        selectedKeys={form.clientId ? new Set([form.clientId]) : new Set([''])}
        selectionMode="single"
        onSelectionChange={(keys) => {
          const key = [...keys][0];
          set('clientId', (key as string) || '');
        }}
      >
        <Dropdown.Item key="" id="" textValue="No client">
          <Label>No client</Label>
        </Dropdown.Item>
        {clients.map((c) => (
          <Dropdown.Item key={c.id} id={c.id} textValue={c.name}>
            <Label>{c.name}</Label>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown.Popover>
  </Dropdown>
  </div>
  )}
  </DialogBody>

  <DialogFooter>
  <Button variant="secondary" onClick={onClose} disabled={isSaving}>
  Cancel
  </Button>
  <Button className="create-btn" onClick={handleSave} disabled={isSaving || !form.amount}>
  {isSaving ? 'Saving…' : 'Record credit'}
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
 initialMetrics,
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
 initialMetrics: RevenueMetrics;
}) {
 const { currency, options: currencyOptions, formatAmount, convertToUsd, formatNative } = useCurrency();
 const { toast } = useToast();

 useAssistantPageContext('Revenue', {
 totalRevenue: initialSummary.totalRevenue,
 netRevenue: initialSummary.netRevenue,
 expensesCount: initialExpenses.length,
 clientCount: clientBreakdown.length,
 projectCount: projectBreakdown.length,
 });

 const [range, setRange] = useState<RevenueRange>('30d');
 const [summary, setSummary] = useState<RevenueSummary>(initialSummary);
 const [expenses, setExpenses] = useState<ExpenseRecord[]>(initialExpenses);
 const [clientsByRevenue, setClientsByRevenue] = useState<ClientRevenueBreakdown[]>(clientBreakdown);
 const [projectsByRevenue, setProjectsByRevenue] = useState<ProjectRevenueBreakdown[]>(projectBreakdown);
 const [sourceBreakdown, setSourceBreakdown] = useState<PaymentSourceBreakdown[]>(paymentSources);
 const [activityItems, setActivityItems] = useState<ActivityEvent[]>(activityFeed);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const [showAddExpenseDialog, setShowAddExpenseDialog] = useState(false);
 const [showExpenseDialog, setShowExpenseDialog] = useState(false);
 const [showCreditDialog, setShowCreditDialog] = useState(false);
 const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
 const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
 const [isSavingExpense, setIsSavingExpense] = useState(false);
 const [isSavingCredit, setIsSavingCredit] = useState(false);
 const [isDeletingExpense, setIsDeletingExpense] = useState(false);
 const [metrics, setMetrics] = useState<RevenueMetrics>(initialMetrics);
 const [isRefreshingRange, setIsRefreshingRange] = useState(false);
const [showAllExpenses, setShowAllExpenses] = useState(false);
 const mounted = useRef(true);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

 // Click outside to close import menu
 useEffect(() => {
   if (!showImportMenu) return;
   const handleClick = (e: MouseEvent) => {
     if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
       setShowImportMenu(false);
     }
   };
   document.addEventListener('mousedown', handleClick);
   return () => document.removeEventListener('mousedown', handleClick);
  }, [showImportMenu]);

  const apiOpts = { accessToken };

 const refreshRangeData = useCallback(async (nextRange: RevenueRange) => {
 if (!accessToken) {
 setRange(nextRange);
 return;
 }

 setRange(nextRange);
 setIsRefreshingRange(true);

 try {
 const [nextSummary, nextBreakdown, nextPaymentSources, nextMetrics] = await Promise.all([
 hedwigApi.revenueSummary(nextRange, apiOpts),
 hedwigApi.revenueBreakdown(nextRange, apiOpts),
 hedwigApi.revenuePaymentSources(nextRange, apiOpts),
 hedwigApi.revenueMetrics(nextRange, apiOpts).catch(() => null),
 ]);

 if (!mounted.current) return;

 setSummary(nextSummary);
 setClientsByRevenue(Array.isArray((nextBreakdown as any)?.clients) ? (nextBreakdown as any).clients : []);
 setProjectsByRevenue(Array.isArray((nextBreakdown as any)?.projects) ? (nextBreakdown as any).projects : []);
 setSourceBreakdown(Array.isArray(nextPaymentSources) ? nextPaymentSources : []);
 if (nextMetrics) setMetrics(nextMetrics);
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

 const refreshRevenueData = useCallback(async () => {
 if (!accessToken) return;
 try {
 const [nextSummary, nextBreakdown, nextPaymentSources, nextActivity] = await Promise.all([
 hedwigApi.revenueSummary(range, apiOpts),
 hedwigApi.revenueBreakdown(range, apiOpts),
 hedwigApi.revenuePaymentSources(range, apiOpts),
 hedwigApi.revenueActivity(apiOpts),
 ]);
 if (!mounted.current) return;
 setSummary(nextSummary);
 setClientsByRevenue(Array.isArray((nextBreakdown as any)?.clients) ? (nextBreakdown as any).clients : []);
 setProjectsByRevenue(Array.isArray((nextBreakdown as any)?.projects) ? (nextBreakdown as any).projects : []);
 setSourceBreakdown(Array.isArray(nextPaymentSources) ? nextPaymentSources : []);
 setActivityItems(Array.isArray(nextActivity) ? nextActivity : []);
 } catch {
 // The create/update operation already reports user-facing errors.
 }
 }, [accessToken, range]); // eslint-disable-line react-hooks/exhaustive-deps

 const handleSaveExpense = useCallback(async (form: ExpenseFormState) => {
 setIsSavingExpense(true);
 try {
 const amt = parseFloat(form.amount.replace(/[^0-9.]/g, ''));
 const fallbackConvertedAmountUsd = convertToUsd(amt, form.currency);
 const payload = {
 amount: amt,
 currency: form.currency,
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
  const normalized = normalizeExpenseRecord({
  ...editingExpense,
  ...raw,
  amount: raw?.amount ?? amt,
  currency: raw?.currency ?? form.currency,
  convertedAmountUsd: raw?.convertedAmountUsd ?? raw?.converted_amount_usd ?? fallbackConvertedAmountUsd,
  category: raw?.category ?? form.category,
  date: raw?.date ?? new Date(form.date).toISOString(),
  note: raw?.note ?? form.note,
  clientId: raw?.clientId ?? raw?.client_id ?? form.clientId ?? null,
  projectId: raw?.projectId ?? raw?.project_id ?? form.projectId ?? null,
  });
  setExpenses((prev) =>
  prev.map((e) =>
  e.id === editingExpense.id
  ? normalized
  : e,
  ),
  );
  toast({ type: 'success', title: 'Expense updated', message: `${formatNative(normalized.amount, normalized.currency)} saved.` });
  } else {
  const created = await hedwigApi.createExpense(payload, apiOpts);
  if (!mounted.current) return;
  const raw = (created as any)?.data ?? created;
  const newExpense = normalizeExpenseRecord({
  ...raw,
  id: raw?.id ?? `exp_${Date.now()}`,
  amount: amt,
  currency: raw?.currency ?? form.currency,
  convertedAmountUsd: raw?.convertedAmountUsd ?? raw?.converted_amount_usd ?? fallbackConvertedAmountUsd,
  category: raw?.category ?? form.category,
  date: raw?.date ?? new Date(form.date).toISOString(),
  note: raw?.note ?? form.note,
  clientId: raw?.client_id ?? form.clientId ?? null,
  projectId: raw?.project_id ?? form.projectId ?? null,
  sourceType: raw?.source_type ?? 'manual',
  createdAt: raw?.created_at ?? new Date().toISOString(),
  updatedAt: raw?.updated_at ?? new Date().toISOString(),
  });
  setExpenses((prev) => [newExpense, ...prev]);
  toast({ type: 'success', title: 'Expense added', message: `${formatNative(newExpense.amount, newExpense.currency)} recorded.` });
  }

  hedwigApi.revenueMetrics(range, apiOpts).then((next) => {
  if (mounted.current && next) setMetrics(next);
  }).catch(() => {});
 } catch (error: any) {
 if (!mounted.current) return;
 toast({ type: 'error', title: 'Failed to save expense', message: error?.message || 'Please try again.' });
 } finally {
 if (mounted.current) {
 setIsSavingExpense(false);
 setShowExpenseDialog(false);
 setEditingExpense(null);
 }
 }
  }, [editingExpense, toast, accessToken, range, convertToUsd, formatNative]); // eslint-disable-line react-hooks/exhaustive-deps

 const handleSaveCredit = useCallback(async (form: CreditFormState) => {
 setIsSavingCredit(true);
 try {
 const amt = parseFloat(form.amount.replace(/[^0-9.]/g, ''));
 const convertedAmountUsd = convertToUsd(amt, form.currency);
 await hedwigApi.createRevenueCredit({
 amount: amt,
 currency: form.currency,
 convertedAmountUsd,
 title: form.title || form.note || 'Manual credit',
 note: form.note,
 clientId: form.clientId || undefined,
 date: form.date ? new Date(form.date).toISOString() : undefined,
 }, apiOpts);
 if (!mounted.current) return;
 toast({ type: 'success', title: 'Credit recorded', message: `${formatNative(amt, form.currency)} added as paid revenue.` });
 await refreshRevenueData();
 } catch (error: any) {
 if (!mounted.current) return;
 toast({ type: 'error', title: 'Failed to record credit', message: error?.message || 'Please try again.' });
 } finally {
 if (mounted.current) {
 setIsSavingCredit(false);
 setShowCreditDialog(false);
 }
 }
 }, [toast, accessToken, convertToUsd, formatNative, refreshRevenueData]); // eslint-disable-line react-hooks/exhaustive-deps

 const handleDeleteExpense = useCallback(async () => {
 if (!deletingExpenseId) return;
 setIsDeletingExpense(true);
 try {
  await hedwigApi.deleteExpense(deletingExpenseId, apiOpts);
  if (!mounted.current) return;
  setExpenses((prev) => prev.filter((e) => e.id !== deletingExpenseId));
  toast({ type: 'success', title: 'Expense deleted', message: 'The expense has been removed.' });
  hedwigApi.revenueMetrics(range, apiOpts).then((next) => {
  if (mounted.current && next) setMetrics(next);
  }).catch(() => {});
 } catch (error: any) {
 if (!mounted.current) return;
 toast({ type: 'error', title: 'Failed to delete expense', message: error?.message || 'Please try again.' });
 } finally {
 if (mounted.current) {
 setDeletingExpenseId(null);
 setIsDeletingExpense(false);
 }
 }
  }, [deletingExpenseId, toast, accessToken, range]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAddExpense = () => { setEditingExpense(null); setShowExpenseDialog(true); setShowImportMenu(false); };
  const openAddCredit = () => setShowCreditDialog(true);
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
 <div className="space-y-6">
 {/* ── Page header ── */}
 <div className="flex items-start justify-between gap-4">
 <div>
 <h1 className="text-[18px] font-semibold text-[var(--color-foreground)]">Revenue</h1>
 <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">Operational financial dashboard — what is happening with your money right now.</p>
 </div>
  <div className="flex shrink-0 items-center gap-2 mt-0.5">
   <div className="relative" ref={importMenuRef}>
    <button
     type="button"
     aria-haspopup="menu"
     aria-expanded={showImportMenu}
     onClick={() => setShowImportMenu((p) => !p)}
     className={'flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold shadow-sm transition ' + (showImportMenu
      ? 'border-[var(--color-create-dark)] bg-[var(--color-create-dark)] text-white shadow-[var(--color-accent)]/20'
      : 'border-[var(--color-create)] bg-[var(--color-create)] text-white shadow-[var(--color-accent)]/20 hover:border-[var(--color-create-dark)] hover:bg-[var(--color-create-dark)]')}
    >
     <Plus className="h-4 w-4" weight="bold" />
     <span>Import</span>
     <CaretDown className={'h-3.5 w-3.5 transition ' + (showImportMenu ? 'rotate-180' : '')} weight="bold" />
    </button>

    {showImportMenu && (
     <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface)] py-1 shadow-lg shadow-black/5">
      <button
       type="button"
       onClick={() => { setShowImportMenu(false); setShowImportDialog(true); }}
       className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
      >
       <DownloadSimple className="h-3.5 w-3.5 text-[var(--color-text-placeholder)]" weight="bold" />
       Import
      </button>
      <button
       type="button"
        onClick={openAddExpense}
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
       >
        <NotePencil className="h-3.5 w-3.5 text-[var(--color-text-placeholder)]" weight="bold" />
        Add manually
       </button>
      </div>
     )}
    </div>

   </div>
  </div>
  <ImportDialog
  open={showImportDialog}
  onClose={() => setShowImportDialog(false)}
  onImported={() => { refreshRevenueData(); }}
  accessToken={accessToken}
  />

  <ContextualSuggestions
  title="Expense review"
  description="Grouped expense suggestions stay beside your revenue data so cleanup happens in context."
  query={{ expensePage: true, limit: 1 }}
  />

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
    ? 'bg-[var(--color-text-primary)] text-[var(--color-background)]'
    : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-secondary)]'
  }`}
  >
  {RANGE_LABELS[r]}
  </button>
  ))}
 </div>

 <AttachedStatGrid
 items={[
 {
 id: 'total-revenue',
 title: 'Total revenue',
 value: formatAmount(summary.totalRevenue, { compact: true }),
 helper: (
 <span className="flex items-center gap-1">
 {netTrend === 'up' && <ArrowUpRight className="h-3 w-3 text-[var(--color-success)]" weight="bold" />}
 {netTrend === 'down' && <ArrowDownRight className="h-3 w-3 text-[var(--color-danger)]" weight="bold" />}
 <span>{summary.revenueDeltaPct >= 0 ? '+' : ''}{summary.revenueDeltaPct.toFixed(0)}% vs prev period</span>
 </span>
 ),
 icon: CurrencyDollar,
 },
 {
 id: 'paid',
 title: 'Paid',
 value: formatAmount(summary.paidRevenue, { compact: true }),
 helper: 'Collected',
 icon: CheckCircle,
 href: '/payments',
 },
 {
 id: 'pending',
 title: 'Pending',
 value: formatAmount(summary.pendingRevenue, { compact: true }),
 helper: 'Awaiting payment',
 icon: Receipt,
 href: '/payments',
 },
 {
 id: 'overdue',
 title: 'Overdue',
 value: formatAmount(summary.overdueRevenue, { compact: true }),
 helper: `${overdueInvoices.length} invoice${overdueInvoices.length !== 1 ? 's' : ''}`,
 icon: Warning,
 href: '/payments',
 valueClassName: summary.overdueRevenue > 0 ? 'text-[var(--color-danger)]' : undefined,
 iconWrapClassName: summary.overdueRevenue > 0 ? 'bg-[var(--color-danger-soft)]' : undefined,
 iconClassName: summary.overdueRevenue > 0 ? 'text-[var(--color-danger)]' : undefined,
 },
 {
 id: 'expenses',
 title: 'Expenses',
 value: formatAmount(totalExpensesDisplay, { compact: true }),
 helper: `${expenses.length} recorded`,
 icon: FileText,
 },
 {
 id: 'net-revenue',
 title: 'Net revenue',
 value: formatAmount(netRevenueDisplay, { compact: true }),
 helper: 'Paid minus expenses',
 icon: netRevenueDisplay >= 0 ? ArrowUpRight : ArrowDownRight,
 valueClassName: netRevenueDisplay >= 0 ? undefined : 'text-[var(--color-danger)]',
 iconWrapClassName: netRevenueDisplay >= 0 ? 'bg-[var(--color-success-soft)]' : 'bg-[var(--color-danger-soft)]',
 iconClassName: netRevenueDisplay >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]',
 },
 {
 id: 'profit-margin',
 title: 'Profit margin',
 value: `${metrics.profitMargin >= 0 ? '+' : ''}${metrics.profitMargin.toFixed(1)}%`,
 helper: summary.paidRevenue > 0 ? 'Net ÷ paid revenue' : 'No revenue yet',
 icon: ChartBar,
 valueClassName: metrics.profitMargin >= 20 ? 'text-[var(--color-success)]' : metrics.profitMargin >= 0 ? undefined : 'text-[var(--color-danger)]',
 },
 {
 id: 'monthly-burn',
 title: 'Monthly burn',
 value: formatAmount(metrics.burnRate, { compact: true }),
 helper: metrics.burnRate > 0 ? 'Avg over last 90 days' : 'No expenses recorded',
 icon: Coins,
 },
 {
 id: 'runway',
 title: 'Runway',
 value: metrics.runway !== null ? `${metrics.runway.toFixed(1)}mo` : '∞',
 helper: metrics.runway !== null ? 'At current burn rate' : 'No expenses to deplete',
 icon: CalendarBlank,
 },
 ]}
 className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
 />

 {/* ── Invoice Status + Revenue Breakdown ── */}
 <div className="grid gap-4 lg:grid-cols-2">

 {/* Invoice Status */}
 <article className="flex flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs">
 <div className="flex items-center justify-between border-b border-[var(--color-surface-secondary)] px-5 py-4">
 <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Invoice status</h2>
 <Link href="/payments" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-accent)] hover:text-[var(--color-primary-dark)]">
 All invoices <ArrowRight className="h-3.5 w-3.5" weight="bold" />
 </Link>
 </div>

 {/* Unpaid */}
 <div className="border-b border-[var(--color-surface-secondary)] px-5 py-3">
 <p className="mb-2 text-[11px] font-semibold text-[var(--color-text-muted)]">
 Unpaid ({unpaidInvoices.length})
 </p>
 {unpaidInvoices.length === 0 ? (
 <p className="py-1 text-[13px] text-[var(--color-text-muted)]">No unpaid invoices</p>
 ) : (
 <div className="space-y-1">
 {unpaidInvoices.slice(0, 3).map((inv) => (
 <button
 key={inv.id}
 type="button"
 onClick={() => openPaymentDetail('invoice', inv.id)}
 className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors hover:bg-[var(--color-background)]"
 >
 <div className="min-w-0 flex-1">
 <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{inv.number}</p>
 <p className="text-[11px] text-[var(--color-text-muted)]">Due {formatShortDate(inv.dueAt)}</p>
 </div>
 <div className="ml-3 flex items-center gap-2 shrink-0">
 <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
 {formatAmount(inv.amountUsd, { compact: true })}
 </span>
 <StatusPill status={inv.status} />
 <ArrowRight className="h-3.5 w-3.5 text-[var(--color-border-input)]" weight="bold" />
 </div>
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Overdue */}
 <div className="border-b border-[var(--color-surface-secondary)] px-5 py-3">
 <p className="mb-2 text-[11px] font-semibold text-[var(--color-text-muted)]">
 Overdue ({overdueInvoices.length})
 </p>
 {overdueInvoices.length === 0 ? (
 <p className="py-1 text-[13px] text-[var(--color-text-muted)]">No overdue invoices</p>
 ) : (
 <div className="space-y-1">
 {overdueInvoices.slice(0, 3).map((inv) => (
 <button
 key={inv.id}
 type="button"
 onClick={() => openPaymentDetail('invoice', inv.id)}
 className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors hover:bg-[var(--color-background)]"
 >
 <div className="min-w-0 flex-1">
 <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{inv.number}</p>
 <p className="text-[11px] text-[var(--color-danger)]">Was due {formatShortDate(inv.dueAt)}</p>
 </div>
 <div className="ml-3 flex items-center gap-2 shrink-0">
 <span className="text-[13px] font-semibold text-[var(--color-danger)]">
 {formatAmount(inv.amountUsd, { compact: true })}
 </span>
 <StatusPill status="overdue" />
 <ArrowRight className="h-3.5 w-3.5 text-[var(--color-border-input)]" weight="bold" />
 </div>
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Recently Paid */}
 <div className="px-5 py-3">
 <p className="mb-2 text-[11px] font-semibold text-[var(--color-text-muted)]">
 Recently paid
 </p>
 {paidInvoices.length === 0 ? (
 <p className="py-1 text-[13px] text-[var(--color-text-muted)]">No paid invoices yet</p>
 ) : (
 <div className="space-y-1">
 {paidInvoices.map((inv) => (
 <button
 key={inv.id}
 type="button"
 onClick={() => openPaymentDetail('invoice', inv.id)}
 className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors hover:bg-[var(--color-background)]"
 >
 <div className="min-w-0 flex-1">
 <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{inv.number}</p>
 <p className="text-[11px] text-[var(--color-text-muted)]">Paid {formatShortDate(inv.dueAt)}</p>
 </div>
 <div className="ml-3 flex items-center gap-2 shrink-0">
 <span className="text-[13px] font-semibold text-[var(--color-success)]">
 {formatAmount(inv.amountUsd, { compact: true })}
 </span>
 <StatusPill status="paid" />
 <ArrowRight className="h-3.5 w-3.5 text-[var(--color-border-input)]" weight="bold" />
 </div>
 </button>
 ))}
 </div>
 )}
 </div>
 </article>

  {/* Revenue Breakdown + Expense Categories */}
  <div className="flex flex-col gap-4">

  <article className="flex flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs">
  <div className="border-b border-[var(--color-surface-secondary)] px-5 py-4">
  <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Revenue breakdown</h2>
  </div>

  {/* By Client */}
  <div className="border-b border-[var(--color-surface-secondary)] px-5 py-3">
  <div className="flex items-center gap-2 mb-3">
  <UsersThree className="h-3.5 w-3.5 text-[var(--color-text-muted)]" weight="regular" />
  <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">By client</p>
  </div>
  <div className="space-y-3">
  {clientsByRevenue.map((c) => (
  <div key={c.clientId}>
  <div className="mb-1 flex items-center justify-between">
  <div className="min-w-0 flex-1">
  <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{c.company || c.clientName}</p>
  </div>
  <div className="ml-3 flex items-center gap-2 shrink-0">
  <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
  {formatAmount(c.totalRevenue, { compact: true })}
  </span>
  <span className="w-9 text-right text-[11px] text-[var(--color-text-muted)]">{c.shareOfTotal.toFixed(0)}%</span>
  </div>
  </div>
  <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
  <div
  className="h-full rounded-full bg-[var(--color-accent)] transition-all"
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
  <FolderSimple className="h-3.5 w-3.5 text-[var(--color-text-muted)]" weight="regular" />
  <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">By project</p>
  </div>
  <div className="space-y-2">
  {projectsByRevenue.map((p, i) => (
  <div key={p.projectId} className="flex items-center gap-3">
  <span className="w-4 shrink-0 text-[11px] font-semibold text-[var(--color-text-muted)]">{i + 1}</span>
  <div className="min-w-0 flex-1">
  <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">{p.projectName}</p>
  <p className="text-[11px] text-[var(--color-text-muted)]">{p.clientName}</p>
  </div>
  <span className="shrink-0 text-[13px] font-semibold text-[var(--color-text-primary)]">
  {formatAmount(p.totalRevenue, { compact: true })}
  </span>
  </div>
  ))}
  </div>
  </div>
   </article>

  {metrics.expenseCategories.length > 0 && (
    <ExpensePieChart
      categories={metrics.expenseCategories}
      formatAmount={formatAmount}
    />
  )}
  </div>
  </div>

  {/* ── Expense Tracking ── */}
 <article className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs">
  <div className="flex items-center justify-between border-b border-[var(--color-surface-secondary)] px-5 py-4">
  <div>
  <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Expenses</h2>
  <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">
  {expenses.length > 0
  ? `${showAllExpenses ? expenses.length : Math.min(expenses.length, 5)} of ${expenses.length} expense${expenses.length !== 1 ? 's' : ''} · ${formatAmount(totalExpensesDisplay, { compact: true })} total`
  : 'No expenses recorded yet'}
  </p>
  </div>
  </div>

 {expenses.length === 0 ? (
 <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
 <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-surface-secondary)]">
 <FileText className="h-5 w-5 text-[var(--color-text-muted)]" weight="regular" />
 </div>
 <p className="text-[14px] font-semibold text-[var(--color-text-secondary)]">No expenses yet</p>
 <p className="text-[13px] text-[var(--color-text-muted)]">
 Track your business costs to see your true net revenue.
 </p>
 <Button variant="secondary" onClick={openAddExpense}>
 <Plus className="h-4 w-4" weight="bold" />
 Add first expense
 </Button>
 </div>
 ) : (
 <>
  <Table>
  <Table.ScrollContainer>
  <Table.Content aria-label="Expenses">
  <Table.Header>
   <Table.Column isRowHeader className="text-[11px] font-semibold text-[var(--color-text-muted)]">Description</Table.Column>
  <Table.Column className="text-[11px] font-semibold text-[var(--color-text-muted)]">Category</Table.Column>
  <Table.Column className="text-right text-[11px] font-semibold text-[var(--color-text-muted)]">Amount</Table.Column>
  <Table.Column className="text-right text-[11px] font-semibold text-[var(--color-text-muted)]">Date</Table.Column>
  <Table.Column />
  </Table.Header>
  <Table.Body>
  {(showAllExpenses ? expenses : expenses.slice(0, 5)).map((exp) => {
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
  <Table.Row key={exp.id} className="hover:bg-[var(--color-background)]">
  <Table.Cell>
  <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
  {exp.note || CATEGORY_LABELS[exp.category]}
  </p>
  {linkedClient && (
  <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{linkedClient.name}</p>
  )}
  </Table.Cell>
  <Table.Cell><CategoryPill category={exp.category} /></Table.Cell>
  <Table.Cell className="text-right">
  <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
  {formatAmount(exp.convertedAmountUsd, { compact: true })}
  </p>
  </Table.Cell>
  <Table.Cell className="text-right text-[12px] text-[var(--color-text-tertiary)]">
  {formatShortDate(exp.date)}
  </Table.Cell>
  <Table.Cell><RowActionsMenu items={actions} /></Table.Cell>
  </Table.Row>
  );
  })}
  </Table.Body>
  </Table.Content>
  </Table.ScrollContainer>
  </Table>
  {expenses.length > 5 && (
  <div className="border-t border-[var(--color-surface-secondary)] px-5 py-3">
  <button
  onClick={() => setShowAllExpenses(!showAllExpenses)}
  className="text-[12px] font-semibold text-[var(--color-accent)] hover:text-[var(--color-primary-dark)] transition"
  >
  {showAllExpenses ? 'Show less' : `View all ${expenses.length} expenses`}
  </button>
  </div>
  )}
  </>
  )}
  </article>

  {/* ── Activity Feed + Payment Sources ── */}
  <div className="grid items-start gap-4 lg:grid-cols-2">

 {/* Recent Activity */}
 <article className="flex h-[300px] flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs">
 <div className="shrink-0 border-b border-[var(--color-surface-secondary)] px-5 py-3.5">
 <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Recent activity</h2>
 <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">Latest financial events from your account.</p>
 </div>
 {activityItems.length === 0 ? (
 <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
 <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">No recent activity</p>
 <p className="text-[12px] text-[var(--color-text-muted)]">Activity appears here as invoices are paid and expenses are added.</p>
 </div>
 ) : (
 <div className="min-h-0 flex-1 divide-y divide-[var(--color-surface-secondary)] overflow-y-auto">
 {activityItems.map((evt) => {
 const colors = ACTIVITY_COLORS[evt.type] ?? DEFAULT_ACTIVITY_COLORS;
 return (
 <div key={evt.id} className="flex items-start gap-3 px-5 py-3 hover:bg-[var(--color-background)]">
 <div className={`mt-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${colors.bg}`}>
 <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{evt.title}</p>
 <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">{evt.description}</p>
 </div>
 <div className="shrink-0 text-right">
 {evt.amount !== undefined && (
 <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
 {formatAmount(evt.amount, { compact: true })}
 </p>
 )}
          <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{formatTimeAgo(evt.createdAt)}</p>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </article>

  {/* Payment Sources */}
  <article className="flex h-[300px] flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs">
  <div className="shrink-0 border-b border-[var(--color-surface-secondary)] px-4 py-3.5">
    <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Payment sources</h2>
 <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">Where your revenue comes from.</p>
 </div>
 {sourceBreakdown.length === 0 ? (
 <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-8 text-center">
 <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">No payment sources yet</p>
 <p className="text-[12px] text-[var(--color-text-muted)]">Revenue sources appear as invoices and payment links are collected.</p>
 </div>
 ) : (
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
 <div className="space-y-3">
 {sourceBreakdown.map((src) => (
 <div key={src.source}>
 <div className="mb-1 flex items-center justify-between gap-3">
 <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{src.label}</p>
 <div className="flex items-center gap-2">
 <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
 {formatAmount(src.amount, { compact: true })}
 </span>
 <span className="w-8 text-right text-[11px] font-semibold text-[var(--color-text-muted)]">
 {src.shareOfTotal.toFixed(0)}%
 </span>
 </div>
 </div>
 <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
 <div
 className="h-full rounded-full bg-[var(--color-accent)] transition-all"
 style={{ width: `${src.shareOfTotal}%` }}
 />
 </div>
 <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{src.count} transaction{src.count !== 1 ? 's' : ''}</p>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Footer: net revenue callout */}
 <div className="shrink-0 border-t border-[var(--color-surface-secondary)] px-4 py-3">
 <div className="flex items-center justify-between">
 <p className="text-[12px] font-semibold text-[var(--color-text-tertiary)]">Net revenue this period</p>
 <p className={`text-[16px] font-bold tracking-[-0.02em] ${netRevenueDisplay >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
 {formatAmount(netRevenueDisplay, { compact: true })}
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
 currencyOptions={currencyOptions}
 defaultCurrency={currency}
 onSave={handleSaveExpense}
 onClose={() => { setShowExpenseDialog(false); setEditingExpense(null); }}
 isSaving={isSavingExpense}
 />

 <CreditDialog
 open={showCreditDialog}
 clients={clients}
 currencyOptions={currencyOptions}
 defaultCurrency={currency}
 onSave={handleSaveCredit}
 onClose={() => setShowCreditDialog(false)}
 isSaving={isSavingCredit}
 />

 <DeleteDialog
 open={!!deletingExpenseId}
 title="Delete expense"
 description="This expense will be permanently removed. This cannot be undone."
 itemLabel={expenses.find((expense) => expense.id === deletingExpenseId)?.note || 'Expense'}
 isDeleting={isDeletingExpense}
 onConfirm={handleDeleteExpense}
 onOpenChange={(o) => { if (!o && !isDeletingExpense) setDeletingExpenseId(null); }}
 />
  </div>
  );
}



function ExpensePieChart({ categories, formatAmount, compact }: {
  categories: { category: string; total: number; percentage: number }[];
  formatAmount: (n: number, opts?: any) => string;
  compact?: boolean;
}) {
  const total = categories.reduce((s, c) => s + c.total, 0);
  const size = compact ? 100 : 160;
  const radius = compact ? 38 : 60;
  const strokeWidth = compact ? 12 : 18;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const slices = categories.map((cat, i) => {
    const pct = cat.percentage / 100;
    const length = pct * circumference;
    const slice = { ...cat, color: `hsl(${(i * 137.5) % 360}, 65%, 55%)`, dash: length, offset };
    offset -= length;
    return slice;
  });

  if (compact) {
    return (
      <article className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs">
        <div className="border-b border-[var(--color-surface-secondary)] px-4 py-3">
          <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Expense categories</h2>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="relative shrink-0">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--color-surface-tertiary)" strokeWidth={strokeWidth} />
              {slices.map((slice) => (
                <circle key={slice.category} cx={cx} cy={cy} r={radius} fill="none"
                  stroke={slice.color} strokeWidth={strokeWidth} strokeDasharray={`${slice.dash} ${circumference - slice.dash}`}
                  strokeDashoffset={slice.offset} strokeLinecap="butt" />
              ))}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-[11px] font-bold tabular-nums text-[var(--color-foreground)]" style={{ fontFamily: 'var(--font-sans)' }}>{formatAmount(total, { compact: true })}</p>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            {categories.map((cat, i) => {
              const hue = (i * 137.5) % 360;
              return (
                <div key={cat.category} className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `hsl(${hue}, 65%, 55%)` }} />
                  <span className="truncate text-[11px] text-[var(--color-text-secondary)] flex-1">
                    {CATEGORY_LABELS[cat.category as ExpenseCategory] || cat.category}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[var(--color-foreground)]">
                    {cat.percentage.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="flex h-[300px] flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-xs">
      <div className="shrink-0 border-b border-[var(--color-surface-secondary)] px-4 py-3.5">
        <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Expense categories</h2>
        <p className="mt-0.5 text-[13px] text-[var(--color-text-tertiary)]">How your costs break down.</p>
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-5 overflow-y-auto px-4 py-4">
        <div className="relative shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" style={{ fontFamily: 'var(--font-sans)' }}>
            <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--color-surface-tertiary)" strokeWidth={strokeWidth} />
            {slices.map((slice) => (
              <circle key={slice.category} cx={cx} cy={cy} r={radius} fill="none"
                stroke={slice.color} strokeWidth={strokeWidth} strokeDasharray={`${slice.dash} ${circumference - slice.dash}`}
                strokeDashoffset={slice.offset} strokeLinecap="butt" />
            ))}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-[16px] font-bold tabular-nums text-[var(--color-foreground)]" style={{ fontFamily: 'var(--font-sans)' }}>{formatAmount(total, { compact: true })}</p>
              <p className="text-[10px] text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-sans)' }}>Total</p>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {categories.map((cat, i) => {
            const hue = (i * 137.5) % 360;
            return (
              <div key={cat.category} className="flex items-center gap-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `hsl(${hue}, 65%, 55%)` }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-[var(--color-foreground)]" style={{ fontFamily: 'var(--font-sans)' }}>
                      {CATEGORY_LABELS[cat.category as ExpenseCategory] || cat.category}
                    </span>
                    <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[var(--color-foreground)]" style={{ fontFamily: 'var(--font-sans)' }}>
                      {formatAmount(cat.total, { compact: true })}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-sans)' }}>{cat.percentage.toFixed(1)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
