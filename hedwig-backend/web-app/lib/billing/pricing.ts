export const FREE_PLAN_LIMITS = {
  invoicesPerMonth: null as number | null,
  paymentLinksPerMonth: null as number | null,
  contractsPerMonth: null as number | null,
  bankAccounts: 1,
  revenueHistoryDays: 30,
} as const;

export const SUPPORTED_CRYPTO_CHAINS = [
  'Base',
  'Arbitrum',
  'Polygon',
  'Optimism',
  'Solana',
] as const;

const cryptoChainsLabel = SUPPORTED_CRYPTO_CHAINS.join(', ');

export const FREE_PLAN_FEATURES = [
  'Unlimited invoices, payment links, and contracts',
  `Stablecoin checkout on ${cryptoChainsLabel}`,
  '1 external payout bank account (NG, GH, US, or UK)',
  'Mark-as-paid with payment method and reference capture',
  'Clients, projects, expenses, and last-30-days revenue tracking',
  'Manual invoice reminders',
];

export const STARTER_PLAN_FEATURES = [
  'Everything in Free',
  'Full revenue history (no time limit)',
  'Recurring invoice automation',
  'Daily brief email',
  'Up to 3 payout bank accounts',
];

export const PRO_PLAN_FEATURES = [
  'Everything in Starter',
  'Unlimited payout bank accounts (multi-country)',
  'Hedwig AI assistant: chat with workspace context and smart suggestions',
  'AI document import: drag in invoices and contracts, OCR + auto-classification',
  'Automatic milestone invoice creation',
  'Gmail, Google Calendar, Drive, and Docs integrations',
  'Weekly summary email',
];

export type PlanId = 'free' | 'starter' | 'pro';

export const PLAN_COMPARISON_ROWS: Array<{ feature: string; free: string; starter: string; pro: string }> = [
  { feature: 'Invoices', free: 'Unlimited', starter: 'Unlimited', pro: 'Unlimited' },
  { feature: 'Payment links', free: 'Unlimited', starter: 'Unlimited', pro: 'Unlimited' },
  { feature: 'Contracts', free: 'Unlimited', starter: 'Unlimited', pro: 'Unlimited' },
  { feature: 'Creation Box (NL → invoice)', free: 'Included', starter: 'Included', pro: 'Included' },
  { feature: `Stablecoin checkout (${cryptoChainsLabel})`, free: 'Included', starter: 'Included', pro: 'Included' },
  { feature: 'Mark as paid (off-platform)', free: 'Included', starter: 'Included', pro: 'Included' },
  { feature: 'Clients, projects, expenses', free: 'Included', starter: 'Included', pro: 'Included' },
  { feature: 'Payout bank accounts', free: '1 account', starter: '3 accounts', pro: 'Unlimited multi-country' },
  { feature: 'Revenue history', free: 'Last 30 days', starter: 'Full history', pro: 'Full history' },
  { feature: 'Recurring invoices', free: '—', starter: 'Included', pro: 'Included' },
  { feature: 'Daily brief email', free: '—', starter: 'Included', pro: 'Included' },
  { feature: 'AI assistant chat', free: '—', starter: '—', pro: 'Included' },
  { feature: 'AI document import (OCR)', free: '—', starter: '—', pro: 'Included' },
  { feature: 'Milestone invoice automation', free: '—', starter: '—', pro: 'Included' },
  { feature: 'Gmail / Calendar / Drive / Docs', free: '—', starter: '—', pro: 'Included' },
  { feature: 'Weekly summary email', free: '—', starter: '—', pro: 'Included' },
];
