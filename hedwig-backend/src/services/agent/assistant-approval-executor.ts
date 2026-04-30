import crypto from 'crypto';
import { supabase } from '../../lib/supabase';
import { SchedulerService } from '../scheduler';
import { EmailService } from '../email';
import { ClientService } from '../clientService';
import { createCalendarEventFromSource, upsertCalendarEventFromSource } from '../../routes/calendar';
import {
  type AssistantSuggestionRecord,
  type SuggestionAction,
  type SuggestionDraftEnvelope,
} from '../assistantSuggestions';
import { executeComposioWrite, stageFileForComposio } from './composio-tools';
import { deleteFromR2 } from '../../lib/r2';
import { createLogger } from '../../utils/logger';
import { convertToUsd } from '../currency';

const logger = createLogger('AssistantApprovalExecutor');

const WEB_CLIENT_URL = (process.env.WEB_CLIENT_URL || process.env.PUBLIC_BASE_URL || 'https://hedwigbot.xyz').replace(/\/+$/, '');

const SUGGESTION_SELECT =
  'id,user_id,type,title,description,priority,confidence_score,status,reason,surface,actions,related_entities,edited_data,suggestion_key,created_at,updated_at,last_shown_at,shown_count';

type DraftMap = Record<string, Record<string, unknown>>;
type JsonRecord = Record<string, unknown>;

export interface AssistantApprovalExecutionResult {
  status: 'completed' | 'queued_for_manual_review' | 'failed';
  action: string;
  message: string;
  entity_id?: string | null;
  entity_type?: string | null;
  metadata?: Record<string, unknown>;
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asDraftEnvelope(value: unknown): SuggestionDraftEnvelope | null {
  const record = asRecord(value);
  if (!record) return null;
  const draftEntries = asRecord(record.drafts);
  const drafts: DraftMap = {};

  if (draftEntries) {
    for (const [key, entry] of Object.entries(draftEntries)) {
      const parsedEntry = asRecord(entry);
      if (parsedEntry) {
        drafts[key] = parsedEntry;
      }
    }
  }

  return {
    default_action: typeof record.default_action === 'string' ? record.default_action : null,
    selected_action: typeof record.selected_action === 'string' ? record.selected_action : null,
    execution_result: asRecord(record.execution_result),
    drafts,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function resolveSelectedAction(
  suggestion: AssistantSuggestionRecord,
  envelope: SuggestionDraftEnvelope | null,
  actionType?: string | null
): string | null {
  if (actionType) return actionType;
  if (envelope?.selected_action) return envelope.selected_action;
  if (envelope?.default_action) return envelope.default_action;
  return suggestion.actions[0]?.type ?? null;
}

function executionToRecord(result: AssistantApprovalExecutionResult): Record<string, unknown> {
  return {
    status: result.status,
    action: result.action,
    message: result.message,
    entity_id: result.entity_id ?? null,
    entity_type: result.entity_type ?? null,
    metadata: result.metadata ?? null,
  };
}

async function loadSuggestion(userId: string, suggestionId: string): Promise<AssistantSuggestionRecord | null> {
  const { data, error } = await supabase
    .from('assistant_suggestions')
    .select(SUGGESTION_SELECT)
    .eq('id', suggestionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    ...(data as AssistantSuggestionRecord),
    actions: Array.isArray((data as AssistantSuggestionRecord).actions)
      ? ((data as AssistantSuggestionRecord).actions as SuggestionAction[])
      : [],
    related_entities: asRecord((data as AssistantSuggestionRecord).related_entities) ?? {},
    edited_data: asDraftEnvelope((data as AssistantSuggestionRecord).edited_data),
    shown_count: typeof (data as AssistantSuggestionRecord).shown_count === 'number'
      ? (data as AssistantSuggestionRecord).shown_count
      : 0,
  };
}

async function persistSuggestion(
  userId: string,
  suggestionId: string,
  status: AssistantSuggestionRecord['status'],
  envelope: SuggestionDraftEnvelope | null
): Promise<AssistantSuggestionRecord | null> {
  const { data, error } = await supabase
    .from('assistant_suggestions')
    .update({
      status,
      edited_data: envelope,
      updated_at: new Date().toISOString(),
    })
    .eq('id', suggestionId)
    .eq('user_id', userId)
    .select(SUGGESTION_SELECT)
    .single();

  if (error || !data) return null;
  return {
    ...(data as AssistantSuggestionRecord),
    actions: Array.isArray((data as AssistantSuggestionRecord).actions)
      ? ((data as AssistantSuggestionRecord).actions as SuggestionAction[])
      : [],
    related_entities: asRecord((data as AssistantSuggestionRecord).related_entities) ?? {},
    edited_data: asDraftEnvelope((data as AssistantSuggestionRecord).edited_data),
    shown_count: typeof (data as AssistantSuggestionRecord).shown_count === 'number'
      ? (data as AssistantSuggestionRecord).shown_count
      : 0,
  };
}

async function queueManualReview(
  action: string,
  suggestion: AssistantSuggestionRecord
): Promise<AssistantApprovalExecutionResult> {
  return {
    status: 'queued_for_manual_review',
    action,
    message: `The ${suggestion.title.toLowerCase()} review is queued for manual follow-up.`,
    entity_type: suggestion.type,
    entity_id: suggestion.id,
    metadata: {
      suggestion_type: suggestion.type,
    },
  };
}

async function executeSendReminder(userId: string, draft: JsonRecord): Promise<AssistantApprovalExecutionResult> {
  const invoiceId = stringValue(draft.invoice_id);
  if (!invoiceId) throw new Error('Reminder draft is missing invoice_id');

  const { data: document, error } = await supabase
    .from('documents')
    .select(`
      *,
      user:users(
        first_name,
        last_name,
        email,
        client_reminders_enabled
      )
    `)
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !document) {
    throw new Error('Invoice not found for reminder');
  }

  const result = await SchedulerService.processDocumentReminder(document, true);
  if (!result.sent) {
    throw new Error(result.reason || 'Reminder could not be sent');
  }

  return {
    status: 'completed',
    action: 'send_reminder',
    message: 'Invoice reminder sent successfully.',
    entity_type: 'invoice',
    entity_id: invoiceId,
  };
}

async function executeCreateClient(userId: string, draft: JsonRecord): Promise<AssistantApprovalExecutionResult> {
  const suggestedName = stringValue(draft.suggested_name) || stringValue(draft.suggested_email);
  const suggestedEmail = stringValue(draft.suggested_email);
  const sourceThreadId = stringValue(draft.source_thread_id);

  if (!suggestedName && !suggestedEmail) {
    throw new Error('Client draft is missing both suggested_name and suggested_email');
  }

  const client = await ClientService.getOrCreateClient(
    userId,
    suggestedName,
    suggestedEmail,
    { createdFrom: 'assistant_suggestion' }
  );

  if (sourceThreadId) {
    await supabase
      .from('email_threads')
      .update({ matched_client_id: client.id })
      .eq('id', sourceThreadId)
      .eq('user_id', userId);
  }

  return {
    status: 'completed',
    action: 'create_client',
    message: client.isNew ? 'Client created from imported invoice context.' : 'Matched the suggestion to an existing client.',
    entity_type: 'client',
    entity_id: client.id,
    metadata: { is_new: client.isNew },
  };
}

async function executeLinkProject(userId: string, draft: JsonRecord): Promise<AssistantApprovalExecutionResult> {
  const threadIds = stringArray(draft.thread_ids);
  const projectId = stringValue(draft.suggested_project_id);
  const clientId = stringValue(draft.suggested_client_id);

  if (!projectId || threadIds.length === 0) {
    throw new Error('Project link draft is missing a project or source threads');
  }

  const { error } = await supabase
    .from('email_threads')
    .update({
      matched_project_id: projectId,
      ...(clientId ? { matched_client_id: clientId } : {}),
    })
    .in('id', threadIds)
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }

  return {
    status: 'completed',
    action: 'link_project',
    message: `Linked ${threadIds.length} imported record${threadIds.length === 1 ? '' : 's'} to the suggested project.`,
    entity_type: 'project',
    entity_id: projectId,
    metadata: {
      linked_threads: threadIds.length,
      client_id: clientId,
    },
  };
}

async function executeCreateProject(userId: string, draft: JsonRecord): Promise<AssistantApprovalExecutionResult> {
  const title = stringValue(draft.title) || 'Imported project';
  const description = stringValue(draft.description);
  const clientName = stringValue(draft.client_name) || 'Imported client';
  const clientEmail = stringValue(draft.client_email);
  const deadline = stringValue(draft.deadline) || (() => {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 30);
    return fallback.toISOString().slice(0, 10);
  })();
  const budget = numberValue(draft.budget_usd);

  const { id: clientId } = await ClientService.getOrCreateClient(
    userId,
    clientName,
    clientEmail,
    { createdFrom: 'assistant_attachment_project' }
  );

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      client_id: clientId,
      name: title,
      description,
      start_date: new Date().toISOString().slice(0, 10),
      deadline,
      end_date: deadline,
      budget,
      currency: 'USD',
      status: 'ONGOING',
    })
    .select('id,name')
    .single();

  if (error || !project?.id) {
    throw new Error(error?.message || 'Failed to create project');
  }

  await upsertCalendarEventFromSource(
    userId,
    `Project ending: ${project.name}`,
    deadline,
    'project_deadline',
    'project',
    project.id,
    description || `Project deadline for ${project.name}.`
  );

  return {
    status: 'completed',
    action: 'create_project',
    message: 'Project created from assistant attachment.',
    entity_type: 'project',
    entity_id: project.id,
    metadata: { client_id: clientId },
  };
}

async function executeCategorizeExpenses(userId: string, draft: JsonRecord, action: string): Promise<AssistantApprovalExecutionResult> {
  const expenses = Array.isArray(draft.expenses) ? draft.expenses : [];
  const fallbackIds = stringArray(draft.expense_ids);
  const nowIso = new Date().toISOString();
  let updatedCount = 0;

  for (const item of expenses) {
    const expense = asRecord(item);
    if (!expense) continue;
    const expenseId = stringValue(expense.id);
    const suggestedCategory = stringValue(expense.suggested_category) || 'operations';
    if (!expenseId) continue;

    const { error } = await supabase
      .from('expenses')
      .update({
        category: suggestedCategory,
        updated_at: nowIso,
      })
      .eq('id', expenseId)
      .eq('user_id', userId);

    if (!error) updatedCount += 1;
  }

  if (updatedCount === 0 && fallbackIds.length > 0) {
    const { error } = await supabase
      .from('expenses')
      .update({
        category: 'operations',
        updated_at: nowIso,
      })
      .in('id', fallbackIds)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
    updatedCount = fallbackIds.length;
  }

  if (updatedCount === 0) {
    throw new Error('No expenses were available to categorize');
  }

  return {
    status: 'completed',
    action,
    message: `Categorized ${updatedCount} expense${updatedCount === 1 ? '' : 's'}.`,
    entity_type: 'expense',
    metadata: { updated_count: updatedCount },
  };
}

async function executeCalendarEvent(userId: string, draft: JsonRecord): Promise<AssistantApprovalExecutionResult> {
  const title = stringValue(draft.title);
  const eventDate = stringValue(draft.event_date);
  const sourceType = stringValue(draft.source_type);
  const sourceId = stringValue(draft.source_id);
  const description = stringValue(draft.description) || undefined;

  if (!title || !eventDate || !sourceType || !sourceId) {
    throw new Error('Calendar draft is missing title, event_date, source_type, or source_id');
  }

  const eventType = sourceType === 'invoice'
    ? 'invoice_due'
    : sourceType === 'project'
      ? 'project_deadline'
      : 'custom';

  const result = await upsertCalendarEventFromSource(
    userId,
    title,
    eventDate,
    eventType,
    sourceType,
    sourceId,
    description
  );

  if (!result?.id) {
    throw new Error('Calendar event could not be created');
  }

  return {
    status: 'completed',
    action: 'add_calendar_event',
    message: 'Calendar event created successfully.',
    entity_type: 'calendar_event',
    entity_id: result.id,
    metadata: {
      source_type: sourceType,
      source_id: sourceId,
    },
  };
}

function normalizeInvoiceItems(value: unknown): Array<{ description: string; amount: number; quantity: number }> {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const description = stringValue(record.description) || 'Service';
      const amount = numberValue(record.amount) ?? 0;
      const quantity = numberValue(record.quantity) ?? 1;
      return { description, amount, quantity };
    })
    .filter((item): item is { description: string; amount: number; quantity: number } => Boolean(item));
}

async function executeCreateInvoice(userId: string, draft: JsonRecord): Promise<AssistantApprovalExecutionResult> {
  const title = stringValue(draft.title) || 'Invoice draft';
  const description = stringValue(draft.description);
  const clientId = stringValue(draft.client_id);
  const projectId = stringValue(draft.project_id);
  const milestoneId = stringValue(draft.milestone_id);
  const dueDate = stringValue(draft.due_date);
  const items = normalizeInvoiceItems(draft.items);

  let amount = numberValue(draft.amount_usd);
  if (amount === null) {
    amount = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  }
  if (amount === null || amount < 0) {
    throw new Error('Invoice draft is missing a valid amount');
  }

  let clientName = stringValue(draft.client_name);
  let recipientEmail: string | null = null;

  if (clientId) {
    const { data: client, error } = await supabase
      .from('clients')
      .select('name, company, email')
      .eq('id', clientId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (client) {
      clientName = client.company || client.name || clientName;
      recipientEmail = client.email || null;
    }
  }

  const { data: document, error } = await supabase
    .from('documents')
    .insert({
      user_id: userId,
      client_id: clientId,
      project_id: projectId,
      type: 'INVOICE',
      title,
      amount,
      description: description || items.map((item) => item.description).join(', ') || null,
      status: 'DRAFT',
      chain: 'BASE',
      content: {
        client_name: clientName,
        recipient_email: recipientEmail,
        due_date: dueDate,
        items,
        reminders_enabled: true,
        created_from: 'assistant_suggestion',
      },
    })
    .select('id')
    .single();

  if (error || !document?.id) {
    throw new Error(error?.message || 'Failed to create invoice');
  }

  const shareableUrl = `${WEB_CLIENT_URL}/invoice/${document.id}`;
  await supabase
    .from('documents')
    .update({ payment_link_url: shareableUrl })
    .eq('id', document.id)
    .eq('user_id', userId);

  if (dueDate) {
    await createCalendarEventFromSource(
      userId,
      `Invoice due: ${title}`,
      dueDate,
      'invoice_due',
      'invoice',
      document.id,
      description || `Invoice draft for ${clientName || 'a client'}.`
    );
  }

  if (milestoneId) {
    await supabase
      .from('milestones')
      .update({
        invoice_id: document.id,
        status: 'invoiced',
      })
      .eq('id', milestoneId);
  }

  return {
    status: 'completed',
    action: 'create_invoice',
    message: 'Invoice draft created from assistant suggestion.',
    entity_type: 'invoice',
    entity_id: document.id,
    metadata: {
      payment_url: shareableUrl,
      milestone_id: milestoneId,
    },
  };
}

async function executeRecordRevenueCredit(userId: string, draft: JsonRecord): Promise<AssistantApprovalExecutionResult> {
  const originalAmount = numberValue(draft.amount);
  if (originalAmount === null || originalAmount <= 0) {
    throw new Error('Credit draft is missing a valid amount');
  }

  const originalCurrency = (stringValue(draft.currency) || 'USD').toUpperCase();
  const title = stringValue(draft.title) || stringValue(draft.note) || 'Manual credit';
  const note = stringValue(draft.note);
  const date = stringValue(draft.date);
  let clientId = stringValue(draft.client_id);
  const clientName = stringValue(draft.client_name);

  if (!clientId && clientName) {
    const created = await ClientService.getOrCreateClient(
      userId,
      clientName,
      null,
      { createdFrom: 'assistant_revenue_credit' }
    );
    clientId = created.id;
  }

  const amountUsd = originalCurrency === 'USD'
    ? originalAmount
    : await convertToUsd(originalAmount, originalCurrency);
  const recordDate = date ? new Date(date).toISOString() : new Date().toISOString();

  const { data: document, error } = await supabase
    .from('documents')
    .insert({
      user_id: userId,
      client_id: clientId,
      type: 'INVOICE',
      title: `${title} [Credit]`,
      amount: Number(amountUsd.toFixed(6)),
      currency: 'USD',
      description: note || 'Assistant-recorded revenue credit',
      status: 'PAID',
      chain: 'BASE',
      created_at: recordDate,
      content: {
        client_name: clientName,
        created_from: 'assistant_revenue_credit',
        bookkeeping_only: true,
        payment_status: 'paid',
        original_amount: originalAmount,
        original_currency: originalCurrency,
        recorded_at: recordDate,
        note: note || null,
        reminders_enabled: false,
      },
    })
    .select('id')
    .single();

  if (error || !document?.id) {
    throw new Error(error?.message || 'Failed to record revenue credit');
  }

  return {
    status: 'completed',
    action: 'record_revenue_credit',
    message: 'Revenue credit recorded from assistant suggestion.',
    entity_type: 'invoice',
    entity_id: document.id,
    metadata: {
      original_amount: originalAmount,
      original_currency: originalCurrency,
      amount_usd: amountUsd,
    },
  };
}

async function executeSendContract(userId: string, draft: JsonRecord): Promise<AssistantApprovalExecutionResult> {
  const contractId = stringValue(draft.contract_id);
  if (!contractId) {
    throw new Error('Contract draft is missing contract_id');
  }

  const [{ data: user, error: userError }, { data: contract, error: contractError }] = await Promise.all([
    supabase
      .from('users')
      .select('id, first_name, last_name')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('documents')
      .select('*')
      .eq('id', contractId)
      .eq('user_id', userId)
      .eq('type', 'CONTRACT')
      .maybeSingle(),
  ]);

  if (userError || !user) {
    throw new Error('User not found');
  }
  if (contractError || !contract) {
    throw new Error('Contract not found');
  }

  const contractContent = asRecord(contract.content) ?? {};
  const clientEmail = stringValue(contractContent.client_email) || stringValue(contractContent.recipient_email);
  if (!clientEmail) {
    throw new Error('Contract has no client email');
  }

  const approvalToken = crypto.randomBytes(32).toString('hex');
  const updatedContent = {
    ...contractContent,
    approval_token: approvalToken,
    sent_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from('documents')
    .update({
      status: 'SENT',
      content: updatedContent,
    })
    .eq('id', contractId)
    .eq('user_id', userId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const senderName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'A Hedwig User';
  const milestones = Array.isArray(contractContent.milestones) ? contractContent.milestones : [];
  const emailSent = await EmailService.sendContractEmail({
    to: clientEmail,
    senderName,
    contractTitle: contract.title,
    contractId,
    approvalToken,
    totalAmount: contractContent.payment_amount ? String(contractContent.payment_amount) : contract.amount?.toString(),
    milestoneCount: milestones.length,
  });

  return {
    status: 'completed',
    action: 'send_contract',
    message: emailSent
      ? 'Contract sent to the client for review and signature.'
      : 'Contract prepared and marked as sent, but the email service did not confirm delivery.',
    entity_type: 'contract',
    entity_id: contractId,
    metadata: {
      email_sent: emailSent,
      client_email: clientEmail,
    },
  };
}

async function executeCreateProjectFromBrief(userId: string, draft: JsonRecord): Promise<AssistantApprovalExecutionResult> {
  const title = stringValue(draft.title);
  const description = stringValue(draft.description);
  const deadline = stringValue(draft.deadline);
  const startDate = stringValue(draft.start_date);
  const budgetUsd = numberValue(draft.budget_usd);
  const clientId = stringValue(draft.client_id);
  const clientName = stringValue(draft.client_name);
  const clientEmail = stringValue(draft.client_email);
  const milestonesRaw = Array.isArray(draft.milestones) ? draft.milestones : [];

  if (!title) throw new Error('Project draft is missing a title');
  if (!deadline) throw new Error('Project draft is missing a deadline');

  let resolvedClientId = clientId;
  if (!resolvedClientId && (clientName || clientEmail)) {
    const client = await ClientService.getOrCreateClient(
      userId,
      clientName,
      clientEmail,
      { createdFrom: 'agent_project_brief' }
    );
    resolvedClientId = client.id;
  }
  if (!resolvedClientId) {
    throw new Error('Project draft requires a client_id, client_name, or client_email');
  }

  const milestones = milestonesRaw
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const milestoneTitle = stringValue(record.title);
      if (!milestoneTitle) return null;
      return {
        title: milestoneTitle,
        amount: numberValue(record.amount_usd) ?? 0,
        dueDate: stringValue(record.due_date),
        description: stringValue(record.description) || undefined,
      };
    })
    .filter((m): m is NonNullable<typeof m> => Boolean(m));

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      client_id: resolvedClientId,
      title,
      description: description || null,
      start_date: startDate ? new Date(startDate).toISOString() : null,
      deadline: new Date(deadline).toISOString(),
      budget: budgetUsd ?? null,
      currency: 'USD',
      status: 'ACTIVE',
    })
    .select('id, title')
    .single();

  if (error || !project) {
    throw new Error(error?.message || 'Failed to create project');
  }

  if (milestones.length > 0) {
    const milestoneRows = milestones.map((m) => ({
      project_id: project.id,
      title: m.title,
      amount: m.amount,
      due_date: m.dueDate ? new Date(m.dueDate).toISOString() : null,
      description: m.description ?? null,
      status: 'pending',
    }));
    const { error: milestoneError } = await supabase.from('milestones').insert(milestoneRows);
    if (milestoneError) {
      logger.warn('Project created but some milestones failed to insert', {
        projectId: project.id,
        error: milestoneError.message,
      });
    }
  }

  return {
    status: 'completed',
    action: 'create_project_from_brief',
    message: `Created project "${project.title}" with ${milestones.length} milestone${milestones.length === 1 ? '' : 's'}.`,
    entity_type: 'project',
    entity_id: project.id,
    metadata: {
      client_id: resolvedClientId,
      milestone_count: milestones.length,
    },
  };
}

async function executeComposioStaged(userId: string, action: string, draft: JsonRecord): Promise<AssistantApprovalExecutionResult> {
  const slug = stringValue(draft.composio_action);
  let input = asRecord(draft.composio_input) ?? {};
  if (!slug) {
    throw new Error('Composio draft is missing composio_action slug');
  }

  // If the draft references an R2-staged file, lift it into Composio's S3 and
  // substitute the placeholder in `composio_input` with the FileUploadData.
  const fileMeta = asRecord(draft.composio_file);
  let r2KeyForCleanup: string | null = null;
  if (fileMeta) {
    const r2Url = stringValue(fileMeta.r2_url);
    const fileParam = stringValue(fileMeta.file_param) || 'file_to_upload';
    const toolkitSlug = stringValue(fileMeta.toolkit_slug);
    if (!r2Url || !toolkitSlug) {
      throw new Error('composio_file draft is missing r2_url or toolkit_slug');
    }

    const fileData = await stageFileForComposio({
      fileUrl: r2Url,
      toolSlug: slug,
      toolkitSlug,
    });
    input = { ...input, [fileParam]: fileData };
    r2KeyForCleanup = stringValue(fileMeta.r2_key);
  }

  const result = await executeComposioWrite({ hedwigUserId: userId, slug, input });

  // Best-effort cleanup of the temporary R2 object after a successful upload.
  if (r2KeyForCleanup) {
    deleteFromR2(r2KeyForCleanup).catch((err) => {
      logger.warn('R2 cleanup after Composio upload failed', {
        key: r2KeyForCleanup,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return {
    status: 'completed',
    action,
    message: `Composio action ${slug} executed successfully.`,
    metadata: {
      composio_action: slug,
      composio_result: result ?? null,
    },
  };
}

async function executeAction(
  userId: string,
  suggestion: AssistantSuggestionRecord,
  selectedAction: string,
  drafts: DraftMap
): Promise<AssistantApprovalExecutionResult> {
  const draft = asRecord(drafts[selectedAction]) ?? {};

  // Composio-staged write actions use a `composio_<action_slug>` key.
  if (selectedAction.startsWith('composio_')) {
    return executeComposioStaged(userId, selectedAction, draft);
  }

  switch (selectedAction) {
    case 'send_reminder':
      return executeSendReminder(userId, draft);
    case 'create_client':
      return executeCreateClient(userId, draft);
    case 'create_project':
      return executeCreateProject(userId, draft);
    case 'link_project':
      return executeLinkProject(userId, draft);
    case 'categorize_expense':
    case 'categorize_expense_batch':
      return executeCategorizeExpenses(userId, draft, selectedAction);
    case 'add_calendar_event':
      return executeCalendarEvent(userId, draft);
    case 'create_invoice':
      return executeCreateInvoice(userId, draft);
    case 'record_revenue_credit':
      return executeRecordRevenueCredit(userId, draft);
    case 'create_project_from_brief':
      return executeCreateProjectFromBrief(userId, draft);
    case 'send_contract':
      return executeSendContract(userId, draft);
    case 'review_imports':
    case 'review_contract':
    case 'review_payment_link':
    case 'review_recurring_invoice':
      return queueManualReview(selectedAction, suggestion);
    default:
      return queueManualReview(selectedAction, suggestion);
  }
}

export async function approveAssistantSuggestion(
  userId: string,
  suggestionId: string,
  actionType?: string | null
): Promise<AssistantSuggestionRecord | null> {
  const suggestion = await loadSuggestion(userId, suggestionId);
  if (!suggestion) return null;

  const envelope = asDraftEnvelope(suggestion.edited_data) ?? {
    default_action: null,
    selected_action: null,
    execution_result: null,
    drafts: {},
  };
  const selectedAction = resolveSelectedAction(suggestion, envelope, actionType);

  if (!selectedAction) {
    throw new Error('Suggestion does not have an actionable draft');
  }

  if (
    suggestion.status === 'approved' &&
    envelope.selected_action === selectedAction &&
    envelope.execution_result?.status === 'completed'
  ) {
    return suggestion;
  }

  try {
    const execution = await executeAction(userId, suggestion, selectedAction, envelope.drafts);
    const updatedEnvelope: SuggestionDraftEnvelope = {
      default_action: envelope.default_action,
      drafts: envelope.drafts,
      selected_action: selectedAction,
      execution_result: executionToRecord(execution),
    };

    return persistSuggestion(userId, suggestionId, 'approved', updatedEnvelope);
  } catch (error) {
    const failureResult: AssistantApprovalExecutionResult = {
      status: 'failed',
      action: selectedAction,
      message: error instanceof Error ? error.message : 'Assistant approval failed',
    };

    const failedEnvelope: SuggestionDraftEnvelope = {
      default_action: envelope.default_action,
      drafts: envelope.drafts,
      selected_action: selectedAction,
      execution_result: executionToRecord(failureResult),
    };

    await persistSuggestion(userId, suggestionId, suggestion.status, failedEnvelope);
    logger.error('Assistant approval execution failed', {
      suggestionId,
      action: selectedAction,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
