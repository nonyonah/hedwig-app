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
  return billing?.plan === 'pro';
}

export function isOnPaidPlan(billing: BillingStatusSummary | null | undefined): boolean {
  if (!billing) return false;
  return (billing.plan === 'starter' || billing.plan === 'pro') && billing.entitlement.isActive;
}

/**
 * Check if the user can use a specific Pro feature.
 * - assistant_summary_advanced: Pro only
 * - recurring_invoice_automation: Starter or Pro
 * - usd_account: Starter or Pro
 */
export function canUseFeature(
  feature: ProFeature,
  billing: BillingStatusSummary | null | undefined
): boolean {
  if (!billing) return false;
  if (!billing.entitlement.isActive) return false;

  switch (feature) {
    case 'assistant_summary_advanced':
      return billing.plan === 'pro';
    case 'recurring_invoice_automation':
      return billing.plan === 'starter' || billing.plan === 'pro';
    case 'usd_account':
      return billing.plan === 'starter' || billing.plan === 'pro';
    default:
      return false;
  }
}
