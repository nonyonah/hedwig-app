export const FREE_PLAN_LIMITS = {
  invoicesPerMonth: 10,
  paymentLinksPerMonth: 10,
  contractsPerMonth: 3,
} as const;

export const FREE_PLAN_FEATURES = [
  `Up to ${FREE_PLAN_LIMITS.invoicesPerMonth} invoices per month`,
  `Up to ${FREE_PLAN_LIMITS.paymentLinksPerMonth} payment links per month`,
  `Up to ${FREE_PLAN_LIMITS.contractsPerMonth} contracts per month`,
  'Clients, projects, expenses, and basic reporting',
  'Manual invoice reminders',
];

export const PRO_PLAN_FEATURES = [
  'Unlimited invoices, payment links, and contracts',
  'Hedwig Assistant with document uploads and approval actions',
  'Recurring invoice automation',
  'Automatic milestone invoice creation',
  'Advanced insights, assistant summaries, and tax planning views',
  'USD account access where available',
  'Priority product updates',
];

export const PLAN_COMPARISON_ROWS: Array<{ feature: string; free: string; pro: string }> = [
  { feature: 'Manual invoices', free: `${FREE_PLAN_LIMITS.invoicesPerMonth} / month`, pro: 'Unlimited' },
  { feature: 'Payment links', free: `${FREE_PLAN_LIMITS.paymentLinksPerMonth} / month`, pro: 'Unlimited' },
  { feature: 'Contracts', free: `${FREE_PLAN_LIMITS.contractsPerMonth} / month`, pro: 'Unlimited' },
  { feature: 'Clients, projects, and expenses', free: 'Included', pro: 'Included' },
  { feature: 'Manual reminders', free: 'Included', pro: 'Included' },
  { feature: 'Hedwig Assistant', free: 'Limited', pro: 'Full workspace actions' },
  { feature: 'Document uploads to assistant', free: '—', pro: 'Included' },
  { feature: 'Recurring invoices', free: '—', pro: 'Included' },
  { feature: 'Milestone invoice automation', free: '—', pro: 'Included' },
  { feature: 'Advanced insights and summaries', free: '—', pro: 'Included' },
  { feature: 'Tax planning views', free: '—', pro: 'Included' },
  { feature: 'USD account', free: '—', pro: 'Eligible markets' },
];
