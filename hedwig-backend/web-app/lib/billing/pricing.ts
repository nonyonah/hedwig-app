export const FREE_PLAN_LIMITS = {
  invoicesPerMonth: 10,
  paymentLinksPerMonth: 10,
  contractsPerMonth: 3,
} as const;

export const FREE_PLAN_FEATURES = [
  `Up to ${FREE_PLAN_LIMITS.invoicesPerMonth} invoices per month`,
  `Up to ${FREE_PLAN_LIMITS.paymentLinksPerMonth} payment links per month`,
  `Up to ${FREE_PLAN_LIMITS.contractsPerMonth} contracts per month`,
  'Clients, projects, and basic reporting',
];

export const PRO_PLAN_FEATURES = [
  'Unlimited invoices, payment links, and contracts',
  'Hedwig Assistant across dashboard and workflow surfaces',
  'Recurring invoice automation',
  'Automatic milestone invoice creation',
  'Priority product updates',
];

export const PLAN_COMPARISON_ROWS: Array<{ feature: string; free: string; pro: string }> = [
  { feature: 'Manual invoices', free: `${FREE_PLAN_LIMITS.invoicesPerMonth} / month`, pro: 'Unlimited' },
  { feature: 'Payment links', free: `${FREE_PLAN_LIMITS.paymentLinksPerMonth} / month`, pro: 'Unlimited' },
  { feature: 'Contracts', free: `${FREE_PLAN_LIMITS.contractsPerMonth} / month`, pro: 'Unlimited' },
  { feature: 'Clients and projects', free: 'Included', pro: 'Included' },
  { feature: 'Hedwig Assistant', free: '—', pro: 'Included' },
  { feature: 'Recurring invoices', free: '—', pro: 'Included' },
  { feature: 'Milestone invoice automation', free: '—', pro: 'Included' },
];
