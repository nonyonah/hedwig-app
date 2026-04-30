'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowsClockwise,
  CalendarBlank,
  CaretRight,
  Check,
  CheckCircle,
  ClockCountdown,
  DotsThreeOutline,
  Envelope,
  Eye,
  FileText,
  FolderSimple,
  Info,
  LinkSimple,
  MagicWand,
  MagnifyingGlass,
  Paperclip,
  Plus,
  Receipt,
  Signature,
  Sparkle,
  Trash,
  UploadSimple,
  User,
  WarningCircle,
  X,
  XCircle,
} from '@/components/ui/lucide-icons';
import { AttachedStatGrid } from '@/components/ui/attached-stat-cards';
import { useToast } from '@/components/providers/toast-provider';
import type {
  EmailThread,
  InboxTab,
  InboxFilter,
  DocumentType,
  AnyProvider,
  Attachment,
  ImportedInvoice,
  AISuggestion,
} from '@/lib/types/email-intelligence';
import { ThreadDetailPanel } from '@/components/email/thread-detail-panel';
import { ImportInvoiceModal } from '@/components/email/import-invoice-modal';

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchThreadsFromApi(): Promise<{ threads: EmailThread[] }> {
  try {
    const resp = await fetch('/api/integrations/threads?limit=20', { cache: 'no-store' });
    const text = await resp.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { console.error('[inbox] non-JSON response:', text.slice(0, 200)); }
    if (!resp.ok || !json.success) {
      console.error('[inbox] threads fetch failed', resp.status, json);
      return { threads: [] };
    }
    return { threads: Array.isArray(json.data) ? json.data : [] };
  } catch (err) {
    console.error('[inbox] threads fetch error', err);
    return { threads: [] };
  }
}

async function patchThread(id: string, body: Record<string, unknown>): Promise<void> {
  await fetch(`/api/integrations/threads?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { id: InboxTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'needs_review', label: 'Needs Review' },
  { id: 'matched', label: 'Matched' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'imports', label: 'Imports' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function confidenceColor(score: number) {
  if (score >= 0.8) return { dot: 'bg-[#12b76a]', text: 'text-[#027a48]', bg: 'bg-[#ecfdf3]' };
  if (score >= 0.6) return { dot: 'bg-[#f79009]', text: 'text-[#92400e]', bg: 'bg-[#fffaeb]' };
  return { dot: 'bg-[#f04438]', text: 'text-[#b42318]', bg: 'bg-[#fef3f2]' };
}

function statusConfig(status: EmailThread['status']) {
  switch (status) {
    case 'matched':    return { label: 'Matched',      bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]', dot: 'bg-[#12b76a]' };
    case 'needs_review': return { label: 'Needs Review', bg: 'bg-[#fffaeb]', text: 'text-[#92400e]', dot: 'bg-[#f79009]' };
    case 'ignored':    return { label: 'Ignored',      bg: 'bg-[#f2f4f7]', text: 'text-[#717680]', dot: 'bg-[#d0d5dd]' };
    case 'imported':   return { label: 'Imported',     bg: 'bg-[#eff4ff]', text: 'text-[#3538cd]', dot: 'bg-[#6172f3]' };
  }
}

function typeConfig(type?: DocumentType) {
  switch (type) {
    case 'invoice':  return { label: 'Invoice',  bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' };
    case 'contract': return { label: 'Contract', bg: 'bg-[#f0fdf4]', text: 'text-[#15803d]' };
    case 'receipt':  return { label: 'Receipt',  bg: 'bg-[#fefce8]', text: 'text-[#a16207]' };
    case 'proposal': return { label: 'Proposal', bg: 'bg-[#fdf4ff]', text: 'text-[#9333ea]' };
    default:         return null;
  }
}

function formatEmailTime(iso: string) {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts) || ts <= 0) return '';

  const d = new Date(ts);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;

  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (ts >= todayStart) return timeStr;
  if (ts >= yesterdayStart) return `Yesterday ${timeStr}`;
  if (ts >= weekStart) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${timeStr}`;
  if (d.getFullYear() === now.getFullYear())
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${timeStr}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAmount(amount?: number, currency = 'USD') {
  if (!amount) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

// ─── Thread Card ──────────────────────────────────────────────────────────────

function ThreadCard({
  thread,
  isSelected,
  onSelect,
  onConfirm,
  onIgnore,
}: {
  thread: EmailThread;
  isSelected: boolean;
  onSelect: () => void;
  onConfirm: () => void;
  onIgnore: () => void;
}) {
  const status = statusConfig(thread.status);
  const type = typeConfig(thread.detectedType);
  const conf = thread.confidenceScore ? confidenceColor(thread.confidenceScore) : null;
  const amount = formatAmount(thread.detectedAmount, thread.detectedCurrency);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full rounded-2xl border bg-white p-4 text-left transition ${
        isSelected
          ? 'border-[#2563eb] shadow-[0_0_0_3px_#eff4ff]'
          : 'border-[#e9eaeb] hover:border-[#c8cdd5] hover:shadow-xs'
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {/* Provider badge */}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7]">
            <Envelope className="h-3.5 w-3.5 text-[#717680]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-[#181d27]">{thread.subject}</p>
            <p className="mt-0.5 text-[11px] text-[#717680]">{thread.fromName || thread.fromEmail}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-[#a4a7ae]">{formatEmailTime(thread.lastMessageAt)}</span>
          {thread.hasAttachments && (
            <Paperclip className="h-3.5 w-3.5 text-[#a4a7ae]" />
          )}
        </div>
      </div>

      {/* Summary */}
      {thread.summary && (
        <p className="mt-2.5 line-clamp-2 text-[12px] leading-relaxed text-[#717680]">
          {thread.summary}
        </p>
      )}

      {/* Tags row */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {/* Status */}
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.bg} ${status.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>

        {/* Type */}
        {type && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${type.bg} ${type.text}`}>
            {type.label}
          </span>
        )}

        {/* Amount */}
        {amount && (
          <span className="rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[10px] font-semibold text-[#414651]">
            {amount}
          </span>
        )}

        {/* Matched entity */}
        {thread.matchedClientName && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[10px] font-medium text-[#414651]">
            <User className="h-2.5 w-2.5" />
            {thread.matchedClientName}
          </span>
        )}
        {thread.matchedProjectName && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#f2f4f7] px-2 py-0.5 text-[10px] font-medium text-[#414651]">
            <FolderSimple className="h-2.5 w-2.5" />
            {thread.matchedProjectName}
          </span>
        )}

        {/* Confidence */}
        {conf && thread.confidenceScore && (
          <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${conf.bg} ${conf.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${conf.dot}`} />
            {Math.round(thread.confidenceScore * 100)}% match
          </span>
        )}
      </div>

      {/* Actions — visible on hover/selection */}
      {(thread.status === 'needs_review' || isSelected) && (
        <div className="mt-3 flex items-center gap-2 border-t border-[#f2f4f7] pt-3 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onConfirm(); }}
            className="inline-flex items-center gap-1 rounded-full bg-[#2563eb] px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-[#1d4ed8]"
          >
            <Check className="h-3 w-3" />
            Confirm match
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIgnore(); }}
            className="inline-flex items-center gap-1 rounded-full border border-[#e9eaeb] bg-white px-3 py-1 text-[11px] font-semibold text-[#414651] transition hover:bg-[#f9fafb]"
          >
            <X className="h-3 w-3" />
            Ignore
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-[#717680] transition hover:text-[#181d27]"
          >
            View thread
            <CaretRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </button>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: InboxTab }) {
  const config = {
    all:          { icon: Envelope,     title: 'No emails yet',              body: 'Connect Gmail or Outlook to start seeing email intelligence here.' },
    needs_review: { icon: WarningCircle, title: 'All caught up',              body: 'No emails need your review right now.' },
    matched:      { icon: CheckCircle,  title: 'No matched emails',           body: 'Emails matched to clients, projects, or documents will appear here.' },
    invoices:     { icon: Receipt,      title: 'No invoice emails',           body: 'Emails containing invoices will appear here.' },
    contracts:    { icon: Signature,    title: 'No contract emails',          body: 'Emails related to contracts will appear here.' },
    receipts:     { icon: FileText,     title: 'No receipt emails',           body: 'Payment receipts and acknowledgements will appear here.' },
    attachments:  { icon: Paperclip,   title: 'No emails with attachments',  body: 'Emails with downloaded attachments will appear here.' },
    imports:      { icon: UploadSimple, title: 'No imported documents',       body: 'Import external invoices or drag-and-drop documents to get started.' },
  }[tab];

  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f2f4f7]">
        <Icon className="h-6 w-6 text-[#a4a7ae]" />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-[#181d27]">{config.title}</p>
      <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-[#717680]">{config.body}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MagicInboxClient({ accessToken }: { accessToken: string | null }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<InboxTab>((searchParams.get('tab') as InboxTab) ?? 'all');
  const [search, setSearch] = useState('');
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    fetchThreadsFromApi()
      .then(({ threads: t }) => setThreads(t))
      .finally(() => setIsLoading(false));
  }, []);

  // Filter threads by tab + search
  const filtered = useMemo(() => {
    let result = threads;

    if (activeTab === 'needs_review') result = result.filter((t) => t.status === 'needs_review');
    else if (activeTab === 'matched') result = result.filter((t) => t.status === 'matched');
    else if (activeTab === 'invoices') result = result.filter((t) => t.detectedType === 'invoice');
    else if (activeTab === 'contracts') result = result.filter((t) => t.detectedType === 'contract');
    else if (activeTab === 'receipts') result = result.filter((t) => t.detectedType === 'receipt');
    else if (activeTab === 'attachments') result = result.filter((t) => t.hasAttachments);
    else if (activeTab === 'imports') result = result.filter((t) => t.status === 'imported');

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.fromEmail.toLowerCase().includes(q) ||
          t.fromName?.toLowerCase().includes(q) ||
          t.summary?.toLowerCase().includes(q) ||
          t.matchedClientName?.toLowerCase().includes(q) ||
          t.matchedProjectName?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [threads, activeTab, search]);

  const counts = useMemo(() => ({
    all: threads.length,
    needs_review: threads.filter((t) => t.status === 'needs_review').length,
    matched: threads.filter((t) => t.status === 'matched').length,
    invoices: threads.filter((t) => t.detectedType === 'invoice').length,
    contracts: threads.filter((t) => t.detectedType === 'contract').length,
    receipts: threads.filter((t) => t.detectedType === 'receipt').length,
    attachments: threads.filter((t) => t.hasAttachments).length,
    imports: threads.filter((t) => t.status === 'imported').length,
  }), [threads]);

  const handleConfirm = (threadId: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, status: 'matched' as const } : t))
    );
    patchThread(threadId, { status: 'matched' }).catch(() => {});
    toast({ type: 'success', title: 'Match confirmed' });
  };

  const handleIgnore = (threadId: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, status: 'ignored' as const } : t))
    );
    patchThread(threadId, { status: 'ignored' }).catch(() => {});
    if (selectedThread?.id === threadId) setSelectedThread(null);
    toast({ type: 'info', title: 'Thread ignored' });
  };

  const handleSync = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/integrations/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'gmail' }),
      });
      const { threads: fresh } = await fetchThreadsFromApi();
      setThreads(fresh);
      toast({ type: 'success', title: 'Inbox synced' });
    } catch {
      toast({ type: 'error', title: 'Sync failed', message: 'Could not sync your inbox.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between border-b border-[#f2f4f7] px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eff4ff]">
            <Sparkle className="h-4 w-4 text-[#2563eb]" />
          </span>
          <div>
            <h1 className="text-[17px] font-semibold text-[#181d27]">Magic Inbox</h1>
            <p className="text-[12px] text-[#717680]">Your emails, organized and matched automatically</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#414651] shadow-xs transition hover:bg-[#f9fafb] disabled:opacity-60"
          >
            <ArrowsClockwise className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Syncing…' : 'Sync'}
          </button>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#2563eb] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#1d4ed8]"
          >
            <Plus className="h-3.5 w-3.5" />
            Import invoice
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-[#f2f4f7] px-6 pt-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2 text-[12px] font-semibold transition ${
              activeTab === id
                ? 'border-b-2 border-[#2563eb] text-[#2563eb]'
                : 'text-[#717680] hover:text-[#414651]'
            }`}
          >
            {label}
            {counts[id] > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                activeTab === id ? 'bg-[#eff4ff] text-[#2563eb]' : 'bg-[#f2f4f7] text-[#717680]'
              }`}>
                {counts[id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Thread list */}
        <div className={`flex flex-col overflow-y-auto transition-all ${selectedThread ? 'w-[420px] shrink-0 border-r border-[#f2f4f7]' : 'flex-1'}`}>
          {/* Search */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 rounded-full border border-[#e9eaeb] bg-[#f9fafb] px-3 py-2">
              <MagnifyingGlass className="h-3.5 w-3.5 shrink-0 text-[#a4a7ae]" />
              <input
                type="text"
                placeholder="Search emails, senders, clients…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-[12px] text-[#181d27] placeholder-[#a4a7ae] outline-none"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')}>
                  <X className="h-3 w-3 text-[#a4a7ae] hover:text-[#414651]" />
                </button>
              )}
            </div>
          </div>

          {/* Stats bar (top-level only) */}
          {activeTab === 'all' && !search && (
            <AttachedStatGrid
              items={[
                { id: 'needs-review', title: 'Needs review', value: String(counts.needs_review), valueClassName: 'text-[#92400e]', helper: undefined },
                { id: 'matched', title: 'Matched', value: String(counts.matched), valueClassName: 'text-[#027a48]', helper: undefined },
                { id: 'attachments', title: 'Attachments', value: String(counts.attachments), valueClassName: 'text-[#2563eb]', helper: undefined },
              ]}
              className="mx-4 mb-3 grid-cols-1 md:grid-cols-3"
            />
          )}

          {/* Thread cards */}
          <div className="flex flex-col gap-2 px-4 pb-6">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-[#f2f4f7] bg-[#f9fafb] p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-[#e9eaeb]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-3/4 rounded-full bg-[#e9eaeb]" />
                      <div className="h-2.5 w-1/2 rounded-full bg-[#f2f4f7]" />
                      <div className="h-2.5 w-full rounded-full bg-[#f2f4f7]" />
                    </div>
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <EmptyState tab={activeTab} />
            ) : (
              filtered.map((thread) => (
                <ThreadCard
                  key={thread.id}
                  thread={thread}
                  isSelected={selectedThread?.id === thread.id}
                  onSelect={() => setSelectedThread(thread)}
                  onConfirm={() => handleConfirm(thread.id)}
                  onIgnore={() => handleIgnore(thread.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Thread detail panel */}
        {selectedThread && (
          <ThreadDetailPanel
            thread={selectedThread}
            onClose={() => setSelectedThread(null)}
            onConfirm={() => handleConfirm(selectedThread.id)}
            onIgnore={() => handleIgnore(selectedThread.id)}
            onUpdate={(updated) => {
              setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
              setSelectedThread(updated);
            }}
          />
        )}
      </div>

      {/* Import modal */}
      {showImportModal && (
        <ImportInvoiceModal
          onClose={() => setShowImportModal(false)}
          onImported={(invoice) => {
            toast({ type: 'success', title: 'Invoice imported', message: `${invoice.filename} is ready for review.` });
            setShowImportModal(false);
          }}
        />
      )}
    </div>
  );
}
