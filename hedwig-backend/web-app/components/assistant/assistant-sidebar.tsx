'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  ArrowsClockwise,
  PaperPlaneRight,
  Paperclip,
  Sparkle,
  X,
} from '@/components/ui/lucide-icons';
import { useAssistantSidebar } from '@/components/providers/assistant-sidebar-provider';
import { UsageCounter } from '@/components/assistant/usage-counter';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { AssistantSuggestion } from '@/lib/types/assistant';
import { extractApiErrorMessage, friendlyErrorMessage } from '@/lib/api/errors';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}

const STORAGE_KEY_PREFIX = 'hedwig-assistant-sidebar-chat';

function newId() {
  return `msg_${Math.random().toString(36).slice(2, 10)}`;
}

function getStorageKey(userId?: string | null) {
  if (!userId) return null;
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(userId)}`;
}

function loadHistory(key: string | null): ChatMessage[] {
  if (typeof window === 'undefined' || !key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m: any) =>
      m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    ).slice(-50);
  } catch {
    return [];
  }
}

function persistHistory(key: string | null, messages: ChatMessage[]) {
  if (typeof window === 'undefined' || !key) return;
  try {
    const trimmed = messages.filter((m) => !m.pending).slice(-50);
    window.localStorage.setItem(key, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export function AssistantSidebar() {
  const { open, toggle, pageContext } = useAssistantSidebar();
  const { user } = usePrivy();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const userId = user?.id || user?.email?.address || user?.google?.email || user?.apple?.email || null;
  const storageKey = getStorageKey(userId);

  useEffect(() => {
    if (!open) return;
    setMessages(loadHistory(storageKey));
  }, [open, storageKey]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text && pendingFiles.length === 0) return;
    if (sending) return;

    const userMsg: ChatMessage = { id: newId(), role: 'user', content: text };
    const pendingMsg: ChatMessage = { id: newId(), role: 'assistant', content: '', pending: true };
    const nextMessages = [...messages, userMsg, pendingMsg];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setPendingFiles([]);

    try {
      let attachmentId: string | undefined;

      if (pendingFiles.length > 0) {
        const formData = new FormData();
        pendingFiles.forEach((file) => formData.append('files', file));
        const attachResp = await fetch('/api/assistant/attachment', {
          method: 'POST',
          body: formData,
        });
        if (attachResp.ok) {
          const attachJson = await attachResp.json();
          attachmentId = attachJson.data?.attachmentId;
        }
      }

      const contextPayload = pageContext
        ? { page: pageContext.page, route: pageContext.route, data: pageContext.data }
        : undefined;

      const resp = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          attachmentId,
          context: contextPayload,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => 'Failed to get response');
        throw new Error(errText);
      }

      const json = await resp.json();
      const reply = json.data?.reply || json.data?.message || 'No response';

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== pendingMsg.id);
        const updated: ChatMessage[] = [...filtered, { id: newId(), role: 'assistant' as const, content: reply }];
        persistHistory(storageKey, updated);
        return updated;
      });
    } catch (err: any) {
      const errorMsg = friendlyErrorMessage(extractApiErrorMessage(err, 'Something went wrong. Please try again.'));
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== pendingMsg.id);
        const updated: ChatMessage[] = [...filtered, { id: newId(), role: 'assistant' as const, content: errorMsg }];
        persistHistory(storageKey, updated);
        return updated;
      });
    } finally {
      setSending(false);
    }
  }, [input, pendingFiles, messages, sending, pageContext, storageKey]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      setPendingFiles((prev) => [...prev, ...files].slice(0, 6));
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      className={cn(
        'sticky top-0 flex h-dvh shrink-0 flex-col border-l border-[var(--color-border-light)] bg-[var(--color-surface)] transition-all duration-300 ease-out',
        open ? 'w-[380px] opacity-100' : 'w-0 overflow-hidden opacity-0'
      )}
    >
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border-light)] px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
            <Sparkle className="h-3.5 w-3.5 text-[var(--color-accent)]" weight="fill" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">Hedwig Assistant</p>
          </div>
          <UsageCounter />
        </div>
        <div className="flex items-center gap-1.5">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                if (storageKey) window.localStorage.removeItem(storageKey);
              }}
              title="Clear chat"
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] transition duration-150 hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-tertiary)] active:scale-90"
            >
              <ArrowsClockwise className="h-3.5 w-3.5" weight="bold" />
            </button>
          )}
          <button
            type="button"
            onClick={toggle}
            title="Close sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] transition duration-150 hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-tertiary)] active:scale-90"
          >
            <X className="h-3.5 w-3.5" weight="bold" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="animate-fade-up">
            <EmptyState onPick={(prompt) => { setInput(prompt); }} />
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={msg.id}
                className={msg.role === 'user' ? 'animate-message-in-user' : 'animate-message-in'}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <MessageBubble message={msg} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-[var(--color-border-light)] bg-[var(--color-surface)] px-4 py-3">
        {pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingFiles.map((file, i) => (
              <div key={i} className="animate-chip-in inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-tertiary)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)]">
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--color-text-muted)] transition duration-150 hover:text-[var(--color-text-tertiary)] active:scale-75"
                >
                  <X className="h-3 w-3" weight="bold" />
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls"
          className="hidden"
          onChange={handleFileSelect}
        />
        <div className="relative rounded-2xl border border-[var(--color-border-light)] bg-[var(--color-surface)] shadow-xs transition duration-150 focus-within:border-[var(--color-border)] focus-within:shadow-sm">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Hedwig anything..."
            rows={3}
            className="min-h-[72px] w-full resize-none bg-transparent px-3 pb-10 pt-3 text-[13px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none"
            style={{ maxHeight: '140px' }}
          />
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] transition duration-150 hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-tertiary)] active:scale-90"
            >
              <Paperclip className="h-3.5 w-3.5" weight="bold" />
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || (!input.trim() && pendingFiles.length === 0)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent)] text-white transition duration-150 hover:bg-[var(--color-primary-dark)] active:scale-90 disabled:opacity-40"
            >
              <PaperPlaneRight className="h-3.5 w-3.5" weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
          isUser
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]'
        )}
      >
        {message.pending ? (
          <div className="flex items-center gap-2 py-1">
            <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-current opacity-60" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-current opacity-60" style={{ animationDelay: '200ms' }} />
            <span className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-current opacity-60" style={{ animationDelay: '400ms' }} />
          </div>
        ) : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const prompts = [
    'Summarise my active projects',
    'Show unpaid invoices',
    'What did clients reply about?',
  ];

  return (
    <div className="flex flex-col items-center justify-center text-center py-8">
      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent)]/10">
        <Sparkle className="h-5 w-5 text-[var(--color-accent)]" weight="fill" />
      </div>
      <p className="mt-3 text-[15px] font-semibold text-[var(--color-text-primary)]">How can I help?</p>
      <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">
        Ask about your workspace, documents, or connected tools.
      </p>
      <div className="mt-5 flex w-full flex-col gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-left text-[12px] text-[var(--color-text-secondary)] transition duration-150 hover:border-[var(--color-border-input)] hover:bg-[var(--color-background)] active:scale-[0.98]"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
