'use client';

import { PencilSimple, Trash } from '@/components/ui/lucide-icons';
import type { TimeEntry } from '@/components/time/types';

function fmtDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function TimeEntriesList({
  grouped,
  onEdit,
  onDelete,
}: {
  grouped: Map<string, TimeEntry[]>;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="divide-y divide-[var(--color-surface-secondary)]">
      {Array.from(grouped.entries()).map(([date, entries]) => (
        <div key={date}>
          <div className="bg-[var(--color-background)] px-5 py-2">
            <span className="text-[12px] font-semibold text-[var(--color-text-tertiary)]">{date}</span>
          </div>
          <div className="divide-y divide-[var(--color-surface-secondary)]">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[var(--color-background)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--color-foreground)]">
                      {entry.project?.name || 'No project'}
                    </span>
                    {entry.project?.client && (
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        · {entry.project.client.name}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
                    {fmtTime(entry.startTime)}
                    {entry.endTime ? ` — ${fmtTime(entry.endTime)}` : ' — running'}
                    {entry.description ? ` · ${entry.description}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-[13px] font-semibold tabular-nums text-[var(--color-foreground)]">
                      {fmtDuration(entry.durationSeconds)}
                    </p>
                    {entry.billableAmount != null && entry.billableAmount > 0 && (
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        ${entry.billableAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => onEdit(entry)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
                      aria-label="Edit entry"
                    >
                      <PencilSimple className="h-3.5 w-3.5" weight="bold" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entry.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                      aria-label="Delete entry"
                    >
                      <Trash className="h-3.5 w-3.5" weight="bold" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
