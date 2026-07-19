'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
 FileText,
 FolderSimple,
 Receipt,
 Signature,
 User,
 WarningCircle,
} from '@/components/ui/lucide-icons';
import type { ReviewDecisionType, SuggestedEntity } from '@/lib/types/import-review';
import { ConfidenceIndicator } from './confidence-indicator';
import { ExistingMatchList } from './existing-match-list';
import { SuggestionReasonPanel } from './suggestion-reason-panel';

const iconByEntity = {
 client: User,
 project: FolderSimple,
 invoice: Receipt,
 contract: Signature,
} as const;

const decisionLabel: Record<ReviewDecisionType, string> = {
 approve_creation: 'Approved to create',
 link_existing: 'Approved to link existing',
 edit_then_approve: 'Edited and approved',
 reject: 'Rejected',
 skip: 'Skipped for now',
 defer: 'Deferred',
};

export function SuggestionCard({
 suggestion,
 onDecision,
 onRequestReject,
 onRequestSkip,
}: {
 suggestion: SuggestedEntity;
 onDecision: (decision: ReviewDecisionType, options?: { selectedExistingMatchId?: string; editedValue?: string }) => void;
 onRequestReject: () => void;
 onRequestSkip: () => void;
}) {
 const [editedValue, setEditedValue] = useState(suggestion.edited_value || suggestion.suggested_name);
 const [selectedMatchId, setSelectedMatchId] = useState(
 suggestion.selected_existing_match_id || suggestion.existing_match_candidates[0]?.id,
 );
 const Icon = iconByEntity[suggestion.entity_type] || FileText;

 return (
 <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs">
 <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
 <div className="flex items-start gap-3">
 <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent-soft)]">
 <Icon className="h-5 w-5 text-[var(--color-accent)]" />
 </span>
 <div>
 <div className="flex flex-wrap items-center gap-2">
 <p className="text-[11px] font-semibold text-[var(--color-text-placeholder)]">
 Suggested {suggestion.entity_type}
 </p>
 <ConfidenceIndicator score={suggestion.confidence_score} tier={suggestion.confidence_tier} compact />
 {suggestion.user_decision ? (
 <span className="inline-flex items-center rounded-full bg-[var(--color-surface-tertiary)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)]">
 {decisionLabel[suggestion.user_decision]}
 </span>
 ) : null}
 </div>
 <h3 className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-[var(--color-foreground)]">
 {suggestion.edited_value || suggestion.suggested_name}
 </h3>
 <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--color-text-muted)]">{suggestion.reason_summary}</p>
 </div>
 </div>
 <div className="w-full max-w-[260px]">
 <ConfidenceIndicator score={suggestion.confidence_score} tier={suggestion.confidence_tier} />
 </div>
 </div>

 {suggestion.duplicate_warning || suggestion.conflict_warning ? (
 <div className="mt-4 rounded-2xl border border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] px-4 py-3 text-[12px] text-[var(--color-warning)]">
 <div className="flex items-start gap-2">
 <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
 <div>
 {suggestion.duplicate_warning ? <p>{suggestion.duplicate_warning}</p> : null}
 {suggestion.conflict_warning ? <p>{suggestion.conflict_warning}</p> : null}
 </div>
 </div>
 </div>
 ) : null}

 <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
 <div className="space-y-4">
 <div className="rounded-2xl bg-[var(--color-background)] p-4">
 <div className="flex items-center justify-between gap-3">
 <div>
 <p className="text-[12px] font-semibold text-[var(--color-foreground)]">Create new {suggestion.entity_type}</p>
 <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
 Edit the detected value before approving if you want to correct it.
 </p>
 </div>
 </div>

 <label className="mt-4 block">
 <span className="mb-2 block text-[11px] font-semibold text-[var(--color-text-placeholder)]">
 Detected value
 </span>
 <input
 value={editedValue}
 onChange={(event) => setEditedValue(event.target.value)}
 className="h-11 w-full rounded-2xl border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 text-[14px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-accent)]/10"
 />
 </label>

 <div className="mt-4 flex flex-wrap gap-2">
 <Button
 onClick={() =>
 onDecision(
 editedValue !== suggestion.suggested_name ? 'edit_then_approve' : 'approve_creation',
 { editedValue },
 )
 }
 >
 {editedValue !== suggestion.suggested_name ? 'Edit and approve' : 'Approve creation'}
 </Button>
 <Button variant="outline" onClick={onRequestSkip}>Skip for later</Button>
 <Button variant="ghost" onClick={onRequestReject}>Reject suggestion</Button>
 </div>
 </div>

 <SuggestionReasonPanel suggestion={suggestion} />
 </div>

 <div className="space-y-4">
 <div className="rounded-2xl bg-[var(--color-background)] p-4 ring-1 ring-[var(--color-surface-tertiary)]">
 <div className="flex items-center justify-between gap-3">
 <div>
 <p className="text-[12px] font-semibold text-[var(--color-foreground)]">Existing alternatives</p>
 <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
 Choose an existing record if you want to avoid creating a duplicate.
 </p>
 </div>
 <Button
 variant="outline"
 onClick={() => onDecision('link_existing', { selectedExistingMatchId: selectedMatchId })}
 disabled={!suggestion.existing_match_candidates.length || !selectedMatchId}
 >
 Choose existing
 </Button>
 </div>

 <div className="mt-4">
 <ExistingMatchList
 candidates={suggestion.existing_match_candidates}
 selectedId={selectedMatchId}
 onSelect={setSelectedMatchId}
 />
 </div>
 </div>

 {suggestion.manual_review_recommended ? (
 <div className="rounded-2xl bg-[var(--color-background)] px-4 py-3 text-[12px] leading-5 text-[var(--color-text-muted)] ring-1 ring-[var(--color-surface-tertiary)]">
 Manual review is recommended for this suggestion. Hedwig will not create or link anything here unless you explicitly approve it.
 </div>
 ) : null}
 </div>
 </div>
 </div>
 );
}
