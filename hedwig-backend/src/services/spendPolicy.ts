/**
 * Deterministic agent spend-policy engine (ported from Nche `policy.service.ts`).
 *
 * Pure functions only — no DB, no LLM. Enforcement reads `SpendPolicy` rows;
 * Gemini-style instruction parsing (agent-setup) never affects the decision.
 */

export type SpendLimitPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface PolicyLike {
  monthlyCap: number | string;
  perTransactionCap: number | string;
  limitPeriod?: SpendLimitPeriod | string | null;
  merchantAllowlist: string[];
  merchantTypes?: string[] | null;
  allowNewVendors?: boolean | null;
  requiresApprovalAbove: number | string;
}

export interface PolicyEvaluationInput {
  agentStatus: string;
  policy: PolicyLike | null;
  amount: number;
  merchantName: string | null;
  merchantType?: string | null;
  periodSpendSoFar: number;
}

export type PolicyDecision =
  | { decision: 'APPROVE'; reason: string }
  | { decision: 'HOLD'; reason: string }
  | { decision: 'DECLINE'; reason: string };

function normalizeMerchant(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function merchantMatches(allowlist: string[], candidate: string | null): boolean {
  if (!candidate) return false;
  const norm = normalizeMerchant(candidate);
  return allowlist.some((entry) => {
    const e = normalizeMerchant(entry);
    return e.length > 0 && (norm.includes(e) || e.includes(norm));
  });
}

/** UTC window for the policy's limit period. */
export function limitPeriodWindow(
  period: SpendLimitPeriod | string | null | undefined,
  now = new Date()
): { start: Date; end: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  switch (period) {
    case 'DAILY':
      return { start: new Date(Date.UTC(y, m, d)), end: new Date(Date.UTC(y, m, d + 1)) };
    case 'WEEKLY': {
      const weekday = now.getUTCDay();
      const sunday = new Date(Date.UTC(y, m, d - weekday));
      const nextSunday = new Date(sunday);
      nextSunday.setUTCDate(sunday.getUTCDate() + 7);
      return { start: sunday, end: nextSunday };
    }
    case 'YEARLY':
      return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y + 1, 0, 1)) };
    case 'MONTHLY':
    default:
      return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
  }
}

export function evaluateSpendPolicy(input: PolicyEvaluationInput): PolicyDecision {
  if (input.agentStatus === 'SUSPENDED' || input.agentStatus === 'REVOKED') {
    return { decision: 'DECLINE', reason: 'AGENT_NOT_ACTIVE' };
  }
  const { policy } = input;
  if (!policy) return { decision: 'DECLINE', reason: 'NO_POLICY_CONFIGURED' };

  const perTx = Number(policy.perTransactionCap);
  const cap = Number(policy.monthlyCap);
  const threshold = Number(policy.requiresApprovalAbove);

  if (policy.allowNewVendors !== true) {
    if (!merchantMatches(policy.merchantAllowlist, input.merchantName)) {
      return { decision: 'HOLD', reason: 'MERCHANT_NOT_IN_ALLOWLIST' };
    }
  }
  if (policy.merchantTypes && policy.merchantTypes.length > 0) {
    const allowed = policy.merchantTypes.map((t) => t.toLowerCase());
    const candidate = input.merchantType ? input.merchantType.toLowerCase() : null;
    if (!candidate || !allowed.includes(candidate)) {
      return { decision: 'HOLD', reason: 'MERCHANT_TYPE_NOT_ALLOWED' };
    }
  }
  if (input.amount > perTx) return { decision: 'HOLD', reason: 'PER_TRANSACTION_CAP_EXCEEDED' };
  if (input.periodSpendSoFar + input.amount > cap) {
    return { decision: 'HOLD', reason: 'PERIOD_CAP_EXCEEDED' };
  }
  if (input.amount > threshold) return { decision: 'HOLD', reason: 'ABOVE_APPROVAL_THRESHOLD' };
  return { decision: 'APPROVE', reason: 'WITHIN_POLICY' };
}

export function buildPolicySnapshot(
  policy: PolicyLike | null,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    monthly_cap: policy ? Number(policy.monthlyCap) : null,
    per_transaction_cap: policy ? Number(policy.perTransactionCap) : null,
    limit_period: policy?.limitPeriod ?? 'MONTHLY',
    requires_approval_above: policy ? Number(policy.requiresApprovalAbove) : null,
    merchant_allowlist: policy ? policy.merchantAllowlist : [],
    merchant_types: policy?.merchantTypes ?? [],
    allow_new_vendors: policy ? policy.allowNewVendors === true : false,
    captured_at: new Date().toISOString(),
    ...extra,
  };
}
