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

const PROVIDER_TOOLS: Partial<Record<ComposioProvider, ToolSpec[]>> = {
  gmail: [
    {
      kind: 'read',
      name: 'gmail_search_emails',
      description: 'Search the user\'s Gmail inbox using Gmail operators ("from:", "is:unread", "subject:"). Returns matching threads with subject, sender, snippet, and date.',
      slug: 'GMAIL_FETCH_EMAILS',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Gmail search query.' },
          maxResults: { type: 'integer', description: 'Maximum results (1–25). Default 10.' },
        },
        required: ['query'],
      },
      transform: (args) => ({ query: String(args.query || ''), max_results: Math.min(Number(args.maxResults || 10), 25) }),
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
