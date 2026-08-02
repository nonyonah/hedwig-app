'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, CloseButton } from '@heroui/react';
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
  onChanged?: () => void;
}

const typeToStatus: Record<SuggestionType, 'accent' | 'danger' | 'success' | 'warning'> = {
  invoice_reminder: 'danger',
  import_match: 'accent',
  expense_categorization: 'success',
  calendar_event: 'warning',
  project_action: 'accent',
  tax_review: 'accent',
};

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
    <div className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-xl bg-[var(--color-background)]" />
      ))}
    </div>
  );
}

export function ContextualSuggestions({
  title = 'Suggested next steps',
  description = 'Contextual suggestions appear here only when Hedwig finds something worth reviewing.',
  query,
  className,
  onChanged,
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
    return () => { active = false; };
  }, [queryString]);

  const handleDismiss = async (id: string) => {
    const resp = await fetch(`/api/assistant/suggestions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    }).catch(() => null);
    if (resp?.ok) {
      setSuggestions((current) => current.filter((suggestion) => suggestion.id !== id));
      onChanged?.();
    }
  };

  const removeSuggestion = (id: string) => {
    setSuggestions((current) => current.filter((suggestion) => suggestion.id !== id));
    onChanged?.();
  };

  if (loading) {
    return (
      <section className={cn('space-y-3', className)}>
        {title && (
          <div className="px-0.5">
            <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{title}</p>
            {description && <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">{description}</p>}
          </div>
        )}
        <InlineSkeleton />
      </section>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <>
      <section className={cn('space-y-3', className)}>
        {title && (
          <div className="px-0.5">
            <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{title}</p>
            {description && <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">{description}</p>}
          </div>
        )}

        <div className="space-y-3">
          {suggestions.map((suggestion) => {
            const meta = SUGGESTION_META[suggestion.type] ?? SUGGESTION_META.invoice_reminder;
            const status = typeToStatus[suggestion.type] || 'accent';
            const badges = getEntityBadges(suggestion);
            const actions = Array.isArray(suggestion.actions) ? suggestion.actions : [];
            const primaryActionLabel = actions[0]?.label || 'Review';

            return (
              <Alert key={suggestion.id} status={status}>
                <Alert.Indicator />
                <Alert.Content>
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{meta.label}</span>
                    {badges.slice(0, 2).map((badge) => (
                      <span
                        key={badge}
                        className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-tertiary)]"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                  <Alert.Title>{suggestion.title}</Alert.Title>
                  <Alert.Description>{suggestion.description}</Alert.Description>
                  <Button
                    className="mt-2"
                    size="sm"
                    variant={status === 'danger' ? 'danger' : 'primary'}
                    onPress={() => setReviewTarget(suggestion)}
                  >
                    {primaryActionLabel}
                  </Button>
                </Alert.Content>
                <CloseButton onPress={() => void handleDismiss(suggestion.id)} />
              </Alert>
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
