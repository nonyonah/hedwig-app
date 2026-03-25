'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from 'react';
import {
  CalendarBlank,
  ArrowUp,
  Paperclip,
  ListPlus,
  X,
  Check,
  LinkSimple,
  FileText,
  SpinnerGap,
} from '@/components/ui/lucide-icons';
import { backendConfig } from '@/lib/auth/config';
import { useToast } from '@/components/providers/toast-provider';
import type { Invoice, PaymentLink, RecurringInvoice, Client } from '@/lib/models/entities';
import { CreateRecurringInvoiceDialog } from './create-recurring-invoice-dialog';

/* ── types ── */
interface LineItem {
  description: string;
  amount: number;
}

interface ParsedData {
  intent: 'invoice' | 'payment_link' | 'recurring_invoice' | 'unknown';
  clientName: string | null;
  clientEmail: string | null;
  amount: number | null;
  dueDate: string | null;
  title: string | null;
  items?: LineItem[];
  frequency?: string;
  autoSend?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

interface Props {
  accessToken: string | null;
  clients?: Client[];
  onCreated: (result: { invoice?: Invoice; paymentLink?: PaymentLink; recurringInvoice?: RecurringInvoice }) => void;
}

/* ── helpers ── */
function formatDateChip(d: Date | null): string {
  if (!d) return 'Date';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  const diff = Math.floor((n.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff <= 6)
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const EXAMPLES = [
  'Invoice for Acme Corp $1 200 web design due Friday',
  'Payment link for logo design $350 for john@acme.com due next week',
  'Invoice for Sarah $500 brand strategy + $200 deck design due Mar 30',
  'Payment link for consulting fee $800 due tomorrow',
];

/* ── component ── */
export function UniversalCreationBox({ accessToken, clients = [], onCreated }: Props) {
  const { toast } = useToast();

  /* input */
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* AI parse */
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  /* date */
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [shakingDate, setShakingDate] = useState(false);

  /* file */
  const [fileName, setFileName] = useState<string | null>(null);

  /* items */
  const [items, setItems] = useState<LineItem[]>([]);
  const [addingItem, setAddingItem] = useState(false);
  const [itemDesc, setItemDesc] = useState('');
  const [itemAmt, setItemAmt] = useState('');

  /* submit */
  const [isCreating, setIsCreating] = useState(false);

  /* recurring invoice dialog */
  const [showRecurring, setShowRecurring] = useState(false);

  /* cycling placeholder */
  const [exampleIdx, setExampleIdx] = useState(0);
  useEffect(() => {
    if (text) return;
    const t = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 3500);
    return () => clearInterval(t);
  }, [text]);

  /* derived */
  const effectiveDate =
    selectedDate ?? (parsed?.dueDate ? new Date(parsed.dueDate) : null);
  const resolvedIntent: 'invoice' | 'payment_link' | 'recurring_invoice' =
    parsed?.intent === 'payment_link' ? 'payment_link' :
    parsed?.intent === 'recurring_invoice' ? 'recurring_invoice' : 'invoice';

  /* ── auto-grow textarea ── */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text]);

  /* ── AI parse (debounced 800 ms) ── */
  const triggerParse = useCallback(
    (value: string) => {
      if (parseTimer.current) clearTimeout(parseTimer.current);
      if (value.length < 3) { setParsed(null); return; }
      parseTimer.current = setTimeout(async () => {
        setIsParsing(true);
        try {
          const res = await fetch(`${backendConfig.apiBaseUrl}/api/creation-box/parse`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: value, currentDate: new Date().toISOString() }),
            cache: 'no-store',
          });
          const json = await res.json();
          if (json?.success && json.data) {
            setParsed({
              intent: json.data.intent === 'payment_link' ? 'payment_link' : 'invoice',
              clientName: json.data.clientName ?? null,
              clientEmail: json.data.clientEmail ?? null,
              amount: json.data.amount ?? null,
              dueDate: json.data.dueDate ?? null,
              title: json.data.title ?? null,
              items: Array.isArray(json.data.items) ? json.data.items : undefined,
            });
          }
        } catch {
          // silent — user can still submit manually
        } finally {
          setIsParsing(false);
        }
      }, 800);
    },
    [accessToken]
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setText(v);
    triggerParse(v);
  };

  /* ── date picker ── */
  const openDatePicker = () => {
    try {
      (dateInputRef.current as any)?.showPicker?.();
    } catch {
      dateInputRef.current?.click();
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    setSelectedDate(new Date(e.target.value + 'T12:00:00'));
  };

  const shakeDate = () => {
    setShakingDate(true);
    setTimeout(() => setShakingDate(false), 600);
  };

  /* ── file ── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFileName(file.name);
  };

  /* ── items ── */
  const commitItem = () => {
    const amt = parseFloat(itemAmt.replace(/[^0-9.]/g, ''));
    if (!itemDesc.trim() || isNaN(amt) || amt <= 0) return;
    setItems((prev) => [...prev, { description: itemDesc.trim(), amount: amt }]);
    setItemDesc('');
    setItemAmt('');
    setAddingItem(false);
    textareaRef.current?.focus();
  };

  const handleItemKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitItem(); }
    if (e.key === 'Escape') { setAddingItem(false); }
  };

  /* ── submit ── */
  const handleCreate = async () => {
    if (!text.trim() || isCreating || isParsing) return;

    // Recurring invoice: open the dedicated dialog pre-filled with AI-parsed data
    if (resolvedIntent === 'recurring_invoice') {
      setShowRecurring(true);
      return;
    }

    if (!effectiveDate) {
      shakeDate();
      toast({ type: 'error', title: 'Date required', message: 'Please pick a due date.' });
      return;
    }

    setIsCreating(true);
    try {
      const isPaymentLink = resolvedIntent === 'payment_link';
      const endpoint = isPaymentLink
        ? '/api/documents/payment-link'
        : '/api/documents/invoice';

      const finalItems =
        items.length > 0 ? items : (parsed?.items ?? []);

      const totalAmount =
        items.length > 0
          ? items.reduce((s, i) => s + i.amount, 0)
          : (parsed?.amount ?? 0);

      // Build a clean title — never use raw prompt text
      const typeLabel = isPaymentLink ? 'Payment Link' : 'Invoice';
      const finalTitle =
        parsed?.title ||
        (parsed?.clientName ? `${typeLabel} for ${parsed.clientName}` : null) ||
        (parsed?.clientEmail ? `${typeLabel} for ${parsed.clientEmail.split('@')[0]}` : null) ||
        typeLabel;

      // Use the finalTitle as description too — clean and consistent, never the raw prompt
      const body: Record<string, unknown> = {
        title: finalTitle,
        description: finalTitle,
        amount: totalAmount,
        currency: isPaymentLink ? 'USDC' : 'USD',
        remindersEnabled: true,
        items: finalItems,
        dueDate: effectiveDate.toISOString(),
      };

      // Only include optional fields if we have real values
      if (parsed?.clientName) body.clientName = parsed.clientName;
      if (parsed?.clientEmail) body.recipientEmail = parsed.clientEmail;

      const response = await fetch(
        `${backendConfig.apiBaseUrl}${endpoint}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          cache: 'no-store',
        }
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message ?? result.message ?? 'Failed to create');
      }

      const doc = result.data?.document ?? result.data ?? {};

      if (isPaymentLink) {
        const rawStatus = String(doc.status ?? '').toLowerCase();
        const linkStatus: PaymentLink['status'] =
          rawStatus === 'paid' ? 'paid' : rawStatus === 'expired' ? 'expired' : 'active';
        const rawCurrency = String(doc.currency ?? 'USDC').toUpperCase();
        const link: PaymentLink = {
          id: doc.id,
          clientId: doc.clientId ?? doc.client_id ?? null,
          status: linkStatus,
          amountUsd: doc.amount ?? totalAmount,
          title: doc.title ?? finalTitle,
          asset: rawCurrency === 'USDT' ? 'USDT' : 'USDC',
          chain: String(doc.chain ?? 'BASE').toUpperCase() === 'SOLANA' ? 'Solana' : 'Base',
          remindersEnabled: true,
        };
        toast({ type: 'success', title: 'Payment link created', message: link.title });
        onCreated({ paymentLink: link });
      } else {
        const rawInvStatus = String(doc.status ?? '').toLowerCase();
        const invStatus: Invoice['status'] =
          rawInvStatus === 'paid' ? 'paid' :
          rawInvStatus === 'overdue' ? 'overdue' :
          rawInvStatus === 'sent' ? 'sent' : 'draft';
        const invoice: Invoice = {
          id: doc.id,
          clientId: doc.clientId ?? doc.client_id ?? '',
          projectId: doc.projectId ?? doc.project_id,
          title: doc.title ?? finalTitle,
          status: invStatus,
          amountUsd: doc.amount ?? totalAmount,
          dueAt: doc.dueDate ?? doc.due_date ?? effectiveDate.toISOString(),
          number: `INV-${String(doc.id).slice(-6).toUpperCase()}`,
          remindersEnabled: true,
        };
        toast({ type: 'success', title: 'Invoice created', message: invoice.number });
        onCreated({ invoice });
      }

      /* reset */
      setText('');
      setParsed(null);
      setSelectedDate(null);
      setFileName(null);
      setItems([]);
    } catch (err: any) {
      toast({ type: 'error', title: 'Creation failed', message: err?.message ?? 'Please try again.' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCreate();
    }
  };

  /* ── render ── */
  return (
    <div className="overflow-visible">
      {/* Hidden native inputs */}
      <input
        ref={dateInputRef}
        type="date"
        className="sr-only"
        onChange={handleDateChange}
        value={
          selectedDate
            ? selectedDate.toISOString().slice(0, 10)
            : (parsed?.dueDate ? new Date(parsed.dueDate).toISOString().slice(0, 10) : '')
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        onChange={handleFileChange}
        accept="*/*"
      />

      {/* Prompt textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        placeholder={EXAMPLES[exampleIdx]}
        rows={2}
        className="w-full resize-none bg-transparent px-5 pt-4 pb-1 text-[14px] text-[#181d27] placeholder:text-[#b8bdc7] outline-none transition-[placeholder] duration-500"
      />

      {/* Example hint — tap to fill, only shown when empty */}
      {!text && (
        <div className="flex items-center gap-1.5 px-5 pb-2">
          <span className="text-[11px] text-[#b8bdc7]">e.g.</span>
          <button
            type="button"
            onClick={() => { setText(EXAMPLES[exampleIdx]); triggerParse(EXAMPLES[exampleIdx]); textareaRef.current?.focus(); }}
            className="text-[11px] text-[#a4a7ae] hover:text-[#2563eb] transition-colors truncate max-w-[340px] text-left"
          >
            {EXAMPLES[exampleIdx]}
          </button>
        </div>
      )}

      {/* Detected intent + parsed summary */}
      {parsed && text.length > 3 && (
        <div className="flex flex-wrap items-center gap-2 px-5 pb-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            resolvedIntent === 'payment_link'
              ? 'bg-[#f0fdf4] text-[#16a34a]'
              : resolvedIntent === 'recurring_invoice'
              ? 'bg-[#fdf4ff] text-[#9333ea]'
              : 'bg-[#eff4ff] text-[#2563eb]'
          }`}>
            {resolvedIntent === 'payment_link'
              ? <><LinkSimple className="h-3 w-3" weight="bold" /> Payment Link</>
              : resolvedIntent === 'recurring_invoice'
              ? <><ArrowUp className="h-3 w-3" weight="bold" /> Recurring Invoice</>
              : <><FileText className="h-3 w-3" weight="bold" /> Invoice</>}
          </span>
          {parsed.amount != null && parsed.amount > 0 && (
            <span className="text-[12px] font-medium text-[#344054]">
              ${parsed.amount.toLocaleString()}
            </span>
          )}
          {parsed.clientName && (
            <span className="text-[12px] text-[#717680]">→ {parsed.clientName}</span>
          )}
        </div>
      )}

      {/* Line items */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 px-5 pb-2">
          {items.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eff4ff] px-3 py-1 text-[12px] font-medium text-[#2563eb]"
            >
              {item.description} · ${item.amount.toFixed(2)}
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                className="ml-0.5 rounded-full hover:text-[#1d4ed8]"
              >
                <X className="h-3 w-3" weight="bold" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Inline add-item form */}
      {addingItem && (
        <div className="flex items-center gap-2 border-t border-[#f2f4f7] px-5 py-2.5">
          <input
            autoFocus
            type="text"
            placeholder="Item description"
            value={itemDesc}
            onChange={(e) => setItemDesc(e.target.value)}
            onKeyDown={handleItemKey}
            className="flex-1 rounded-full border border-[#d5d7da] bg-[#f9fafb] px-3.5 py-1.5 text-[13px] text-[#181d27] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/30"
          />
          <input
            type="number"
            placeholder="$0.00"
            value={itemAmt}
            onChange={(e) => setItemAmt(e.target.value)}
            onKeyDown={handleItemKey}
            className="w-24 rounded-full border border-[#d5d7da] bg-[#f9fafb] px-3.5 py-1.5 text-[13px] text-[#181d27] outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/30"
          />
          <button
            type="button"
            onClick={commitItem}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-white"
          >
            <Check className="h-3.5 w-3.5" weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => setAddingItem(false)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7] text-[#717680]"
          >
            <X className="h-3.5 w-3.5" weight="bold" />
          </button>
        </div>
      )}

      {/* Chips + action row */}
      <div className="flex items-center justify-between border-t border-[#f2f4f7] px-5 py-2.5">
        <div className="flex items-center gap-2">
          {/* Date chip */}
          <button
            type="button"
            onClick={openDatePicker}
            className={[
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
              shakingDate ? 'animate-shake' : '',
              effectiveDate
                ? 'border-[#2563eb] bg-[#eff4ff] text-[#2563eb]'
                : 'border-[#d5d7da] bg-[#f9fafb] text-[#717680] hover:border-[#2563eb] hover:text-[#2563eb]',
            ].join(' ')}
          >
            <CalendarBlank className="h-3.5 w-3.5" weight="bold" />
            {formatDateChip(effectiveDate)}
            {effectiveDate && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDate(null);
                  setParsed((p) => p ? { ...p, dueDate: null } : p);
                }}
                className="ml-0.5 rounded-full hover:text-[#1d4ed8]"
              >
                <X className="h-3 w-3" weight="bold" />
              </span>
            )}
          </button>

          {/* Add Item chip */}
          {!addingItem && (
            <button
              type="button"
              onClick={() => setAddingItem(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#d5d7da] bg-[#f9fafb] px-3 py-1.5 text-[12px] font-medium text-[#717680] transition-colors hover:border-[#2563eb] hover:text-[#2563eb]"
            >
              <ListPlus className="h-3.5 w-3.5" weight="bold" />
              Add Item
            </button>
          )}

          {/* Attachment chip */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={[
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
              fileName
                ? 'border-[#2563eb] bg-[#eff4ff] text-[#2563eb]'
                : 'border-[#d5d7da] bg-[#f9fafb] text-[#717680] hover:border-[#2563eb] hover:text-[#2563eb]',
            ].join(' ')}
          >
            <Paperclip className="h-3.5 w-3.5" weight="bold" />
            {fileName ? (
              <>
                <span className="max-w-[100px] truncate">{fileName}</span>
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFileName(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="ml-0.5 hover:text-[#1d4ed8]"
                >
                  <X className="h-3 w-3" weight="bold" />
                </span>
              </>
            ) : null}
          </button>
        </div>

        {/* Right: spinner + send */}
        <div className="flex items-center gap-2.5">
          {isParsing && (
            <SpinnerGap className="h-4 w-4 animate-spin text-[#a4a7ae]" weight="bold" />
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={!text.trim() || isCreating || isParsing}
            title="Create (⌘↵)"
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              text.trim() && !isCreating && !isParsing
                ? 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]'
                : 'bg-[#f2f4f7] text-[#a4a7ae]'
            }`}
          >
            {isCreating ? (
              <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" />
            ) : (
              <ArrowUp className="h-4 w-4" weight="bold" />
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>

      {/* Recurring invoice dialog — opened when AI detects recurring intent */}
      <CreateRecurringInvoiceDialog
        open={showRecurring}
        clients={clients}
        accessToken={accessToken}
        onOpenChange={setShowRecurring}
        prefill={{
          clientName: parsed?.clientName ?? '',
          clientEmail: parsed?.clientEmail ?? '',
          amount: parsed?.amount != null ? String(parsed.amount) : '',
          frequency: (parsed?.frequency as any) ?? 'monthly',
          title: parsed?.title ?? '',
          startDate: parsed?.startDate ?? new Date().toISOString().split('T')[0],
          endDate: parsed?.endDate ?? '',
          autoSend: parsed?.autoSend ?? false,
        }}
        onCreated={(r) => {
          setShowRecurring(false);
          setText('');
          setParsed(null);
          setSelectedDate(null);
          setItems([]);
          onCreated({ recurringInvoice: r });
        }}
      />
    </div>
  );
}
