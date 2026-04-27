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

export interface AssistantBriefMetrics {
  unpaidCount: number;
  unpaidAmountUsd: number;
  overdueCount: number;
  overdueAmountUsd: number;
  upcomingDeadlines: number;
  activePaymentLinks: number;
  reviewDocuments: number;
}

export interface AssistantBrief {
  generatedAt: string;
  summary: string;
  highlights: string[];
  events: AssistantEvent[];
  metrics: AssistantBriefMetrics;
}

export interface TopClient {
  name: string;
  amountUsd: number;
}

export interface WeeklySummary {
  weekLabel: string;
  startDate: string;
  endDate: string;
  revenueUsd: number;
  newInvoiceCount: number;
  paidInvoiceCount: number;
  overdueCount: number;
  overdueAmountUsd: number;
  topClients: TopClient[];
  aiInsight: string;
}
