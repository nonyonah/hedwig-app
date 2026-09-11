'use client';

import Link from 'next/link';
import MarkdownIt from 'markdown-it';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, ChartBar, Check, CheckCircle, ClockCountdown, Copy, MagicWand, Plus, Receipt, Terminal, ThumbsDown, ThumbsUp, Warning } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { hedwigApi } from '@/lib/api/client';
import { Message, MessageContent, MessageMeta, type MessageRole } from '@/components/ui/message';

type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  stagedSuggestionIds?: string[];
  toolsCalled?: string[];
};

type Approval = {
  id: string;
  status?: string;
  amount?: number | string;
  currency?: string;
  merchant_name?: string | null;
  reason?: string | null;
};

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true });

const STARTERS = [
  { label: 'Review overdue invoices', prompt: 'Show me my overdue invoices and suggest the next follow-up for each one.', Icon: Receipt },
  { label: 'Summarize my cash flow', prompt: 'Summarize my recent cash flow, including money in, money out, and anything unusual.', Icon: ChartBar },
  { label: 'Review upcoming payments', prompt: 'What payments and obligations are coming up, and which ones need my attention?', Icon: ClockCountdown },
  { label: 'Review my expenses', prompt: 'Review my recent expenses and flag anything that needs categorization or follow-up.', Icon: CheckCircle },
];

function formatApproval(approval: Approval): string {
  const amount = approval.amount == null ? '' : ` · ${approval.currency ?? 'USD'} ${Number(approval.amount).toLocaleString()}`;
  return `${approval.merchant_name || 'Financial action'}${amount}`;
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div
      className="intelligence-markdown"
      dangerouslySetInnerHTML={{ __html: markdown.render(content) }}
    />
  );
}

function ThinkingMessage() {
  return (
    <Message role="assistant" className="max-w-3xl">
      <MessageContent variant="plain" className="flex items-center gap-1.5 py-2" aria-label="Hedwig is thinking">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-text-muted)]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-text-muted)] [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-text-muted)] [animation-delay:240ms]" />
      </MessageContent>
    </Message>
  );
}

export function IntelligenceClient({ accessToken }: { accessToken: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const opts = useMemo(() => ({ accessToken, disableMockFallback: true }), [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void hedwigApi.approvals(opts).then((rows) => {
      if (!cancelled) setApprovals((rows as Approval[]).filter((row) => row.status === 'PENDING'));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [accessToken, opts]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  const newConversation = () => {
    setMessages([]);
    setInput('');
    setError(null);
    setCopiedId(null);
  };

  const sendMessage = async (event?: FormEvent, value?: string) => {
    event?.preventDefault();
    const content = (value ?? input).trim();
    if (!content || pending) return;

    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setPending(true);
    setError(null);

    try {
      const result = await hedwigApi.assistantChat({
        message: content,
        history: nextMessages.slice(-10).map(({ role, content: text }) => ({ role, content: text })),
        context: { page: 'Intelligence', route: '/intelligence' },
      }, opts);
      if (!result?.reply?.trim()) throw new Error('Hedwig returned an empty response. Please try again.');
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.reply,
        stagedSuggestionIds: result.stagedSuggestionIds,
        toolsCalled: result.toolsCalled,
      }]);
      if (result.stagedSuggestionIds?.length) {
        void hedwigApi.approvals(opts).then((rows) => setApprovals((rows as Approval[]).filter((row) => row.status === 'PENDING'))).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hedwig could not complete that request.');
    } finally {
      setPending(false);
    }
  };

  const copyMessage = async (message: ChatMessage) => {
    await navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId((current) => current === message.id ? null : current), 1800);
  };

  const conversation = messages.length > 0 || pending;

  return (
    <div className="flex min-h-[calc(100vh-7rem)] w-full flex-col">
      {conversation && (
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-1 sm:px-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" aria-label="Back to dashboard" className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="text-[16px] font-semibold text-[var(--color-foreground)]">New conversation</span>
          </div>
          <button type="button" onClick={newConversation} aria-label="Start a new conversation" className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]">
            <Plus className="h-5 w-5" />
          </button>
        </header>
      )}

      {!conversation ? (
        <main className="flex flex-1 flex-col items-center justify-center px-4 pb-20 pt-8">
          <h1 className="text-center text-[32px] font-medium tracking-[-0.04em] text-[var(--color-foreground)] sm:text-[38px]">Let’s put your money to work</h1>
          <Composer input={input} setInput={setInput} pending={pending} onSubmit={sendMessage} />
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            <span className="mr-1 text-[13px] text-[var(--color-text-tertiary)]">Try one of these prompts out:</span>
            {STARTERS.map(({ label, prompt, Icon }) => (
              <button key={label} type="button" onClick={() => void sendMessage(undefined, prompt)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--color-surface-secondary)] px-4 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2">
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
          {error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}
        </main>
      ) : (
        <main ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-36 pt-10 sm:px-10 lg:px-16">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-9">
            {messages.map((message) => (
              <div key={message.id}>
                <Message role={message.role} className={message.role === 'user' ? 'justify-end' : 'items-start'}>
                  <MessageContent role={message.role} variant={message.role === 'assistant' ? 'plain' : 'bubble'}>
                    {message.role === 'assistant' ? <MarkdownMessage content={message.content} /> : <p className="whitespace-pre-wrap">{message.content}</p>}
                  </MessageContent>
                </Message>
                {message.role === 'assistant' && (
                  <div className="ml-11 mt-2 flex flex-wrap items-center gap-1 text-[var(--color-text-muted)]">
                    <details className="mr-2">
                      <summary className="cursor-pointer list-none px-1 text-[12px] hover:text-[var(--color-text-secondary)]">Thought process <span aria-hidden="true">›</span></summary>
                      <p className="mt-2 max-w-lg rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2 text-[11px] leading-5 text-[var(--color-text-tertiary)]">Hedwig used workspace data and available tools to ground this response. The underlying reasoning is summarized rather than exposed.</p>
                    </details>
                    <button type="button" onClick={() => void copyMessage(message)} aria-label="Copy response" className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]">
                      {copiedId === message.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <button type="button" aria-label="Mark response as helpful" className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"><ThumbsUp className="h-4 w-4" /></button>
                    <button type="button" aria-label="Mark response as unhelpful" className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"><ThumbsDown className="h-4 w-4" /></button>
                    <span className="ml-1 text-[12px]">Hedwig AI</span>
                  </div>
                )}
                {message.role === 'assistant' && message.stagedSuggestionIds?.length ? (
                  <MessageMeta><Link href="/approvals" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"><CheckCircle className="h-3.5 w-3.5" /> Review {message.stagedSuggestionIds.length} prepared action{message.stagedSuggestionIds.length === 1 ? '' : 's'}</Link></MessageMeta>
                ) : null}
              </div>
            ))}
            {pending && <ThinkingMessage />}
            {error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}
          </div>
        </main>
      )}

      {conversation && <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[var(--color-background)] via-[var(--color-background)] to-transparent px-4 pb-5 pt-10 sm:px-10"><div className="mx-auto max-w-3xl"><Composer input={input} setInput={setInput} pending={pending} onSubmit={sendMessage} /><p className="mt-2 text-center text-[11px] text-[var(--color-text-muted)]">Hedwig can prepare actions for your review. You stay in control.</p></div></div>}

      {approvals.length > 0 && !conversation && <div className="sr-only" aria-live="polite">{approvals.length} pending approvals</div>}
    </div>
  );
}

function Composer({ input, setInput, pending, onSubmit }: { input: string; setInput: (value: string) => void; pending: boolean; onSubmit: (event?: FormEvent) => void }) {
  return (
    <form onSubmit={onSubmit} className="mt-8 w-full max-w-[730px]">
      <label htmlFor="intelligence-message" className="sr-only">Ask Hedwig a question or give a command</label>
      <div className="flex items-center gap-2 rounded-full border border-[var(--color-accent)] bg-[var(--color-surface)] px-2 py-1.5 shadow-sm ring-1 ring-[var(--color-accent-soft)] focus-within:ring-2">
        <textarea id="intelligence-message" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSubmit(); } }} placeholder="Ask a question or give a command" rows={1} disabled={pending} className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-4 py-2.5 text-[14px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-muted)] disabled:opacity-60" />
        <Button type="submit" size="icon" disabled={!input.trim() || pending} aria-label="Send message" className="h-10 w-10 shrink-0 rounded-full bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]"><ArrowUp className="h-4 w-4" /></Button>
      </div>
    </form>
  );
}

function ErrorNotice({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return <div role="alert" className="mx-auto mt-6 flex max-w-xl items-start gap-3 rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-left text-[13px] text-[var(--color-danger)]"><Warning className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={onDismiss} className="min-h-10 rounded-md px-2 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]">Dismiss</button></div>;
}
