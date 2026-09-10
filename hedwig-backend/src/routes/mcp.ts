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
  run: (userId: string, args: Record<string, unknown>) => Promise<unknown>;
};

const tools: McpTool[] = [
  {
    name: 'hedwig_get_profile',
    description: 'Get the authenticated account profile and verification status.',
    inputSchema: { type: 'object', properties: {} },
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
    return reply({
      tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
  }
  if (method === 'tools/call') {
    const name = (params as Record<string, unknown> | undefined)?.name as string;
    const args = ((params as Record<string, unknown> | undefined)?.arguments ?? {}) as Record<string, unknown>;
    const tool = tools.find((t) => t.name === name);
    if (!tool) return res.json({ jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: `unknown tool ${name}` } });
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
