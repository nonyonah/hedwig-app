import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('AssistantSuggestions');

export type AssistantSuggestionType =
  | 'invoice_reminder'
  | 'import_match'
  | 'expense_categorization'
  | 'calendar_event'
  | 'project_action'
  | 'tax_review';

export type AssistantSuggestionPriority = 'high' | 'medium' | 'low';
export type AssistantSuggestionStatus = 'active' | 'dismissed' | 'approved' | 'rejected';
export type AssistantSuggestionSurface = 'inline' | 'assistant_panel' | 'notification';

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

export interface AssistantSuggestionRecord {
  id: string;
  user_id: string;
  type: AssistantSuggestionType;
  title: string;
  description: string;
  priority: AssistantSuggestionPriority;
  confidence_score: number;
  status: AssistantSuggestionStatus;
  reason: string;
  surface: AssistantSuggestionSurface;
  actions: SuggestionAction[];
  related_entities: Record<string, unknown>;
  edited_data: SuggestionDraftEnvelope | null;
  suggestion_key: string | null;
  created_at: string;
  updated_at: string | null;
  last_shown_at: string | null;
  shown_count: number;
}

interface SuggestionCandidate {
  type: AssistantSuggestionType;
  title: string;
  description: string;
  priority: AssistantSuggestionPriority;
  confidence_score: number;
  reason: string;
  surface: AssistantSuggestionSurface;
  actions: SuggestionAction[];
  related_entities: Record<string, unknown>;
  edited_data?: SuggestionDraftEnvelope | null;
  suggestion_key: string;
  actionable: boolean;
  high_signal: boolean;
}

export interface SuggestionFilters {
  surface?: AssistantSuggestionSurface;
  projectId?: string;
  invoiceId?: string;
  clientId?: string;
  contractId?: string;
  types?: AssistantSuggestionType[];
  expensePage?: boolean;
  taxPage?: boolean;
  importsPage?: boolean;
  insightsPage?: boolean;
  limit?: number;
}

interface ExistingSuggestionRow {
  id: string;
  user_id: string;
  type: AssistantSuggestionType;
  title: string;
  description: string;
  priority: AssistantSuggestionPriority;
  confidence_score: number;
  status: AssistantSuggestionStatus;
  reason: string;
  surface: AssistantSuggestionSurface;
  actions: SuggestionAction[] | null;
  related_entities: Record<string, unknown> | null;
  edited_data: SuggestionDraftEnvelope | null;
  suggestion_key: string | null;
  created_at: string;
  updated_at: string | null;
  last_shown_at: string | null;
  shown_count: number | null;
}

interface DocumentRow {
  id: string;
  type: string;
  status: string;
  amount: number | string | null;
  title: string | null;
  client_id: string | null;
  project_id: string | null;
  content: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  client_id: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

interface MilestoneRow {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  status: string;
  invoice_id: string | null;
  amount: number | string | null;
  created_at: string;
}

interface ExpenseRow {
  id: string;
  category: string | null;
  converted_amount_usd: number | string | null;
  amount: number | string | null;
  client_id: string | null;
  project_id: string | null;
  note: string | null;
  date: string;
}

interface EmailThreadRow {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  detected_type: string | null;
  detected_amount: number | string | null;
  detected_due_date: string | null;
  matched_client_id: string | null;
  matched_project_id: string | null;
  status: string | null;
  last_message_at: string | null;
}

interface CalendarEventRow {
  source_type: string | null;
  source_id: string | null;
}

interface ClientRow {
  id: string;
  name: string;
  company: string | null;
}

interface RecurringInvoiceRow {
  id: string;
  title: string;
  status: string;
  next_due_date: string;
  auto_send: boolean;
  client_id: string | null;
  project_id: string | null;
}

const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.5;
const PROJECT_INVOICE_GAP_DAYS = 21;
const PAYMENT_LINK_FOLLOW_UP_DAYS = 5;
const CONTRACT_REVIEW_DAYS = 3;

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeStatus = (value: unknown): string => String(value || '').trim().toUpperCase();
const normalizeType = (value: unknown): string => String(value || '').trim().toUpperCase();

const daysBetween = (older: Date, newer: Date) =>
  Math.floor((newer.getTime() - older.getTime()) / (24 * 60 * 60 * 1000));

const getDocumentDueDate = (doc: DocumentRow): string | null => {
  const dueDate = doc.content?.due_date || doc.content?.dueDate || null;
  return typeof dueDate === 'string' && dueDate.trim().length > 0 ? dueDate : null;
};

function buildAction(label: string, type: string): SuggestionAction {
  return { label, type, requires_approval: true };
}

function createDraftEnvelope(
  defaultAction: string | null,
  drafts: Record<string, Record<string, unknown>>
): SuggestionDraftEnvelope | null {
  if (Object.keys(drafts).length === 0) return null;
  return {
    default_action: defaultAction,
    drafts,
  };
}

function buildSuggestionDrafts(
  candidate: SuggestionCandidate,
  context: Awaited<ReturnType<typeof fetchContext>>,
  now: Date
): SuggestionDraftEnvelope | null {
  const documentsById = new Map(context.documents.map((doc) => [doc.id, doc]));
  const projectsById = new Map(context.projects.map((project) => [project.id, project]));
  const clientsById = new Map(context.clients.map((client) => [client.id, client]));
  const expensesById = new Map(context.expenses.map((expense) => [expense.id, expense]));
  const threadsById = new Map(context.emailThreads.map((thread) => [thread.id, thread]));
  const recurringByTitle = new Map(context.recurringInvoices.map((invoice) => [invoice.title, invoice]));
  const drafts: Record<string, Record<string, unknown>> = {};
  const defaultAction = candidate.actions[0]?.type ?? null;

  const invoiceId = typeof candidate.related_entities.invoice_id === 'string' ? candidate.related_entities.invoice_id : null;
  const projectId = typeof candidate.related_entities.project_id === 'string' ? candidate.related_entities.project_id : null;
  const clientId = typeof candidate.related_entities.client_id === 'string' ? candidate.related_entities.client_id : null;
  const contractId = typeof candidate.related_entities.contract_id === 'string' ? candidate.related_entities.contract_id : null;
  const milestoneId = typeof candidate.related_entities.milestone_id === 'string' ? candidate.related_entities.milestone_id : null;
  const expenseIds = Array.isArray(candidate.related_entities.expense_ids)
    ? candidate.related_entities.expense_ids.filter((id): id is string => typeof id === 'string')
    : [];
  const threadIds = Array.isArray(candidate.related_entities.thread_ids)
    ? candidate.related_entities.thread_ids.filter((id): id is string => typeof id === 'string')
    : [];

  if (candidate.actions.some((action) => action.type === 'send_reminder') && invoiceId) {
    const invoice = documentsById.get(invoiceId);
    if (invoice) {
      const dueDate = getDocumentDueDate(invoice);
      const daysOverdue = dueDate ? Math.max(daysBetween(new Date(dueDate), now), 0) : null;
      drafts.send_reminder = {
        draft_type: 'invoice_reminder_email',
        invoice_id: invoice.id,
        title: invoice.title || 'Invoice reminder',
        due_date: dueDate,
        days_overdue: daysOverdue,
        amount_usd: toNumber(invoice.amount),
        subject: `Reminder: ${invoice.title || 'Invoice payment due'}`,
        body: `Hi, this is a reminder that ${invoice.title || 'your invoice'} is still outstanding${daysOverdue ? ` and is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue` : ''}.`,
      };
    }
  }

  if (candidate.actions.some((action) => action.type === 'review_imports')) {
    const threads = threadIds.map((id) => threadsById.get(id)).filter(Boolean);
    drafts.review_imports = {
      draft_type: 'import_match_review',
      thread_ids: threadIds,
      summary: candidate.description,
      imports: threads.map((thread) => ({
        id: thread!.id,
        subject: thread!.subject,
        from_name: thread!.from_name,
        from_email: thread!.from_email,
        detected_amount: toNumber(thread!.detected_amount),
        detected_due_date: thread!.detected_due_date,
      })),
    };
  }

  if (candidate.actions.some((action) => action.type === 'create_client')) {
    const threads = threadIds.map((id) => threadsById.get(id)).filter(Boolean);
    const firstThread = threads[0];
    if (firstThread) {
      drafts.create_client = {
        draft_type: 'client_creation',
        source_thread_id: firstThread.id,
        suggested_name: firstThread.from_name || firstThread.from_email || 'New client',
        suggested_email: firstThread.from_email,
      };
    }
  }

  if (candidate.actions.some((action) => action.type === 'link_project')) {
    drafts.link_project = {
      draft_type: 'project_link',
      thread_ids: threadIds,
      suggested_project_id: projectId,
      suggested_client_id: clientId,
    };
  }

  if (candidate.actions.some((action) => action.type === 'categorize_expense') || candidate.actions.some((action) => action.type === 'categorize_expense_batch')) {
    const expenses = expenseIds.map((id) => expensesById.get(id)).filter(Boolean);
    drafts[candidate.actions.some((action) => action.type === 'categorize_expense_batch') ? 'categorize_expense_batch' : 'categorize_expense'] = {
      draft_type: 'expense_categorization',
      expense_ids: expenseIds,
      expenses: expenses.map((expense) => ({
        id: expense!.id,
        note: expense!.note,
        amount_usd: toNumber(expense!.converted_amount_usd ?? expense!.amount),
        current_category: expense!.category || 'other',
        suggested_category: 'operations',
      })),
    };
  }

  if (candidate.actions.some((action) => action.type === 'add_calendar_event')) {
    if (invoiceId) {
      const invoice = documentsById.get(invoiceId);
      if (invoice) {
        drafts.add_calendar_event = {
          draft_type: 'calendar_event',
          source_type: 'invoice',
          source_id: invoice.id,
          title: `Invoice due: ${invoice.title || 'Invoice'}`,
          event_date: getDocumentDueDate(invoice),
          description: `Invoice due reminder for ${invoice.title || invoice.id}.`,
        };
      }
    } else if (projectId) {
      const project = projectsById.get(projectId);
      if (project) {
        drafts.add_calendar_event = {
          draft_type: 'calendar_event',
          source_type: 'project',
          source_id: project.id,
          title: `Project deadline: ${project.name}`,
          event_date: project.deadline,
          description: `Deadline reminder for ${project.name}.`,
        };
      }
    }
  }

  if (candidate.actions.some((action) => action.type === 'create_invoice')) {
    const project = projectId ? projectsById.get(projectId) : null;
    const client = clientId ? clientsById.get(clientId) : null;
    const matchingMilestone = context.milestones.find((milestone) =>
      milestone.project_id === projectId &&
      !milestone.invoice_id &&
      milestone.title &&
      candidate.description.toLowerCase().includes(milestone.title.toLowerCase())
    );
    drafts.create_invoice = {
      draft_type: 'invoice_creation',
      milestone_id: milestoneId || matchingMilestone?.id || null,
      project_id: projectId,
      client_id: clientId,
      title: matchingMilestone ? `Invoice: ${matchingMilestone.title}` : `Invoice for ${project?.name || 'project work'}`,
      description: matchingMilestone
        ? `Milestone for ${project?.name || 'project'}`
        : `Invoice draft prepared from assistant suggestion for ${project?.name || 'project work'}.`,
      amount_usd: matchingMilestone ? toNumber(matchingMilestone.amount) : null,
      due_date: matchingMilestone?.due_date || project?.deadline || null,
      client_name: client?.company || client?.name || null,
      items: matchingMilestone
        ? [{ description: matchingMilestone.title, amount: toNumber(matchingMilestone.amount) }]
        : [],
    };
  }

  if (candidate.actions.some((action) => action.type === 'send_contract') && contractId) {
    const contract = documentsById.get(contractId);
    drafts.send_contract = {
      draft_type: 'contract_send',
      contract_id: contractId,
      title: contract?.title || candidate.title,
      subject: `Contract ready: ${contract?.title || 'Review requested'}`,
      message: `Your contract ${contract?.title || ''} is ready to send for review and signature.`,
    };
  }

  if (candidate.actions.some((action) => action.type === 'review_contract') && contractId) {
    const contract = documentsById.get(contractId);
    drafts.review_contract = {
      draft_type: 'contract_follow_up',
      contract_id: contractId,
      title: contract?.title || candidate.title,
      status: contract?.status || null,
      subject: `Follow-up on ${contract?.title || 'your contract'}`,
      message: `Checking in on ${contract?.title || 'the contract'} to help move the approval forward.`,
    };
  }

  if (candidate.actions.some((action) => action.type === 'review_payment_link')) {
    const matchingPaymentLink = context.documents.find((doc) =>
      normalizeType(doc.type) === 'PAYMENT_LINK' && candidate.suggestion_key.endsWith(doc.id)
    );
    if (matchingPaymentLink) {
      drafts.review_payment_link = {
        draft_type: 'payment_link_follow_up',
        payment_link_id: matchingPaymentLink.id,
        title: matchingPaymentLink.title,
        amount_usd: toNumber(matchingPaymentLink.amount),
        status: matchingPaymentLink.status,
      };
    }
  }

  if (candidate.actions.some((action) => action.type === 'review_recurring_invoice')) {
    const recurringInvoice = recurringByTitle.get(candidate.title.replace('Recurring invoice will send soon', '').trim()) ||
      context.recurringInvoices.find((invoice) => candidate.description.includes(invoice.title));
    if (recurringInvoice) {
      drafts.review_recurring_invoice = {
        draft_type: 'recurring_invoice_review',
        recurring_invoice_id: recurringInvoice.id,
        title: recurringInvoice.title,
        next_due_date: recurringInvoice.next_due_date,
        auto_send: recurringInvoice.auto_send,
      };
    }
  }

  return createDraftEnvelope(defaultAction, drafts);
}

function mapRow(row: ExistingSuggestionRow): AssistantSuggestionRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description,
    priority: row.priority,
    confidence_score: row.confidence_score,
    status: row.status,
    reason: row.reason,
    surface: row.surface,
    actions: Array.isArray(row.actions) ? row.actions : [],
    related_entities: row.related_entities ?? {},
    edited_data: row.edited_data ?? null,
    suggestion_key: row.suggestion_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_shown_at: row.last_shown_at,
    shown_count: row.shown_count ?? 0,
  };
}

function confidenceAllowsSurface(surface: AssistantSuggestionSurface, confidenceScore: number): boolean {
  if (confidenceScore < MEDIUM_CONFIDENCE_THRESHOLD) return false;
  if (surface === 'inline') return confidenceScore >= HIGH_CONFIDENCE_THRESHOLD;
  return true;
}

function matchesFilters(
  suggestion: AssistantSuggestionRecord,
  filters: SuggestionFilters
): boolean {
  if (filters.surface && suggestion.surface !== filters.surface) return false;
  if (filters.types?.length && !filters.types.includes(suggestion.type)) return false;

  const entities = suggestion.related_entities ?? {};
  if (filters.projectId && entities.project_id !== filters.projectId) return false;
  if (filters.invoiceId && entities.invoice_id !== filters.invoiceId) return false;
  if (filters.clientId && entities.client_id !== filters.clientId) return false;
  if (filters.contractId && entities.contract_id !== filters.contractId) return false;
  if (filters.expensePage && suggestion.type !== 'expense_categorization') return false;
  if (filters.taxPage && suggestion.type !== 'tax_review') return false;
  if (filters.importsPage && suggestion.type !== 'import_match') return false;
  if (filters.insightsPage && suggestion.type !== 'tax_review') return false;

  return true;
}

function getCooldownHours(suggestion: AssistantSuggestionRecord): number | null {
  if (suggestion.surface === 'inline') return null;

  switch (suggestion.type) {
    case 'invoice_reminder':
      if (suggestion.suggestion_key?.includes('stage-3')) return 72;
      if (suggestion.suggestion_key?.includes('stage-2')) return 48;
      return 24;
    case 'import_match':
    case 'calendar_event':
      return Number.POSITIVE_INFINITY;
    case 'expense_categorization':
      return 24;
    case 'project_action':
      return 72;
    case 'tax_review':
      return 168;
    default:
      return 24;
  }
}

function isSuppressed(suggestion: AssistantSuggestionRecord, now = new Date()): boolean {
  if (suggestion.status !== 'active') return true;
  if (suggestion.confidence_score < MEDIUM_CONFIDENCE_THRESHOLD) return true;

  const cooldownHours = getCooldownHours(suggestion);
  if (!cooldownHours || !suggestion.last_shown_at) return false;
  if (!Number.isFinite(cooldownHours)) return true;

  const lastShownAt = new Date(suggestion.last_shown_at);
  const elapsedHours = (now.getTime() - lastShownAt.getTime()) / (60 * 60 * 1000);
  return elapsedHours < cooldownHours;
}

function buildImportMatchCandidates(threads: EmailThreadRow[]): SuggestionCandidate[] {
  const relevantThreads = threads.filter((thread) =>
    normalizeType(thread.detected_type) === 'INVOICE' &&
    (!thread.matched_client_id || !thread.matched_project_id) &&
    ['NEEDS_REVIEW', 'IMPORTED', 'MATCHED'].includes(normalizeStatus(thread.status))
  );

  if (relevantThreads.length === 0) return [];

  const count = relevantThreads.length;
  const latest = relevantThreads[0];
  const confidenceScore = count >= 3 ? 0.82 : 0.76;
  const title = count === 1
    ? `Imported invoice needs a client or project match`
    : `${count} imported invoices need matching`;
  const description = count === 1
    ? `A detected invoice from ${latest.from_name || latest.from_email || 'an external source'} is ready to be linked or turned into a client/project record.`
    : `Hedwig found ${count} imported invoice records that still need a client, project, or existing document match.`;

  const reason = count === 1
    ? 'Detected invoice data exists, but a client or project match is still missing.'
    : `${count} detected invoice records are still waiting for workspace matching.`;

  const relatedThreadIds = relevantThreads.slice(0, 5).map((thread) => thread.id).sort();

  return [
    {
      type: 'import_match',
      title,
      description,
      priority: 'medium',
      confidence_score: confidenceScore,
      reason,
      surface: confidenceScore >= HIGH_CONFIDENCE_THRESHOLD ? 'inline' : 'assistant_panel',
      actions: [
        buildAction('Review Imports', 'review_imports'),
        buildAction('Create Client', 'create_client'),
        buildAction('Link Project', 'link_project'),
      ],
      related_entities: {
        thread_ids: relatedThreadIds,
      },
      suggestion_key: `import-match:${relatedThreadIds.join(',') || 'none'}`,
      actionable: true,
      high_signal: true,
    },
    ...(confidenceScore >= MEDIUM_CONFIDENCE_THRESHOLD
      ? [{
          type: 'import_match' as const,
          title,
          description,
          priority: 'medium' as const,
          confidence_score: confidenceScore,
          reason,
          surface: 'assistant_panel' as const,
          actions: [
            buildAction('Review Imports', 'review_imports'),
            buildAction('Create Client', 'create_client'),
          ],
          related_entities: { thread_ids: relatedThreadIds },
          suggestion_key: `import-match-panel:${relatedThreadIds.join(',') || 'none'}`,
          actionable: true,
          high_signal: true,
        }]
      : []),
  ];
}

function buildExpenseCategorizationCandidates(expenses: ExpenseRow[]): SuggestionCandidate[] {
  const uncategorized = expenses.filter((expense) => {
    const category = String(expense.category || '').trim().toLowerCase();
    return !category || category === 'other';
  });

  if (uncategorized.length === 0) return [];

  const totalAmount = uncategorized.reduce((sum, expense) => sum + toNumber(expense.converted_amount_usd ?? expense.amount), 0);
  const confidenceScore = uncategorized.length >= 3 || totalAmount >= 300 ? 0.83 : 0.7;
  const expenseIds = uncategorized.slice(0, 10).map((expense) => expense.id).sort();
  const title = `${uncategorized.length} expense${uncategorized.length === 1 ? '' : 's'} need categorization`;
  const description = `${totalAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} in uncategorized expenses should be reviewed before reporting or tax prep.`;

  return [
    {
      type: 'expense_categorization',
      title,
      description,
      priority: 'medium',
      confidence_score: confidenceScore,
      reason: 'These expenses are still uncategorized, which limits reporting and tax accuracy.',
      surface: confidenceScore >= HIGH_CONFIDENCE_THRESHOLD ? 'inline' : 'assistant_panel',
      actions: [buildAction('Categorize Expenses', 'categorize_expense')],
      related_entities: {
        expense_ids: expenseIds,
      },
      suggestion_key: `expense-categorization:${expenseIds.join(',')}`,
      actionable: true,
      high_signal: uncategorized.length >= 1,
    },
    {
      type: 'expense_categorization',
      title,
      description,
      priority: 'medium',
      confidence_score: Math.max(confidenceScore, 0.72),
      reason: 'Grouped expense categorization keeps the assistant panel focused on one batch instead of many single-item prompts.',
      surface: 'assistant_panel',
      actions: [buildAction('Review Batch', 'categorize_expense_batch')],
      related_entities: {
        expense_ids: expenseIds,
      },
      suggestion_key: `expense-categorization-panel:${expenseIds.join(',')}`,
      actionable: true,
      high_signal: true,
    }
  ];
}

function buildCalendarEventCandidates(
  invoices: DocumentRow[],
  projects: ProjectRow[],
  calendarEvents: CalendarEventRow[]
): SuggestionCandidate[] {
  const existingSources = new Set(
    calendarEvents.map((event) => `${String(event.source_type || '').toLowerCase()}:${event.source_id || ''}`)
  );
  const candidates: SuggestionCandidate[] = [];

  for (const invoice of invoices.filter((doc) => normalizeType(doc.type) === 'INVOICE')) {
    const dueDate = getDocumentDueDate(invoice);
    if (!dueDate || normalizeStatus(invoice.status) === 'PAID') continue;
    const sourceKey = `invoice:${invoice.id}`;
    if (existingSources.has(sourceKey)) continue;

    candidates.push({
      type: 'calendar_event',
      title: 'Add invoice due date to calendar',
      description: `${invoice.title || 'This invoice'} has a due date but is not linked to a calendar event yet.`,
      priority: 'medium',
      confidence_score: 0.82,
      reason: 'The invoice has a due date, but no linked calendar event exists yet.',
      surface: 'inline',
      actions: [buildAction('Add Calendar Event', 'add_calendar_event')],
      related_entities: {
        invoice_id: invoice.id,
        client_id: invoice.client_id,
        project_id: invoice.project_id,
      },
      suggestion_key: `calendar-event:invoice:${invoice.id}`,
      actionable: true,
      high_signal: true,
    });
  }

  for (const project of projects) {
    if (!project.deadline) continue;
    const sourceKey = `project:${project.id}`;
    if (existingSources.has(sourceKey)) continue;

    candidates.push({
      type: 'calendar_event',
      title: 'Add project deadline to calendar',
      description: `${project.name} has a deadline but no linked calendar event yet.`,
      priority: 'medium',
      confidence_score: 0.84,
      reason: 'This project has a deadline without a connected calendar event.',
      surface: 'inline',
      actions: [buildAction('Add Calendar Event', 'add_calendar_event')],
      related_entities: {
        project_id: project.id,
        client_id: project.client_id,
      },
      suggestion_key: `calendar-event:project:${project.id}`,
      actionable: true,
      high_signal: true,
    });
  }

  return candidates;
}

function buildProjectActionCandidates(
  projects: ProjectRow[],
  invoices: DocumentRow[],
  now: Date
): SuggestionCandidate[] {
  const candidates: SuggestionCandidate[] = [];

  for (const project of projects.filter((project) => ['ACTIVE', 'ONGOING', 'IN_PROGRESS', 'ON_HOLD'].includes(normalizeStatus(project.status)))) {
    const projectInvoices = invoices.filter((invoice) => invoice.project_id === project.id);
    const latestInvoiceDate = projectInvoices
      .map((invoice) => new Date(invoice.created_at).getTime())
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a)[0];

    if (!latestInvoiceDate) {
      candidates.push({
        type: 'project_action',
        title: 'Create the first invoice for this project',
        description: `${project.name} is active but has no invoice yet.`,
        priority: 'medium',
        confidence_score: 0.85,
        reason: 'The project is active and no invoice has been created yet.',
        surface: 'inline',
        actions: [buildAction('Create Invoice', 'create_invoice')],
        related_entities: {
          project_id: project.id,
          client_id: project.client_id,
        },
        suggestion_key: `project-action:first-invoice:${project.id}`,
        actionable: true,
        high_signal: true,
      });
      continue;
    }

    const daysSinceInvoice = daysBetween(new Date(latestInvoiceDate), now);
    if (daysSinceInvoice < PROJECT_INVOICE_GAP_DAYS) continue;

    const title = `Project may be ready for a follow-up invoice`;
    const description = `${project.name} has been active for ${daysSinceInvoice} days since the last invoice.`;

    candidates.push({
      type: 'project_action',
      title,
      description,
      priority: 'medium',
      confidence_score: 0.81,
      reason: `No new invoice has been created for this active project in the last ${daysSinceInvoice} days.`,
      surface: 'inline',
      actions: [buildAction('Create Invoice', 'create_invoice')],
      related_entities: {
        project_id: project.id,
        client_id: project.client_id,
      },
      suggestion_key: `project-action:invoice-gap:${project.id}`,
      actionable: true,
      high_signal: true,
    });
  }

  return candidates;
}

function buildContractActionCandidates(
  documents: DocumentRow[],
  now: Date
): SuggestionCandidate[] {
  const contracts = documents.filter((doc) =>
    normalizeType(doc.type) === 'CONTRACT' &&
    ['DRAFT', 'REVIEW'].includes(normalizeStatus(doc.status))
  );
  const candidates: SuggestionCandidate[] = [];

  for (const contract of contracts) {
    const ageDays = daysBetween(new Date(contract.created_at), now);
    if (ageDays < CONTRACT_REVIEW_DAYS) continue;

    const inReview = normalizeStatus(contract.status) === 'REVIEW';
    candidates.push({
      type: 'project_action',
      title: inReview ? 'Contract is waiting for signature follow-up' : 'Contract draft is ready to send',
      description: inReview
        ? `${contract.title || 'This contract'} has been in review for ${ageDays} days without a signed update.`
        : `${contract.title || 'This contract'} has been sitting in draft for ${ageDays} days and may be ready to send.`,
      priority: inReview ? 'high' : 'medium',
      confidence_score: inReview ? 0.88 : 0.81,
      reason: inReview
        ? 'The contract is still in review and may need a follow-up with the client.'
        : 'The contract draft exists but has not been sent yet.',
      surface: 'assistant_panel',
      actions: [buildAction(inReview ? 'Review Contract' : 'Send Contract', inReview ? 'review_contract' : 'send_contract')],
      related_entities: {
        contract_id: contract.id,
        client_id: contract.client_id,
        project_id: contract.project_id,
      },
      suggestion_key: `project-action:contract:${contract.id}`,
      actionable: true,
      high_signal: true,
    });
  }

  return candidates;
}

function buildInvoiceReminderCandidates(
  documents: DocumentRow[],
  now: Date
): SuggestionCandidate[] {
  const candidates: SuggestionCandidate[] = [];

  for (const invoice of documents.filter((doc) =>
    normalizeType(doc.type) === 'INVOICE' &&
    ['SENT', 'VIEWED'].includes(normalizeStatus(doc.status))
  )) {
    const dueDate = getDocumentDueDate(invoice);
    if (!dueDate) continue;

    const dueAt = new Date(dueDate);
    if (Number.isNaN(dueAt.getTime())) continue;

    const daysFromDue = daysBetween(dueAt, now);
    // daysFromDue > 0 means overdue; <= 0 means due today/upcoming.
    // Surface reminders for invoices that are overdue OR due within 2 days.
    if (daysFromDue < -2) continue;

    const amount = toNumber(invoice.amount);
    const overdue = daysFromDue > 0;
    const titleText = invoice.title || 'an invoice';

    candidates.push({
      type: 'invoice_reminder',
      title: overdue
        ? `Send reminder for overdue ${titleText}`
        : `Send reminder before ${titleText} is due`,
      description: overdue
        ? `${titleText} is ${daysFromDue} day${daysFromDue === 1 ? '' : 's'} past due. A friendly nudge usually helps.`
        : `${titleText} is due ${daysFromDue === 0 ? 'today' : `in ${Math.abs(daysFromDue)} day${Math.abs(daysFromDue) === 1 ? '' : 's'}`}. A pre-due reminder reduces late payments.`,
      priority: overdue ? (daysFromDue >= 7 ? 'high' : 'medium') : 'low',
      confidence_score: overdue ? (daysFromDue >= 7 ? 0.93 : 0.85) : 0.72,
      reason: overdue
        ? 'An invoice has not been paid past its due date.'
        : 'An invoice is approaching its due date and has not been paid yet.',
      surface: 'assistant_panel',
      actions: [buildAction('Send Reminder', 'send_reminder')],
      related_entities: {
        invoice_id: invoice.id,
        client_id: invoice.client_id,
        project_id: invoice.project_id,
        amount_usd: amount,
        days_overdue: overdue ? daysFromDue : 0,
      },
      suggestion_key: `invoice-reminder:${invoice.id}`,
      actionable: true,
      high_signal: true,
    });
  }

  return candidates;
}

function buildPaymentLinkActionCandidates(
  documents: DocumentRow[],
  now: Date
): SuggestionCandidate[] {
  const candidates: SuggestionCandidate[] = [];

  for (const paymentLink of documents.filter((doc) =>
    normalizeType(doc.type) === 'PAYMENT_LINK' &&
    ['DRAFT', 'SENT', 'VIEWED'].includes(normalizeStatus(doc.status))
  )) {
    const ageDays = daysBetween(new Date(paymentLink.created_at), now);
    if (ageDays < PAYMENT_LINK_FOLLOW_UP_DAYS) continue;

    candidates.push({
      type: 'project_action',
      title: 'Payment link may need a follow-up',
      description: `${paymentLink.title || 'This payment link'} has been open for ${ageDays} days without a completion update.`,
      priority: ageDays >= 10 ? 'high' : 'medium',
      confidence_score: ageDays >= 10 ? 0.87 : 0.78,
      reason: 'An active payment link has been waiting for client action longer than usual.',
      surface: 'assistant_panel',
      actions: [buildAction('Review Payment Link', 'review_payment_link')],
      related_entities: {
        client_id: paymentLink.client_id,
        project_id: paymentLink.project_id,
        payment_link_id: paymentLink.id,
      },
      suggestion_key: `project-action:payment-link:${paymentLink.id}`,
      actionable: true,
      high_signal: true,
    });
  }

  return candidates;
}

function buildMilestoneActionCandidates(
  milestones: MilestoneRow[],
  projects: ProjectRow[],
  now: Date
): SuggestionCandidate[] {
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const candidates: SuggestionCandidate[] = [];

  for (const milestone of milestones) {
    if (milestone.invoice_id || ['paid', 'invoiced'].includes(normalizeStatus(milestone.status))) continue;
    if (!milestone.due_date) continue;

    const dueDate = new Date(milestone.due_date);
    const daysUntilDue = daysBetween(now, dueDate);
    if (daysUntilDue > 7) continue;

    const project = projectMap.get(milestone.project_id);
    const overdue = dueDate.getTime() < now.getTime();

    candidates.push({
      type: 'project_action',
      title: overdue ? 'Milestone is overdue and ready to invoice' : 'Upcoming milestone may need an invoice',
      description: overdue
        ? `${milestone.title} for ${project?.name || 'this project'} is past due and still has no linked invoice.`
        : `${milestone.title} for ${project?.name || 'this project'} is due soon and still has no linked invoice.`,
      priority: overdue ? 'high' : 'medium',
      confidence_score: overdue ? 0.91 : 0.83,
      reason: 'The milestone has a due date but no invoice has been linked to it yet.',
      surface: 'inline',
      actions: [buildAction('Create Invoice', 'create_invoice')],
      related_entities: {
        project_id: milestone.project_id,
        client_id: project?.client_id,
        milestone_id: milestone.id,
      },
      suggestion_key: `project-action:milestone:${milestone.id}`,
      actionable: true,
      high_signal: true,
    });
  }

  return candidates;
}

function buildRecurringInvoiceCandidates(
  recurringInvoices: RecurringInvoiceRow[],
  now: Date
): SuggestionCandidate[] {
  const candidates: SuggestionCandidate[] = [];

  for (const recurringInvoice of recurringInvoices) {
    if (normalizeStatus(recurringInvoice.status) !== 'ACTIVE') continue;

    const nextDueDate = new Date(recurringInvoice.next_due_date);
    const daysUntilDue = daysBetween(now, nextDueDate);
    if (daysUntilDue < 0 || daysUntilDue > 3) continue;

    candidates.push({
      type: 'project_action',
      title: recurringInvoice.auto_send
        ? 'Recurring invoice will send soon'
        : 'Recurring invoice is due for review',
      description: recurringInvoice.auto_send
        ? `${recurringInvoice.title} is scheduled to auto-send ${daysUntilDue === 0 ? 'today' : `in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`}.`
        : `${recurringInvoice.title} is due ${daysUntilDue === 0 ? 'today' : `in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`} and may need a quick review.`,
      priority: 'medium',
      confidence_score: 0.82,
      reason: 'The next recurring invoice run is approaching.',
      surface: 'assistant_panel',
      actions: [buildAction('Review Recurring Invoice', 'review_recurring_invoice')],
      related_entities: {
        client_id: recurringInvoice.client_id,
        project_id: recurringInvoice.project_id,
        recurring_invoice_id: recurringInvoice.id,
      },
      suggestion_key: `project-action:recurring:${recurringInvoice.id}`,
      actionable: true,
      high_signal: true,
    });
  }

  return candidates;
}

async function fetchContext(userId: string) {
  const [documentsRes, projectsRes, expensesRes, calendarRes, threadsRes, clientsRes, recurringInvoicesRes] = await Promise.all([
    supabase
      .from('documents')
      .select('id,type,status,amount,title,client_id,project_id,content,created_at,updated_at')
      .eq('user_id', userId),
    supabase
      .from('projects')
      .select('id,name,status,client_id,deadline,created_at,updated_at')
      .eq('user_id', userId),
    supabase
      .from('expenses')
      .select('id,category,converted_amount_usd,amount,client_id,project_id,note,date')
      .eq('user_id', userId),
    supabase
      .from('calendar_events')
      .select('source_type,source_id')
      .eq('user_id', userId)
      .neq('status', 'cancelled'),
    supabase
      .from('email_threads')
      .select('id,subject,from_name,from_email,detected_type,detected_amount,detected_due_date,matched_client_id,matched_project_id,status,last_message_at')
      .eq('user_id', userId)
      .not('detected_type', 'is', null)
      .order('last_message_at', { ascending: false })
      .limit(10),
    supabase
      .from('clients')
      .select('id,name,company')
      .eq('user_id', userId),
    supabase
      .from('recurring_invoices')
      .select('id,title,status,next_due_date,auto_send,client_id,project_id')
      .eq('user_id', userId),
  ]);

  for (const result of [documentsRes, projectsRes, expensesRes, calendarRes, threadsRes, clientsRes, recurringInvoicesRes]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  const projects = (projectsRes.data || []) as ProjectRow[];
  let milestones: MilestoneRow[] = [];

  if (projects.length > 0) {
    const { data: milestoneRows, error: milestoneError } = await supabase
      .from('milestones')
      .select('id,project_id,title,due_date,status,invoice_id,amount,created_at')
      .in('project_id', projects.map((project) => project.id));

    if (milestoneError) {
      throw new Error(milestoneError.message);
    }

    milestones = (milestoneRows || []) as MilestoneRow[];
  }

  return {
    documents: (documentsRes.data || []) as DocumentRow[],
    projects,
    milestones,
    expenses: (expensesRes.data || []) as ExpenseRow[],
    calendarEvents: (calendarRes.data || []) as CalendarEventRow[],
    emailThreads: (threadsRes.data || []) as EmailThreadRow[],
    clients: (clientsRes.data || []) as ClientRow[],
    recurringInvoices: (recurringInvoicesRes.data || []) as RecurringInvoiceRow[],
  };
}

function buildCandidates(context: Awaited<ReturnType<typeof fetchContext>>, now = new Date()): SuggestionCandidate[] {
  const invoices = context.documents.filter((doc) => normalizeType(doc.type) === 'INVOICE');

  return [
    ...buildInvoiceReminderCandidates(context.documents, now),
    ...buildImportMatchCandidates(context.emailThreads),
    ...buildExpenseCategorizationCandidates(context.expenses),
    ...buildCalendarEventCandidates(invoices, context.projects, context.calendarEvents),
    ...buildProjectActionCandidates(context.projects, invoices, now),
    ...buildContractActionCandidates(context.documents, now),
    ...buildPaymentLinkActionCandidates(context.documents, now),
    ...buildMilestoneActionCandidates(context.milestones, context.projects, now),
    ...buildRecurringInvoiceCandidates(context.recurringInvoices, now),
  ].filter((candidate) =>
    candidate.actionable &&
    candidate.high_signal &&
    candidate.confidence_score >= MEDIUM_CONFIDENCE_THRESHOLD &&
    confidenceAllowsSurface(candidate.surface, candidate.confidence_score)
  );
}

async function loadExistingSuggestions(userId: string): Promise<Map<string, ExistingSuggestionRow>> {
  const { data, error } = await supabase
    .from('assistant_suggestions')
    .select('id,user_id,type,title,description,priority,confidence_score,status,reason,surface,actions,related_entities,edited_data,suggestion_key,created_at,updated_at,last_shown_at,shown_count')
    .eq('user_id', userId)
    .not('suggestion_key', 'is', null);

  if (error) {
    throw new Error(error.message);
  }

  const map = new Map<string, ExistingSuggestionRow>();
  for (const row of (data || []) as ExistingSuggestionRow[]) {
    if (row.suggestion_key) {
      map.set(row.suggestion_key, row);
    }
  }
  return map;
}

async function insertSuggestion(userId: string, candidate: SuggestionCandidate): Promise<AssistantSuggestionRecord | null> {
  const { data, error } = await supabase
    .from('assistant_suggestions')
    .insert({
      user_id: userId,
      type: candidate.type,
      title: candidate.title,
      description: candidate.description,
      priority: candidate.priority,
      confidence_score: candidate.confidence_score,
      status: 'active',
      reason: candidate.reason,
      surface: candidate.surface,
      actions: candidate.actions,
      related_entities: candidate.related_entities,
      edited_data: candidate.edited_data ?? null,
      suggestion_key: candidate.suggestion_key,
      last_shown_at: null,
      shown_count: 0,
    })
    .select('id,user_id,type,title,description,priority,confidence_score,status,reason,surface,actions,related_entities,edited_data,suggestion_key,created_at,updated_at,last_shown_at,shown_count')
    .single();

  if (error || !data) {
    logger.warn('Failed to insert assistant suggestion', {
      key: candidate.suggestion_key,
      error: error?.message || 'unknown',
    });
    return null;
  }

  return data as AssistantSuggestionRecord;
}

async function updateSuggestion(
  id: string,
  candidate: SuggestionCandidate
): Promise<AssistantSuggestionRecord | null> {
  const { data, error } = await supabase
    .from('assistant_suggestions')
    .update({
      title: candidate.title,
      description: candidate.description,
      priority: candidate.priority,
      confidence_score: candidate.confidence_score,
      reason: candidate.reason,
      surface: candidate.surface,
      actions: candidate.actions,
      related_entities: candidate.related_entities,
      edited_data: candidate.edited_data ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id,user_id,type,title,description,priority,confidence_score,status,reason,surface,actions,related_entities,edited_data,suggestion_key,created_at,updated_at,last_shown_at,shown_count')
    .single();

  if (error) {
    logger.warn('Failed to update assistant suggestion', {
      id,
      error: error.message,
    });
    return null;
  }

  return (data as AssistantSuggestionRecord | null) ?? null;
}

export async function syncAssistantSuggestions(userId: string): Promise<AssistantSuggestionRecord[]> {
  const [context, existingSuggestions] = await Promise.all([
    fetchContext(userId),
    loadExistingSuggestions(userId),
  ]);

  const now = new Date();
  const candidates = buildCandidates(context, now).map((candidate) => ({
    ...candidate,
    edited_data: buildSuggestionDrafts(candidate, context, now),
  }));
  const currentSuggestions: AssistantSuggestionRecord[] = [];

  for (const candidate of candidates) {
    const existing = existingSuggestions.get(candidate.suggestion_key);

    if (existing && ['dismissed', 'approved', 'rejected'].includes(existing.status)) {
      continue;
    }

    if (existing && existing.status === 'active') {
      const updated = await updateSuggestion(existing.id, candidate);
      currentSuggestions.push(updated ?? mapRow(existing));
      continue;
    }

    const created = await insertSuggestion(userId, candidate);
    if (created) currentSuggestions.push(created);
  }

  return currentSuggestions
    .sort((a, b) => {
      const priorityRank = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence_score - a.confidence_score;
    });
}

export async function getAssistantSuggestions(
  userId: string,
  filters: SuggestionFilters = {}
): Promise<AssistantSuggestionRecord[]> {
  const suggestions = await syncAssistantSuggestions(userId);
  const filtered = suggestions.filter((suggestion) =>
    matchesFilters(suggestion, filters) && !isSuppressed(suggestion)
  );
  const limit = Math.max(1, Math.min(filters.limit || 8, 20));
  return filtered.slice(0, limit);
}

export async function getAssistantSuggestionById(
  userId: string,
  id: string
): Promise<AssistantSuggestionRecord | null> {
  const { data, error } = await supabase
    .from('assistant_suggestions')
    .select('id,user_id,type,title,description,priority,confidence_score,status,reason,surface,actions,related_entities,edited_data,suggestion_key,created_at,updated_at,last_shown_at,shown_count')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data as ExistingSuggestionRow);
}

export async function markAssistantSuggestionShown(id: string): Promise<void> {
  await supabase
    .from('assistant_suggestions')
    .update({
      last_shown_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

export async function updateAssistantSuggestionStatus(
  userId: string,
  id: string,
  status: AssistantSuggestionStatus,
  actionType?: string | null
): Promise<AssistantSuggestionRecord | null> {
  const { data: existing } = await supabase
    .from('assistant_suggestions')
    .select('edited_data')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  const editedData = existing?.edited_data && typeof existing.edited_data === 'object'
    ? { ...(existing.edited_data as Record<string, unknown>) }
    : {};

  if (actionType) {
    editedData.selected_action = actionType;
  }

  const { data, error } = await supabase
    .from('assistant_suggestions')
    .update({
      status,
      edited_data: Object.keys(editedData).length > 0 ? editedData : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id,user_id,type,title,description,priority,confidence_score,status,reason,surface,actions,related_entities,edited_data,suggestion_key,created_at,updated_at,last_shown_at,shown_count')
    .single();

  if (error || !data) {
    return null;
  }

  return data as AssistantSuggestionRecord;
}

export async function buildNotificationSuggestions(userId: string): Promise<AssistantSuggestionRecord[]> {
  const suggestions = await getAssistantSuggestions(userId, { surface: 'notification', limit: 10 });
  return suggestions.filter((suggestion) => suggestion.priority === 'high');
}
