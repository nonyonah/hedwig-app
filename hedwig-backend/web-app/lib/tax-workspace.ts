import type { Invoice } from '@/lib/models/entities';
import type { BuildTaxWorkspaceInput, TaxExpenseItem, TaxIncomeRecord, TaxRecordStatus, TaxWorkspaceData } from '@/lib/types/tax';
import type { ExpenseCategory } from '@/lib/types/revenue';

const DEDUCTIBLE_CATEGORIES = new Set<ExpenseCategory>([
  'software',
  'equipment',
  'travel',
  'operations',
  'contractor',
  'subscriptions',
  'marketing'
]);

function normalizeInvoiceStatus(status: Invoice['status']): TaxRecordStatus {
  if (status === 'paid') return 'paid';
  if (status === 'overdue') return 'overdue';
  if (status === 'draft') return 'draft';
  return 'pending';
}

export function buildTaxWorkspaceData({
  clients,
  projects,
  invoices,
  expenses,
  generatedAt = new Date().toISOString(),
  regions
}: BuildTaxWorkspaceInput): TaxWorkspaceData {
  const clientMap = new Map(clients.map((client) => [client.id, client]));
  const projectMap = new Map(projects.map((project) => [project.id, project]));

  const incomes: TaxIncomeRecord[] = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.number,
    clientId: invoice.clientId ?? null,
    clientName: clientMap.get(invoice.clientId)?.company || clientMap.get(invoice.clientId)?.name || 'Unassigned client',
    projectId: invoice.projectId ?? null,
    projectName: projectMap.get(invoice.projectId || '')?.name || 'Unassigned project',
    amountUsd: Number(invoice.amountUsd || 0),
    status: normalizeInvoiceStatus(invoice.status),
    date: invoice.dueAt
  }));

  const normalizedExpenses: TaxExpenseItem[] = expenses.map((expense) => {
    const isDeductible = DEDUCTIBLE_CATEGORIES.has(expense.category) && expense.category !== 'other';
    const lowerNote = expense.note.toLowerCase();
    const missingReceipt = lowerNote.includes('receipt missing') || lowerNote.includes('missing receipt');
    const needsReview = expense.category === 'other' || missingReceipt || (!expense.clientId && !expense.projectId);

    return {
      ...expense,
      title: expense.note || 'Business expense',
      clientName: expense.clientId ? (clientMap.get(expense.clientId)?.company || clientMap.get(expense.clientId)?.name) : undefined,
      projectName: expense.projectId ? projectMap.get(expense.projectId)?.name : undefined,
      isDeductible,
      needsReview,
      receiptStatus: missingReceipt ? 'missing' : 'complete'
    };
  });

  return {
    generatedAt,
    regions,
    incomes,
    expenses: normalizedExpenses,
    clients,
    projects
  };
}
