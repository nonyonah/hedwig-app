import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { resolveRequestIdentity, ownerScope, workspaceScope, type RequestIdentity } from '../utils/identity';
import { convertToUsd } from '../services/currency';
import { bridgeUsdService } from '../services/bridgeUsd';
import { getOrCreateUser } from '../utils/userHelper';

const router = Router();
const logger = createLogger('Accounts');

/**
 * Unified currency accounts — stablecoin (auto-provisioned at signup) plus
 * fiat virtual accounts (USD via Bridge, NGN via Flutterwave, others pending).
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

/**
 * Mirror Bridge USD state (user_usd_accounts, the system of record) onto
 * virtual_accounts rows so the unified list shows live numbers + status.
 */
async function syncBridgeRows(rows: Record<string, unknown>[], internalId: string) {
  const needsSync = rows.some(
    (r) => r.provider === 'bridge' && (!(r as Record<string, unknown>).account_number_masked || (r as Record<string, unknown>).status === 'provisioning')
  );
  if (!needsSync) return rows;
  const { data: bridge } = await supabase
    .from('user_usd_accounts')
    .select('bridge_customer_id,provider_status,bridge_kyc_status,ach_account_number_masked,bank_name')
    .eq('user_id', internalId)
    .maybeSingle();
  if (!bridge) return rows;
  const b = bridge as Record<string, unknown>;
  const synced = rows.map((r) => {
    if (r.provider !== 'bridge') return r;
    const status =
      b.provider_status === 'active' ? 'active' : b.bridge_kyc_status === 'approved' ? 'active' : 'provisioning';
    return {
      ...r,
      status,
      account_number_masked: (r.account_number_masked as string) ?? (b.ach_account_number_masked as string) ?? null,
      bank_name: (r.bank_name as string) ?? (b.bank_name as string) ?? null,
    };
  });
  // Persist the mirror best-effort (never fail the read).
  const first = synced.find((r) => r.provider === 'bridge') as Record<string, unknown> | undefined;
  if (first?.id) {
    supabase
      .from('virtual_accounts')
      .update({
        status: first.status,
        account_number_masked: first.account_number_masked,
        bank_name: first.bank_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', first.id as string)
      .then(
        () => undefined,
        () => undefined
      );
  }
  return synced;
}
router.get('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  await ensureStablecoinAccount(identity);
  let listQuery = supabase
    .from('virtual_accounts')
    .select('*')
    .in('user_id', ownerScope(identity));
  listQuery = withWorkspaceScope(listQuery, identity, workspaceScope(identity));
  const { data, error } = await listQuery.order('created_at');
  if (error) throw error;
  const synced = await syncBridgeRows((data ?? []) as Record<string, unknown>[], identity.internalId);
  return res.json({ success: true, data: synced.map(rowToApi) });
}));

/** GET /api/accounts/summary — available, pending deposits, pending transfers. */
router.get('/summary', authenticate, asyncHandler(async (req: Request, res: Response) => {
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
}));

/** POST /api/accounts — create a currency account (provisions via provider where available). */
router.post('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const b = req.body ?? {};
  const currency = String(b.currency ?? 'USD').toUpperCase();
  if (!['USDC', 'USD', 'NGN', 'GBP', 'EUR'].includes(currency)) {
    return res.status(400).json({ error: 'unsupported currency' });
  }
  // GBP + EUR are disabled until their providers ship — added back gradually.
  if (currency === 'GBP' || currency === 'EUR') {
    return res.status(400).json({ error: 'coming soon', currency });
  }
  const accountType = ['checking', 'savings', 'payroll', 'current'].includes(b.account_type)
    ? b.account_type
    : 'checking';
  const provider = currency === 'USD' ? 'bridge' : currency === 'NGN' ? 'flutterwave' : 'hedwig';

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

  // USD: drive real Bridge enrollment now (sandbox activates immediately;
  // production lands in KYC). Failures keep the row in `provisioning`.
  let provisionNote: string | null = null;
  if (currency === 'USD') {
    try {
      const profile = (await getOrCreateUser(req.user!.id)) as unknown as Record<string, unknown>;
      const customer = await bridgeUsdService.createOrGetCustomer({
        externalUserId: identity.internalId,
        email: (profile?.email as string) ?? null,
        firstName: (profile?.first_name as string) ?? null,
        lastName: (profile?.last_name as string) ?? null,
      });
      const sandboxMode = bridgeUsdService.isSandbox();
      const synced = await syncBridgeRows(
        [{ ...data, provider_ref: customer.id, status: sandboxMode ? 'active' : 'provisioning' }],
        identity.internalId
      );
      const fresh = synced[0] as Record<string, unknown>;
      await supabase
        .from('virtual_accounts')
        .update({
          provider_ref: customer.id,
          status: fresh.status,
          account_number_masked: (fresh.account_number_masked as string) ?? null,
          bank_name: (fresh.bank_name as string) ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.id);
      data.status = fresh.status as string;
      data.account_number_masked = (fresh.account_number_masked as string) ?? null;
      data.bank_name = (fresh.bank_name as string) ?? null;
      provisionNote = sandboxMode ? null : 'complete_bridge_kyc';
    } catch (err) {
      logger.warn('bridge enrollment from accounts failed', {
        message: err instanceof Error ? err.message : String(err),
      });
      provisionNote = 'provisioning_failed_retry';
    }
  }

  // Record the request on the timeline (best-effort).
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

  return res.status(201).json({ success: true, data: { ...rowToApi(data), next_action: provisionNote } });
}));

/**
 * POST /api/accounts/:id/close — remove an empty account from the account
 * directory. Financial events and provider transfer history remain intact.
 */
router.post('/:id/close', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const { data: account, error: lookupError } = await supabase
    .from('virtual_accounts')
    .select('id, balance, status, provider, currency, account_type')
    .eq('id', req.params.id)
    .in('user_id', ownerScope(identity))
    .maybeSingle();

  // A missing row is already closed from the account directory. Keeping this
  // idempotent makes retries safe after a successful delete.
  if (lookupError) throw lookupError;
  if (!account) return res.json({ success: true, data: null });
  if (Number(account.balance ?? 0) > 0) {
    return res.status(400).json({ error: 'move funds out before closing this account' });
  }
  // The stablecoin row is auto-provisioned on every list read — closing it
  // would just resurrect it. It is the core wallet account and stays.
  if (account.currency === 'USDC' && account.account_type === 'stablecoin') {
    return res.status(400).json({ error: 'the stablecoin account cannot be closed' });
  }

  // Stop the provider account before removing Hedwig's directory row.
  // Provider calls are best-effort: a provider-side failure must never strand
  // the user with an unclosable row. Anything left active provider-side simply
  // stops matching (the webhook only credits active directory rows) and is
  // logged for operator follow-up.
  // - Bridge: virtual accounts can't be deleted, only deactivated (blocks new
  //   deposits; Bridge returns later funds to the sender).
  // - Flutterwave: v3 exposes no programmatic static-VA delete; the local row
  //   is removed and stray inflows land in the unmatched-inflow log.
  if (account.provider === 'bridge') {
    const { data: bridgeAccount, error: bridgeLookupError } = await supabase
      .from('user_usd_accounts')
      .select('bridge_customer_id, bridge_virtual_account_id')
      .eq('user_id', identity.internalId)
      .maybeSingle();
    if (bridgeLookupError) throw bridgeLookupError;

    if (bridgeAccount?.bridge_customer_id && bridgeAccount.bridge_virtual_account_id) {
      try {
        await bridgeUsdService.deactivateVirtualAccount(
          bridgeAccount.bridge_customer_id,
          bridgeAccount.bridge_virtual_account_id
        );
      } catch (error) {
        const status = Number(
          (error as { response?: { status?: number } })?.response?.status ?? 0
        );
        // 404 = already gone provider-side; anything else is logged and the
        // local close proceeds anyway — never strand the row on provider error.
        logger.warn('Bridge virtual account deactivation issue (proceeding with close)', {
          accountId: account.id,
          status: status || undefined,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      logger.info('Bridge close with no provider virtual account on file; closing locally', {
        accountId: account.id,
      });
    }
  }

  const { error: deleteError } = await supabase
    .from('virtual_accounts')
    .delete()
    .eq('id', account.id)
    .in('user_id', ownerScope(identity));
  if (deleteError) throw deleteError;

  return res.json({ success: true, data: null });
}));

/** GET /api/accounts/:id — detail + recent transactions. */
router.get('/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
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
}));

/** GET /api/accounts/:id/history?range=30d|90d|1y — cumulative balance series (USD). */
router.get('/:id/history', authenticate, asyncHandler(async (req: Request, res: Response) => {
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
}));

export default router;
