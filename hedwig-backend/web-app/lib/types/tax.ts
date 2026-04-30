import type { Invoice, Project, Client } from '@/lib/models/entities';
import type { ExpenseCategory, ExpenseRecord } from '@/lib/types/revenue';

export type TaxPeriodPreset = 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type TaxDeductibleFilter = 'all' | 'deductible' | 'non_deductible';
export type TaxAlertSeverity = 'high' | 'medium' | 'low';
export type TaxAlertKind = 'uncategorized_expenses' | 'missing_records' | 'unusual_patterns';
export type TaxRecordStatus = 'paid' | 'pending' | 'overdue' | 'draft';
export type TaxReceiptStatus = 'complete' | 'missing';
export type TaxSourceState = 'live' | 'partial' | 'error';

export interface TaxRegionOption {
  code: string;
  label: string;
  disclaimer: string;
  roughTaxRate?: number;
  filingLabel?: string;
}

export interface TaxIncomeRecord {
  id: string;
  invoiceNumber: string;
  clientId: string | null;
  clientName: string;
  projectId: string | null;
  projectName: string;
  amountUsd: number;
  status: TaxRecordStatus;
  date: string;
}

export interface TaxExpenseItem extends ExpenseRecord {
  title: string;
  clientName?: string;
  projectName?: string;
  isDeductible: boolean;
  needsReview: boolean;
  receiptStatus: TaxReceiptStatus;
}

export interface TaxEntitySummary {
  id: string;
  label: string;
  sublabel?: string;
  amountUsd: number;
  count: number;
  shareOfTotal: number;
}

export interface TaxCategorySummary {
  category: ExpenseCategory | 'uncategorized';
  label: string;
  amountUsd: number;
  count: number;
  deductibleAmountUsd: number;
  nonDeductibleAmountUsd: number;
}

export interface TaxAlert {
  id: string;
  kind: TaxAlertKind;
  severity: TaxAlertSeverity;
  title: string;
  description: string;
  actionLabel?: string;
  actionRoute?: string;
}

export interface TaxWorkspaceData {
  generatedAt: string;
  regions: TaxRegionOption[];
  incomes: TaxIncomeRecord[];
  expenses: TaxExpenseItem[];
  clients: Array<Pick<Client, 'id' | 'name' | 'company'>>;
  projects: Array<Pick<Project, 'id' | 'name' | 'clientId'>>;
}

export interface BuildTaxWorkspaceInput {
  clients: Array<Pick<Client, 'id' | 'name' | 'company'>>;
  projects: Array<Pick<Project, 'id' | 'name' | 'clientId'>>;
  invoices: Invoice[];
  expenses: ExpenseRecord[];
  generatedAt?: string;
  regions: TaxRegionOption[];
}
