export type ExpenseCategory =
  | 'software'
  | 'equipment'
  | 'marketing'
  | 'travel'
  | 'operations'
  | 'contractor'
  | 'subscriptions'
  | 'other';

export type ExpenseSourceType = 'manual' | 'email_import' | 'transaction_import';

export type FinancialRecordType = 'revenue' | 'expense';

export type PaymentSourceType = 'invoice' | 'payment_link' | 'direct_transfer' | 'manual';

export interface ExpenseRecord {
  id: string;
  amount: number;
  currency: string;
  convertedAmountUsd: number;
  category: ExpenseCategory;
  projectId: string | null;
  clientId: string | null;
  note: string;
  sourceType: ExpenseSourceType;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialRecord {
  id: string;
  recordType: FinancialRecordType;
  sourceType: PaymentSourceType;
  amount: number;
  currency: string;
  normalizedAmount: number;
  normalizedCurrency: 'USD';
  relatedInvoiceId?: string;
  relatedProjectId?: string;
  relatedClientId?: string;
  createdAt: string;
}

export interface RevenueSummary {
  totalRevenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  overdueRevenue: number;
  totalExpenses: number;
  netRevenue: number;
  currency: string;
  range: string;
  previousPeriodRevenue: number;
  revenueDeltaPct: number;
}

export interface ClientRevenueBreakdown {
  clientId: string;
  clientName: string;
  company: string;
  totalRevenue: number;
  paidRevenue: number;
  invoiceCount: number;
  shareOfTotal: number;
}

export interface ProjectRevenueBreakdown {
  projectId: string;
  projectName: string;
  clientName: string;
  totalRevenue: number;
  budgetUsd: number;
}

export interface ActivityEvent {
  id: string;
  type:
    | 'invoice_paid'
    | 'invoice_overdue'
    | 'invoice_sent'
    | 'expense_added'
    | 'payment_received'
    | 'invoice_created';
  title: string;
  description: string;
  amount?: number;
  createdAt: string;
}

export interface PaymentSourceBreakdown {
  source: 'invoices' | 'payment_links' | 'direct_transfers';
  label: string;
  amount: number;
  count: number;
  shareOfTotal: number;
}

export interface RevenueTrendPoint {
  key: string;
  revenue: number;
  expenses: number;
  net: number;
}

export interface InsightRisk {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionLabel?: string;
  actionRoute?: string;
}
