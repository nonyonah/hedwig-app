'use client';

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  ArrowUp,
  SpinnerGap,
  FileText,
  LinkSimple,
  ArrowsClockwise,
  CheckCircle,
  XCircle,
} from '@/components/ui/lucide-icons';
import { backendConfig } from '@/lib/auth/config';
import { CreateRecurringInvoiceDialog } from '@/components/payments/create-recurring-invoice-dialog';
import { useCurrency } from '@/components/providers/currency-provider';
import { useToast } from '@/components/providers/toast-provider';
import { usePostHog } from 'posthog-js/react';
import { HedwigLogoImg as HedwigMark } from '@/components/ui/hedwig-logo';

function HedwigLogoImg({ fill = false, size = 22 }: { fill?: boolean; size?: number }) {
  if (fill) {
    return (
      <HedwigMark
        variant="icon"
        alt="Hedwig"
        className="block h-full w-full object-cover object-center"
      />
    );
  }
  return (
    <HedwigMark
      variant="icon"
      alt="Hedwig"
      width={size}
      height={size}
      className="block rounded-full object-cover object-center"
      style={{ width: size, height: size }}
    />
  );
}

/* ── Types ── */
type ParsedData = {
  intent: 'invoice' | 'payment_link' | 'recurring_invoice' | 'unknown';
  clientName: string | null;
  clientEmail: string | null;
  amount: number | null;
  dueDate: string | null;
  title: string | null;
  items?: { description: string; amount: number }[];
  frequency?: string;
  autoSend?: boolean;
  startDate?: string | null;
  endDate?: string | null;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parsed?: ParsedData;
  actionState?: 'pending' | 'creating' | 'done' | 'error';
  actionResult?: string;
};

const INTENT_META: Record<string, { label: string; color: string; Icon: any }> = {
  invoice:           { label: 'Invoice',          color: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]',  Icon: FileText },
  payment_link:      { label: 'Payment Link',      color: 'bg-[var(--color-success-soft)] text-[var(--color-text-tertiary)]',  Icon: LinkSimple },
  recurring_invoice: { label: 'Recurring Invoice', color: 'bg-[var(--color-accent-soft)] text-[var(--color-text-tertiary)]',  Icon: ArrowsClockwise },
};

const EXAMPLES = [
  'Invoice for $500 web design for john@acme.com due Friday',
  'Recurring monthly invoice $1,200 for Sarah for consulting',
  'Payment link for logo design $350 due next week',
];

/* ── Action card shown below AI message ── */
function ActionCard({
  parsed, onConfirm, onDismiss,
}: {
  parsed: ParsedData;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const meta = INTENT_META[parsed.intent] ?? INTENT_META.invoice;
  const { Icon } = meta;
  const { formatAmount } = useCurrency();

  return (
    <div className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xs">
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.color}`}>
          <Icon className="h-3 w-3" weight="bold" />
          {meta.label}
        </span>
      </div>

      <div className="mb-3 space-y-1.5">
        {parsed.amount != null && (
          <Row label="Amount" value={formatAmount(parsed.amount)} />
        )}
        {parsed.clientName && <Row label="Client" value={parsed.clientName} />}
        {parsed.clientEmail && <Row label="Email" value={parsed.clientEmail} truncate />}
        {parsed.dueDate && (
          <Row label="Due" value={new Date(parsed.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
        )}
        {parsed.frequency && <Row label="Frequency" value={parsed.frequency.charAt(0).toUpperCase() + parsed.frequency.slice(1)} />}
        {parsed.title && <Row label="For" value={parsed.title} truncate />}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="flex-1 rounded-full bg-[var(--color-accent)] py-1.5 text-[12px] font-semibold text-white transition hover:bg-[var(--color-primary-dark)]"
        >
          {parsed.intent === 'recurring_invoice' ? 'Review & Set up' : 'Create'}
        </button>
        <button
          onClick={onDismiss}
          className="rounded-full border border-[var(--color-border-input)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-background)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="shrink-0 text-[var(--color-text-muted)]">{label}</span>
      <span className={`font-medium text-[var(--color-foreground)] ${truncate ? 'truncate max-w-[160px]' : ''}`}>{value}</span>
    </div>
  );
}

/* ── Main component ── */
export function HedwigChatBubble({ accessToken }: { accessToken: string | null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [pendingParsed, setPendingParsed] = useState<ParsedData | null>(null);
  const [pendingMsgId, setPendingMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { formatUsdText } = useCurrency();
  const posthog = usePostHog();

  const capturePostHog = useCallback((event: string, properties: Record<string, unknown>) => {
    if (posthog) {
      posthog.capture(event, properties);
      return;
    }
    if (typeof window !== 'undefined') {
      (window as Window & { posthog?: { capture?: (name: string, props?: Record<string, unknown>) => void } })
        .posthog
        ?.capture?.(event, properties);
    }
  }, [posthog]);

  /* Scroll to bottom on new messages */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isParsing]);

  /* Focus input when opened */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  /* Listen for external open requests */
  useEffect(() => {
    const handler = () => setOpen(true);
    const handlerWithQuery = (e: Event) => {
      const query = (e as CustomEvent).detail?.query;
      setOpen(true);
      if (query) setInput(query);
    };
    window.addEventListener('hedwig:openchat', handler);
    window.addEventListener('hedwig:open-chat', handlerWithQuery);
    return () => {
      window.removeEventListener('hedwig:openchat', handler);
      window.removeEventListener('hedwig:open-chat', handlerWithQuery);
    };
  }, []);

  /* Auto-grow textarea */
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 100)}px`;
  }, [input]);

  /* Send message → call Gemini creation-box parse */
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isParsing) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsParsing(true);

    try {
      const res = await fetch(`${backendConfig.apiBaseUrl}/api/creation-box/parse`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, currentDate: new Date().toISOString() }),
        cache: 'no-store',
      });
      const json = await res.json();

      if (json?.success && json.data) {
        const raw = json.data;
        const parsed: ParsedData = {
          intent:
            raw.intent === 'payment_link' ? 'payment_link'
            : raw.intent === 'recurring_invoice' ? 'recurring_invoice'
            : raw.intent === 'unknown' ? 'unknown'
            : 'invoice',
          clientName:  raw.clientName  ?? null,
          clientEmail: raw.clientEmail ?? null,
          amount:      raw.amount      ?? null,
          dueDate:     raw.dueDate     ?? null,
          title:       raw.title       ?? null,
          items:       Array.isArray(raw.items) ? raw.items : undefined,
          frequency:   raw.frequency,
          autoSend:    raw.autoSend,
          startDate:   raw.startDate   ?? null,
          endDate:     raw.endDate     ?? null,
        };

        const actionable = parsed.intent !== 'unknown';
        const aiMsg: Message = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: raw.naturalResponse || (actionable
            ? "Here's what I found — confirm to create:"
            : "I'm not sure what you need. Try describing an invoice, payment link, or recurring invoice."),
          parsed:      actionable ? parsed : undefined,
          actionState: actionable ? 'pending' : undefined,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        setMessages((prev) => [...prev, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: 'I couldn\'t parse that. Try: "Invoice for $500 web design for john@acme.com due Friday".',
        }]);
      }
    } catch {
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
      }]);
    } finally {
      setIsParsing(false);
    }
  }, [input, accessToken, isParsing]);

  /* Confirm creating an invoice or payment link */
  const confirmAction = useCallback(async (msgId: string, parsed: ParsedData) => {
    if (parsed.intent === 'recurring_invoice') {
      setPendingParsed(parsed);
      setPendingMsgId(msgId);
      setShowRecurring(true);
      return;
    }

    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, actionState: 'creating' } : m));

    try {
      const isPaymentLink = parsed.intent === 'payment_link';
      const endpoint = isPaymentLink ? '/api/documents/payment-link' : '/api/documents/invoice';

      const totalAmount = parsed.items?.length
        ? parsed.items.reduce((s, i) => s + i.amount, 0)
        : (parsed.amount ?? 0);

      const typeLabel = isPaymentLink ? 'Payment Link' : 'Invoice';
      const title =
        parsed.title ||
        (parsed.clientName ? `${typeLabel} for ${parsed.clientName}` : null) ||
        (parsed.clientEmail ? `${typeLabel} for ${parsed.clientEmail.split('@')[0]}` : null) ||
        typeLabel;

      const dueDate = parsed.dueDate
        ? new Date(parsed.dueDate).toISOString()
        : new Date(Date.now() + 7 * 86_400_000).toISOString();

      const body: Record<string, unknown> = {
        title,
        description: title,
        amount: totalAmount,
        currency: isPaymentLink ? 'USDC' : 'USD',
        remindersEnabled: true,
        items: parsed.items ?? [],
        dueDate,
      };
      if (parsed.clientName)  body.clientName     = parsed.clientName;
      if (parsed.clientEmail) body.recipientEmail = parsed.clientEmail;

      const res = await fetch(`${backendConfig.apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error?.message ?? 'Failed to create');
      const document = result?.data?.document;

      if (isPaymentLink) {
        capturePostHog('payment_link_created', {
          payment_link_id: document?.id,
          amount: document?.amount,
          currency: document?.currency,
          client_id: document?.client_id ?? document?.clientId,
        });
      } else {
        capturePostHog('invoice_created', {
          invoice_id: document?.id,
          amount: document?.amount,
          currency: document?.currency,
          client_id: document?.client_id ?? document?.clientId,
        });
      }

      setMessages((prev) => prev.map((m) => m.id === msgId
        ? { ...m, actionState: 'done', actionResult: `${typeLabel} created successfully.` }
        : m
      ));
      toast({ type: 'success', title: `${typeLabel} created` });
      router.refresh();
    } catch (err: any) {
      setMessages((prev) => prev.map((m) => m.id === msgId
        ? { ...m, actionState: 'error', actionResult: err?.message ?? 'Failed to create.' }
        : m
      ));
    }
  }, [accessToken, capturePostHog, router, toast]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* ── Floating bubble ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 overflow-hidden rounded-full shadow-lg ring-4 ring-[var(--color-accent)]/20 transition hover:shadow-xl active:scale-95"
          aria-label="Open Hedwig AI"
        >
          <HedwigLogoImg fill />
        </button>
      )}

      {/* ── Chat panel ── */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[580px] w-[400px] flex-col overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)]">

          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-surface-tertiary)] px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
              <HedwigLogoImg size={28} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-[var(--color-foreground)]">Hedwig</p>
              <p className="text-[11px] text-[var(--color-text-muted)]">AI assistant</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-background)]"
              aria-label="Close"
            >
              <X className="h-4 w-4" weight="bold" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

            {/* Empty state */}
            {messages.length === 0 && !isParsing && (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
                  <HedwigLogoImg size={40} />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[var(--color-foreground)]">What do you need?</p>
                  <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
                    Create invoices, payment links, and recurring invoices — just describe them.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => { setInput(ex); inputRef.current?.focus(); }}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-left text-[12px] text-[var(--color-text-muted)] transition hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-text-tertiary)]"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

                {/* AI avatar */}
                {msg.role === 'assistant' && (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
                    <HedwigLogoImg size={24} />
                  </div>
                )}

                <div className={`flex max-w-[82%] flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {/* Bubble */}
                  <div className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'rounded-tr-sm bg-[var(--color-accent)] text-white'
                      : 'rounded-tl-sm bg-[var(--color-background)] text-[var(--color-foreground)]'
                  }`}>
                    {msg.role === 'assistant' ? formatUsdText(msg.content) : msg.content}
                  </div>

                  {/* Action card */}
                  {msg.parsed && msg.actionState === 'pending' && (
                    <ActionCard
                      parsed={msg.parsed}
                      onConfirm={() => confirmAction(msg.id, msg.parsed!)}
                      onDismiss={() => setMessages((prev) =>
                        prev.map((m) => m.id === msg.id ? { ...m, actionState: undefined, parsed: undefined } : m)
                      )}
                    />
                  )}

                  {/* Creating */}
                  {msg.actionState === 'creating' && (
                    <div className="flex items-center gap-2 rounded-xl bg-[var(--color-background)] px-3 py-2 text-[12px] text-[var(--color-text-tertiary)]">
                      <SpinnerGap className="h-3.5 w-3.5 animate-spin text-[var(--color-text-tertiary)]" weight="bold" />
                      Creating…
                    </div>
                  )}

                  {/* Done */}
                  {msg.actionState === 'done' && (
                    <div className="flex items-center gap-2 rounded-xl bg-[var(--color-success-soft)] px-3 py-2 text-[12px] text-[var(--color-text-tertiary)]">
                      <CheckCircle className="h-3.5 w-3.5" weight="fill" />
                      {msg.actionResult}
                    </div>
                  )}

                  {/* Error */}
                  {msg.actionState === 'error' && (
                    <div className="flex items-center gap-2 rounded-xl bg-[var(--color-danger-soft)] px-3 py-2 text-[12px] text-[var(--color-text-tertiary)]">
                      <XCircle className="h-3.5 w-3.5" weight="fill" />
                      {msg.actionResult}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isParsing && (
              <div className="flex gap-2">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
                  <HedwigLogoImg size={28} />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-[var(--color-background)] px-3.5 py-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-[var(--color-surface-tertiary)] bg-[var(--color-surface)] px-3 py-3">
            <div className="flex items-end gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 py-2.5">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you need…"
                rows={1}
                className="flex-1 resize-none bg-transparent text-[13px] text-[var(--color-foreground)] placeholder:text-[var(--color-text-muted)] outline-none"
                style={{ maxHeight: '100px' }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isParsing}
                className={`mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${
                  input.trim() && !isParsing
                    ? 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-primary-dark)]'
                    : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                }`}
              >
                <ArrowUp className="h-3.5 w-3.5" weight="bold" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-[var(--color-text-muted)]">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}

      {/* Recurring invoice dialog */}
      <CreateRecurringInvoiceDialog
        open={showRecurring}
        clients={[]}
        accessToken={accessToken}
        onOpenChange={setShowRecurring}
        prefill={{
          clientName:  pendingParsed?.clientName  ?? '',
          clientEmail: pendingParsed?.clientEmail ?? '',
          amount:      pendingParsed?.amount != null ? String(pendingParsed.amount) : '',
          frequency:   (pendingParsed?.frequency as any) ?? 'monthly',
          title:       pendingParsed?.title ?? '',
          startDate:   pendingParsed?.startDate ?? new Date().toISOString().split('T')[0],
          endDate:     pendingParsed?.endDate ?? '',
          autoSend:    pendingParsed?.autoSend ?? false,
        }}
        onCreated={() => {
          setShowRecurring(false);
          if (pendingMsgId) {
            setMessages((prev) => prev.map((m) => m.id === pendingMsgId
              ? { ...m, actionState: 'done', actionResult: 'Recurring invoice set up.' }
              : m
            ));
          }
          setPendingParsed(null);
          setPendingMsgId(null);
          toast({ type: 'success', title: 'Recurring invoice created' });
          router.refresh();
        }}
      />
    </>
  );
}
