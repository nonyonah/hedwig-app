import { createLogger } from '../../utils/logger';
import { supabase } from '../../lib/supabase';
import type { AgentToolDefinition } from './types';
import type { ComposioProvider } from '../composio';
import {
  syncInvoiceToQuickBooks,
  exportRevenueToQuickBooks,
  pushEntriesToXero,
  createLinearProject,
  syncLinearProjectStatus,
} from '../composioCommercial';

const logger = createLogger('ComposioCommercialTools');

const COMMERCIAL_PROVIDERS: ComposioProvider[] = ['quickbooks', 'xero', 'linear'];

// ─── Tool definitions ───────────────────────────────────────────────────────

const QUICKBOOKS_TOOLS: AgentToolDefinition[] = [
  {
    name: 'sync_invoice_to_quickbooks',
    description: 'Sync a Hedwig invoice to QuickBooks. Use when the user asks to export an invoice, push to QuickBooks, or sync a specific invoice.',
    parameters: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Hedwig invoice ID.' },
        title: { type: 'string', description: 'Invoice title.' },
        amount: { type: 'number', description: 'Invoice amount.' },
        currency: { type: 'string', description: 'Currency code e.g. USD.' },
        clientName: { type: 'string', description: 'Client name.' },
        clientEmail: { type: 'string', description: 'Client email.' },
        status: { type: 'string', description: 'Invoice status (Paid, Sent, Draft, Overdue).' },
        issueDate: { type: 'string', description: 'Issue date YYYY-MM-DD.' },
        dueDate: { type: 'string', description: 'Due date YYYY-MM-DD.' },
      },
      required: ['invoiceId', 'title', 'amount', 'currency', 'status', 'issueDate'],
    },
    execute: async (args, context) => {
      const result = await syncInvoiceToQuickBooks({
        userId: context.userId,
        invoiceData: {
          id: String(args.invoiceId),
          title: String(args.title),
          amount: Number(args.amount),
          currency: String(args.currency),
          clientName: args.clientName ? String(args.clientName) : undefined,
          clientEmail: args.clientEmail ? String(args.clientEmail) : undefined,
          status: String(args.status),
          issueDate: String(args.issueDate),
          dueDate: args.dueDate ? String(args.dueDate) : undefined,
        },
      });
      if (!result.success) throw new Error(result.error || 'Could not sync to QuickBooks');
      return { reply: `Synced "${args.title}" to QuickBooks.`, externalId: result.externalId };
    },
  },
  {
    name: 'export_today_transactions',
    description: 'Export today\'s revenue transactions to QuickBooks. Use when the user asks to export today\'s transactions, sync daily revenue, or push recent income.',
    parameters: {
      type: 'object',
      properties: {
        totalRevenue: { type: 'number', description: 'Total revenue for the period.' },
        paidRevenue: { type: 'number', description: 'Paid revenue amount.' },
        currency: { type: 'string', description: 'Currency code e.g. USD.' },
      },
      required: ['totalRevenue', 'paidRevenue', 'currency'],
    },
    execute: async (args, context) => {
      const { data: revenueData } = await supabase
        .from('revenue_credits')
        .select('title, amount, currency, created_at, client_name')
        .eq('user_id', context.userId)
        .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .limit(50);

      const entries = (revenueData ?? []).map((r: any) => ({
        title: r.title || 'Revenue credit',
        amount: Number(r.amount || 0),
        date: (r.created_at || '').slice(0, 10),
        clientName: r.client_name || undefined,
      }));

      const result = await exportRevenueToQuickBooks({
        userId: context.userId,
        revenueData: {
          totalRevenue: Number(args.totalRevenue),
          paidRevenue: Number(args.paidRevenue),
          pendingRevenue: 0,
          currency: String(args.currency),
          range: 'today',
          entries,
        },
      });
      if (!result.success) throw new Error(result.error || 'Could not export to QuickBooks');
      return { reply: `Exported ${result.count || 0} transactions to QuickBooks.` };
    },
  },
  {
    name: 'show_quickbooks_revenue',
    description: 'Show revenue that has been synced to QuickBooks. Use when the user asks what has been exported, what synced, or their QuickBooks revenue.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: async (_args, context) => {
      const { data } = await supabase
        .from('composio_connections')
        .select('last_synced_at, metadata')
        .eq('user_id', context.userId)
        .eq('provider', 'quickbooks')
        .eq('status', 'active')
        .maybeSingle();

      if (!data) return { reply: 'QuickBooks is not connected.' };
      return {
        reply: `QuickBooks last synced: ${data.last_synced_at || 'never'}. Connected to QuickBooks — use "Export transactions to QuickBooks" to push data.`,
      };
    },
  },
];

const XERO_TOOLS: AgentToolDefinition[] = [
  {
    name: 'push_bookkeeping_to_xero',
    description: 'Push bookkeeping entries and revenue credits to Xero. Use when the user asks to push to Xero, sync bookkeeping, or export entries to Xero.',
    parameters: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          description: 'Bookkeeping entries to push.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Entry title.' },
              amount: { type: 'number', description: 'Entry amount.' },
              currency: { type: 'string', description: 'Currency code.' },
              date: { type: 'string', description: 'Date YYYY-MM-DD.' },
              type: { type: 'string', enum: ['invoice', 'expense', 'credit'], description: 'Entry type.' },
              clientName: { type: 'string' },
            },
            required: ['title', 'amount', 'currency', 'date', 'type'],
          },
        },
      },
      required: ['entries'],
    },
    execute: async (args, context) => {
      const entries = Array.isArray(args.entries) ? args.entries.map((e: any) => ({
        title: String(e.title || ''),
        amount: Number(e.amount || 0),
        currency: String(e.currency || 'USD'),
        date: String(e.date || ''),
        type: String(e.type || 'invoice') as 'invoice' | 'expense' | 'credit',
        clientName: e.clientName ? String(e.clientName) : undefined,
      })) : [];

      const result = await pushEntriesToXero({ userId: context.userId, entries });
      if (!result.success) throw new Error(result.error || 'Could not push to Xero');
      return { reply: `Pushed ${result.count || 0} entries to Xero.` };
    },
  },
  {
    name: 'reconcile_xero_transactions',
    description: 'Reconcile recent Hedwig transactions against Xero. Use when the user asks to reconcile, match transactions, or check Xero sync status.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: async (_args, context) => {
      const { data } = await supabase
        .from('composio_connections')
        .select('last_synced_at, account_label')
        .eq('user_id', context.userId)
        .eq('provider', 'xero')
        .eq('status', 'active')
        .maybeSingle();

      if (!data) return { reply: 'Xero is not connected. Connect it in Settings to reconcile transactions.' };
      return {
        reply: `Xero account: ${data.account_label || 'Connected'}. Last synced: ${data.last_synced_at || 'never'}. Say "Push to Xero" to send recent entries.`,
      };
    },
  },
  {
    name: 'sync_expenses_to_xero',
    description: 'Sync Hedwig expenses to Xero. Use when the user asks to send expenses, sync costs, or push spending to Xero.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: async (_args, context) => {
      const { data: expenses } = await supabase
        .from('expenses')
        .select('title, amount, currency, date')
        .eq('user_id', context.userId)
        .limit(50);

      const entries = (expenses ?? []).map((e: any) => ({
        title: e.title || 'Expense',
        amount: Number(e.amount || 0),
        currency: String(e.currency || 'USD'),
        date: (e.date || '').slice(0, 10),
        type: 'expense' as const,
      }));

      const result = await pushEntriesToXero({ userId: context.userId, entries });
      if (!result.success) throw new Error(result.error || 'Could not sync expenses');
      return { reply: `Synced ${result.count || 0} expenses to Xero.` };
    },
  },
];

const LINEAR_TOOLS: AgentToolDefinition[] = [
  {
    name: 'create_linear_project',
    description: 'Create a project in Linear from a Hedwig project. Use when the user asks to create a project in Linear, push to Linear, or set up a Linear project.',
    parameters: {
      type: 'object',
      properties: {
        hedwigProjectId: { type: 'string', description: 'Hedwig project ID.' },
        name: { type: 'string', description: 'Project name.' },
        description: { type: 'string', description: 'Project description.' },
        dueDate: { type: 'string', description: 'Due date YYYY-MM-DD.' },
        assigneeName: { type: 'string', description: 'Assignee name in Linear.' },
      },
      required: ['hedwigProjectId', 'name'],
    },
    execute: async (args, context) => {
      const result = await createLinearProject({
        userId: context.userId,
        projectData: {
          name: String(args.name),
          description: args.description ? String(args.description) : undefined,
          dueDate: args.dueDate ? String(args.dueDate) : undefined,
          assigneeName: args.assigneeName ? String(args.assigneeName) : undefined,
          hedwigProjectId: String(args.hedwigProjectId),
        },
      });
      if (!result.success) throw new Error(result.error || 'Could not create Linear project');
      return {
        reply: `Created "${args.name}" in Linear.`,
        externalId: result.externalId,
        url: result.url,
      };
    },
  },
  {
    name: 'sync_linear_project_status',
    description: 'Bidirectional sync between a linked Linear project and Hedwig. Pushes Hedwig changes (name, description, status, new milestones) to Linear and pulls Linear status back to Hedwig. Use when the user asks about project status, what changed in Linear, to sync project progress, or wants to push Hedwig updates to Linear.',
    parameters: {
      type: 'object',
      properties: {
        hedwigProjectId: { type: 'string', description: 'Hedwig project ID.' },
      },
      required: ['hedwigProjectId'],
    },
    execute: async (args, context) => {
      const result = await syncLinearProjectStatus({
        userId: context.userId,
        hedwigProjectId: String(args.hedwigProjectId),
      });
      if (!result.success) return { reply: result.error || 'Could not sync with Linear.' };
      const parts: string[] = [`Linear status: ${result.linearStatus || 'Unknown'}.`];
      if (result.milestonesSynced && result.milestonesSynced > 0) {
        parts.push(`${result.milestonesSynced} new milestone(s) synced to Linear.`);
      }
      if (result.milestonesStatusUpdated && result.milestonesStatusUpdated > 0) {
        parts.push(`${result.milestonesStatusUpdated} milestone(s) status synced.`);
      }
      if (result.hedwigStatusUpdated) parts.push('Hedwig status updated.');
      return { reply: parts.join(' ') };
    },
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────

export function getCommercialToolsForProvider(provider: ComposioProvider): AgentToolDefinition[] {
  switch (provider) {
    case 'quickbooks': return QUICKBOOKS_TOOLS;
    case 'xero': return XERO_TOOLS;
    case 'linear': return LINEAR_TOOLS;
    default: return [];
  }
}

export async function getCommercialToolsForUser(hedwigUserId: string): Promise<AgentToolDefinition[]> {
  const { data, error } = await supabase
    .from('composio_connections')
    .select('provider, status')
    .eq('user_id', hedwigUserId)
    .eq('status', 'active')
    .in('provider', COMMERCIAL_PROVIDERS);

  if (error) {
    logger.warn('Failed to load commercial connections', { hedwigUserId, error: error.message });
    return [];
  }

  const tools: AgentToolDefinition[] = [];
  for (const row of data ?? []) {
    const providerTools = getCommercialToolsForProvider(row.provider as ComposioProvider);
    tools.push(...providerTools);
  }
  return tools;
}
