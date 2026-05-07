'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowSquareOut,
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
  Paperclip,
  Receipt,
  Signature,
  Sparkle,
  Trash,
  User,
  UserPlus,
  WarningCircle,
  X,
} from '@/components/ui/lucide-icons';
import type { EmailThread, DocumentType } from '@/lib/types/email-intelligence';
import { hedwigApi } from '@/lib/api/client';

type ClientOption = {
  id: string;
  name: string;
  email?: string | null;
};

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

function formatFileSize(sizeBytes?: number) {
  const size = Number(sizeBytes || 0);
  if (!Number.isFinite(size) || size <= 0) return 'Unknown size';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function ConfidenceMeter({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? '#12b76a' : score >= 0.6 ? '#f79009' : '#f04438';
  const label = score >= 0.8 ? 'High confidence' : score >= 0.6 ? 'Medium confidence' : 'Low confidence';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#717680]">{label}</span>
        <span className="text-[11px] font-semibold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f2f4f7]">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a4a7ae]">{children}</p>
  );
}

function EntityChip({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: React.FC<any>;
  label: string;
  value: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-[#e9eaeb] bg-[#f9fafb] px-3 py-2.5 text-left transition hover:border-[#c8cdd5] hover:bg-white"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-[#717680]" />
        <div>
          <p className="text-[10px] font-medium text-[#a4a7ae]">{label}</p>
          <p className="text-[12px] font-semibold text-[#181d27]">{value}</p>
        </div>
      </div>
      <CaretRight className="h-3.5 w-3.5 text-[#a4a7ae]" />
    </button>
  );
}

function AttachmentRow({ name, size, type }: { name: string; size: string; type?: string }) {
  const typeColors: Record<string, { bg: string; text: string }> = {
    invoice:  { bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
    contract: { bg: 'bg-[#f0fdf4]', text: 'text-[#15803d]' },
    receipt:  { bg: 'bg-[#fefce8]', text: 'text-[#a16207]' },
  };
  const tc = type ? typeColors[type] : null;

  return (
    <div className="flex items-center justify-between rounded-xl border border-[#e9eaeb] bg-[#f9fafb] px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-xs">
          <FileText className="h-3.5 w-3.5 text-[#717680]" />
        </span>
        <div>
          <p className="text-[12px] font-semibold text-[#181d27]">{name}</p>
          <p className="text-[10px] text-[#a4a7ae]">{size}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {tc && type && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tc.bg} ${tc.text}`}>
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </span>
        )}
        <button type="button" className="rounded-lg p-1.5 transition hover:bg-[#e9eaeb]">
          <Eye className="h-3.5 w-3.5 text-[#717680]" />
        </button>
      </div>
    </div>
  );
}

// ─── Mock calendar suggestions ─────────────────────────────────────────────────

const MOCK_CALENDAR_SUGGESTION = {
  title: 'Invoice Due — Acme Studio',
  date: 'Feb 1, 2024',
  reason: 'Detected due date from invoice email',
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function ThreadDetailPanel({
  thread,
  accessToken,
  onClose,
  onConfirm,
  onIgnore,
  onUpdate,
}: {
  thread: EmailThread;
  accessToken: string | null;
  onClose: () => void;
  onConfirm: () => void;
  onIgnore: () => void;
  onUpdate: (updated: EmailThread) => void;
}) {
  const amount = formatAmount(thread.detectedAmount, thread.detectedCurrency);
  const isMatched = thread.status === 'matched';
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [isLinking, setIsLinking] = useState(false);

  const suggestedClientName = useMemo(() => {
    if (thread.fromName?.trim()) return thread.fromName.trim();
    const local = thread.fromEmail.split('@')[0] || 'Imported client';
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Imported client';
  }, [thread.fromEmail, thread.fromName]);

  useEffect(() => {
    if (!showClientPicker || !accessToken) return;
    hedwigApi.clients({ accessToken })
      .then((items) => {
        setClients(items.map((client) => ({
          id: client.id,
          name: client.name,
          email: client.email,
        })));
      })
      .catch(() => setClients([]));
  }, [accessToken, showClientPicker]);

  const patchCurrentThread = async (body: Record<string, unknown>, update: Partial<EmailThread>) => {
    setIsLinking(true);
    try {
      const resp = await fetch(`/api/integrations/threads?id=${thread.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error('Could not update import');
      onUpdate({ ...thread, ...update });
      setShowClientPicker(false);
    } finally {
      setIsLinking(false);
    }
  };

  const handleLinkClient = async (client: ClientOption) => {
    await patchCurrentThread(
      { matchedClientId: client.id, status: 'matched' },
      {
        matchedClientId: client.id,
        matchedClientName: client.name,
        status: 'matched',
        confidenceScore: thread.confidenceScore ?? 1,
      },
    );
  };

  const handleCreateClient = async () => {
    if (!accessToken) return;
    setIsLinking(true);
    try {
      const client = await hedwigApi.createClient({
        name: suggestedClientName,
        email: thread.fromEmail,
      }, { accessToken });
      await patchCurrentThread(
        { matchedClientId: client.id, status: 'matched' },
        {
          matchedClientId: client.id,
          matchedClientName: client.name,
          status: 'matched',
          confidenceScore: 1,
        },
      );
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-l border-[#f2f4f7] bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[#f2f4f7] px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[#181d27]">{thread.subject}</p>
          <p className="mt-0.5 text-[12px] text-[#717680]">
            {thread.fromName || thread.fromEmail} · {thread.messageCount} {thread.messageCount === 1 ? 'message' : 'messages'} · {formatEmailTime(thread.lastMessageAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition hover:bg-[#f2f4f7]"
        >
          <X className="h-4 w-4 text-[#717680]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Summary */}
        {thread.summary && (
          <div className="border-b border-[#f2f4f7] px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkle className="h-3.5 w-3.5 text-[#2563eb]" />
              <SectionLabel>Summary</SectionLabel>
            </div>
            <p className="text-[13px] leading-relaxed text-[#414651]">{thread.summary}</p>
          </div>
        )}

        {/* Detected entities */}
        {(amount || thread.detectedDueDate || thread.detectedType) && (
          <div className="border-b border-[#f2f4f7] px-5 py-4 space-y-3">
            <SectionLabel>Detected details</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              {thread.detectedType && (
                <div className="rounded-xl bg-[#f9fafb] px-3 py-2.5">
                  <p className="text-[10px] font-medium text-[#a4a7ae]">Type</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-[#181d27] capitalize">{thread.detectedType}</p>
                </div>
              )}
              {amount && (
                <div className="rounded-xl bg-[#f9fafb] px-3 py-2.5">
                  <p className="text-[10px] font-medium text-[#a4a7ae]">Amount</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-[#181d27]">{amount}</p>
                </div>
              )}
              {thread.detectedDueDate && (
                <div className="rounded-xl bg-[#f9fafb] px-3 py-2.5">
                  <p className="text-[10px] font-medium text-[#a4a7ae]">Due date</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-[#181d27]">
                    {new Date(thread.detectedDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              )}
              <div className="rounded-xl bg-[#f9fafb] px-3 py-2.5">
                <p className="text-[10px] font-medium text-[#a4a7ae]">Participants</p>
                <p className="mt-0.5 text-[12px] font-semibold text-[#181d27]">{thread.participants.length}</p>
              </div>
            </div>
          </div>
        )}

        {/* Match confidence */}
        {thread.confidenceScore !== undefined && (
          <div className="border-b border-[#f2f4f7] px-5 py-4 space-y-3">
            <SectionLabel>Match confidence</SectionLabel>
            <ConfidenceMeter score={thread.confidenceScore} />
          </div>
        )}

        {/* Linked entities */}
        <div className="border-b border-[#f2f4f7] px-5 py-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Linked to</SectionLabel>
            <button
              type="button"
              onClick={() => setShowClientPicker((value) => !value)}
              className="text-[11px] font-semibold text-[#2563eb] hover:text-[#1d4ed8]"
            >
              + Assign
            </button>
          </div>
          {thread.matchedClientName ? (
            <EntityChip icon={User} label="Client" value={thread.matchedClientName} />
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-dashed border-[#e9eaeb] px-3 py-2.5">
              <div className="flex items-center gap-2 text-[#a4a7ae]">
                <User className="h-3.5 w-3.5" />
                <span className="text-[12px]">No client linked</span>
              </div>
              <button
                type="button"
                onClick={() => setShowClientPicker(true)}
                className="text-[11px] font-semibold text-[#2563eb]"
              >
                Link
              </button>
            </div>
          )}
          {showClientPicker && (
            <div className="space-y-2 rounded-xl border border-[#e9eaeb] bg-white p-2 shadow-xs">
              <button
                type="button"
                disabled={isLinking || !accessToken}
                onClick={() => void handleCreateClient()}
                className="flex w-full items-center justify-between rounded-lg bg-[#eff4ff] px-3 py-2.5 text-left transition hover:bg-[#dbeafe] disabled:opacity-60"
              >
                <span>
                  <span className="block text-[12px] font-semibold text-[#181d27]">Create {suggestedClientName}</span>
                  <span className="block text-[11px] text-[#717680]">{thread.fromEmail}</span>
                </span>
                <UserPlus className="h-3.5 w-3.5 text-[#2563eb]" />
              </button>
              <div className="max-h-48 overflow-y-auto">
                {clients.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    disabled={isLinking}
                    onClick={() => void handleLinkClient(client)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-[#f9fafb] disabled:opacity-60"
                  >
                    <span>
                      <span className="block text-[12px] font-semibold text-[#181d27]">{client.name}</span>
                      {client.email && <span className="block text-[11px] text-[#717680]">{client.email}</span>}
                    </span>
                    <LinkSimple className="h-3.5 w-3.5 text-[#a4a7ae]" />
                  </button>
                ))}
                {!clients.length && (
                  <p className="px-3 py-2 text-[11px] text-[#717680]">No existing clients found.</p>
                )}
              </div>
            </div>
          )}
          {thread.matchedProjectName ? (
            <EntityChip icon={FolderSimple} label="Project" value={thread.matchedProjectName} />
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-dashed border-[#e9eaeb] px-3 py-2.5">
              <div className="flex items-center gap-2 text-[#a4a7ae]">
                <FolderSimple className="h-3.5 w-3.5" />
                <span className="text-[12px]">No project linked</span>
              </div>
              <button type="button" className="text-[11px] font-semibold text-[#2563eb]">Link</button>
            </div>
          )}
        </div>

        {/* Attachments */}
        {thread.hasAttachments && (
          <div className="border-b border-[#f2f4f7] px-5 py-4 space-y-2">
            <SectionLabel>Attachments ({thread.attachmentCount})</SectionLabel>
            {(thread.attachments?.length ? thread.attachments : []).map((attachment) => (
              <AttachmentRow
                key={attachment.id}
                name={attachment.filename}
                size={formatFileSize(attachment.sizeBytes)}
                type={attachment.attachmentType || thread.detectedType}
              />
            ))}
            {!thread.attachments?.length && (
              <p className="text-[12px] text-[#717680]">
                Attachment metadata is still syncing.
              </p>
            )}
          </div>
        )}

        {/* Calendar suggestion */}
        {thread.detectedDueDate && (
          <div className="border-b border-[#f2f4f7] px-5 py-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <CalendarBlank className="h-3.5 w-3.5 text-[#717680]" />
              <SectionLabel>Calendar suggestion</SectionLabel>
            </div>
            <div className="rounded-xl border border-[#e9eaeb] bg-[#f9fafb] p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[12px] font-semibold text-[#181d27]">{MOCK_CALENDAR_SUGGESTION.title}</p>
                  <p className="mt-0.5 text-[11px] text-[#717680]">{MOCK_CALENDAR_SUGGESTION.date}</p>
                  <p className="mt-1 text-[11px] text-[#a4a7ae]">{MOCK_CALENDAR_SUGGESTION.reason}</p>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" className="rounded-full bg-[#2563eb] px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-[#1d4ed8]">
                    Add
                  </button>
                  <button type="button" className="rounded-full border border-[#e9eaeb] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#414651] hover:bg-[#f9fafb]">
                    Skip
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Participants */}
        <div className="px-5 py-4 space-y-2">
          <SectionLabel>Participants</SectionLabel>
          {thread.participants.map((p) => (
            <div key={p} className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7] text-[10px] font-semibold text-[#717680]">
                {p.charAt(0).toUpperCase()}
              </span>
              <span className="text-[12px] text-[#414651]">{p}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions footer */}
      <div className="border-t border-[#f2f4f7] px-5 py-3">
        {isMatched ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#027a48]">
              <CheckCircle className="h-4 w-4" />
              Match confirmed
            </span>
            <button
              type="button"
              onClick={onIgnore}
              className="ml-auto text-[12px] font-medium text-[#717680] hover:text-[#414651]"
            >
              Unlink
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#2563eb] py-2 text-[12px] font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              <Check className="h-3.5 w-3.5" />
              Confirm match
            </button>
            <button
              type="button"
              onClick={onIgnore}
              className="flex items-center justify-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-4 py-2 text-[12px] font-semibold text-[#414651] transition hover:bg-[#f9fafb]"
            >
              <X className="h-3.5 w-3.5" />
              Ignore
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
