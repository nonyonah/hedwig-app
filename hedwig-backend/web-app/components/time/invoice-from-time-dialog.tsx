'use client';

import { useState, useMemo } from 'react';
import { X, Receipt, SpinnerGap } from '@/components/ui/lucide-icons';
import { ClientPortal } from '@/components/ui/client-portal';
import { Button } from '@/components/ui/button';
import { hedwigApi } from '@/lib/api/client';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import type { TimeEntry } from '@/components/time/types';

function fmtDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function InvoiceFromTimeDialog({
  entries,
  accessToken,
  onClose,
}: {
  entries: TimeEntry[];
  accessToken: string | null;
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(entries.map(e => e.id)));
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const { activeWorkspace } = useWorkspaceContext();

  const selected = entries.filter(e => selectedIds.has(e.id));
  const totalHours = selected.reduce((s, e) => s + (e.durationSeconds || 0), 0) / 3600;
  const totalBillable = selected.reduce((s, e) => s + (e.billableAmount || 0), 0);

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selected.length === 0) return;
    setSending(true);
    try {
      const clientName = selected[0]?.project?.client?.name || 'Client';
      await hedwigApi.createInvoice({
        clientName,
        amount: totalBillable,
        description: selected.map(e =>
          `${e.description || 'Work'} (${fmtDuration(e.durationSeconds)})`
        ).join('; '),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      }, { accessToken, workspaceId: activeWorkspace?.id, disableMockFallback: true });
      setDone(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to create invoice');
    } finally { setSending(false); }
  };

  return (
    <ClientPortal>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={sending ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)] animate-in fade-in-0 zoom-in-95 duration-200">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <p className="text-[15px] font-bold text-[var(--color-foreground)]">
                {done ? 'Invoice created' : 'Generate invoice'}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
                {done ? 'Invoice has been created from tracked time.' : `${selected.length} of ${entries.length} entries selected`}
              </p>
            </div>
            {!sending && (
              <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-secondary)]">
                <X className="h-4 w-4" weight="bold" />
              </button>
            )}
          </div>

          {done ? (
            <div className="flex flex-col items-center gap-4 px-5 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-success-soft)]">
                <Receipt className="h-7 w-7 text-[var(--color-success)]" weight="bold" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-[var(--color-foreground)]">
                  ${totalBillable.toLocaleString(undefined, { minimumFractionDigits: 2 })} · {totalHours.toFixed(1)}h
                </p>
                <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
                  {selected.length} time entr{selected.length !== 1 ? 'ies' : 'y'} billed
                </p>
              </div>
              <Button variant="default" onClick={onClose}>Done</Button>
            </div>
          ) : (
            <>
              <div className="max-h-[320px] overflow-y-auto divide-y divide-[var(--color-surface-secondary)]">
                {entries.map(e => (
                  <label key={e.id} className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-[var(--color-background)]">
                    <input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggle(e.id)}
                      className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--color-foreground)]">
                        {e.project?.name || 'No project'}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-muted)] truncate">
                        {fmtDuration(e.durationSeconds)}{e.description ? ` · ${e.description}` : ''}
                      </p>
                    </div>
                    {e.billableAmount != null && (
                      <span className="shrink-0 text-[13px] font-semibold text-[var(--color-foreground)]">
                        ${e.billableAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-4">
                <div>
                  <p className="text-[15px] font-bold text-[var(--color-foreground)]">
                    ${totalBillable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {totalHours.toFixed(1)}h · {selected.length} entr{selected.length !== 1 ? 'ies' : 'y'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={onClose}>Cancel</Button>
                  <Button variant="default" onClick={handleGenerate} disabled={sending || selected.length === 0}>
                    {sending ? <><SpinnerGap className="h-4 w-4 animate-spin" weight="bold" /> Creating…</> : 'Create invoice'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </ClientPortal>
  );
}
