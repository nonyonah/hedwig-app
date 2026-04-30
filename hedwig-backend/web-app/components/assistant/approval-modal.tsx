'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CheckCircle,
  Info,
  Warning,
  X,
} from '@/components/ui/lucide-icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AssistantSuggestion } from '@/lib/types/assistant';
import { SUGGESTION_META, getConfidenceBadge, getEntityBadges, getPriorityBadge, getSuggestionHref } from './suggestion-meta';

interface ApprovalModalProps {
  suggestion: AssistantSuggestion | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ApprovalModal({ suggestion, onClose, onApprove, onReject }: ApprovalModalProps) {
  const [saving, setSaving] = useState<'approve' | 'dismiss' | null>(null);
  const [selectedActionType, setSelectedActionType] = useState<string | null>(null);
  const actions = Array.isArray(suggestion?.actions) ? suggestion.actions : [];

  useEffect(() => {
    setSelectedActionType(actions[0]?.type ?? null);
  }, [suggestion?.id]);

  if (!suggestion) return null;

  const meta = SUGGESTION_META[suggestion.type] ?? SUGGESTION_META.invoice_reminder;
  const confidence = getConfidenceBadge(suggestion.confidenceScore);
  const priority = getPriorityBadge(suggestion.priority);
  const badges = getEntityBadges(suggestion);
  const contextHref = getSuggestionHref(suggestion);
  const selectedAction = actions.find((action) => action.type === selectedActionType) ?? actions[0] ?? null;

  const handleApprove = async () => {
    setSaving('approve');
    try {
      await fetch(`/api/assistant/suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', actionType: selectedActionType }),
      });
      onApprove(suggestion.id);
      onClose();
    } finally {
      setSaving(null);
    }
  };

  const handleReject = async () => {
    setSaving('dismiss');
    try {
      await fetch(`/api/assistant/suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      onReject(suggestion.id);
      onClose();
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={!!suggestion} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#a4a7ae]">
                {meta.label}
              </p>
              <DialogTitle className="mt-1">{suggestion.title}</DialogTitle>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold', confidence.color)}>
                {confidence.label}
              </span>
              <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold', priority.color)}>
                {priority.label}
              </span>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="rounded-xl bg-[#f9fafb] px-4 py-3">
            <p className="text-[13px] leading-relaxed text-[#414651]">{suggestion.description}</p>
          </div>

          {suggestion.reason && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[#e9eaeb] px-4 py-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" weight="fill" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Why Hedwig is suggesting this</p>
                <p className="mt-1 text-[13px] text-[#414651]">{suggestion.reason}</p>
              </div>
            </div>
          )}

          {badges.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Context</p>
              <div className="flex flex-wrap gap-2">
                {badges.map((badge) => (
                  <span key={badge} className="inline-flex items-center rounded-lg bg-[#f9fafb] px-3 py-1.5 text-[12px] font-medium text-[#414651]">
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3">
            <Warning className="mt-0.5 h-4 w-4 shrink-0 text-[#92400e]" weight="fill" />
            <p className="text-[12px] text-[#92400e]">
              <span className="font-semibold">Approval is always manual.</span> Hedwig will never send, create, link, or file anything automatically from this suggestion.
            </p>
          </div>

          {actions.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Available actions</p>
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <button
                    key={action.type}
                    type="button"
                    onClick={() => setSelectedActionType(action.type)}
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                      selectedAction?.type === action.type
                        ? 'border-[#2563eb] bg-[#eff4ff] text-[#2563eb]'
                        : 'border-[#e9eaeb] bg-white text-[#414651] hover:bg-[#f9fafb]'
                    )}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              {selectedAction ? (
                <p className="mt-2 text-[12px] text-[#717680]">
                  Approving will mark <span className="font-semibold text-[#181d27]">{selectedAction.label}</span> as the intended next step.
                </p>
              ) : null}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={!!saving}
            className="mr-auto"
          >
            Cancel
          </Button>
          <Button
            asChild
            variant="secondary"
          >
            <Link href={contextHref}>Open context</Link>
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={!!saving}
          >
            {saving === 'dismiss' ? 'Dismissing…' : (
              <><X className="h-3.5 w-3.5" weight="bold" /> Dismiss</>
            )}
          </Button>
          <Button
            onClick={handleApprove}
            disabled={!!saving}
          >
            {saving === 'approve' ? 'Approving…' : (
              <><CheckCircle className="h-3.5 w-3.5" weight="bold" /> {selectedAction ? selectedAction.label : 'Approve'}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
