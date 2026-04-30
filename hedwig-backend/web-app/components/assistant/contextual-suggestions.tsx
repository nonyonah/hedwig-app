'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Warning } from '@/components/ui/lucide-icons';
import { cn } from '@/lib/utils';
import type { AssistantSuggestion, SuggestionType } from '@/lib/types/assistant';
import { ApprovalModal } from './approval-modal';
import { SUGGESTION_META, getEntityBadges } from './suggestion-meta';

type SuggestionQuery = {
  invoiceId?: string;
  projectId?: string;
  clientId?: string;
  contractId?: string;
  types?: SuggestionType[];
  expensePage?: boolean;
  taxPage?: boolean;
  importsPage?: boolean;
  insightsPage?: boolean;
  limit?: number;
};

interface ContextualSuggestionsProps {
  title?: string;
  description?: string;
  query: SuggestionQuery;
  className?: string;
}

function buildQueryString(query: SuggestionQuery) {
  const params = new URLSearchParams();
  params.set('surface', 'inline');

  if (query.invoiceId) params.set('invoiceId', query.invoiceId);
  if (query.projectId) params.set('projectId', query.projectId);
  if (query.clientId) params.set('clientId', query.clientId);
  if (query.contractId) params.set('contractId', query.contractId);
  if (query.types?.length) params.set('types', query.types.join(','));
  if (query.expensePage) params.set('expensePage', 'true');
  if (query.taxPage) params.set('taxPage', 'true');
  if (query.importsPage) params.set('importsPage', 'true');
  if (query.insightsPage) params.set('insightsPage', 'true');
  if (query.limit) params.set('limit', String(query.limit));

  return params.toString();
}

function InlineSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="h-20 animate-pulse rounded-2xl bg-[#f9fafb]" />
      ))}
    </div>
  );
}

export function ContextualSuggestions({
  title = 'Suggested next steps',
  description = 'Contextual suggestions appear here only when Hedwig finds something worth reviewing.',
  query,
  className,
}: ContextualSuggestionsProps) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<AssistantSuggestion[]>([]);
  const [reviewTarget, setReviewTarget] = useState<AssistantSuggestion | null>(null);

  const queryString = useMemo(() => buildQueryString(query), [query]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/assistant/suggestions?${queryString}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({ success: false }));
        if (active && data.success) {
          setSuggestions(data.data?.suggestions ?? []);
        }
      } catch {
        if (active) setSuggestions([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [queryString]);

  const handleDismiss = async (id: string) => {
    await fetch(`/api/assistant/suggestions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    }).catch(() => {});

    setSuggestions((current) => current.filter((suggestion) => suggestion.id !== id));
  };

  const removeSuggestion = (id: string) => {
    setSuggestions((current) => current.filter((suggestion) => suggestion.id !== id));
  };

  if (loading) {
    return (
      <section className={cn('rounded-2xl border border-[#e9eaeb] bg-white p-4 shadow-xs', className)}>
        <InlineSkeleton />
      </section>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <>
      <section className={cn('rounded-2xl border border-[#e9eaeb] bg-white p-4 shadow-xs', className)}>
        <div className="mb-3">
          <p className="text-[14px] font-semibold text-[#181d27]">{title}</p>
          <p className="mt-1 text-[12px] text-[#717680]">{description}</p>
        </div>

        <div className="space-y-2.5">
          {suggestions.map((suggestion) => {
            const meta = SUGGESTION_META[suggestion.type] ?? SUGGESTION_META.invoice_reminder;
            const Icon = meta.icon;
            const badges = getEntityBadges(suggestion);
            const actions = Array.isArray(suggestion.actions) ? suggestion.actions : [];
            const primaryActionLabel = actions[0]?.label || 'Review';

            return (
              <div key={suggestion.id} className="rounded-2xl bg-[#f9fafb] p-3">
                <div className="flex items-start gap-3">
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', meta.bg)}>
                    <Icon className={cn('h-4 w-4', meta.color)} weight="fill" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider', meta.color)}>{meta.label}</span>
                      {badges.slice(0, 2).map((badge) => (
                        <span key={badge} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#717680] ring-1 ring-[#eaecf0]">
                          {badge}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-[13px] font-semibold text-[#181d27]">{suggestion.title}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-[#717680]">{suggestion.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewTarget(suggestion)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#2563eb] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
                      >
                        <CheckCircle className="h-3 w-3" weight="bold" />
                        {primaryActionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDismiss(suggestion.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#717680] transition-colors hover:bg-[#fef3f2] hover:text-[#b42318]"
                      >
                        <Warning className="h-3 w-3" />
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <ApprovalModal
        suggestion={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onApprove={removeSuggestion}
        onReject={removeSuggestion}
      />
    </>
  );
}
