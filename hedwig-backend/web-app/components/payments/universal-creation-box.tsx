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
  CaretDown,
  Tray,
} from '@phosphor-icons/react/dist/ssr';
import { hedwigApi } from '@/lib/api/client';
import { useToast } from '@/components/providers/toast-provider';
import type { Invoice, PaymentLink } from '@/lib/models/entities';

/* ── types ── */
type Mode = 'auto' | 'payment_link' | 'invoice';

interface LineItem {
  description: string;
  amount: number;
}

interface ParsedData {
  intent: 'invoice' | 'payment_link' | 'unknown';
  clientName: string | null;
  clientEmail: string | null;
  amount: number | null;
  dueDate: string | null;
  title: string | null;
  items?: LineItem[];
  confidence: number;
}

interface Props {
  accessToken: string | null;
  onCreated: (result: { invoice?: Invoice; paymentLink?: PaymentLink }) => void;
}

/* ── helpers ── */
const MODE_LABELS: Record<Mode, string> = {
  auto: 'General',
  payment_link: 'Payment Link',
  invoice: 'Invoice',
};

const PLACEHOLDERS: Record<Mode, string> = {
  auto: 'Select a mode below or describe what you need…',
  payment_link: 'e.g. Design Retainer $500 for john@acme.com',
  invoice: 'e.g. Web Design Project $2 000 for Sarah, 3 milestones',
};

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

/* ── component ── */
export function UniversalCreationBox({ accessToken, onCreated }: Props) {
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

  /* mode */
  const [mode, setMode] = useState<Mode>('auto');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  /* submit */
  const [isCreating, setIsCreating] = useState(false);

  /* derived */
  const effectiveDate =
    selectedDate ?? (parsed?.dueDate ? new Date(parsed.dueDate) : null);
  const detectedMode: 'invoice' | 'payment_link' | 'unknown' =
    mode !== 'auto' ? mode : (parsed?.intent ?? 'unknown');

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
        const result = await hedwigApi.parseCreationBox(value, mode, { accessToken });
        if (result) setParsed(result);
        setIsParsing(false);
      }, 800);
    },
    [accessToken, mode]
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

  /* ── shake date chip ── */
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

  /* ── mode change ── */
  const chooseMode = (m: Mode) => {
    setMode(m);
    setDropdownOpen(false);
    textareaRef.current?.focus();
  };

  /* ── submit ── */
  const handleCreate = async () => {
    if (!text.trim() || isCreating) return;

    const needsDate = detectedMode !== 'unknown';
    if (needsDate && !effectiveDate) {
      shakeDate();
      toast({ type: 'error', title: 'Date required', message: 'Please pick a due date.' });
      return;
    }

    setIsCreating(true);
    try {
      const isPaymentLink = detectedMode === 'payment_link';
      const endpoint = isPaymentLink
        ? '/api/documents/payment-link'
        : '/api/documents/invoice';

      let finalItems = items.length > 0
        ? items
        : parsed?.items ?? [];

      let totalAmount =
        items.length > 0
          ? items.reduce((s, i) => s + i.amount, 0)
          : (parsed?.amount ?? 0);

      if (totalAmount === 0 && finalItems.length === 0) {
        // No amount parsed — let backend reject with a clear error
      }

      const cleanDesc = text
        .replace(/^(?:create\s+)?(?:invoice|bill|pay link|payment link)\s+(?:for\s+)?/i, '')
        .replace(/\s+(?:due|at)\s+.*$/i, '')
        .replace(/\s+(?:\$|USD).*$/i, '')
        .trim() || 'Professional Services';

      let finalTitle = parsed?.title;
      if (!finalTitle || finalTitle.length > 50 || finalTitle === text.trim()) {
        finalTitle = parsed?.clientName
          ? `${isPaymentLink ? 'Payment Link' : 'Invoice'} for ${parsed.clientName}`
          : cleanDesc;
      }

      const body: Record<string, unknown> = {
        title: finalTitle,
        description: cleanDesc,
        clientName: parsed?.clientName ?? undefined,
        amount: totalAmount,
        currency: 'USD',
        recipientEmail: parsed?.clientEmail ?? undefined,
        items: finalItems,
        remindersEnabled: true,
      };
      if (effectiveDate) body.dueDate = effectiveDate.toISOString();

      const response = await fetch(
        `${(await import('@/lib/auth/config')).backendConfig.apiBaseUrl}${endpoint}`,
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
        const link: PaymentLink = {
          id: doc.id,
          clientId: doc.clientId,
          status: ((doc.status ?? 'active') as string).toLowerCase() as PaymentLink['status'],
          amountUsd: doc.amount ?? totalAmount,
          title: doc.title ?? finalTitle ?? 'Payment Link',
          asset: (doc.currency ?? doc.asset ?? 'USDC') as PaymentLink['asset'],
          chain: (doc.chain ?? 'Base') as PaymentLink['chain'],
        };
        toast({ type: 'success', title: 'Payment link created', message: link.title });
        onCreated({ paymentLink: link });
      } else {
        const invoice: Invoice = {
          id: doc.id,
          clientId: doc.clientId ?? '',
          projectId: doc.projectId,
          status: ((doc.status ?? 'draft') as string).toLowerCase() as Invoice['status'],
          amountUsd: doc.amount ?? totalAmount,
          dueAt: doc.dueDate ?? doc.dueAt ?? effectiveDate?.toISOString() ?? '',
          number: doc.number ?? doc.invoiceNumber ?? `INV-${doc.id?.slice(-6).toUpperCase()}`,
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
      setMode('auto');
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

  /* ── close dropdown on outside click ── */
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

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
        placeholder={PLACEHOLDERS[mode]}
        rows={2}
        className="w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[14px] text-[#181d27] placeholder:text-[#a4a7ae] outline-none"
      />

      {/* Line items (invoice mode) */}
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

      {/* Chips row */}
      <div className="flex items-center gap-2 border-t border-[#f2f4f7] px-5 py-2.5">
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
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSelectedDate(null); setParsed((p) => p ? { ...p, dueDate: null } : p); }}
              className="ml-0.5 rounded-full hover:text-[#1d4ed8]"
            >
              <X className="h-3 w-3" weight="bold" />
            </button>
          )}
        </button>

        {/* Add Item chip — invoice mode only */}
        {mode === 'invoice' && !addingItem && (
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
            <span className="max-w-[120px] truncate">{fileName}</span>
          ) : null}
          {fileName && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFileName(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
              className="ml-0.5 hover:text-[#1d4ed8]"
            >
              <X className="h-3 w-3" weight="bold" />
            </button>
          )}
        </button>
      </div>

      {/* Bottom action row */}
      <div className="flex items-center justify-between border-t border-[#e9eaeb] px-5 py-3">
        {/* Mode dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-[#717680] transition-colors hover:bg-[#f2f4f7]"
          >
            {mode === 'auto'         && <Tray className="h-4 w-4" weight="bold" />}
            {mode === 'payment_link' && <LinkSimple className="h-4 w-4" weight="bold" />}
            {mode === 'invoice'      && <FileText className="h-4 w-4" weight="bold" />}
            <span>{MODE_LABELS[mode]}</span>
            <CaretDown
              className={`h-3.5 w-3.5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
              weight="bold"
            />
          </button>

          {/* Dropdown menu — opens upward */}
          {dropdownOpen && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-48 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-[#e9eaeb]">
              {([ 'auto', 'payment_link', 'invoice' ] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => chooseMode(m)}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
                    mode === m
                      ? 'bg-[#eff4ff] text-[#2563eb]'
                      : 'text-[#344054] hover:bg-[#f9fafb]'
                  }`}
                >
                  {m === 'auto'         && <Tray className="h-4 w-4 shrink-0" weight="bold" />}
                  {m === 'payment_link' && <LinkSimple className="h-4 w-4 shrink-0" weight="bold" />}
                  {m === 'invoice'      && <FileText className="h-4 w-4 shrink-0" weight="bold" />}
                  {MODE_LABELS[m]}
                  {mode === m && <Check className="ml-auto h-3.5 w-3.5" weight="bold" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right side: AI spinner + submit */}
        <div className="flex items-center gap-2.5">
          {isParsing && (
            <SpinnerGap className="h-4 w-4 animate-spin text-[#a4a7ae]" weight="bold" />
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={!text.trim() || isCreating}
            title="Create (⌘↵)"
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              text.trim() && !isCreating
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

      {/* Shake keyframe injected via style tag */}
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
    </div>
  );
}
