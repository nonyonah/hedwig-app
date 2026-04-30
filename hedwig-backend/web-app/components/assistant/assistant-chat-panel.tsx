'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  CheckCircle,
  PaperPlaneRight,
  Paperclip,
  X,
} from '@/components/ui/lucide-icons';
import { ClientPortal } from '@/components/ui/client-portal';
import { useCurrency } from '@/components/providers/currency-provider';
import { cn } from '@/lib/utils';
import type { AssistantSuggestion } from '@/lib/types/assistant';
import { extractApiErrorMessage, friendlyErrorMessage } from '@/lib/api/errors';
import { SUGGESTION_META } from './suggestion-meta';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  pendingProviders?: ToolProvider[];
  toolsCalled?: string[];
  stagedSuggestionIds?: string[];
}

interface AssistantChatPanelProps {
  open: boolean;
  onClose: () => void;
}

type ToolProvider = 'workspace' | 'gmail' | 'google_calendar' | 'google_drive' | 'google_docs';

const STORAGE_KEY = 'hedwig-assistant-chat-history';

const PROVIDER_ICON_PATH: Partial<Record<ToolProvider, string>> = {
  workspace: '/hedwig-icon.png',
  gmail: '/icons/gmail.svg',
  google_calendar: '/icons/google-calendar.svg',
  google_drive: '/icons/google-drive.svg',
  google_docs: '/icons/google-docs.svg',
};

function inferPendingProviders(text: string, file?: File | null): ToolProvider[] {
  const lower = text.toLowerCase();
  const providers = new Set<ToolProvider>(['workspace']);

  if (file) {
    providers.add('google_drive');
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      providers.add('google_docs');
    }
  }
  if (/\b(gmail|email|mail|inbox|reply|thread)\b/.test(lower)) providers.add('gmail');
  if (/\b(calendar|schedule|deadline|due date|meeting|event)\b/.test(lower)) providers.add('google_calendar');
  if (/\b(drive|upload|file|folder|pdf|document)\b/.test(lower)) providers.add('google_drive');
  if (/\b(doc|docs|contract|brief|proposal)\b/.test(lower)) providers.add('google_docs');

  return Array.from(providers);
}

function newId() {
  return `msg_${Math.random().toString(36).slice(2, 10)}`;
}

function loadHistory(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m: any) =>
      m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    ).slice(-30);
  } catch {
    return [];
  }
}

function persistHistory(messages: ChatMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = messages
      .filter((m) => !m.pending)
      .slice(-30);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* ignore quota */ }
}

export function AssistantChatPanel({ open, onClose }: AssistantChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestionsById, setSuggestionsById] = useState<Record<string, AssistantSuggestion>>({});
  const [savingSuggestionId, setSavingSuggestionId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setMessages(loadHistory());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ids = Array.from(new Set(
      messages.flatMap((message) => message.stagedSuggestionIds ?? [])
    )).filter((id) => !suggestionsById[id]);

    if (ids.length === 0) return;

    let cancelled = false;
    const loadSuggestions = async () => {
      const results = await Promise.all(ids.map(async (id) => {
        try {
          const resp = await fetch(`/api/assistant/suggestions/${id}`, { cache: 'no-store' });
          const payload = await resp.json();
          return payload?.success ? payload.data?.suggestion as AssistantSuggestion : null;
        } catch {
          return null;
        }
      }));

      if (cancelled) return;
      setSuggestionsById((current) => {
        const next = { ...current };
        for (const suggestion of results) {
          if (suggestion?.id) next[suggestion.id] = suggestion;
        }
        return next;
      });
    };

    void loadSuggestions();
    return () => { cancelled = true; };
  }, [messages, open, suggestionsById]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => textareaRef.current?.focus(), 320);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const send = async () => {
    const text = input.trim();
    if (sending) return;
    if (!text && !pendingFile) return;

    const file = pendingFile;
    const userText = text || (file ? `Uploaded ${file.name}` : '');
    const userMessage: ChatMessage = { id: newId(), role: 'user', content: userText };
    const pendingMessage: ChatMessage = {
      id: newId(),
      role: 'assistant',
      content: '',
      pending: true,
      pendingProviders: inferPendingProviders(text, file),
    };
    const next = [...messages, userMessage, pendingMessage];
    setMessages(next);
    setInput('');
    setPendingFile(null);
    setSending(true);

    try {
      let payload: any;

      if (file) {
        const form = new FormData();
        form.append('file', file);
        if (text) form.append('message', text);

        const resp = await fetch('/api/assistant/attachment', {
          method: 'POST',
          body: form,
        });
        payload = await resp.json();
      } else {
        const history = messages
          .filter((m) => !m.pending)
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content }));

        const resp = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history }),
        });
        payload = await resp.json();
      }

      const reply: ChatMessage = payload?.success
        ? {
          id: pendingMessage.id,
          role: 'assistant',
          content: payload.data?.reply || '(empty response)',
          toolsCalled: payload.data?.toolsCalled || [],
          stagedSuggestionIds: payload.data?.stagedSuggestionIds || [],
        }
        : {
          id: pendingMessage.id,
          role: 'assistant',
          content: extractApiErrorMessage(payload, 'I could not reach the assistant. Please try again in a moment.'),
        };

      setMessages((current) => {
        const updated = current.map((m) => m.id === pendingMessage.id ? reply : m);
        persistHistory(updated);
        return updated;
      });
    } catch (error: any) {
      setMessages((current) => current.map((m) =>
        m.id === pendingMessage.id
          ? { id: m.id, role: 'assistant' as const, content: friendlyErrorMessage(error, 'I could not reach the assistant. Please try again in a moment.') }
          : m
      ));
    } finally {
      setSending(false);
    }
  };

  const handleFilePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setPendingFile(file);
    event.target.value = '';
  };

  const clearHistory = () => {
      setMessages([]);
    setSuggestionsById({});
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
  };

  const updateSuggestionStatus = async (
    suggestion: AssistantSuggestion,
    status: 'approved' | 'dismissed',
    actionType?: string | null
  ) => {
    setSavingSuggestionId(suggestion.id);
    try {
      const resp = await fetch(`/api/assistant/suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, actionType }),
      });
      const payload = await resp.json().catch(() => null);
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Could not update suggestion');
      const updated = payload.data?.suggestion as AssistantSuggestion | undefined;
      if (updated?.id) {
        setSuggestionsById((current) => ({ ...current, [updated.id]: updated }));
      }
    } finally {
      setSavingSuggestionId(null);
    }
  };

  const handleKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  if (!open) return null;

  return (
    <ClientPortal>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full max-w-[480px] flex-col bg-white shadow-2xl animate-in slide-in-from-right-full duration-300 ease-out">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[#e9eaeb] px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2563eb]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/hedwig-icon.png" alt="Hedwig" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-semibold text-[#181d27]">Hedwig</p>
              <span className="rounded-full bg-[#eff4ff] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#2563eb]">Beta</span>
            </div>
            <p className="text-[12px] text-[#a4a7ae]">Ask anything · Actions need your approval</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              title="Clear history"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e9eaeb] text-[#717680] transition hover:bg-[#f5f5f5]"
            >
              <ArrowsClockwise className="h-3.5 w-3.5" weight="bold" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e9eaeb] text-[#717680] transition hover:bg-[#f5f5f5]"
          >
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
          {messages.length === 0 ? (
            <EmptyState onPick={(prompt) => { setInput(prompt); textareaRef.current?.focus(); }} />
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  suggestionsById={suggestionsById}
                  savingSuggestionId={savingSuggestionId}
                  onApprove={(suggestion, actionType) => updateSuggestionStatus(suggestion, 'approved', actionType)}
                  onDismiss={(suggestion) => updateSuggestionStatus(suggestion, 'dismissed')}
                />
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-[#e9eaeb] bg-[#fcfcfd] px-4 py-3">
          {pendingFile && (
            <div className="mb-2 flex items-center gap-2 rounded-full border border-[#e9eaeb] bg-white px-3 py-1.5 text-[12px]">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-[#717680]" weight="bold" />
              <span className="min-w-0 flex-1 truncate font-medium text-[#414651]">{pendingFile.name}</span>
              <span className="shrink-0 text-[11px] text-[#a4a7ae]">{Math.round(pendingFile.size / 1024)} KB</span>
              <button
                type="button"
                onClick={() => setPendingFile(null)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#a4a7ae] transition hover:bg-[#f5f5f5] hover:text-[#414651]"
              >
                <X className="h-3 w-3" weight="bold" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-[#e9eaeb] bg-white px-2 py-2 transition-colors focus-within:border-[#2563eb]">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={handleFilePick}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Attach a document"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#717680] transition hover:bg-[#f5f5f5] hover:text-[#414651] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Paperclip className="h-4 w-4" weight="bold" />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder={pendingFile ? 'Add a note (optional)…' : 'Ask anything…'}
              className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent text-[14px] text-[#181d27] placeholder:text-[#c1c5cd] focus:outline-none"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || (!input.trim() && !pendingFile)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PaperPlaneRight className="h-3.5 w-3.5" weight="fill" />
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-[#a4a7ae]">
            Hedwig drafts actions · You approve before anything executes.
          </p>
        </div>
      </div>
    </ClientPortal>
  );
}

function providerFromToolName(toolName: string): ToolProvider | null {
  const name = toolName.toLowerCase();
  if (!name) return null;
  if (name.includes('gmail')) return 'gmail';
  if (name.includes('calendar') || name.includes('google_calendar')) return 'google_calendar';
  if (name.includes('drive')) return 'google_drive';
  if (name.includes('docs') || name.includes('document')) return 'google_docs';
  if (name.includes('workspace') || name.includes('brief')) return 'workspace';
  return null;
}

function providersFromToolCalls(toolsCalled: string[] = []): ToolProvider[] {
  const providers = toolsCalled
    .map(providerFromToolName)
    .filter(Boolean) as ToolProvider[];
  return Array.from(new Set(providers));
}

function ToolIcon({ provider, index = 0, animated = false }: { provider: ToolProvider; index?: number; animated?: boolean }) {
  const imagePath = PROVIDER_ICON_PATH[provider];

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#e9eaeb] bg-white shadow-xs',
        animated && 'animate-pulse'
      )}
      style={animated ? { animationDelay: `${index * 120}ms` } : undefined}
    >
      {imagePath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagePath} alt="" className="h-3.5 w-3.5" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/hedwig-icon.png" alt="" className="h-full w-full object-cover" />
      )}
    </span>
  );
}

function ToolIconStrip({ providers, animated = false }: { providers: ToolProvider[]; animated?: boolean }) {
  const visibleProviders: ToolProvider[] = providers.length > 0 ? providers : ['workspace'];

  return (
    <div className="flex items-center gap-1.5">
      {visibleProviders.slice(0, 6).map((provider, index) => (
        <ToolIcon key={provider} provider={provider} index={index} animated={animated} />
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  suggestionsById,
  savingSuggestionId,
  onApprove,
  onDismiss,
}: {
  message: ChatMessage;
  suggestionsById: Record<string, AssistantSuggestion>;
  savingSuggestionId: string | null;
  onApprove: (suggestion: AssistantSuggestion, actionType?: string | null) => Promise<void>;
  onDismiss: (suggestion: AssistantSuggestion) => Promise<void>;
}) {
  const isUser = message.role === 'user';
  const { formatUsdText } = useCurrency();

  if (message.pending) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl bg-[#f5f5f5] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="sr-only">Hedwig is thinking</span>
            <ToolIconStrip providers={message.pendingProviders ?? ['workspace']} animated />
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#a4a7ae]" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#a4a7ae]" style={{ animationDelay: '120ms' }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#a4a7ae]" style={{ animationDelay: '240ms' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed',
          isUser
            ? 'bg-[#2563eb] text-white'
            : 'bg-[#f5f5f5] text-[#181d27]'
        )}
      >
        <p className="whitespace-pre-wrap">{isUser ? message.content : formatUsdText(message.content)}</p>

        {!isUser && message.toolsCalled && message.toolsCalled.length > 0 && (
          <div className="mt-2">
            <ToolIconStrip providers={providersFromToolCalls(message.toolsCalled)} />
          </div>
        )}

        {!isUser && message.stagedSuggestionIds && message.stagedSuggestionIds.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.stagedSuggestionIds.map((id) => (
              <AssistantActionCard
                key={id}
                suggestion={suggestionsById[id] ?? null}
                saving={savingSuggestionId === id}
                onApprove={onApprove}
                onDismiss={onDismiss}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistantActionCard({
  suggestion,
  saving,
  onApprove,
  onDismiss,
}: {
  suggestion: AssistantSuggestion | null;
  saving: boolean;
  onApprove: (suggestion: AssistantSuggestion, actionType?: string | null) => Promise<void>;
  onDismiss: (suggestion: AssistantSuggestion) => Promise<void>;
}) {
  if (!suggestion) {
    return (
      <div className="rounded-xl border border-[#e9eaeb] bg-white px-3 py-2.5">
        <div className="h-3 w-28 animate-pulse rounded-full bg-[#e9eaeb]" />
        <div className="mt-2 h-3 w-full animate-pulse rounded-full bg-[#f2f4f7]" />
      </div>
    );
  }

  const meta = SUGGESTION_META[suggestion.type] ?? SUGGESTION_META.invoice_reminder;
  const Icon = meta.icon;
  const primaryAction = suggestion.actions?.[0] ?? null;
  const completed = suggestion.status === 'approved' || suggestion.status === 'dismissed' || suggestion.status === 'rejected';

  return (
    <div className="rounded-xl border border-[#d5d7da] bg-white p-3 text-left shadow-xs">
      <div className="flex items-start gap-2.5">
        <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', meta.bg, meta.color)}>
          <Icon className="h-3.5 w-3.5" weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#a4a7ae]">{meta.label}</p>
          <p className="mt-0.5 text-[13px] font-semibold leading-snug text-[#181d27]">{suggestion.title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#535862]">{suggestion.description}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {completed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf3] px-2.5 py-1 text-[11px] font-semibold text-[#027a48]">
            <CheckCircle className="h-3 w-3" weight="bold" />
            {suggestion.status === 'approved' ? 'Approved' : 'Dismissed'}
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onApprove(suggestion, primaryAction?.type ?? null)}
              disabled={saving}
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#2563eb] px-3 text-[12px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
            >
              <CheckCircle className="h-3.5 w-3.5" weight="bold" />
              {saving ? 'Approving...' : primaryAction?.label ?? 'Approve'}
            </button>
            <button
              type="button"
              onClick={() => onDismiss(suggestion)}
              disabled={saving}
              className="inline-flex h-7 items-center rounded-full border border-[#e9eaeb] bg-white px-3 text-[12px] font-semibold text-[#535862] transition hover:bg-[#fafafa] disabled:opacity-50"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const prompts = [
    'Summarise the state of all my active projects.',
    'Show me unpaid invoices older than 7 days.',
    'What did clients reply about in the last 24 hours?',
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[#2563eb]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hedwig-icon.png" alt="Hedwig" className="h-full w-full object-cover" />
      </div>
      <p className="mt-4 text-[15px] font-semibold text-[#181d27]">How can I help?</p>
      <p className="mt-1 text-[12px] text-[#717680]">
        I can read your workspace, import documents, and draft actions in connected tools.
      </p>
      <div className="mt-6 flex w-full flex-col gap-2 px-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="rounded-2xl border border-[#e9eaeb] bg-white px-4 py-2.5 text-left text-[12px] text-[#414651] transition hover:border-[#d0d5dd] hover:bg-[#fafafa]"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
