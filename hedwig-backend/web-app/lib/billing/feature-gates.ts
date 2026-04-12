import type { BillingStatusSummary } from '@/lib/api/client';

export type ProFeature =
  | 'assistant_summary_advanced'
  | 'recurring_invoice_automation'
  | 'tax_summary';

export const PRO_FEATURE_LABELS: Record<ProFeature, string> = {
  assistant_summary_advanced: 'Assistant summary',
  recurring_invoice_automation: 'Recurring invoice automation',
  tax_summary: 'Tax summaries',
};

export function isProPlan(billing: BillingStatusSummary | null | undefined): boolean {
  if (!billing) return false;
  return billing.plan === 'pro' || Boolean(billing.entitlement?.isActive);
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
    case 'tax_summary':
      return true;
    default:
      return false;
  }
}
