import type { BillingStatusSummary } from '@/lib/api/client';

export type ProFeature =
  | 'assistant_summary_advanced'
  | 'recurring_invoice_automation'
  | 'usd_account';

export const PRO_FEATURE_LABELS: Record<ProFeature, string> = {
  assistant_summary_advanced: 'Assistant summary',
  recurring_invoice_automation: 'Recurring invoice automation',
  usd_account: 'USD account',
};

export function isProPlan(billing: BillingStatusSummary | null | undefined): boolean {
  if (!billing) return false;
  return billing.plan === 'pro';
}

export function isOnPaidPlan(billing: BillingStatusSummary | null | undefined): boolean {
  if (!billing) return false;
  return billing.plan === 'starter' || billing.plan === 'pro' || Boolean(billing.entitlement?.isActive);
}

export function canUseFeature(
  feature: ProFeature,
  billing: BillingStatusSummary | null | undefined
): boolean {
  const isPro = isProPlan(billing);
  if (!isPro) return false;

  switch (feature) {
    case 'assistant_summary_advanced':
    case 'recurring_invoice_automation':
    case 'usd_account':
      return true;
    default:
      return false;
  }
}
