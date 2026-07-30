export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'software', 'contractors', 'marketing', 'travel',
  'meals', 'office', 'operations', 'taxes', 'subscriptions',
  'shopping', 'entertainment', 'groceries', 'utilities',
  'health', 'education', 'transportation', 'rent', 'personal_care',
  'other',
];

export type ExpenseCategory =
  | 'software'
  | 'contractors'
  | 'marketing'
  | 'travel'
  | 'meals'
  | 'office'
  | 'operations'
  | 'taxes'
  | 'subscriptions'
  | 'shopping'
  | 'entertainment'
  | 'groceries'
  | 'utilities'
  | 'health'
  | 'education'
  | 'transportation'
  | 'rent'
  | 'personal_care'
  | 'other';

export type ImportedTransactionStatus = 'pending' | 'matched' | 'expensed' | 'skipped' | 'reconciled';
export type StatementImportStatus = 'pending' | 'reviewing' | 'confirmed' | 'partially_confirmed' | 'cancelled';

export interface ImportedTransaction {
  id: string;
  userId: string;
  workspaceId: string | null;
  statementId: string;
  transactionDate: string;
  description: string;
  originalDescription: string;
  amount: number;
  currency: string;
  type: 'debit' | 'credit';
  category: string | null;
  bankName: string | null;
  accountNumber: string | null;
  runningBalance: number | null;
  reference: string | null;
  matchedClientId: string | null;
  matchedInvoiceId: string | null;
  matchedExpenseId: string | null;
  matchConfidence: number | null;
  matchMethod: string | null;
  status: ImportedTransactionStatus;
  convertedAmountUsd: number | null;
  fxRate: number | null;
  fxSource: string | null;
  createdAt: string;
}

export interface StatementImport {
  id: string;
  userId: string;
  workspaceId: string | null;
  originalFilename: string;
  fileFormat: string;
  bankName: string | null;
  accountNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  currency: string;
  transactionCount: number;
  totalDebits: number | null;
  totalCredits: number | null;
  status: StatementImportStatus;
  importSummary: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseSourceType = 'manual' | 'email_import' | 'transaction_import' | 'attachment_import';

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
  /** Fiat received via onramp (bank → USDC). Tracked separately from
   * revenue so it doesn't inflate earnings — it's a currency hop. */
  depositsTotal?: number;
  depositsCount?: number;
  depositsPending?: number;
  /** Fiat sent via offramp (USDC → bank). */
  withdrawalsTotal?: number;
  withdrawalsCount?: number;
  withdrawalsPending?: number;
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
    | 'invoice_created'
    | 'payment_link_paid'
    | 'payment_link_active';
  title: string;
  description: string;
  amount?: number;
  nativeAmount?: number;
  currency?: string;
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

export interface ExpenseCategoryBreakdown {
  category: ExpenseCategory;
  total: number;
  percentage: number;
}

export interface RevenueMetrics {
  profitMargin: number;
  burnRate: number;
  runway: number | null;
  expenseCategories: ExpenseCategoryBreakdown[];
}

export interface InsightRisk {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionLabel?: string;
  actionRoute?: string;
}
