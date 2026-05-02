import { createLogger } from '../../utils/logger';
import { hedwigAgentOrchestrator } from './orchestrator';
import { approveAssistantSuggestion } from './assistant-approval-executor';
import { getComposioToolsForUser, getHedwigNativeTools } from './composio-tools';
import { refreshConnectionsForUser } from '../composio';
import {
  buildNotificationSuggestions,
  getAssistantSuggestions,
  syncAssistantSuggestions,
  updateAssistantSuggestionStatus,
  type AssistantSuggestionRecord,
  type AssistantSuggestionStatus,
  type SuggestionFilters,
} from '../assistantSuggestions';
import {
  buildDailyBriefSnapshot,
  buildWeeklySummarySnapshot,
  createWorkspaceAnalysisTools,
  createDailyBriefTool,
  createWeeklySummaryTool,
  dailyBriefResponseSchema,
  weeklySummaryResponseSchema,
  type DailyBriefSnapshot,
  type WeeklySummarySnapshot,
} from './workspace-tools';

const logger = createLogger('AssistantRuntime');

interface DailyBriefNarrative {
  summary: string;
  highlights: string[];
}

interface WeeklyNarrative {
  insight: string;
}

function fallbackDailyBriefNarrative(snapshot: DailyBriefSnapshot): DailyBriefNarrative {
  const overdue = snapshot.metrics.overdueCount;
  const unpaid = snapshot.metrics.unpaidCount;
  const deadlines = snapshot.metrics.upcomingDeadlines;
  const expenses = snapshot.metrics.expensesLast30DaysUsd ?? 0;

  if (overdue > 0) {
    return {
      summary: `${overdue} overdue invoice${overdue === 1 ? '' : 's'} should lead today; the overdue balance is $${snapshot.metrics.overdueAmountUsd.toFixed(2)}.`,
      highlights: deadlines > 0
        ? [`Check ${deadlines} upcoming deadline${deadlines === 1 ? '' : 's'} after payment follow-up.`]
        : ['Send or approve the next reminder before starting new work.'],
    };
  }

  if (unpaid > 0) {
    return {
      summary: `${unpaid} unpaid invoice${unpaid === 1 ? '' : 's'} remain open for $${snapshot.metrics.unpaidAmountUsd.toFixed(2)}, but nothing is overdue yet.`,
      highlights: deadlines > 0
        ? [`Plan around ${deadlines} deadline${deadlines === 1 ? '' : 's'} coming up in the next 14 days.`]
        : [],
    };
  }

  if (snapshot.events.length === 0) {
    return {
      summary: expenses > 0
        ? `No urgent payment or deadline issues stand out. Expenses total $${expenses.toFixed(2)} over the recent period, so bookkeeping is the best next check.`
        : 'No urgent payment or deadline issues stand out right now.',
      highlights: snapshot.projectAlerts?.slice(0, 1) ?? [],
    };
  }

  return {
    summary: `${snapshot.events.length} workspace item${snapshot.events.length > 1 ? 's' : ''} need attention today, led by ${snapshot.events[0]?.title || 'the highest priority item'}.`,
    highlights: snapshot.events.slice(0, 2).map((event) => event.body || event.title),
  };
}

export async function generateAssistantSuggestions(userId: string): Promise<AssistantSuggestionRecord[]> {
  return syncAssistantSuggestions(userId);
}

export async function listAssistantSuggestions(
  userId: string,
  filters: SuggestionFilters = {}
): Promise<AssistantSuggestionRecord[]> {
  return getAssistantSuggestions(userId, filters);
}

export async function updateAssistantSuggestion(
  userId: string,
  suggestionId: string,
  status: AssistantSuggestionStatus,
  actionType?: string | null
): Promise<AssistantSuggestionRecord | null> {
  return updateAssistantSuggestionStatus(userId, suggestionId, status, actionType);
}

export async function approveRuntimeAssistantSuggestion(
  userId: string,
  suggestionId: string,
  actionType?: string | null
): Promise<AssistantSuggestionRecord | null> {
  return approveAssistantSuggestion(userId, suggestionId, actionType);
}

export async function listAssistantNotifications(userId: string): Promise<AssistantSuggestionRecord[]> {
  return buildNotificationSuggestions(userId);
}

function fallbackWeeklyNarrative(snapshot: WeeklySummarySnapshot): WeeklyNarrative {
  if (snapshot.revenueUsd <= 0) {
    return { insight: 'No invoices were paid this week yet.' };
  }

  const topClient = snapshot.topClients[0];
  return {
    insight: topClient
      ? `${topClient.name} led the week while revenue reached $${snapshot.revenueUsd.toFixed(2)}.`
      : `Revenue reached $${snapshot.revenueUsd.toFixed(2)} this week.`,
  };
}

export async function generateDailyBrief(userId: string) {
  const snapshot = await buildDailyBriefSnapshot(userId);
  await refreshConnectionsForUser(userId);
  const externalTools = await getComposioToolsForUser(userId);

  let narrative = fallbackDailyBriefNarrative(snapshot);
  try {
    const result = await hedwigAgentOrchestrator.run<DailyBriefNarrative>({
      userId,
      role: 'dispatcher',
      instruction: [
        'You are Hedwig, a proactive freelancer operations agent.',
        'Use the workspace snapshot tool first to gather Hedwig facts.',
        'When relevant, use the user’s connected external tools (Gmail, Calendar, Drive, Docs) to add context, but only when it adds clear value.',
        'Never call write actions; only read tools are exposed.',
        'Return concise JSON only.',
        'Summary must be 1-2 sentences.',
        'Highlights must contain at most 2 short actionable tips.',
        'No markdown. No emojis.',
      ].join(' '),
      userMessage: 'Prepare today’s assistant brief using the current workspace state.',
      tools: [createDailyBriefTool(), ...externalTools],
      responseSchema: dailyBriefResponseSchema,
      maxIterations: 5,
    });

    if (result.structured?.summary) {
      narrative = {
        summary: String(result.structured.summary),
        highlights: Array.isArray(result.structured.highlights)
          ? result.structured.highlights.slice(0, 2).map(String)
          : [],
      };
    }
  } catch (error) {
    logger.warn('Falling back to deterministic daily brief narrative', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    generatedAt: snapshot.generatedAt,
    summary: narrative.summary,
    highlights: narrative.highlights,
    events: snapshot.events,
    metrics: snapshot.metrics,
    expenseBreakdown: snapshot.expenseBreakdown,
    financialTrend: snapshot.financialTrend,
    taxHint: snapshot.taxHint,
    projectAlerts: snapshot.projectAlerts,
  };
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface AgentChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentChatResult {
  reply: string;
  stagedSuggestionIds: string[];
  toolsCalled: string[];
}

const CHAT_SYSTEM_INSTRUCTION = [
  'You are Hedwig, a freelancer operations agent.',
  'You have read-only access to Hedwig workspace tools (invoices, paid revenue, unpaid/overdue balances, clients, projects, expenses) backed by the live database. Always use these tools for workspace facts; never guess from chat history or uploaded attachment content.',
  'CLIENT RESOLUTION: when the user mentions a client name, call workspace_get_client_insights to confirm the client exists in the database before referencing them. Do not infer client identity from previously uploaded documents — the canonical source is the clients table reachable through workspace_get_client_insights.',
  'INTENT DECISION TREE — pick exactly one tool per user request:',
  '  • One-off bill for a specific client with a due date → create_invoice via assistant suggestion (stage for approval).',
  '  • Reusable shareable link, public checkout, or no specific client/due date → create_payment_link.',
  '  • User reports money already received (bank credit, deposit, off-platform payment) → record_revenue_credit.',
  '  • User asks "is anything overdue", "what is unpaid", or wants to chase a client → workspace_get_invoice_details with status filter, then surface the list. Reminder emails are sent automatically by Hedwig — do NOT stage reminder emails.',
  '  • User mentions a date, deadline, meeting, or milestone → workspace_get_calendar_context first, then if a write is needed, calendar_create_event (Composio, staged for approval).',
  '  • User asks "what should I bill for", "what items are in this brief", or wants line-item breakdown without a target → respond with suggested items in plain text; do not stage an invoice until the user picks the target.',
  'For highest-paying-client or client revenue ranking questions with an explicit time window, call workspace_get_client_insights with the exact lookbackDays value: 90 for last 90 days, 180 for last 180 days, 365 for last 1 year. Do not answer from cached client totals.',
  'You also have read+write access to connected external tools (Gmail, Calendar, Drive, Docs).',
  'CRITICAL: write tools (e.g. calendar_create_event, docs_create_document, create_invoice, create_payment_link) DO NOT execute the action — they stage a suggestion the user must approve. Always call the tool when the user asks for a supported action; never assume you cannot do it.',
  'After staging an action, tell the user which suggestion has been drafted and where to approve it.',
  'Use read tools to gather context before staging writes (e.g. look up client details before drafting an invoice).',
  'Be concise. No markdown. No emojis.',
  'When mentioning workspace money from USD-backed fields, include a clear $ or USD amount so the app can render it in the user’s selected display currency.',
].join(' ');

function extractStagedSuggestionIds(result: unknown): string[] {
  if (!result || typeof result !== 'object') return [];
  const record = result as Record<string, unknown>;
  if (record.staged === true && typeof record.suggestionId === 'string') {
    return [record.suggestionId];
  }
  return [];
}

export async function runAgentChat(params: {
  userId: string;
  history: AgentChatMessage[];
  userMessage: string;
}): Promise<AgentChatResult> {
  const { userId, history, userMessage } = params;
  await refreshConnectionsForUser(userId);
  const externalTools = await getComposioToolsForUser(userId, { includeWrites: true });
  const workspaceTools = createWorkspaceAnalysisTools();
  const hedwigNativeTools = getHedwigNativeTools();

  // Compose history into a single user message — orchestrator only takes one.
  const composedMessage = history.length > 0
    ? `${history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}\nUSER: ${userMessage}`
    : userMessage;

  try {
    const result = await hedwigAgentOrchestrator.run<unknown>({
      userId,
      role: 'dispatcher',
      instruction: CHAT_SYSTEM_INSTRUCTION,
      userMessage: composedMessage,
      tools: [...workspaceTools, ...hedwigNativeTools, ...externalTools],
      maxIterations: 8,
    });

    const stagedSuggestionIds = Array.from(new Set(
      result.toolResults.flatMap((toolResult) => extractStagedSuggestionIds(toolResult.result))
    ));
    const toolsCalled: string[] = [];

    for (const call of result.toolCalls) {
      toolsCalled.push(call.name);
    }

    return {
      reply: result.text || 'I could not produce a response.',
      stagedSuggestionIds,
      toolsCalled,
    };
  } catch (error) {
    logger.error('Agent chat run failed', {
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      reply: 'I hit an error while processing that request. Please try again in a moment.',
      stagedSuggestionIds: [],
      toolsCalled: [],
    };
  }
}

export async function generateWeeklySummary(userId: string) {
  const snapshot = await buildWeeklySummarySnapshot(userId);
  await refreshConnectionsForUser(userId);
  const externalTools = await getComposioToolsForUser(userId);

  let narrative = fallbackWeeklyNarrative(snapshot);
  try {
    const result = await hedwigAgentOrchestrator.run<WeeklyNarrative>({
      userId,
      role: 'dispatcher',
      instruction: [
        'You are Hedwig, a proactive freelancer operations agent.',
        'Use the weekly summary tool first to gather Hedwig facts.',
        'When relevant, use the user’s connected external tools (Gmail, Calendar, Drive, Docs) for additional context. Read-only.',
        'Return concise JSON only.',
        'Insight must be one sentence, specific, and mention a real number.',
        'No markdown. No emojis.',
      ].join(' '),
      userMessage: 'Prepare this week’s assistant summary using the current workspace state.',
      tools: [createWeeklySummaryTool(), ...externalTools],
      responseSchema: weeklySummaryResponseSchema,
      maxIterations: 5,
    });

    if (result.structured?.insight) {
      narrative = { insight: String(result.structured.insight) };
    }
  } catch (error) {
    logger.warn('Falling back to deterministic weekly narrative', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    weekLabel: snapshot.weekLabel,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    revenueUsd: snapshot.revenueUsd,
    previousWeekRevenueUsd: snapshot.previousWeekRevenueUsd,
    revenueChangePct: snapshot.revenueChangePct,
    newInvoiceCount: snapshot.newInvoiceCount,
    paidInvoiceCount: snapshot.paidInvoiceCount,
    overdueCount: snapshot.overdueCount,
    overdueAmountUsd: snapshot.overdueAmountUsd,
    topClients: snapshot.topClients,
    aiInsight: narrative.insight,
  };
}
