'use client';

import { useState } from 'react';
import { Info } from '@/components/ui/lucide-icons';
import type { SuggestedEntity } from '@/lib/types/import-review';

export function SuggestionReasonPanel({ suggestion }: { suggestion: SuggestedEntity }) {
 const [open, setOpen] = useState(false);

 return (
 <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
 <button
 type="button"
 onClick={() => setOpen((value) => !value)}
 className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
 >
 <div className="flex items-center gap-2">
 <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
 <Info className="h-4 w-4 text-[var(--color-text-tertiary)]" />
 </span>
 <div>
 <p className="text-[12px] font-semibold text-[var(--color-foreground)]">Why this suggestion?</p>
 <p className="text-[12px] text-[var(--color-text-tertiary)]">{suggestion.reason_summary}</p>
 </div>
 </div>
 <span className="text-[11px] font-semibold text-[var(--color-accent)]">{open ? 'Hide details' : 'Show details'}</span>
 </button>

 {open && (
 <div className="border-t border-[var(--color-border)] px-4 py-4">
 <ul className="space-y-2 text-[12px] leading-5 text-[var(--color-text-secondary)]">
 {suggestion.reason_details.map((detail) => (
 <li key={detail} className="rounded-xl bg-[var(--color-surface)] px-3 py-2 ring-1 ring-[var(--color-surface-tertiary)]">
 {detail}
 </li>
 ))}
 </ul>
 <div className="mt-3 grid gap-2 sm:grid-cols-2">
 {suggestion.source_signals.map((signal) => (
 <div key={signal.id} className="rounded-xl bg-[var(--color-surface)] px-3 py-2 ring-1 ring-[var(--color-surface-tertiary)]">
 <p className="text-[10px] font-semibold text-[var(--color-text-muted)]">{signal.label}</p>
 <p className="mt-1 text-[12px] font-medium text-[var(--color-foreground)]">{signal.value}</p>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 );
}
