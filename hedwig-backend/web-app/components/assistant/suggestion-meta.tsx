import type { ComponentType } from 'react';
import {
  Bell,
  CalendarDots,
  FileText,
  FolderSimple,
  Receipt,
  UsersThree,
} from '@/components/ui/lucide-icons';
import type {
  AssistantSuggestion,
  SuggestionPriority,
  SuggestionType,
} from '@/lib/types/assistant';

type SuggestionMeta = {
  label: string;
  icon: ComponentType<any>;
  color: string;
  bg: string;
};

export const SUGGESTION_META: Record<SuggestionType, SuggestionMeta> = {
  invoice_reminder: { label: 'Invoice reminder', icon: Bell, color: 'text-[#b42318]', bg: 'bg-[#fef3f2]' },
  import_match: { label: 'Import match', icon: UsersThree, color: 'text-[#2563eb]', bg: 'bg-[#eff4ff]' },
  expense_categorization: { label: 'Expense review', icon: Receipt, color: 'text-[#027a48]', bg: 'bg-[#ecfdf3]' },
  calendar_event: { label: 'Calendar event', icon: CalendarDots, color: 'text-[#92400e]', bg: 'bg-[#fffaeb]' },
  project_action: { label: 'Project action', icon: FolderSimple, color: 'text-[#7c3aed]', bg: 'bg-[#f5f3ff]' },
  tax_review: { label: 'Tax review', icon: FileText, color: 'text-[#0e7490]', bg: 'bg-[#f0f9ff]' },
};

export function getConfidenceBadge(value: number) {
  const pct = Math.round(value * 100);
  if (pct >= 85) return { label: `${pct}% confidence`, color: 'bg-[#ecfdf3] text-[#027a48]' };
  if (pct >= 65) return { label: `${pct}% confidence`, color: 'bg-[#fffaeb] text-[#92400e]' };
  return { label: `${pct}% confidence`, color: 'bg-[#f2f4f7] text-[#717680]' };
}

export function getPriorityBadge(priority: SuggestionPriority) {
  switch (priority) {
    case 'high':
      return { label: 'High priority', color: 'bg-[#fef3f2] text-[#b42318]' };
    case 'medium':
      return { label: 'Medium priority', color: 'bg-[#fffaeb] text-[#92400e]' };
    default:
      return { label: 'Low priority', color: 'bg-[#f2f4f7] text-[#717680]' };
  }
}

export function getEntityBadges(suggestion: AssistantSuggestion): string[] {
  const entities = suggestion.relatedEntities || {};
  const badges: string[] = [];

  if (entities.invoice_id) badges.push('Invoice');
  if (entities.project_id) badges.push('Project');
  if (entities.client_id) badges.push('Client');
  if (entities.contract_id) badges.push('Contract');
  if (Array.isArray(entities.expense_ids) && entities.expense_ids.length > 0) {
    badges.push(`${entities.expense_ids.length} expense${entities.expense_ids.length === 1 ? '' : 's'}`);
  }
  if (Array.isArray(entities.thread_ids) && entities.thread_ids.length > 0) {
    badges.push(`${entities.thread_ids.length} import${entities.thread_ids.length === 1 ? '' : 's'}`);
  }

  return badges;
}

export function getSuggestionHref(suggestion: AssistantSuggestion): string {
  const entities = suggestion.relatedEntities || {};

  if (entities.project_id) return `/projects/${entities.project_id}`;
  if (entities.contract_id) return '/contracts';
  if (entities.invoice_id) return '/payments';
  if (Array.isArray(entities.expense_ids) && entities.expense_ids.length > 0) return '/revenue';
  if (Array.isArray(entities.thread_ids) && entities.thread_ids.length > 0) return '/payments';

  switch (suggestion.type) {
    case 'invoice_reminder':
      return '/payments';
    case 'import_match':
      return '/payments';
    case 'expense_categorization':
      return '/revenue';
    case 'calendar_event':
      return '/calendar';
    case 'project_action':
      return '/projects';
    case 'tax_review':
      return '/insights';
    default:
      return '/dashboard';
  }
}
