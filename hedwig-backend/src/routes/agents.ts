import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { resolveRequestIdentity, ownerScope, workspaceScope } from '../utils/identity';

const router = Router();
const logger = createLogger('Agents');

/** Gemini-only setup parse (flash-lite). Never throws — returns null when unavailable. */
const SETUP_PRIMARY_MODEL = process.env.AGENT_SETUP_MODEL || 'gemini-3.5-flash-lite';
const SETUP_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

async function parseWithModel(
  ai: { models: { generateContent: (args: Record<string, unknown>) => Promise<unknown> } },
  model: string,
  prompt: string
): Promise<Record<string, unknown>> {
  const out = (await ai.models.generateContent({ model, contents: prompt })) as { text?: string };
  const text = out.text ?? '';
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>;
}
async function parseInstructionsOnce(input: {
  instructions: string;
  monthlyCap?: number;
  perTransactionCap?: number;
  merchantAllowlist?: string[];
  allowNewVendors?: boolean;
}): Promise<{ meta: Record<string, unknown>; flags: string[] } | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key || !input.instructions) return null;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });
    const prompt = `Parse these agent spend instructions into JSON with keys vendor_hints (string[]), payment_triggers (string[]), restrictions (string[]), flags_for_review (string[]). Caps: monthly ${input.monthlyCap ?? 'unset'}, per-tx ${input.perTransactionCap ?? 'unset'}, allowlist ${JSON.stringify(input.merchantAllowlist ?? [])}, allowNewVendors ${input.allowNewVendors === true}. Instructions: """${input.instructions.slice(0, 3000)}""" Reply with JSON only.`;
    let meta: Record<string, unknown>;
    try {
      meta = await parseWithModel(ai as never, SETUP_PRIMARY_MODEL, prompt);
    } catch {
      logger.warn(`Agent setup model ${SETUP_PRIMARY_MODEL} failed; falling back to ${SETUP_FALLBACK_MODEL}`, {});
      meta = await parseWithModel(ai as never, SETUP_FALLBACK_MODEL, prompt);
    }
    return { meta, flags: (meta.flags_for_review as string[]) ?? [] };
  } catch (err) {
    logger.warn('Gemini setup parse failed; creating agent without meta', { err });
    return null;
  }
}

const rowToApi = (a: Record<string, unknown>, policy: Record<string, unknown> | null) => ({
  id: a.id,
  name: a.name,
  description: a.description ?? null,
  status: a.status,
  avatar_style: a.avatar_style ?? null,
  created_at: a.created_at,
  policy: policy
    ? {
        monthly_cap: Number(policy.monthly_cap),
        per_transaction_cap: Number(policy.per_transaction_cap),
        limit_period: policy.limit_period,
        merchant_allowlist: policy.merchant_allowlist ?? [],
        merchant_types: policy.merchant_types ?? [],
        allow_new_vendors: policy.allow_new_vendors === true,
        requires_approval_above: Number(policy.requires_approval_above),
      }
    : null,
});

router.get('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .in('owner_user_id', ownerScope(identity))
    .in('workspace_id', workspaceScope(identity))
    .order('created_at');
  if (error) throw error;
  const ids = (data ?? []).map((a) => a.id);
  const { data: policies } = ids.length
    ? await supabase.from('spend_policies').select('*').in('agent_id', ids)
    : { data: [] };
  const byAgent = new Map((policies ?? []).map((p) => [p.agent_id, p]));
  return res.json({ success: true, data: (data ?? []).map((a) => rowToApi(a, byAgent.get(a.id) ?? null)) });
}));

router.post('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const wsId = identity.workspaceId;
  const b = req.body ?? {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'name is required' });
  const instructions: string | undefined = b.instructions ?? b.description;
  const allowlist: string[] = b.merchant_allowlist ?? [];

  const parsed = instructions
    ? await parseInstructionsOnce({
        instructions,
        monthlyCap: b.monthly_cap,
        perTransactionCap: b.per_transaction_cap,
        merchantAllowlist: allowlist,
        allowNewVendors: b.allow_new_vendors === true,
      })
    : null;
  if (parsed && parsed.flags.length > 0 && b.confirm_flags_reviewed !== true) {
    return res.json({ success: true, data: { status: 'needs_review', ...(parsed.meta as object) } });
  }

  const { data: agent, error } = await supabase
    .from('agents')
    .insert({
      owner_user_id: identity.internalId,
      workspace_id: wsId,
      name: b.name.trim().slice(0, 120),
      description: instructions?.slice(0, 4000) ?? null,
      avatar_style: b.avatar_style ?? 0,
      parsed_instructions_meta: parsed?.meta ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  const { data: policy } = await supabase
    .from('spend_policies')
    .insert({
      agent_id: agent.id,
      monthly_cap: b.monthly_cap ?? 0,
      per_transaction_cap: b.per_transaction_cap ?? 0,
      limit_period: b.limit_period ?? 'MONTHLY',
      merchant_allowlist: allowlist,
      merchant_types: b.merchant_types ?? [],
      allow_new_vendors: b.allow_new_vendors === true,
      requires_approval_above: b.requires_approval_above ?? b.per_transaction_cap ?? 0,
    })
    .select('*')
    .single();

  return res.status(201).json({ success: true, data: rowToApi(agent, policy) });
}));

router.patch('/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const b = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (b.name !== undefined) updates.name = String(b.name).slice(0, 120);
  if (b.status !== undefined) {
    if (!['ACTIVE', 'SUSPENDED', 'REVOKED'].includes(b.status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    updates.status = b.status;
  }
  if (b.avatar_style !== undefined) updates.avatar_style = b.avatar_style;
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', req.params.id)
    .in('owner_user_id', ownerScope(identity))
    .select('*')
    .single();
  if (error) throw error;

  if (b.policy) {
    const p = b.policy;
    await supabase
      .from('spend_policies')
      .update({
        monthly_cap: p.monthly_cap,
        per_transaction_cap: p.per_transaction_cap,
        limit_period: p.limit_period,
        merchant_allowlist: p.merchant_allowlist,
        merchant_types: p.merchant_types,
        allow_new_vendors: p.allow_new_vendors,
        requires_approval_above: p.requires_approval_above,
        updated_at: new Date().toISOString(),
      })
      .eq('agent_id', req.params.id);
  }
  const { data: policy } = await supabase
    .from('spend_policies')
    .select('*')
    .eq('agent_id', req.params.id)
    .single();
  return res.json({ success: true, data: rowToApi(data, policy) });
}));

export default router;
