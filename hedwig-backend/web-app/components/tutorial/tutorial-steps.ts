export type WebScreenId =
  | 'dashboard'
  | 'clients'
  | 'projects'
  | 'contracts'
  | 'payments'
  | 'wallet'
  | 'accounts'
  | 'insights'
  | 'calendar'
  | 'settings';

export interface WebTutorialStep {
  id: string;
  screenId: WebScreenId;
  route: string;
  title: string;
  body: string;
  position: 'top' | 'center' | 'bottom';
}

export const WEB_TUTORIAL_STEPS: WebTutorialStep[] = [
  {
    id: 'dashboard_intro',
    screenId: 'dashboard',
    route: '/dashboard',
    title: 'Your workspace at a glance',
    body: 'Dashboard surfaces your earnings, outstanding invoices, active projects, and wallet balance — everything you need to stay on top of your work.',
    position: 'center',
  },
  {
    id: 'clients_intro',
    screenId: 'clients',
    route: '/clients',
    title: 'Keep client records organised',
    body: 'Add clients and track their billing history, outstanding balances, and associated projects — all in one place.',
    position: 'top',
  },
  {
    id: 'projects_intro',
    screenId: 'projects',
    route: '/projects',
    title: 'Manage projects and milestones',
    body: 'Projects helps you track deliverables, progress, and invoice-ready milestones from start to completion.',
    position: 'top',
  },
  {
    id: 'contracts_intro',
    screenId: 'contracts',
    route: '/contracts',
    title: 'Generate and send contracts',
    body: 'Create professional contracts for your projects and send them to clients for review and approval — no separate tool needed.',
    position: 'top',
  },
  {
    id: 'payments_intro',
    screenId: 'payments',
    route: '/payments',
    title: 'Invoices and payment links',
    body: 'Send invoices or create a payment link for quick one-off requests. Track payment status from sent to paid in real time.',
    position: 'top',
  },
  {
    id: 'wallet_intro',
    screenId: 'wallet',
    route: '/wallet',
    title: 'Your embedded wallet',
    body: 'Your crypto wallet is built right in. View balances across Base and Solana, and send or receive USDC without leaving the app.',
    position: 'center',
  },
  {
    id: 'accounts_intro',
    screenId: 'accounts',
    route: '/accounts',
    title: 'USD account for bank transfers',
    body: 'Set up a virtual USD account to receive ACH and wire payments. Funds settle automatically to your wallet.',
    position: 'center',
  },
  {
    id: 'insights_intro',
    screenId: 'insights',
    route: '/insights',
    title: 'Track your performance',
    body: 'Insights summarises earnings trends, invoice performance, and top clients so you can spot what needs attention fast.',
    position: 'center',
  },
  {
    id: 'calendar_intro',
    screenId: 'calendar',
    route: '/calendar',
    title: 'Never miss a due date',
    body: 'Your calendar keeps upcoming invoices, reminders, and project milestones in one timeline for quick planning.',
    position: 'top',
  },
  {
    id: 'settings_intro',
    screenId: 'settings',
    route: '/settings',
    title: "You're all set",
    body: "Head to Settings anytime to update your profile or replay this walkthrough.",
    position: 'bottom',
  },
];

export const WEB_TOTAL_STEPS = WEB_TUTORIAL_STEPS.length;
