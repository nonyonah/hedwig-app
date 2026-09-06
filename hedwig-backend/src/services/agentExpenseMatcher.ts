import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { evaluateSpendPolicy, buildPolicySnapshot, limitPeriodWindow } from './spendPolicy';

const logger = createLogger('AgentExpenseMatcher');

const AMOUNT_TOLERANCE_PCT = 0.2;

const fingerprintVendor = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Nche invoice auto-matching adapted to Hedwig's model.
 * Hedwig invoices are receivables; Nche's match-then-pay loop targets
 * payables — so the loop runs on EXPENSES instead:
 * vendor fingerprint vs past expenses → MATCHED / NEEDS_REVIEW / UNMATCHED,
 * then each agent policy is evaluated: APPROVE records the match silently,
 * HOLD creates an approval request. Never throws (fire-and-forget).
 */
export async function matchExpenseToAgents(expense: {
  id: string;
  user_id: string;
  /** Privy DID for tolerating legacy DID-keyed agent rows. */
  privy_user_id?: string | null;
  workspace_id?: string | null;
  amount: number | string;
  converted_amount_usd?: number | string | null;
  note?: string | null;
  category?: string | null;
}): Promise<void> {
  try {
    const vendor = (expense.note ?? '').trim();
    const fp = fingerprintVendor(vendor);
    const amountUsd = Number(expense.converted_amount_usd ?? expense.amount);

    let matchStatus = 'UNMATCHED';
    if (fp) {
      const { data: history } = await supabase
        .from('expenses')
        .select('amount,converted_amount_usd')
        .eq('user_id', expense.user_id)
        .neq('id', expense.id)
        .ilike('note', `%${vendor.slice(0, 40)}%`)
        .limit(20);
      const amounts = (history ?? []).map((h) => Number(h.converted_amount_usd ?? h.amount)).filter((n) => n > 0);
      if (amounts.length > 0) {
        const median = amounts.slice().sort((a, b) => a - b)[Math.floor(amounts.length / 2)];
        matchStatus = Math.abs(amountUsd - median) / (median || 1) > AMOUNT_TOLERANCE_PCT ? 'NEEDS_REVIEW' : 'MATCHED';
      }
    }

    const { data: agents } = await supabase
      .from('agents')
      .select('id,status')
      // Tolerate legacy rows keyed by Privy DID (pre-identity-fix writes).
      .in('owner_user_id', expense.privy_user_id && expense.privy_user_id !== expense.user_id
        ? [expense.user_id, expense.privy_user_id]
        : [expense.user_id])
      .eq('status', 'ACTIVE');
    if (!agents?.length) return;
    const { data: policies } = await supabase.from('spend_policies').select('*').in('agent_id', agents.map((a) => a.id));
    const byAgent = new Map((policies ?? []).map((p) => [p.agent_id, p]));

    for (const agent of agents) {
      const policy = byAgent.get(agent.id) ?? null;
      const window = limitPeriodWindow((policy?.limit_period as string) ?? 'MONTHLY');
      const { data: spend } = await supabase
        .from('financial_events')
        .select('amount_usd')
        .eq('user_id', expense.user_id)
        .eq('direction', 'out')
        .gte('occurred_at', window.start.toISOString())
        .lt('occurred_at', window.end.toISOString());
      const periodSpend = (spend ?? []).reduce((s, r) => s + Number(r.amount_usd ?? 0), 0);

      const evaluation = evaluateSpendPolicy({
        agentStatus: agent.status,
        policy: policy
          ? {
              monthlyCap: policy.monthly_cap,
              perTransactionCap: policy.per_transaction_cap,
              limitPeriod: policy.limit_period,
              merchantAllowlist: policy.merchant_allowlist ?? [],
              merchantTypes: policy.merchant_types ?? [],
              allowNewVendors: policy.allow_new_vendors,
              requiresApprovalAbove: policy.requires_approval_above,
            }
          : null,
        amount: amountUsd,
        merchantName: vendor || null,
        periodSpendSoFar: periodSpend,
      });

      if (evaluation.decision !== 'APPROVE' || matchStatus !== 'MATCHED') {
        await supabase.from('approval_requests').insert({
          user_id: expense.user_id,
          workspace_id: expense.workspace_id ?? null,
          type: 'TRANSACTION',
          agent_id: agent.id,
          source_type: 'EXPENSE_MATCH',
          source_reference: expense.id,
          merchant_name: vendor || expense.category || 'Expense',
          amount: amountUsd,
          currency: 'USD',
          reason: matchStatus !== 'MATCHED' ? `EXPENSE_${matchStatus}` : evaluation.reason,
          policy_snapshot: buildPolicySnapshot(policy ? {
            monthlyCap: policy.monthly_cap,
            perTransactionCap: policy.per_transaction_cap,
            limitPeriod: policy.limit_period,
            merchantAllowlist: policy.merchant_allowlist ?? [],
            merchantTypes: policy.merchant_types ?? [],
            allowNewVendors: policy.allow_new_vendors,
            requiresApprovalAbove: policy.requires_approval_above,
          } : null, { match_status: matchStatus, expense_id: expense.id }),
          status: 'PENDING',
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        });
      }
    }
  } catch (err) {
    logger.warn('agent expense matching failed', { err, expenseId: expense.id });
  }
}
