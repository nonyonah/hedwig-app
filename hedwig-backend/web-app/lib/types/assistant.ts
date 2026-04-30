// ── Events ──────────────────────────────────────────────────────────────────

export type AssistantEventType =
  | 'unpaid_invoice'
  | 'overdue_invoice'
  | 'pending_payment_link'
  | 'project_deadline'
  | 'document_review';

export type AssistantEventSeverity = 'info' | 'warning' | 'urgent';

export interface AssistantEvent {
  id: string;
  type: AssistantEventType;
  severity: AssistantEventSeverity;
  title: string;
  body?: string;
  entityId?: string;
  href?: string;
}

// ── Brief ────────────────────────────────────────────────────────────────────

export interface AssistantBriefMetrics {
  unpaidCount: number;
  unpaidAmountUsd: number;
  overdueCount: number;
  overdueAmountUsd: number;
  upcomingDeadlines: number;
  activePaymentLinks: number;
  reviewDocuments: number;
  expensesLast30DaysUsd?: number;
  transactionFeesLast30DaysUsd?: number;
}

export interface FinancialTrend {
  direction: 'up' | 'down' | 'stable';
  percentChange: number;
  description: string;
}

export interface AssistantBrief {
  generatedAt: string;
  summary: string;
  highlights: string[];
  events: AssistantEvent[];
  metrics: AssistantBriefMetrics;
  expenseBreakdown?: Array<{ category: string; amountUsd: number }>;
  financialTrend?: FinancialTrend;
  taxHint?: string | null;
  projectAlerts?: string[];
}

// ── Weekly Summary ───────────────────────────────────────────────────────────

export interface TopClient {
  name: string;
  amountUsd: number;
}

export interface WeeklySummary {
  weekLabel: string;
  startDate: string;
  endDate: string;
  revenueUsd: number;
  previousWeekRevenueUsd: number;
  revenueChangePct: number;
  newInvoiceCount: number;
  paidInvoiceCount: number;
  overdueCount: number;
  overdueAmountUsd: number;
  topClients: TopClient[];
  aiInsight: string;
}

// ── Suggestions ──────────────────────────────────────────────────────────────

export type SuggestionType =
  | 'invoice_reminder'
  | 'import_match'
  | 'expense_categorization'
  | 'calendar_event'
  | 'project_action'
  | 'tax_review';

export type SuggestionPriority = 'high' | 'medium' | 'low';
export type SuggestionStatus = 'active' | 'dismissed' | 'approved' | 'rejected';
export type SuggestionSurface = 'inline' | 'assistant_panel' | 'notification';

export interface SuggestionAction {
  label: string;
  type: string;
  requires_approval: true;
}

export interface SuggestionDraftEnvelope {
  default_action: string | null;
  selected_action?: string | null;
  execution_result?: Record<string, unknown> | null;
  drafts: Record<string, Record<string, unknown>>;
}

export interface AssistantSuggestion {
  id: string;
  userId: string;
  type: SuggestionType;
  title: string;
  description: string;
  priority: SuggestionPriority;
  confidenceScore: number;
  surface: SuggestionSurface;
  reason: string;
  editedData?: SuggestionDraftEnvelope | null;
  relatedEntities: {
    invoice_id?: string;
    project_id?: string;
    client_id?: string;
    expense_ids?: string[];
    contract_id?: string;
    thread_ids?: string[];
    milestone_id?: string;
    payment_link_id?: string;
    recurring_invoice_id?: string;
  };
  actions: SuggestionAction[];
  status: SuggestionStatus;
  createdAt: string;
  updatedAt?: string | null;
  lastShownAt?: string | null;
}

// ── Notification Preferences ─────────────────────────────────────────────────

export interface AssistantNotificationPrefs {
  dailyBriefEmail: boolean;
  weeklySummaryEmail: boolean;
  invoiceAlerts: boolean;
  deadlineAlerts: boolean;
}
