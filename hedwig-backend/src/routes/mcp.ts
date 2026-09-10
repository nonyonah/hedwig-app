import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireMcpAuth } from './mcpOAuth';
import { asyncHandler } from '../utils/asyncHandler';
import { getOrCreateUser } from '../utils/userHelper';

// MCP tokens carry the Privy DID; business tables are keyed by internal
// users.id — resolve once per call and match both (legacy tolerance).
async function scopedUserIds(mcpUserId: string): Promise<string[]> {
  try {
    const u = (await getOrCreateUser(mcpUserId)) as unknown as { id: string };
    return u.id === mcpUserId ? [mcpUserId] : [u.id, mcpUserId];
  } catch {
    return [mcpUserId];
  }
}

const router = Router();

/**
 * MCP server — Nche port, SDK-free.
 * Minimal Streamable-HTTP-compatible JSON-RPC surface (initialize,
 * tools/list, tools/call) over POST /api/mcp. All traffic is OAuth-protected
 * (requireMcpAuth) and read-only except approval decisions.
 */

type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Capability scopes required (Meow-style). Reads need 'read'; anything that moves or commits money needs more. */
  scopes: string[];
  run: (userId: string, args: Record<string, unknown>) => Promise<unknown>;
};

const tools: McpTool[] = [
  {
    name: 'hedwig_get_profile',
    description: 'Get the authenticated account profile and verification status.',
    inputSchema: { type: 'object', properties: {} },
    scopes: ['read'],
    run: async (userId) => {
      const ids = await scopedUserIds(userId);
      const [{ data: user }, { data: reviews }] = await Promise.all([
        supabase.from('users').select('id,kyc_status').in('id', ids).maybeSingle(),
        supabase.from('manual_review_cases').select('id').in('user_id', ids).eq('status', 'OPEN'),
      ]);
      return {
        id: userId,
        kyc_status: (user as { kyc_status?: string } | null)?.kyc_status ?? 'NOT_STARTED',
        open_reviews: (reviews ?? []).length,
      };
    },
  },
  {
    name: 'hedwig_list_agents',
    description: 'List the agent spend profiles with their policies.',
    inputSchema: { type: 'object', properties: {} },
    scopes: ['read'],
    run: async (userId) => {
      const ownerIds = await scopedUserIds(userId);
      const { data: agents } = await supabase.from('agents').select('*').in('owner_user_id', ownerIds).order('created_at');
      const ids = (agents ?? []).map((a) => a.id);
      const { data: policies } = ids.length
        ? await supabase.from('spend_policies').select('*').in('agent_id', ids)
        : { data: [] };
      const byAgent = new Map((policies ?? []).map((p) => [p.agent_id, p]));
      return (agents ?? []).map((a) => ({ ...a, policy: byAgent.get(a.id) ?? null }));
    },
  },
  {
    name: 'hedwig_list_approvals',
    description: 'List pending approval requests (agent spend / invoices held by policy).',
    inputSchema: { type: 'object', properties: {} },
    scopes: ['read'],
    run: async (userId) => {
      const ids = await scopedUserIds(userId);
      const { data } = await supabase
        .from('approval_requests')
        .select('*')
        .in('user_id', ids)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })
        .limit(50);
      return data ?? [];
    },
  },
  {
    name: 'hedwig_list_cards',
    description: 'List stablecoin cards and their statuses (masked only).',
    inputSchema: { type: 'object', properties: {} },
    scopes: ['read'],
    run: async (userId) => {
      const ids = await scopedUserIds(userId);
      const { data } = await supabase
        .from('cards')
        .select('id,last4,brand,status,funding_address,created_at')
        .in('user_id', ids);
      return data ?? [];
    },
  },
  {
    name: 'hedwig_ledger_summary',
    description: 'Summarize recent financial events (money in / out, by rail).',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
    scopes: ['read'],
    run: async (userId, args) => {
      const limit = Math.min(Number(args.limit ?? 50) || 50, 200);
      const ids = await scopedUserIds(userId);
      const { data } = await supabase
        .from('financial_events')
        .select('event_type,direction,amount_usd,occurred_at,source')
        .in('user_id', ids)
        .order('occurred_at', { ascending: false })
        .limit(limit);
      const rows = data ?? [];
      const inflow = rows.filter((r) => r.direction === 'in').reduce((s, r) => s + Number(r.amount_usd ?? 0), 0);
      const outflow = rows.filter((r) => r.direction === 'out').reduce((s, r) => s + Number(r.amount_usd ?? 0), 0);
      return { inflow_usd: inflow, outflow_usd: outflow, net_usd: inflow - outflow, events: rows };
    },
  },
  {
    name: 'hedwig_list_unpaid_invoices',
    description: 'List unpaid invoices (draft, sent, viewed, overdue) with totals.',
    inputSchema: { type: 'object', properties: {} },
    scopes: ['read'],
    run: async (userId) => {
      const ids = await scopedUserIds(userId);
      const { data, error } = await supabase
        .from('documents')
        .select('id,title,amount,currency,status,created_at,content')
        .in('user_id', ids)
        .eq('type', 'INVOICE')
        .in('status', ['DRAFT', 'SENT', 'VIEWED', 'OVERDUE'])
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      const invoices = (data ?? []).map((d: Record<string, unknown>) => ({
        id: d.id,
        title: d.title,
        amount: d.amount,
        currency: d.currency ?? 'USD',
        status: d.status,
        client_name: ((d.content ?? {}) as Record<string, unknown>).client_name ?? null,
        due_date: ((d.content ?? {}) as Record<string, unknown>).due_date ?? null,
      }));
      const total = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
      return { invoices, count: invoices.length, total };
    },
  },
  {
    name: 'hedwig_suggest_matches',
    description: 'Score unmatched receipts against unpaid invoices. Bank statements excluded unless asked.',
    inputSchema: { type: 'object', properties: { minScore: { type: 'number' }, includeStatements: { type: 'boolean' } } },
    scopes: ['read'],
    run: async (userId, args) => {
      const { suggestMatches } = await import('../services/invoiceMatcher');
      const { data: user } = await supabase.from('users').select('id').in('id', await scopedUserIds(userId)).limit(1).maybeSingle();
      const internalId = (user as { id: string } | null)?.id ?? userId;
      const minScore = Math.min(1, Math.max(0, Number(args.minScore ?? 0.5) || 0.5));
      const suggestions = await suggestMatches(internalId, null, minScore, args.includeStatements === true);
      return { suggestions, count: suggestions.length };
    },
  },
  {
    name: 'hedwig_apply_match',
    description: 'Link one imported transaction to one invoice (marks it matched).',
    inputSchema: {
      type: 'object',
      properties: { transactionId: { type: 'string' }, invoiceId: { type: 'string' } },
      required: ['transactionId', 'invoiceId'],
    },
    scopes: ['payments'],
    run: async (userId, args) => {
      const ids = await scopedUserIds(userId);
      const transactionId = String(args.transactionId ?? '');
      const invoiceId = String(args.invoiceId ?? '');
      if (!transactionId || !invoiceId) throw new Error('transactionId and invoiceId are required');
      const { data, error } = await supabase
        .from('imported_transactions')
        .update({
          matched_invoice_id: invoiceId,
          match_method: 'mcp',
          status: 'matched',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transactionId)
        .in('user_id', ids)
        .select('id')
        .single();
      if (error || !data) throw new Error(error?.message ?? 'match failed or not found');
      return { matched: true, transactionId, invoiceId };
    },
  },
  {
    name: 'hedwig_pay_invoice',
    description: 'Record payment on an invoice. Two-step: call first WITHOUT confirmed to get a draft preview, then call again with confirmed:true to execute. Requires payments scope.',
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string' },
        txHash: { type: 'string' },
        chain: { type: 'string' },
        amount: { type: 'number' },
        confirmed: { type: 'boolean', description: 'Set true only after reviewing the draft preview.' },
      },
      required: ['invoiceId'],
    },
    scopes: ['payments'],
    run: async (userId, args) => {
      const ids = await scopedUserIds(userId);
      const invoiceId = String(args.invoiceId ?? '');
      if (!invoiceId) throw new Error('invoiceId is required');
      const { data: doc, error: fetchError } = await supabase
        .from('documents')
        .select('id,amount,user_id,content')
        .eq('id', invoiceId)
        .in('user_id', ids)
        .single();
      if (fetchError || !doc) throw new Error('invoice not found');
      const draft = {
        invoiceId,
        amount: args.amount ?? (doc as { amount: unknown }).amount,
        txHash: args.txHash ?? null,
        payment_chain: args.chain ?? null,
      };
      if (args.confirmed !== true) {
        return { draft: true, ...draft, next: 'Review the draft, then call hedwig_pay_invoice again with confirmed:true to execute.' };
      }
      const paidAt = new Date().toISOString();
      const { error } = await supabase
        .from('documents')
        .update({
          status: 'PAID',
          content: {
            ...((doc.content ?? {}) as Record<string, unknown>),
            paid_at: paidAt,
            tx_hash: args.txHash ?? null,
            payment_chain: args.chain ?? null,
            paid_amount: args.amount ?? (doc as { amount: unknown }).amount,
            paid_via: 'mcp',
          },
        })
        .eq('id', invoiceId);
      if (error) throw new Error(error.message);
      const { emitFinancialEvent, FINANCIAL_EVENT_TYPES } = await import('../services/financial-events');
      await emitFinancialEvent({
        userId: (doc as { user_id: string }).user_id,
        workspaceId: null,
        eventType: FINANCIAL_EVENT_TYPES.DOCUMENT_PAID,
        entityType: 'invoice',
        entityId: invoiceId,
        version: `mcp:${paidAt}`,
        occurredAt: paidAt,
        amount: (doc as { amount: number }).amount,
        direction: 'in',
        source: 'mcp.pay_invoice',
      });
      return { paid: true, invoiceId, paidAt };
    },
  },
  {
    name: 'hedwig_upload_document',
    description: 'Analyze an invoice file (base64 PDF/PNG/JPG) and extract structured data. Confirm via import endpoints afterwards.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string' },
        mimeType: { type: 'string' },
        base64: { type: 'string' },
      },
      required: ['filename', 'mimeType', 'base64'],
    },
    scopes: ['read'],
    run: async (userId, args) => {
      void userId;
      const mimeType = String(args.mimeType ?? '');
      const base64 = String(args.base64 ?? '');
      if (!['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mimeType)) {
        throw new Error('Unsupported file type. Use PDF, PNG, or JPG.');
      }
      if (base64.length > 20 * 1024 * 1024) throw new Error('File too large (20MB base64 limit).');
      const { llmService } = await import('../services/llm');
      const prompt = `Analyze this uploaded file and extract invoice data only. Return ONLY valid JSON, no markdown fences.
{"documentType":"invoice"|"unknown","invoiceNumber":"string","issuer":"string","amount":number,"currency":"string","issueDate":"YYYY-MM-DD","dueDate":"YYYY-MM-DD","title":"string","paymentStatus":"paid"|"unpaid","confidence":number}
Rules: populate invoice fields when clearly an invoice, else documentType unknown; normalize dates; paymentStatus paid only on explicit paid stamp/zero balance, else unpaid.`;
      const text = (await llmService.generateText(prompt, {
        files: [{ mimeType, data: base64 }],
        maxOutputTokens: 1400,
        temperature: 0.1,
      })).trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not extract data from document');
      return {
        filename: String(args.filename ?? 'upload'),
        parsed: JSON.parse(match[0]),
        nextSteps: 'Create the invoice via POST /api/documents/invoice, or confirm it as a receipt/expense via POST /api/revenue/import-document/confirm.',
      };
    },
  },
  {
    name: 'hedwig_list_imported_transactions',
    description: 'List imported bank transactions, pending review by default.',
    inputSchema: { type: 'object', properties: { status: { type: 'string' }, limit: { type: 'number' } } },
    scopes: ['read'],
    run: async (userId, args) => {
      const ids = await scopedUserIds(userId);
      const status = String(args.status ?? 'pending');
      const limit = Math.min(Number(args.limit ?? 50) || 50, 200);
      const { data, error } = await supabase
        .from('imported_transactions')
        .select('id,description,amount,currency,transaction_date,type,status,matched_invoice_id,match_confidence')
        .in('user_id', ids)
        .eq('status', status)
        .order('transaction_date', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return { transactions: data ?? [], count: (data ?? []).length };
    },
  },
];

router.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'hedwig-mcp' });
});

router.post('/', requireMcpAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as Request & { mcpUserId?: string }).mcpUserId!;
  const body = req.body ?? {};
  const { method, params, id } = body as { method?: string; params?: Record<string, unknown>; id?: unknown };
  const reply = (result: unknown) => res.json({ jsonrpc: '2.0', id: id ?? null, result });

  if (method === 'initialize') {
    return reply({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'hedwig-mcp', version: '0.1.0' } });
  }
  if (method === 'notifications/initialized') {
    return reply({});
  }
  if (method === 'tools/list') {
    const granted = (req as Request & { mcpScopes?: string[] }).mcpScopes ?? ['read'];
    return reply({
      tools: tools
        .filter((t) => t.scopes.every((s) => granted.includes(s)))
        .map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
  }
  if (method === 'tools/call') {
    const name = (params as Record<string, unknown> | undefined)?.name as string;
    const args = ((params as Record<string, unknown> | undefined)?.arguments ?? {}) as Record<string, unknown>;
    const tool = tools.find((t) => t.name === name);
    if (!tool) return res.json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: `unknown tool ${name}` } });
    const granted = (req as Request & { mcpScopes?: string[] }).mcpScopes ?? ['read'];
    const missing = tool.scopes.filter((s) => !granted.includes(s));
    if (missing.length > 0) {
      return res.json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32001, message: `insufficient_scope: tool '${name}' requires scope(s) [${missing.join(', ')}]; re-authorize with scope '${missing.join(' ')}'` } });
    }
    try {
      const value = await tool.run(userId, args);
      return reply({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
    } catch (err) {
      return res.json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32603, message: err instanceof Error ? err.message : 'tool failed' } });
    }
  }
  return res.json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: `unknown method ${method}` } });
}));

export default router;
