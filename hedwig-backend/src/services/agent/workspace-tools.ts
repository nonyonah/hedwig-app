import { supabase } from '../../lib/supabase';
import type { AgentToolDefinition } from './types';

export interface AssistantEventPayload {
  id: string;
  type: 'unpaid_invoice' | 'overdue_invoice' | 'pending_payment_link' | 'project_deadline' | 'document_review';
  severity: 'info' | 'warning' | 'urgent';
  title: string;
  body?: string;
  entityId?: string;
  href?: string;
}

export interface DailyBriefSnapshot {
  generatedAt: string;
  events: AssistantEventPayload[];
  metrics: {
    unpaidCount: number;
    unpaidAmountUsd: number;
    overdueCount: number;
    overdueAmountUsd: number;
    upcomingDeadlines: number;
    activePaymentLinks: number;
    reviewDocuments: number;
    expensesLast30DaysUsd: number;
    transactionFeesLast30DaysUsd: number;
  };
  expenseBreakdown: Array<{ category: string; amountUsd: number }>;
  financialTrend?: {
    direction: 'up' | 'down' | 'stable';
    percentChange: number;
    description: string;
  };
  taxHint: string | null;
  projectAlerts: string[];
  contextSummary: string;
}

export interface WeeklySummarySnapshot {
  weekLabel: string;
  startDate: string;
  endDate: string;
  revenueUsd: number;
  previousWeekRevenueUsd: number;
  revenueChangePct: number;
  newInvoiceCount: number;
  paidInvoiceCount: number;
  overdueCount: number;
  overdueAmountUsd: number;
  topClients: Array<{ name: string; amountUsd: number }>;
  contextSummary: string;
}

type WorkspacePeriod = 'week' | 'month' | 'quarter' | 'half_year' | 'year' | 'all';

function normalizeWorkspacePeriod(value: unknown): WorkspacePeriod {
  const raw = String(value || 'all').trim().toLowerCase();
  if (['week', '7', '7d', '7 days', 'last 7 days', 'last_7_days'].includes(raw)) return 'week';
  if (['month', '30', '30d', '30 days', 'last 30 days', 'last_30_days'].includes(raw)) return 'month';
  if (['quarter', '90', '90d', '90 days', 'last 90 days', 'last_90_days'].includes(raw)) return 'quarter';
  if (['half_year', 'half-year', '180', '180d', '180 days', 'last 180 days', '6m', '6 months', 'last 6 months', 'last_180_days'].includes(raw)) return 'half_year';
  if (['year', '1y', '1 year', '365', '365d', '365 days', '12m', '12 months', 'one year', 'last year', 'last 1 year', 'last_year'].includes(raw)) return 'year';
  return 'all';
}

function getLookbackDays(period: WorkspacePeriod): number | null {
  if (period === 'all') return null;
  if (period === 'week') return 7;
  if (period === 'month') return 30;
  if (period === 'quarter') return 90;
  if (period === 'half_year') return 180;
  return 365;
}

function periodStart(period: WorkspacePeriod, now = new Date()): string | null {
  const days = getLookbackDays(period);
  if (!days) return null;
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export const dailyBriefResponseSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    highlights: {
      type: 'array',
      items: { type: 'string' },
      minItems: 0,
      maxItems: 2,
    },
  },
  required: ['summary', 'highlights'],
  additionalProperties: false,
};

export const weeklySummaryResponseSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    insight: { type: 'string' },
  },
  required: ['insight'],
  additionalProperties: false,
};

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeStatus(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function getDocumentDueDate(doc: { content?: Record<string, unknown> | null }): string | null {
  const content = doc.content ?? {};
  const dueDate = content.due_date || content.dueDate || null;
  return typeof dueDate === 'string' && dueDate.trim().length > 0 ? dueDate : null;
}

function isOverdueInvoice(doc: { status?: string; content?: Record<string, unknown> | null }, nowIso: string): boolean {
  const status = normalizeStatus(doc.status);
  if (!['SENT', 'VIEWED'].includes(status)) return false;
  const dueDate = getDocumentDueDate(doc);
  return Boolean(dueDate && dueDate < nowIso);
}

function formatUsd(amount: number): string {
  return amount >= 1000 ? `$${(amount / 1000).toFixed(1)}k` : `$${amount.toFixed(2)}`;
}

function getContentString(content: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  const data = content ?? {};
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export async function buildDailyBriefSnapshot(userId: string): Promise<DailyBriefSnapshot> {
  const now = new Date();
  const nowIso = now.toISOString();
  const in14Days = new Date(now.getTime() + 14 * 86_400_000).toISOString();
  const ago14Days = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const ago28Days = new Date(now.getTime() - 28 * 86_400_000).toISOString();

  const [invoiceQueueRes, paymentLinksRes, deadlinesRes, reviewRes, currentPeriodPaidRes, prevPeriodPaidRes, stalledRes, expensesRes, transactionFeesRes] =
    await Promise.all([
      supabase.from('documents').select('id, amount, content, status').eq('user_id', userId)
        .eq('type', 'INVOICE').in('status', ['SENT', 'VIEWED']),
      supabase.from('documents').select('id, amount, content').eq('user_id', userId)
        .eq('type', 'PAYMENT_LINK').in('status', ['SENT', 'VIEWED', 'DRAFT']),
      supabase.from('projects').select('id, name, deadline, status')
        .eq('user_id', userId).in('status', ['ACTIVE', 'ONGOING', 'IN_PROGRESS', 'ON_HOLD'])
        .lte('deadline', in14Days).gte('deadline', nowIso),
      supabase.from('documents').select('id').eq('user_id', userId)
        .eq('type', 'CONTRACT').in('status', ['DRAFT', 'REVIEW']),
      supabase.from('documents').select('amount').eq('user_id', userId)
        .eq('type', 'INVOICE').eq('status', 'PAID')
        .gte('updated_at', ago14Days).lt('updated_at', nowIso),
      supabase.from('documents').select('amount').eq('user_id', userId)
        .eq('type', 'INVOICE').eq('status', 'PAID')
        .gte('updated_at', ago28Days).lt('updated_at', ago14Days),
      supabase.from('projects').select('id, name').eq('user_id', userId)
        .in('status', ['ACTIVE', 'ONGOING', 'IN_PROGRESS', 'ON_HOLD']).lt('updated_at', ago14Days).limit(3),
      supabase.from('expenses').select('category, converted_amount_usd').eq('user_id', userId)
        .gte('date', ago28Days).lt('date', nowIso).limit(250),
      supabase.from('transactions').select('platform_fee, network_fee').eq('user_id', userId)
        .eq('status', 'CONFIRMED').gte('created_at', ago28Days).lt('created_at', nowIso).limit(250),
    ]);

  const invoiceQueue = invoiceQueueRes.data ?? [];
  const overdueDocs = invoiceQueue.filter((doc) => isOverdueInvoice(doc, nowIso));
  const unpaidDocs = invoiceQueue.filter((doc) => !isOverdueInvoice(doc, nowIso));
  const paymentLinks = paymentLinksRes.data ?? [];
  const deadlines = deadlinesRes.data ?? [];
  const reviewDocs = reviewRes.data ?? [];
  const currentPaidDocs = currentPeriodPaidRes.data ?? [];
  const prevPaidDocs = prevPeriodPaidRes.data ?? [];
  const stalledProjects = stalledRes.data ?? [];
  const expenses = expensesRes.data ?? [];
  const transactions = transactionFeesRes.data ?? [];

  const unpaidAmountUsd = unpaidDocs.reduce((sum, doc) => sum + toNumber(doc.amount), 0);
  const overdueAmountUsd = overdueDocs.reduce((sum, doc) => sum + toNumber(doc.amount), 0);
  const currentPaidUsd = currentPaidDocs.reduce((sum, doc) => sum + toNumber(doc.amount), 0);
  const prevPaidUsd = prevPaidDocs.reduce((sum, doc) => sum + toNumber(doc.amount), 0);
  const expenseCategoryTotals: Record<string, number> = {};
  for (const expense of expenses as any[]) {
    const category = String(expense.category || 'other');
    expenseCategoryTotals[category] = (expenseCategoryTotals[category] ?? 0) + toNumber(expense.converted_amount_usd);
  }
  const transactionFeesUsd = (transactions as any[]).reduce(
    (sum, tx) => sum + toNumber(tx.platform_fee) + toNumber(tx.network_fee),
    0
  );
  if (transactionFeesUsd > 0) {
    expenseCategoryTotals.transaction_fees = (expenseCategoryTotals.transaction_fees ?? 0) + transactionFeesUsd;
  }
  const expenseBreakdown = Object.entries(expenseCategoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amountUsd]) => ({ category, amountUsd }));
  const expensesLast30DaysUsd = expenseBreakdown.reduce((sum, item) => sum + item.amountUsd, 0);

  let financialTrend: DailyBriefSnapshot['financialTrend'];
  if (prevPaidUsd > 0) {
    const pct = Math.round(((currentPaidUsd - prevPaidUsd) / prevPaidUsd) * 100);
    financialTrend = {
      direction: pct >= 5 ? 'up' : pct <= -5 ? 'down' : 'stable',
      percentChange: Math.abs(pct),
      description:
        pct >= 5
          ? `Revenue up ${Math.abs(pct)}% vs last fortnight`
          : pct <= -5
            ? `Revenue down ${Math.abs(pct)}% vs last fortnight`
            : 'Revenue is steady compared to last fortnight',
    };
  }

  const projectAlerts = stalledProjects.map((project) => `"${project.name}" has had no recent updates`);
  const events: AssistantEventPayload[] = [];

  if (overdueDocs.length > 0) {
    events.push({
      id: 'overdue',
      type: 'overdue_invoice',
      severity: 'urgent',
      title: `${overdueDocs.length} overdue invoice${overdueDocs.length > 1 ? 's' : ''}`,
      body: `${formatUsd(overdueAmountUsd)} past due`,
      href: '/payments',
    });
  }

  if (unpaidDocs.length > 0) {
    events.push({
      id: 'unpaid',
      type: 'unpaid_invoice',
      severity: 'warning',
      title: `${unpaidDocs.length} unpaid invoice${unpaidDocs.length > 1 ? 's' : ''}`,
      body: `${formatUsd(unpaidAmountUsd)} outstanding`,
      href: '/payments',
    });
  }

  for (const project of deadlines) {
    const daysLeft = daysBetween(now, new Date(project.deadline));
    events.push({
      id: `deadline-${project.id}`,
      type: 'project_deadline',
      severity: daysLeft <= 3 ? 'urgent' : 'warning',
      title: `${project.name || 'Project'} deadline`,
      body: daysLeft === 0 ? 'Due today' : daysLeft === 1 ? 'Due tomorrow' : `Due in ${daysLeft} days`,
      entityId: project.id,
      href: `/projects/${project.id}`,
    });
  }

  if (paymentLinks.length > 0) {
    events.push({
      id: 'payment-links',
      type: 'pending_payment_link',
      severity: 'info',
      title: `${paymentLinks.length} active payment link${paymentLinks.length > 1 ? 's' : ''}`,
      body: 'Awaiting client payment',
      href: '/payments',
    });
  }

  if (reviewDocs.length > 0) {
    events.push({
      id: 'contracts-review',
      type: 'document_review',
      severity: 'info',
      title: `${reviewDocs.length} contract${reviewDocs.length > 1 ? 's' : ''} need${reviewDocs.length === 1 ? 's' : ''} review`,
      href: '/contracts',
    });
  }

  const contextSummary = [
    overdueAmountUsd > 0 ? `${overdueDocs.length} overdue invoices totalling ${formatUsd(overdueAmountUsd)}` : null,
    unpaidAmountUsd > 0 ? `${unpaidDocs.length} unpaid invoices totalling ${formatUsd(unpaidAmountUsd)}` : null,
    paymentLinks.length > 0 ? `${paymentLinks.length} active payment links awaiting payment` : null,
    deadlines.length > 0 ? `${deadlines.length} project deadline${deadlines.length > 1 ? 's' : ''} in the next 14 days` : null,
    reviewDocs.length > 0 ? `${reviewDocs.length} contracts awaiting review` : null,
    stalledProjects.length > 0 ? `${stalledProjects.length} stalled project${stalledProjects.length > 1 ? 's' : ''}` : null,
    expensesLast30DaysUsd > 0 ? `${formatUsd(expensesLast30DaysUsd)} in expenses over the last 30 days` : null,
  ].filter(Boolean).join('; ');

  return {
    generatedAt: nowIso,
    events,
    metrics: {
      unpaidCount: unpaidDocs.length,
      unpaidAmountUsd,
      overdueCount: overdueDocs.length,
      overdueAmountUsd,
      upcomingDeadlines: deadlines.length,
      activePaymentLinks: paymentLinks.length,
      reviewDocuments: reviewDocs.length,
      expensesLast30DaysUsd,
      transactionFeesLast30DaysUsd: transactionFeesUsd,
    },
    expenseBreakdown,
    financialTrend,
    taxHint: null,
    projectAlerts,
    contextSummary,
  };
}

export async function buildWeeklySummarySnapshot(userId: string): Promise<WeeklySummarySnapshot> {
  const now = new Date();
  const nowIso = now.toISOString();
  const weekStart = new Date(now.getTime() - 7 * 86_400_000);
  const prevWeekStart = new Date(now.getTime() - 14 * 86_400_000);

  const [paidRes, prevPaidRes, newRes, invoiceQueueRes] = await Promise.all([
    supabase.from('documents').select('id, amount, content').eq('user_id', userId)
      .eq('type', 'INVOICE').eq('status', 'PAID').gte('updated_at', weekStart.toISOString()),
    supabase.from('documents').select('amount').eq('user_id', userId)
      .eq('type', 'INVOICE').eq('status', 'PAID')
      .gte('updated_at', prevWeekStart.toISOString()).lt('updated_at', weekStart.toISOString()),
    supabase.from('documents').select('id').eq('user_id', userId)
      .eq('type', 'INVOICE').gte('created_at', weekStart.toISOString()),
    supabase.from('documents').select('id, amount, content, status').eq('user_id', userId)
      .eq('type', 'INVOICE').in('status', ['SENT', 'VIEWED']),
  ]);

  const paidDocs = paidRes.data ?? [];
  const prevPaidDocs = prevPaidRes.data ?? [];
  const newDocs = newRes.data ?? [];
  const overdueDocs = (invoiceQueueRes.data ?? []).filter((doc) => isOverdueInvoice(doc, nowIso));

  const revenueUsd = paidDocs.reduce((sum, doc) => sum + toNumber(doc.amount), 0);
  const previousWeekRevenueUsd = prevPaidDocs.reduce((sum, doc) => sum + toNumber(doc.amount), 0);
  const overdueAmountUsd = overdueDocs.reduce((sum, doc) => sum + toNumber(doc.amount), 0);
  const revenueChangePct = previousWeekRevenueUsd > 0
    ? Math.round(((revenueUsd - previousWeekRevenueUsd) / previousWeekRevenueUsd) * 100)
    : 0;

  const clientTotals: Record<string, number> = {};
  for (const doc of paidDocs) {
    const content = doc.content ?? {};
    const clientName = typeof content.client_name === 'string'
      ? content.client_name
      : typeof content.clientName === 'string'
        ? content.clientName
        : 'Unknown client';
    clientTotals[clientName] = (clientTotals[clientName] ?? 0) + toNumber(doc.amount);
  }

  const topClients = Object.entries(clientTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, amountUsd]) => ({ name, amountUsd }));

  const contextSummary = [
    `Revenue this week: ${formatUsd(revenueUsd)} (${revenueChangePct >= 0 ? '+' : ''}${revenueChangePct}% vs last week)`,
    `${newDocs.length} new invoice${newDocs.length !== 1 ? 's' : ''} created`,
    overdueDocs.length > 0 ? `${overdueDocs.length} overdue invoices totalling ${formatUsd(overdueAmountUsd)}` : 'No overdue invoices',
    topClients[0] ? `Top client: ${topClients[0].name} (${formatUsd(topClients[0].amountUsd)})` : null,
  ].filter(Boolean).join('. ');

  const formatRange = (value: Date) => value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return {
    weekLabel: `${formatRange(weekStart)} – ${formatRange(now)}`,
    startDate: weekStart.toISOString(),
    endDate: now.toISOString(),
    revenueUsd,
    previousWeekRevenueUsd,
    revenueChangePct,
    newInvoiceCount: newDocs.length,
    paidInvoiceCount: paidDocs.length,
    overdueCount: overdueDocs.length,
    overdueAmountUsd,
    topClients,
    contextSummary,
  };
}

export function createDailyBriefTool(): AgentToolDefinition {
  return {
    name: 'get_daily_brief_snapshot',
    description: 'Fetches a live snapshot of invoices, payment links, deadlines, contracts, and stalled projects for the current assistant daily brief.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: async (_args, context) => buildDailyBriefSnapshot(context.userId),
  };
}

export function createWeeklySummaryTool(): AgentToolDefinition {
  return {
    name: 'get_weekly_summary_snapshot',
    description: 'Fetches the current weekly revenue snapshot, top clients, new invoices, and overdue invoice state for the assistant weekly summary.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: async (_args, context) => buildWeeklySummarySnapshot(context.userId),
  };
}

export function createInvoiceDetailsTool(): AgentToolDefinition {
  return {
    name: 'workspace_get_invoice_details',
    description: 'Fetch paid, unpaid, overdue, draft, or all invoice details from Hedwig, including totals and client/project names.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['paid', 'unpaid', 'overdue', 'draft', 'all'],
          description: 'Invoice group to fetch. unpaid includes sent/viewed invoices that are not overdue.',
        },
        limit: { type: 'integer', description: 'Maximum invoices to return. Default 20, max 50.' },
      },
      required: [],
    },
    execute: async (args, context) => {
      const status = String(args.status || 'all').toLowerCase();
      const limit = Math.min(Math.max(Number(args.limit || 20), 1), 50);
      const nowIso = new Date().toISOString();

      let query = supabase
        .from('documents')
        .select(`
          id, title, description, amount, currency, content, status, created_at, updated_at, client_id, project_id,
          clients:client_id ( name, email, company ),
          projects:project_id ( name, status )
        `)
        .eq('user_id', context.userId)
        .eq('type', 'INVOICE')
        .order('updated_at', { ascending: false })
        .limit(status === 'overdue' || status === 'unpaid' ? 100 : limit);

      if (status === 'paid') query = query.eq('status', 'PAID');
      if (status === 'draft') query = query.eq('status', 'DRAFT');
      if (status === 'unpaid' || status === 'overdue') query = query.in('status', ['SENT', 'VIEWED']);

      const { data, error } = await query;
      if (error) throw new Error(`Could not fetch invoices: ${error.message}`);

      const filtered = (data ?? []).filter((doc: any) => {
        if (status === 'overdue') return isOverdueInvoice(doc, nowIso);
        if (status === 'unpaid') return !isOverdueInvoice(doc, nowIso);
        return true;
      }).slice(0, limit);

      const invoices = filtered.map((doc: any) => {
        const dueDate = getDocumentDueDate(doc);
        return {
          id: doc.id,
          title: doc.title,
          status: doc.status,
          amountUsd: toNumber(doc.amount),
          currency: doc.currency || 'USD',
          clientName: doc.clients?.name || getContentString(doc.content, ['client_name', 'clientName']) || null,
          clientEmail: doc.clients?.email || getContentString(doc.content, ['client_email', 'clientEmail']) || null,
          projectName: doc.projects?.name || null,
          dueDate,
          isOverdue: Boolean(dueDate && dueDate < nowIso && ['SENT', 'VIEWED'].includes(normalizeStatus(doc.status))),
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
        };
      });

      return {
        status,
        count: invoices.length,
        totalAmountUsd: invoices.reduce((sum, invoice) => sum + invoice.amountUsd, 0),
        invoices,
      };
    },
  };
}

export function createClientInsightsTool(): AgentToolDefinition {
  return {
    name: 'workspace_get_client_insights',
    description: 'Fetch client details and paid revenue rankings for an exact lookback period, including highest paying clients, outstanding balances, and recent activity. Use lookbackDays for requests like last 90 days, last 180 days, or last year.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['week', 'month', 'quarter', 'half_year', 'year', 'all', '7d', '30d', '90d', '180d', '1y'], description: 'Revenue lookback period. Default all.' },
        lookbackDays: { type: 'integer', description: 'Exact number of days to look back. Overrides period when provided. Use 90 for last 90 days, 180 for last 180 days, 365 for last year.' },
        limit: { type: 'integer', description: 'Maximum clients to return. Default 10, max 30.' },
      },
      required: [],
    },
    execute: async (args, context) => {
      const requestedLookbackDays = Number(args.lookbackDays);
      const lookbackDays = Number.isFinite(requestedLookbackDays)
        ? Math.min(Math.max(Math.floor(requestedLookbackDays), 1), 3650)
        : null;
      const period = normalizeWorkspacePeriod(args.period);
      const limit = Math.min(Math.max(Number(args.limit || 10), 1), 30);
      const start = lookbackDays
        ? new Date(context.now.getTime() - lookbackDays * 86_400_000).toISOString()
        : periodStart(period, context.now);
      const appliedPeriod = lookbackDays ? `${lookbackDays}d` : period;

      const [clientsRes, invoicesRes] = await Promise.all([
        supabase.from('clients').select('id, name, email, company, created_at, updated_at').eq('user_id', context.userId).limit(200),
        (() => {
          let q = supabase
            .from('documents')
            .select('id, client_id, amount, type, status, created_at, updated_at, content')
            .eq('user_id', context.userId)
            .in('type', ['INVOICE', 'PAYMENT_LINK']);
          if (start) q = q.gte('created_at', start);
          return q.limit(500);
        })(),
      ]);

      if (clientsRes.error) throw new Error(`Could not fetch clients: ${clientsRes.error.message}`);
      if (invoicesRes.error) throw new Error(`Could not fetch client invoices: ${invoicesRes.error.message}`);

      const invoiceRows = invoicesRes.data ?? [];
      const stats = new Map<string, { paidUsd: number; outstandingUsd: number; invoiceCount: number; paidInvoiceCount: number }>();

      for (const client of clientsRes.data ?? []) {
        stats.set(client.id, { paidUsd: 0, outstandingUsd: 0, invoiceCount: 0, paidInvoiceCount: 0 });
      }

      for (const invoice of invoiceRows as any[]) {
        const clientId = invoice.client_id;
        if (!clientId) continue;
        const current = stats.get(clientId) ?? { paidUsd: 0, outstandingUsd: 0, invoiceCount: 0, paidInvoiceCount: 0 };
        current.invoiceCount += 1;
        if (normalizeStatus(invoice.status) === 'PAID') {
          current.paidUsd += toNumber(invoice.amount);
          current.paidInvoiceCount += 1;
        } else if (['SENT', 'VIEWED'].includes(normalizeStatus(invoice.status))) {
          current.outstandingUsd += toNumber(invoice.amount);
        }
        stats.set(clientId, current);
      }

      const rankedClients = (clientsRes.data ?? [])
        .map((client: any) => ({ ...client, ...(stats.get(client.id) ?? { paidUsd: 0, outstandingUsd: 0, invoiceCount: 0, paidInvoiceCount: 0 }) }))
        .sort((a, b) => b.paidUsd - a.paidUsd);
      const clients = rankedClients.slice(0, limit);

      return {
        period: appliedPeriod,
        rangeStart: start,
        rangeEnd: context.now.toISOString(),
        highestPayingClient: clients[0] ?? null,
        totalClients: clientsRes.data?.length ?? 0,
        totalPaidUsd: rankedClients.reduce((sum, client) => sum + client.paidUsd, 0),
        totalOutstandingUsd: rankedClients.reduce((sum, client) => sum + client.outstandingUsd, 0),
        clients,
      };
    },
  };
}

export function createProjectDetailsTool(): AgentToolDefinition {
  return {
    name: 'workspace_get_project_details',
    description: 'Fetch Hedwig projects by status with budgets, deadlines, client names, and related invoice totals.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Project status filter, e.g. ACTIVE, IN_PROGRESS, COMPLETED, ON_HOLD, or all.' },
        limit: { type: 'integer', description: 'Maximum projects to return. Default 20, max 50.' },
      },
      required: [],
    },
    execute: async (args, context) => {
      const status = String(args.status || 'all').toUpperCase();
      const limit = Math.min(Math.max(Number(args.limit || 20), 1), 50);

      let query = supabase
        .from('projects')
        .select('id, name, description, status, budget, currency, deadline, start_date, end_date, updated_at, client_id, clients:client_id ( name, email )')
        .eq('user_id', context.userId)
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (status !== 'ALL') query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw new Error(`Could not fetch projects: ${error.message}`);

      const projectIds = (data ?? []).map((project: any) => project.id);
      const { data: docs } = projectIds.length > 0
        ? await supabase.from('documents').select('project_id, amount, status').eq('user_id', context.userId).eq('type', 'INVOICE').in('project_id', projectIds)
        : { data: [] as any[] };

      const totals = new Map<string, { paidUsd: number; outstandingUsd: number; invoiceCount: number }>();
      for (const doc of docs ?? []) {
        const current = totals.get(doc.project_id) ?? { paidUsd: 0, outstandingUsd: 0, invoiceCount: 0 };
        current.invoiceCount += 1;
        if (normalizeStatus(doc.status) === 'PAID') current.paidUsd += toNumber(doc.amount);
        if (['SENT', 'VIEWED'].includes(normalizeStatus(doc.status))) current.outstandingUsd += toNumber(doc.amount);
        totals.set(doc.project_id, current);
      }

      return {
        status: status.toLowerCase(),
        count: data?.length ?? 0,
        projects: (data ?? []).map((project: any) => ({
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          budgetUsd: toNumber(project.budget),
          currency: project.currency || 'USD',
          deadline: project.deadline,
          clientName: project.clients?.name ?? null,
          clientEmail: project.clients?.email ?? null,
          updatedAt: project.updated_at,
          ...(totals.get(project.id) ?? { paidUsd: 0, outstandingUsd: 0, invoiceCount: 0 }),
        })),
      };
    },
  };
}

export function createExpenseBreakdownTool(): AgentToolDefinition {
  return {
    name: 'workspace_get_expense_breakdown',
    description: 'Fetch everyday expense breakdowns from Hedwig expenses plus confirmed transaction fees from the shared backend transaction ledger.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['week', 'month', 'quarter', 'year', 'all'], description: 'Expense lookback period. Default month.' },
        limit: { type: 'integer', description: 'Maximum recent expense rows to return. Default 20, max 50.' },
      },
      required: [],
    },
    execute: async (args, context) => {
      const period = (String(args.period || 'month').toLowerCase() as WorkspacePeriod);
      const limit = Math.min(Math.max(Number(args.limit || 20), 1), 50);
      const start = periodStart(period);

      let expensesQuery = supabase
        .from('expenses')
        .select('id, amount, currency, converted_amount_usd, category, note, source_type, date, client_id, project_id, clients:client_id ( name ), projects:project_id ( name )')
        .eq('user_id', context.userId)
        .order('date', { ascending: false })
        .limit(250);
      let transactionsQuery = supabase
        .from('transactions')
        .select('id, type, status, amount, token, platform_fee, network_fee, timestamp, created_at')
        .eq('user_id', context.userId)
        .eq('status', 'CONFIRMED')
        .limit(250);
      if (start) {
        expensesQuery = expensesQuery.gte('date', start);
        transactionsQuery = transactionsQuery.gte('created_at', start);
      }

      const [expensesRes, txRes] = await Promise.all([expensesQuery, transactionsQuery]);
      if (expensesRes.error) throw new Error(`Could not fetch expenses: ${expensesRes.error.message}`);
      if (txRes.error) throw new Error(`Could not fetch transaction expenses: ${txRes.error.message}`);

      const categoryTotals: Record<string, number> = {};
      const expenses = (expensesRes.data ?? []).map((expense: any) => {
        const amountUsd = toNumber(expense.converted_amount_usd);
        const category = String(expense.category || 'other');
        categoryTotals[category] = (categoryTotals[category] ?? 0) + amountUsd;
        return {
          id: expense.id,
          amountUsd,
          originalAmount: toNumber(expense.amount),
          currency: expense.currency || 'USD',
          category,
          note: expense.note || '',
          sourceType: expense.source_type,
          date: expense.date,
          clientName: expense.clients?.name ?? null,
          projectName: expense.projects?.name ?? null,
        };
      });

      let transactionFeesUsd = 0;
      for (const tx of txRes.data ?? []) {
        transactionFeesUsd += toNumber(tx.platform_fee) + toNumber(tx.network_fee);
      }
      if (transactionFeesUsd > 0) {
        categoryTotals.transaction_fees = (categoryTotals.transaction_fees ?? 0) + transactionFeesUsd;
      }

      const categories = Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1])
        .map(([category, amountUsd]) => ({ category, amountUsd }));

      return {
        period,
        totalExpensesUsd: categories.reduce((sum, category) => sum + category.amountUsd, 0),
        transactionFeesUsd,
        categories,
        recentExpenses: expenses.slice(0, limit),
        sourceNote: 'Manual/imported expenses are read from expenses; platform and network fees are read from confirmed shared backend transactions.',
      };
    },
  };
}

export function createCalendarContextTool(): AgentToolDefinition {
  return {
    name: 'workspace_get_calendar_context',
    description: 'Fetch Hedwig calendar context: upcoming invoice due dates, project deadlines, milestones, and local calendar events. Use this for schedule, deadline, calendar, or what-is-due questions instead of the full workspace brief.',
    parameters: {
      type: 'object',
      properties: {
        daysAhead: { type: 'integer', description: 'Number of days to look ahead. Default 30, max 90.' },
        includeCompleted: { type: 'boolean', description: 'Whether completed calendar events should be included. Default false.' },
      },
      required: [],
    },
    execute: async (args, context) => {
      const daysAhead = Math.min(Math.max(Number(args.daysAhead || 30), 1), 90);
      const includeCompleted = Boolean(args.includeCompleted);
      const now = new Date();
      const nowIso = now.toISOString();
      const maxIso = new Date(now.getTime() + daysAhead * 86_400_000).toISOString();

      const [calendarRes, invoiceRes, projectRes] = await Promise.all([
        (() => {
          let query = supabase
            .from('calendar_events')
            .select('id, title, description, event_date, event_type, status, source_type, source_id')
            .eq('user_id', context.userId)
            .gte('event_date', nowIso)
            .lte('event_date', maxIso)
            .order('event_date', { ascending: true })
            .limit(100);
          if (!includeCompleted) query = query.eq('status', 'upcoming');
          return query;
        })(),
        supabase
          .from('documents')
          .select('id, title, amount, currency, status, content, client_id, clients:client_id ( name, email )')
          .eq('user_id', context.userId)
          .eq('type', 'INVOICE')
          .in('status', ['SENT', 'VIEWED', 'DRAFT'])
          .limit(200),
        supabase
          .from('projects')
          .select('id, name, status, budget, currency, deadline, clients:client_id ( name, email )')
          .eq('user_id', context.userId)
          .gte('deadline', nowIso)
          .lte('deadline', maxIso)
          .order('deadline', { ascending: true })
          .limit(100),
      ]);

      if (calendarRes.error) throw new Error(`Could not fetch calendar events: ${calendarRes.error.message}`);
      if (invoiceRes.error) throw new Error(`Could not fetch invoice due dates: ${invoiceRes.error.message}`);
      if (projectRes.error) throw new Error(`Could not fetch project deadlines: ${projectRes.error.message}`);

      const invoiceDueDates = (invoiceRes.data ?? [])
        .map((invoice: any) => ({
          id: invoice.id,
          title: invoice.title,
          status: invoice.status,
          amountUsd: toNumber(invoice.amount),
          currency: invoice.currency || 'USD',
          dueDate: getDocumentDueDate(invoice),
          isOverdue: isOverdueInvoice(invoice, nowIso),
          clientName: invoice.clients?.name ?? null,
          clientEmail: invoice.clients?.email ?? null,
        }))
        .filter((invoice) => {
          if (!invoice.dueDate) return false;
          const dueTime = Date.parse(invoice.dueDate.length <= 10 ? `${invoice.dueDate}T12:00:00Z` : invoice.dueDate);
          return Number.isFinite(dueTime) && dueTime >= now.getTime() && dueTime <= Date.parse(maxIso);
        })
        .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

      const projectDeadlines = (projectRes.data ?? []).map((project: any) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        budgetUsd: toNumber(project.budget),
        currency: project.currency || 'USD',
        deadline: project.deadline,
        clientName: project.clients?.name ?? null,
        clientEmail: project.clients?.email ?? null,
      }));

      return {
        range: { from: nowIso, to: maxIso, daysAhead },
        calendarEvents: calendarRes.data ?? [],
        invoiceDueDates,
        projectDeadlines,
        counts: {
          calendarEvents: calendarRes.data?.length ?? 0,
          invoiceDueDates: invoiceDueDates.length,
          projectDeadlines: projectDeadlines.length,
        },
      };
    },
  };
}

export function createWorkspaceAnalysisTools(): AgentToolDefinition[] {
  return [
    createInvoiceDetailsTool(),
    createClientInsightsTool(),
    createProjectDetailsTool(),
    createExpenseBreakdownTool(),
    createCalendarContextTool(),
  ];
}
