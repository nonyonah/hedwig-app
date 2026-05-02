export const FREE_PLAN_LIMITS = {
  invoicesPerMonth: 10,
  paymentLinksPerMonth: 10,
  contractsPerMonth: 3,
  bankAccounts: 1,
  revenueHistoryDays: 30,
} as const;

export const FREE_PLAN_FEATURES = [
  `Up to ${FREE_PLAN_LIMITS.invoicesPerMonth} invoices per month`,
  `Up to ${FREE_PLAN_LIMITS.paymentLinksPerMonth} payment links per month`,
  `Up to ${FREE_PLAN_LIMITS.contractsPerMonth} contracts per month`,
  'Crypto checkout on Base, Solana, Celo, Polygon, Arbitrum',
  '1 external payout bank account (NG, GH, US, or UK)',
  'Mark-as-paid with payment method and reference capture',
  'Clients, projects, expenses, and last-30-days revenue tracking',
  'Manual invoice reminders',
];

export const PRO_PLAN_FEATURES = [
  'Unlimited invoices, payment links, and contracts',
  'Unlimited payout bank accounts (multi-country, currency dropdown for clients)',
  'Hedwig AI assistant: chat with workspace context, Creation Box, suggestions',
  'AI document import: drag in invoices and contracts, OCR + auto-classification',
  'Daily brief and weekly summary emails',
  'Recurring invoice automation',
  'Automatic milestone invoice creation',
  'Gmail, Google Calendar, Drive, and Docs integrations',
  'Full revenue history, payment-source breakdown, and tax planning views',
  'Priority product updates',
];

export const PLAN_COMPARISON_ROWS: Array<{ feature: string; free: string; pro: string }> = [
  { feature: 'Invoices', free: `${FREE_PLAN_LIMITS.invoicesPerMonth} / month`, pro: 'Unlimited' },
  { feature: 'Payment links', free: `${FREE_PLAN_LIMITS.paymentLinksPerMonth} / month`, pro: 'Unlimited' },
  { feature: 'Contracts', free: `${FREE_PLAN_LIMITS.contractsPerMonth} / month`, pro: 'Unlimited' },
  { feature: 'Crypto checkout', free: 'Included', pro: 'Included' },
  { feature: 'Mark as paid (off-platform)', free: 'Included', pro: 'Included' },
  { feature: 'Payout bank accounts', free: `${FREE_PLAN_LIMITS.bankAccounts} account`, pro: 'Unlimited multi-country' },
  { feature: 'Clients, projects, expenses', free: 'Included', pro: 'Included' },
  { feature: 'Revenue history', free: `Last ${FREE_PLAN_LIMITS.revenueHistoryDays} days`, pro: 'Full history' },
  { feature: 'AI assistant chat', free: '—', pro: 'Included' },
  { feature: 'Creation Box (NL → invoice)', free: '—', pro: 'Included' },
  { feature: 'AI document import (OCR)', free: '—', pro: 'Included' },
  { feature: 'Daily brief + weekly summary', free: '—', pro: 'Included' },
  { feature: 'Smart suggestions engine', free: '—', pro: 'Included' },
  { feature: 'Gmail / Calendar / Drive / Docs', free: '—', pro: 'Included' },
  { feature: 'Recurring invoices', free: '—', pro: 'Included' },
  { feature: 'Milestone invoice automation', free: '—', pro: 'Included' },
  { feature: 'Tax planning views', free: '—', pro: 'Included' },
  { feature: 'Priority support', free: '—', pro: 'Included' },
];
