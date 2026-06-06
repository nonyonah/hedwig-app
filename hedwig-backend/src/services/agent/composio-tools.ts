import { Composio } from '@composio/core';
import { supabase } from '../../lib/supabase';
import { createLogger } from '../../utils/logger';
import type { AgentToolDefinition } from './types';
import type { ComposioProvider } from '../composio';

const logger = createLogger('ComposioTools');

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;

let cachedSdk: Composio | null = null;
function getSdk(): Composio {
  if (!COMPOSIO_API_KEY) throw new Error('COMPOSIO_API_KEY is not configured');
  if (cachedSdk) return cachedSdk;
  cachedSdk = new Composio({ apiKey: COMPOSIO_API_KEY });
  return cachedSdk;
}

function userIdFor(hedwigUserId: string): string {
  return `hedwig_${hedwigUserId}`;
}

// ─── Tool catalog ────────────────────────────────────────────────────────────
// Hedwig owns the agent-facing tool name + parameter schema. The `slug`
// field maps to Composio's tool slug; the `transform` adapts Hedwig args →
// Composio args. Composio renames don't break the agent.

interface ReadToolSpec {
  kind: 'read';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  slug: string;
  transform?: (args: Record<string, unknown>) => Record<string, unknown>;
}

interface WriteToolSpec {
  kind: 'write';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  slug: string;
  transform?: (args: Record<string, unknown>) => Record<string, unknown>;
  // How to summarise the staged suggestion in the UI.
  buildTitle: (args: Record<string, unknown>) => string;
  buildDescription: (args: Record<string, unknown>) => string;
  // Maps the write tool to a top-level suggestion type used by the
  // assistant_suggestions table. New types must also exist in the DB enum.
  suggestionType:
    | 'invoice_reminder'
    | 'import_match'
    | 'expense_categorization'
    | 'calendar_event'
    | 'project_action'
    | 'tax_review';
}

type ToolSpec = ReadToolSpec | WriteToolSpec;

const WORK_RELATED_GMAIL_SCOPE = '(hedwig OR work OR client OR project OR freelance OR invoice OR contract OR agreement OR retainer OR statement OR proposal OR payment OR paid OR payout)';

function scopeGmailQueryToWork(value: unknown): string {
  const query = String(value || '').trim();
  if (!query) return `in:inbox ${WORK_RELATED_GMAIL_SCOPE}`;
  const lower = query.toLowerCase();
  if (/(hedwig|work|client|project|freelance|invoice|contract|agreement|retainer|statement|proposal|payment|paid|payout)/i.test(lower)) {
    return query;
  }
  return `(${query}) ${WORK_RELATED_GMAIL_SCOPE}`;
}

const PROVIDER_TOOLS: Partial<Record<ComposioProvider, ToolSpec[]>> = {
  gmail: [
    {
      kind: 'read',
      name: 'gmail_search_emails',
      description: 'Search only work-related or Hedwig-relevant Gmail threads using Gmail operators ("from:", "is:unread", "subject:"). Use this for invoices, contracts, client/project work, payment conversations, and Hedwig-related mail. Avoid broad personal inbox searches.',
      slug: 'GMAIL_FETCH_EMAILS',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Gmail search query.' },
          maxResults: { type: 'integer', description: 'Maximum results (1–25). Default 10.' },
        },
        required: ['query'],
      },
      transform: (args) => ({ query: scopeGmailQueryToWork(args.query), max_results: Math.min(Number(args.maxResults || 10), 25) }),
    },
  ],
  google_calendar: [
    {
      kind: 'read',
      name: 'calendar_list_events',
      description: 'List upcoming or recent events on the user\'s primary Google Calendar.',
      slug: 'GOOGLECALENDAR_EVENTS_LIST',
      parameters: {
        type: 'object',
        properties: {
          timeMin: { type: 'string', description: 'ISO 8601 start (default: now).' },
          timeMax: { type: 'string', description: 'ISO 8601 end (default: 14 days out).' },
          query: { type: 'string', description: 'Free-text search.' },
        },
        required: [],
      },
      transform: (args) => {
        const now = new Date();
        return {
          calendar_id: 'primary',
          time_min: String(args.timeMin || now.toISOString()),
          time_max: String(args.timeMax || new Date(now.getTime() + 14 * 86_400_000).toISOString()),
          q: args.query ? String(args.query) : undefined,
          single_events: true,
          order_by: 'startTime',
          max_results: 25,
        };
      },
    },
    {
      kind: 'write',
      name: 'calendar_create_event',
      description: 'Stage a Google Calendar event for the user to review and create. Does NOT create immediately.',
      slug: 'GOOGLECALENDAR_CREATE_EVENT',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Event title.' },
          startTime: { type: 'string', description: 'ISO 8601 start.' },
          endTime: { type: 'string', description: 'ISO 8601 end.' },
          description: { type: 'string', description: 'Event description.' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails.' },
        },
        required: ['title', 'startTime', 'endTime'],
      },
      transform: (args) => ({
        calendar_id: 'primary',
        summary: String(args.title || ''),
        description: String(args.description || ''),
        start_datetime: String(args.startTime || ''),
        event_duration_minutes: Math.max(
          15,
          Math.round((new Date(String(args.endTime)).getTime() - new Date(String(args.startTime)).getTime()) / 60_000)
        ),
        attendees: Array.isArray(args.attendees) ? args.attendees.map(String) : [],
      }),
      suggestionType: 'calendar_event',
      buildTitle: (args) => `Calendar: ${args.title ?? 'New event'}`,
      buildDescription: (args) => `${args.startTime ?? 'TBD'} → ${args.endTime ?? 'TBD'}`,
    },
  ],
  google_drive: [
    {
      kind: 'read',
      name: 'drive_search_files',
      description: 'Search the user\'s Google Drive for files. Returns file IDs, names, links.',
      slug: 'GOOGLEDRIVE_FIND_FILE',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Drive search query.' },
          maxResults: { type: 'integer', description: 'Maximum results (1–25). Default 10.' },
        },
        required: ['query'],
      },
      transform: (args) => ({ query: String(args.query || ''), max_results: Math.min(Number(args.maxResults || 10), 25) }),
    },
  ],
  google_docs: [
    {
      kind: 'read',
      name: 'docs_get_document',
      description: 'Fetch the contents of a Google Doc by document ID.',
      slug: 'GOOGLEDOCS_GET_DOCUMENT_BY_ID',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'Google Docs document ID.' },
        },
        required: ['documentId'],
      },
      transform: (args) => ({ document_id: String(args.documentId || '') }),
    },
    {
      kind: 'write',
      name: 'docs_create_document',
      description: 'Stage a Google Doc for the user to create. Does NOT create immediately.',
      slug: 'GOOGLEDOCS_CREATE_DOCUMENT',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Document title.' },
          content: { type: 'string', description: 'Initial document content (plain text).' },
        },
        required: ['title'],
      },
      transform: (args) => ({ title: String(args.title || ''), text: String(args.content || '') }),
      suggestionType: 'project_action',
      buildTitle: (args) => `Create doc: ${args.title ?? 'New document'}`,
      buildDescription: (args) => `Google Doc${args.content ? ' with starter content' : ''}`,
    },
  ],
};

// ─── Tool execution adapters ─────────────────────────────────────────────────

export interface ComposioWriteStaged {
  staged: true;
  suggestionId: string;
  message: string;
}

async function executeRead(spec: ReadToolSpec, args: Record<string, unknown>, hedwigUserId: string): Promise<unknown> {
  const sdk = getSdk();
  const userId = userIdFor(hedwigUserId);
  const input = spec.transform ? spec.transform(args) : args;

  try {
    const result = await sdk.tools.execute(spec.slug, {
      userId,
      arguments: input,
      dangerouslySkipVersionCheck: true,
    });
    return result.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('Composio read tool failed', { slug: spec.slug, userId, message });
    throw new Error(`${spec.name} failed: ${message}`);
  }
}

async function stageWriteSuggestion(spec: WriteToolSpec, args: Record<string, unknown>, hedwigUserId: string): Promise<ComposioWriteStaged> {
  const composioInput = spec.transform ? spec.transform(args) : args;

  const draftKey = `composio_${spec.slug.toLowerCase()}`;
  const editedData = {
    default_action: draftKey,
    drafts: {
      [draftKey]: {
        composio_action: spec.slug,
        composio_input: composioInput,
        original_args: args,
      },
    },
  };

  const { data, error } = await supabase
    .from('assistant_suggestions')
    .insert({
      user_id: hedwigUserId,
      type: spec.suggestionType,
      title: spec.buildTitle(args),
      description: spec.buildDescription(args),
      priority: 'medium',
      confidence_score: 0.85,
      status: 'active',
      reason: 'Drafted by Hedwig agent — pending your approval.',
      surface: 'assistant_panel',
      actions: [{ label: 'Approve', type: draftKey, requires_approval: true }],
      related_entities: { source: 'agent', tool: spec.name, slug: spec.slug },
      edited_data: editedData,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Could not stage write action: ${error?.message || 'insert failed'}`);
  }

  return {
    staged: true,
    suggestionId: data.id,
    message: `Drafted "${spec.buildTitle(args)}" — awaiting your approval in the assistant panel.`,
  };
}

function specToToolDefinition(spec: ToolSpec): AgentToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    execute: async (args, context) => {
      if (spec.kind === 'read') return executeRead(spec, args, context.userId);
      return stageWriteSuggestion(spec, args, context.userId);
    },
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface GetToolsOptions {
  /** Set false to register only read tools — for the daily brief / weekly summary. */
  includeWrites?: boolean;
}

export async function getComposioToolsForUser(
  hedwigUserId: string,
  options: GetToolsOptions = {}
): Promise<AgentToolDefinition[]> {
  if (!COMPOSIO_API_KEY) return [];

  const { data, error } = await supabase
    .from('composio_connections')
    .select('provider, status')
    .eq('user_id', hedwigUserId)
    .eq('status', 'active');

  if (error) {
    logger.warn('Failed to load composio connections for tools', { hedwigUserId, error: error.message });
    return [];
  }

  const includeWrites = options.includeWrites ?? false;
  const tools: AgentToolDefinition[] = [];

  for (const row of data ?? []) {
    const provider = row.provider as ComposioProvider;
    const specs = PROVIDER_TOOLS[provider] || [];
    for (const spec of specs) {
      if (spec.kind === 'write' && !includeWrites) continue;
      tools.push(specToToolDefinition(spec));
    }
  }
  return tools;
}

export function getProviderToolNames(provider: ComposioProvider): string[] {
  return (PROVIDER_TOOLS[provider] || []).map((spec) => spec.name);
}

/**
 * Hedwig-native write tools — always available to the agent, no Composio
 * connection required. Each tool stages an `assistant_suggestions` row whose
 * action type matches a handler in `assistant-approval-executor.ts`.
 */
export function getHedwigNativeTools(): AgentToolDefinition[] {
  return [
    {
      name: 'create_project_from_brief',
      description: 'Stage a Hedwig project for the user to approve. Use when the user describes a project to create or you have extracted a brief. Does NOT execute — creates an approval suggestion.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Project title.' },
          description: { type: 'string', description: 'Plain-text description.' },
          clientName: { type: 'string', description: 'Client name (or company).' },
          clientEmail: { type: 'string', description: 'Client email.' },
          deadline: { type: 'string', description: 'ISO date (YYYY-MM-DD) for the final deadline.' },
          budgetUsd: { type: 'number', description: 'Total budget in USD.' },
          milestones: {
            type: 'array',
            description: 'Milestone breakdown (optional).',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                dueDate: { type: 'string', description: 'ISO date (YYYY-MM-DD).' },
                amountUsd: { type: 'number' },
              },
              required: ['title'],
            },
          },
        },
        required: ['title', 'deadline'],
      },
      execute: async (args, context) => {
        const draftKey = 'create_project_from_brief';
        const milestones = Array.isArray(args.milestones)
          ? args.milestones.map((m: any) => ({
            title: String(m.title || ''),
            description: m.description ?? null,
            due_date: m.dueDate ?? null,
            amount_usd: typeof m.amountUsd === 'number' ? m.amountUsd : null,
          })).filter((m) => m.title)
          : [];

        const editedData = {
          default_action: draftKey,
          drafts: {
            [draftKey]: {
              title: String(args.title || ''),
              description: args.description ?? null,
              client_name: args.clientName ?? null,
              client_email: args.clientEmail ?? null,
              deadline: args.deadline ?? null,
              budget_usd: typeof args.budgetUsd === 'number' ? args.budgetUsd : null,
              milestones,
            },
          },
        };

        const { data, error } = await supabase
          .from('assistant_suggestions')
          .insert({
            user_id: context.userId,
            type: 'project_action',
            title: `Create project: ${args.title}`,
            description: `Drafted from chat. Approving will create the project${milestones.length > 0 ? ` with ${milestones.length} milestone${milestones.length === 1 ? '' : 's'}` : ''}.`,
            priority: 'medium',
            confidence_score: 0.85,
            status: 'active',
            reason: 'Hedwig agent drafted a project from your message — pending your approval.',
            surface: 'assistant_panel',
            actions: [{ label: 'Create project', type: draftKey, requires_approval: true }],
            related_entities: { source: 'agent_chat' },
            edited_data: editedData,
          })
          .select('id')
          .single();

        if (error || !data) {
          throw new Error(error?.message || 'Could not stage project creation');
        }
        return {
          staged: true,
          suggestionId: data.id,
          message: `Drafted project "${args.title}" — awaiting your approval in the assistant panel.`,
        };
      },
    },
    {
      name: 'record_revenue_credit',
      description: 'Stage a paid revenue credit for the user to approve. Use when the user asks to record a bank credit, deposit, income, revenue received, or other paid bookkeeping credit. Does NOT execute — creates an approval suggestion.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Original credit amount in the stated currency.' },
          currency: { type: 'string', description: 'ISO 4217 currency code, e.g. USD, NGN, EUR, GBP.' },
          title: { type: 'string', description: 'Short credit title.' },
          note: { type: 'string', description: 'Optional bookkeeping note.' },
          clientName: { type: 'string', description: 'Optional client name if known.' },
          clientId: { type: 'string', description: 'Optional Hedwig client id if known.' },
          date: { type: 'string', description: 'ISO date (YYYY-MM-DD) when the credit was received.' },
        },
        required: ['amount', 'currency'],
      },
      execute: async (args, context) => {
        const draftKey = 'record_revenue_credit';
        const amount = typeof args.amount === 'number' ? args.amount : Number(args.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Credit amount is required');
        }
        const currency = String(args.currency || 'USD').toUpperCase();
        const title = String(args.title || args.note || 'Manual credit').trim();

        const editedData = {
          default_action: draftKey,
          drafts: {
            [draftKey]: {
              amount,
              currency,
              title,
              note: args.note ?? null,
              client_name: args.clientName ?? null,
              client_id: args.clientId ?? null,
              date: args.date ?? null,
            },
          },
        };

        const { data, error } = await supabase
          .from('assistant_suggestions')
          .insert({
            user_id: context.userId,
            type: 'import_match',
            title: `${title} [Credit]`,
            description: `Approving will record ${amount} ${currency} as paid revenue for bookkeeping.`,
            priority: 'medium',
            confidence_score: 0.88,
            status: 'active',
            reason: 'Hedwig agent drafted a revenue credit from your message — pending your approval.',
            surface: 'assistant_panel',
            actions: [{ label: 'Record credit', type: draftKey, requires_approval: true }],
            related_entities: { source: 'agent_chat' },
            edited_data: editedData,
          })
          .select('id')
          .single();

        if (error || !data) {
          throw new Error(error?.message || 'Could not stage revenue credit');
        }
        return {
          staged: true,
          suggestionId: data.id,
          message: `Drafted credit "${title}" — awaiting your approval in the assistant panel.`,
        };
      },
    },
    {
      name: 'import_from_email',
      description: 'CRITICAL: Call this after EVERY gmail_search_emails result that mentions invoices, receipts, bank statements, contracts, proposals, payments, or financial documents. Imports the document directly. NEVER skip this — always call it for matching emails. Extract as many fields as possible (amount, client, date, currency) from the email body.',
      parameters: {
        type: 'object',
        properties: {
          threadId: { type: 'string', description: 'The Gmail thread ID (from gmail_search_emails results).' },
          source: { type: 'string', description: 'Source description (e.g., "Email from client@example.com").' },
          contentType: { type: 'string', enum: ['invoice', 'receipt', 'bank_statement', 'contract', 'other'], description: 'Type of document found in the email.' },
          title: { type: 'string', description: 'Short title describing what was found.' },
          summary: { type: 'string', description: 'Brief summary of the email content (amount, client name, date, etc.).' },
          amount: { type: 'number', description: 'Detected amount if an invoice or receipt, omit if unclear.' },
          currency: { type: 'string', description: 'Currency code if amount is present (e.g. USD, NGN, EUR).' },
          clientName: { type: 'string', description: 'Detected client/sender name if identifiable.' },
          clientEmail: { type: 'string', description: 'Detected client/sender email if identifiable.' },
          dueDate: { type: 'string', description: 'Detected due date in YYYY-MM-DD format if applicable.' },
        },
        required: ['threadId', 'source', 'contentType', 'title', 'summary'],
      },
      execute: async (args, context) => {
        const contentType = String(args.contentType || 'other');
        const title = String(args.title || 'Imported document');
        const threadId = String(args.threadId || '');
        const amount = typeof args.amount === 'number' ? args.amount : null;
        const currency = String(args.currency || 'USD').toUpperCase();
        const clientName = args.clientName ? String(args.clientName) : null;
        const clientEmail = args.clientEmail ? String(args.clientEmail) : null;
        const dueDate = args.dueDate ? String(args.dueDate) : null;

        const docType = contentType === 'invoice' ? 'INVOICE'
          : contentType === 'receipt' ? 'RECEIPT'
          : contentType === 'contract' ? 'CONTRACT'
          : 'OTHER';

        const { data: doc, error } = await supabase
          .from('documents')
          .insert({
            user_id: context.userId,
            type: docType,
            title,
            ...(amount !== null && amount > 0 ? { amount: Number(amount) } : {}),
            status: 'DRAFT',
            chain: 'BASE',
            content: {
              currency,
              created_from: 'email_import',
              source: String(args.source || 'email'),
              ...(clientName ? { client_name: clientName } : {}),
              ...(clientEmail ? { client_email: clientEmail } : {}),
              ...(dueDate ? { due_date: dueDate } : {}),
              email_thread_id: threadId,
            },
          })
          .select('id')
          .single();

        if (error || !doc?.id) {
          throw new Error(`Failed to import from email: ${error?.message || 'unknown error'}`);
        }

        return {
          imported: true,
          documentId: doc.id,
          message: `Imported "${title}" from email. You can find it in your documents.`,
        };
      },
    },
    {
      name: 'time_tracker',
      description: 'Query time tracking data, log manual time entries, or stage an invoice from unbilled hours. Use when the user asks about hours worked, time summary, or wants to bill tracked time.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'What to do: "summary" to get totals, "query" to search entries, "log" to record a manual entry, or "invoice" to stage an invoice from unbilled hours.',
            enum: ['summary', 'query', 'log', 'invoice'],
          },
          projectName: { type: 'string', description: 'Filter by project name (for query/summary).' },
          clientName: { type: 'string', description: 'Filter by client name.' },
          dateFrom: { type: 'string', description: 'ISO date start (YYYY-MM-DD).' },
          dateTo: { type: 'string', description: 'ISO date end (YYYY-MM-DD).' },
          description: { type: 'string', description: 'Description of work done (for "log" action).' },
          hours: { type: 'number', description: 'Hours to log (for "log" action).' },
          hourlyRate: { type: 'number', description: 'Hourly rate in USD (for "log" action).' },
        },
        required: ['action'],
      },
      execute: async (args, context) => {
        const { TimeEntriesService } = await import('../timeEntries');
        const workspaceId = await (async () => {
          const { data } = await supabase
            .from('workspaces')
            .select('id')
            .eq('owner_id', context.userId)
            .eq('type', 'personal')
            .single();
          return data?.id || null;
        })();

        if (!workspaceId) {
          return { reply: 'Time tracking is available in your personal workspace.' };
        }

        const action = String(args.action || 'summary');

        if (action === 'summary') {
          const summary = await TimeEntriesService.getSummary(context.userId, workspaceId);
          return {
            reply: [
              `Time summary:`,
              `Today: ${(summary.hoursToday).toFixed(1)}h`,
              `This week: ${(summary.hoursThisWeek).toFixed(1)}h`,
              `This month: ${(summary.hoursThisMonth).toFixed(1)}h`,
              `Billable: $${summary.billableAmount.toLocaleString()}`,
              summary.topClient ? `Top client: ${summary.topClient.name} (${summary.topClient.hours.toFixed(1)}h)` : null,
              summary.topProject ? `Top project: ${summary.topProject.name} (${summary.topProject.hours.toFixed(1)}h)` : null,
            ].filter(Boolean).join('\n'),
          };
        }

        if (action === 'query') {
          const entries = await TimeEntriesService.list(context.userId, workspaceId, {
            from: args.dateFrom as string | undefined,
            to: args.dateTo as string | undefined,
          });
          const total = entries.reduce((s, e) => s + (e.durationSeconds || 0), 0) / 3600;
          const billable = entries.reduce((s, e) => s + (e.billableAmount || 0), 0);
          return {
            reply: `Found ${entries.length} time entries (${total.toFixed(1)}h total, $${billable.toLocaleString()} billable).`,
          };
        }

        if (action === 'log') {
          if (!args.hours || !args.description) {
            return { reply: 'I need both hours and description to log a time entry.' };
          }
          const durationSec = Math.round(Number(args.hours) * 3600);
          await TimeEntriesService.create(context.userId, workspaceId, {
            description: String(args.description),
            durationSeconds: durationSec,
            hourlyRate: typeof args.hourlyRate === 'number' ? args.hourlyRate : undefined,
            startTime: new Date().toISOString(),
            status: 'manual',
          });
          return { reply: `Logged ${args.hours}h — "${args.description}".` };
        }

        if (action === 'invoice') {
          const entries = await TimeEntriesService.list(context.userId, workspaceId, { status: 'stopped' });
          const unbilled = entries.filter(e => e.status !== 'billed');

          if (unbilled.length === 0) {
            return { reply: 'No unbilled time entries found.' };
          }

          const total = unbilled.reduce((s, e) => s + (e.billableAmount || 0), 0);
          const draftKey = 'invoice_from_time';
          const editedData = {
            default_action: draftKey,
            drafts: {
              [draftKey]: {
                title: 'Invoice for tracked time',
                amount: total,
                type: 'INVOICE',
                time_entry_ids: unbilled.map(e => e.id),
                entries: unbilled.map(e => ({
                  id: e.id,
                  description: e.description,
                  durationSeconds: e.durationSeconds,
                  hourlyRate: e.hourlyRate,
                  billableAmount: e.billableAmount,
                  projectName: e.project?.name,
                })),
              },
            },
          };

          const { data, error } = await supabase
            .from('assistant_suggestions')
            .insert({
              user_id: context.userId,
              type: 'time_invoice',
              title: `Invoice from ${unbilled.length} time entries`,
              description: `${unbilled.length} unbilled entries · $${total.toLocaleString()}`,
              priority: 'medium',
              confidence_score: 0.9,
              status: 'active',
              reason: 'Hedwig agent prepared an invoice from unbilled time — pending your approval.',
              surface: 'assistant_panel',
              actions: [{ label: 'Generate invoice', type: draftKey, requires_approval: true }],
              related_entities: { source: 'agent_chat' },
              edited_data: editedData,
            })
            .select('id')
            .single();

          if (error || !data) throw new Error(error?.message || 'Could not stage invoice');
          return {
            staged: true,
            suggestionId: data.id,
            message: `Prepared invoice from ${unbilled.length} unbilled time entries ($${total.toLocaleString()}). Approve to create it.`,
          };
        }

        return { reply: 'Unknown time tracker action.' };
      },
    },
  ];
}

/**
 * Used by the approval executor to run a Composio write action after the
 * user approves the staged suggestion.
 */
export async function executeComposioWrite(params: {
  hedwigUserId: string;
  slug: string;
  input: Record<string, unknown>;
}): Promise<unknown> {
  const sdk = getSdk();
  const userId = userIdFor(params.hedwigUserId);

  try {
    const result = await sdk.tools.execute(params.slug, {
      userId,
      arguments: params.input,
      dangerouslySkipVersionCheck: true,
    });
    return result.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Composio write execution failed', { slug: params.slug, userId, message });
    throw new Error(`Composio action ${params.slug} failed: ${message}`);
  }
}

/**
 * Stages a file (from any URL — typically our R2 public URL) into Composio's
 * managed S3 so the resulting `FileUploadData` can be passed as a tool argument.
 *
 * Returns Composio's `{ name, mimetype, s3key }` object — pass it into
 * `executeComposioWrite` under the file parameter (e.g. `file_to_upload`).
 */
export async function stageFileForComposio(params: {
  fileUrl: string;
  toolSlug: string;
  toolkitSlug: string;
}): Promise<{ name: string; mimetype: string; s3key: string }> {
  const sdk = getSdk();
  try {
    const fileData = await sdk.files.upload({
      file: params.fileUrl,
      toolSlug: params.toolSlug,
      toolkitSlug: params.toolkitSlug,
    });
    return fileData as { name: string; mimetype: string; s3key: string };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Composio file staging failed', { toolSlug: params.toolSlug, message });
    throw new Error(`Could not stage file for ${params.toolSlug}: ${message}`);
  }
}
