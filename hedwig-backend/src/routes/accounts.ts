import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { resolveRequestIdentity, ownerScope, workspaceScope, type RequestIdentity } from '../utils/identity';
import { convertToUsd } from '../services/currency';

const router = Router();
const logger = createLogger('Accounts');

/**
 * Unified currency accounts — stablecoin (auto-provisioned at signup) plus
 * fiat virtual accounts (USD via Bridge, NGN via Strails, others pending).
 * Balances are cached snapshots; provider webhooks keep them fresh.
 */


/**
 * Personal-workspace reads must also match NULL-workspace rows: deposits and
 * imported events are often written without a workspace scope, and PostgREST
 * `IN` never matches NULL. Org paths stay strictly scoped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withWorkspaceScope(query: any, identity: { workspaceId: string }, scope: string[]): any {
  if (!identity.workspaceId.startsWith('ws_personal_')) {
    return query.in('workspace_id', scope);
  }
  const list = scope.map((w) => `"${w}"`).join(',');
  return query.or(`workspace_id.in.(${list}),workspace_id.is.null`);
}

const rowToApi = (r: Record<string, unknown>) => ({
  id: r.id,
  currency: r.currency,
  account_type: r.account_type,
  provider: r.provider,
  status: r.status,
  label: r.label ?? null,
  balance: Number(r.balance ?? 0),
  balance_usd: Number(r.balance_usd ?? 0),
  account_number_masked: r.account_number_masked ?? null,
  bank_name: r.bank_name ?? null,
  created_at: r.created_at,
});

async function ensureStablecoinAccount(identity: RequestIdentity) {
  const { data: existing } = await supabase
    .from('virtual_accounts')
    .select('*')
    .eq('user_id', identity.internalId)
    .eq('workspace_id', identity.workspaceId)
    .eq('currency', 'USDC')
    .eq('account_type', 'stablecoin')
    .maybeSingle();
  if (existing) return existing;

  // Seed the ledger-derived balance: net USDC flow for this scope
  // (legacy DID-keyed + NULL-workspace events included).
  let flowsQuery = supabase
    .from('financial_events')
    .select('direction,amount_usd')
    .in('user_id', ownerScope(identity));
  flowsQuery = withWorkspaceScope(flowsQuery, identity, workspaceScope(identity));
  const { data: flows } = await flowsQuery;
  const net = (flows ?? []).reduce(
    (s, r) => s + (r.direction === 'in' ? 1 : r.direction === 'out' ? -1 : 0) * Number(r.amount_usd ?? 0),
    0
  );
  const { data, error } = await supabase
    .from('virtual_accounts')
    .upsert(
      {
        user_id: identity.internalId,
        workspace_id: identity.workspaceId,
        currency: 'USDC',
        account_type: 'stablecoin',
        provider: 'hedwig',
        status: 'active',
        label: 'USDC Stablecoin',
        balance: Math.max(0, net),
        balance_usd: Math.max(0, net),
      },
      { onConflict: 'user_id,workspace_id,currency,account_type' }
    )
    .select('*')
    .single();
  if (error) {
    logger.warn('stablecoin account ensure failed', { message: error.message });
    return null;
  }
  return data;
}

/** GET /api/accounts — unified list (stablecoin always present). */
router.get('/', authenticate, async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  await ensureStablecoinAccount(identity);
  let listQuery = supabase
    .from('virtual_accounts')
    .select('*')
    .in('user_id', ownerScope(identity));
  listQuery = withWorkspaceScope(listQuery, identity, workspaceScope(identity));
  const { data, error } = await listQuery.order('created_at');
  if (error) throw error;
  return res.json({ success: true, data: (data ?? []).map(rowToApi) });
});

/** GET /api/accounts/summary — available, pending deposits, pending transfers. */
router.get('/summary', authenticate, async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  await ensureStablecoinAccount(identity);
  const owners = ownerScope(identity);
  const scopes = workspaceScope(identity);

  const { data: accounts } = await withWorkspaceScope(
    supabase.from('virtual_accounts').select('balance_usd,status').in('user_id', owners),
    identity,
    scopes
  ).eq('status', 'active');
  const available = (accounts ?? []).reduce(
    (s: number, a: { balance_usd?: number | string | null }) => s + Number(a.balance_usd ?? 0),
    0
  );

  // Pending deposits: unpaid invoices (receivables awaiting payment),
  // converted to USD per invoice currency — never summed raw.
  const { data: invoices } = await withWorkspaceScope(
    supabase.from('documents').select('amount,amount_usd,currency').in('user_id', owners),
    identity,
    scopes
  )
    .eq('type', 'INVOICE')
    .in('status', ['DRAFT', 'SENT', 'VIEWED', 'OVERDUE']);
  let pendingDeposits = 0;
  for (const d of (invoices ?? []) as Record<string, unknown>[]) {
    const raw = Number(d.amount_usd ?? d.amount ?? 0);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    try {
      pendingDeposits += d.amount_usd != null ? raw : await convertToUsd(raw, String(d.currency ?? 'USD'));
    } catch {
      pendingDeposits += d.amount_usd != null ? raw : 0;
    }
  }

  // Pending transfers: offramp orders still in flight (crypto leg is USDC).
  const { data: orders } = await supabase
    .from('offramp_orders')
    .select('crypto_amount,fiat_amount,fiat_currency')
    .in('user_id', owners)
    .in('status', ['PENDING', 'PROCESSING']);
  const pendingTransfers = (orders ?? []).reduce((s, o) => s + Number(o.crypto_amount ?? 0), 0);

  return res.json({
    success: true,
    data: {
      available_usd: available,
      pending_deposits_usd: pendingDeposits,
      pending_deposit_count: (invoices ?? []).length,
      pending_transfers_usd: pendingTransfers,
      pending_transfer_count: (orders ?? []).length,
    },
  });
});

/** POST /api/accounts — create a currency account (provisions via provider where available). */
router.post('/', authenticate, async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const b = req.body ?? {};
  const currency = String(b.currency ?? 'USD').toUpperCase();
  if (!['USDC', 'USD', 'NGN', 'EUR', 'MXN'].includes(currency)) {
    return res.status(400).json({ error: 'unsupported currency' });
  }
  const accountType = ['checking', 'savings', 'payroll'].includes(b.account_type) ? b.account_type : 'checking';
  const provider = currency === 'USD' ? 'bridge' : currency === 'NGN' ? 'strails' : 'hedwig';

  const { data, error } = await supabase
    .from('virtual_accounts')
    .upsert(
      {
        user_id: identity.internalId,
        workspace_id: identity.workspaceId,
        currency,
        account_type: accountType,
        provider,
        status: provider === 'hedwig' ? 'pending' : 'provisioning',
        label: b.label?.slice(0, 120) ?? null,
        balance: 0,
        balance_usd: 0,
      },
      { onConflict: 'user_id,workspace_id,currency,account_type' }
    )
    .select('*')
    .single();
  if (error) throw error;

  // Best-effort provider provisioning hooks (Bridge USD enrollment and
  // Strails NGN onboarding live in their own routes; this records intent).
  try {
    const { supabase: sb } = await import('../lib/supabase');
    await sb.from('timeline_events').insert({
      user_id: identity.internalId,
      workspace_id: identity.workspaceId,
      kind: 'ACCOUNT',
      entity_type: 'virtual_account',
      entity_id: data.id,
      verb: 'CREATED',
      title: `${currency} ${accountType} account requested`,
      context: { currency, account_type: accountType, provider },
    });
  } catch (err) {
    logger.warn('account timeline event failed', { err });
  }

  return res.status(201).json({ success: true, data: rowToApi(data) });
});

/** GET /api/accounts/:id — detail + recent transactions. */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const { data: account, error } = await supabase
    .from('virtual_accounts')
    .select('*')
    .eq('id', req.params.id)
    .in('user_id', ownerScope(identity))
    .single();
  if (error || !account) return res.status(404).json({ error: 'account not found' });

  const currency = String(account.currency);
  // Stablecoin accounts expose the owner's public wallet address (safe to
  // display/copy; bank account numbers stay masked).
  let address: string | null = null;
  if (currency === 'USDC') {
    try {
      const { getOrCreateUser } = await import('../utils/userHelper');
      const u = (await getOrCreateUser(identity.privyDid)) as unknown as Record<string, unknown> | null;
      address = (u?.ethereum_wallet_address as string) ?? null;
    } catch {
      address = null;
    }
  }
  let txQuery = withWorkspaceScope(
    supabase
      .from('financial_events')
      .select('id,event_type,direction,amount,amount_usd,currency,occurred_at,source')
      .in('user_id', ownerScope(identity)),
    identity,
    workspaceScope(identity)
  )
    .order('occurred_at', { ascending: false })
    .limit(50);
  if (currency !== 'USDC') txQuery = txQuery.eq('currency', currency);
  const { data: transactions } = await txQuery;

  return res.json({ success: true, data: { account: { ...rowToApi(account), address }, transactions: transactions ?? [] } });
});

/** GET /api/accounts/:id/history?range=30d|90d|1y — cumulative balance series (USD). */
router.get('/:id/history', authenticate, async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const { data: account } = await supabase
    .from('virtual_accounts')
    .select('*')
    .eq('id', req.params.id)
    .in('user_id', ownerScope(identity))
    .single();
  if (!account) return res.status(404).json({ error: 'account not found' });

  const range = String(req.query.range ?? '30d');
  const days = range === '1y' ? 365 : range === '90d' ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  const { data: events } = await withWorkspaceScope(
    supabase
      .from('financial_events')
      .select('direction,amount_usd,occurred_at')
      .in('user_id', ownerScope(identity)),
    identity,
    workspaceScope(identity)
  )
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: true })
    .limit(2000);

  const current = Number(account.balance_usd ?? 0);
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const byDay = new Map<string, number>();
  for (const e of events ?? []) {
    const k = dayKey(new Date(e.occurred_at as string));
    const delta = (e.direction === 'in' ? 1 : e.direction === 'out' ? -1 : 0) * Number(e.amount_usd ?? 0);
    byDay.set(k, (byDay.get(k) ?? 0) + delta);
  }
  // Walk forward from (current - totalFlow), accumulating daily deltas.
  const totalFlow = [...byDay.values()].reduce((s, v) => s + v, 0);
  const points: Array<{ date: string; value: number }> = [];
  let running = current - totalFlow;
  for (let d = new Date(since); d <= new Date(); d.setUTCDate(d.getUTCDate() + 1)) {
    running += byDay.get(dayKey(d)) ?? 0;
    points.push({ date: dayKey(d), value: Math.round(running * 100) / 100 });
  }
  return res.json({ success: true, data: { points, currency: account.currency } });
});

export default router;
