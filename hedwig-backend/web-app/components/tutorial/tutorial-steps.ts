export type WebScreenId =
  | 'dashboard'
  | 'clients'
  | 'projects'
  | 'contracts'
  | 'payments'
  | 'revenue'
  | 'insights'
  | 'calendar'
  | 'assistant'
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
    body: 'Dashboard brings together earnings, outstanding invoices, active projects, reminders, and your assistant summary so you can see what needs attention first.',
    position: 'center',
  },
  {
    id: 'assistant_intro',
    screenId: 'assistant',
    route: '/dashboard',
    title: 'Ask the Hedwig agent',
    body: 'Use the assistant to ask about clients, projects, paid and unpaid invoices, expenses, and documents. You can upload attachments, then approve any action before Hedwig creates, files, or syncs anything.',
    position: 'bottom',
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
    body: 'Create professional contracts for your projects, track review status, and keep client agreements attached to the workspace.',
    position: 'top',
  },
  {
    id: 'payments_intro',
    screenId: 'payments',
    route: '/payments',
    title: 'Invoices and payment links',
    body: 'Send invoices, create payment links, manage recurring invoices, and use native reminders for client follow-up. Imported paid invoices are kept for revenue bookkeeping.',
    position: 'top',
  },
  {
    id: 'revenue_intro',
    screenId: 'revenue',
    route: '/revenue',
    title: 'Revenue and expenses',
    body: 'Revenue tracks paid invoices, payment sources, expenses, transaction fees, and client or project breakdowns so the agent can answer everyday finance questions with live data.',
    position: 'center',
  },
  {
    id: 'insights_intro',
    screenId: 'insights',
    route: '/insights',
    title: 'Track your performance',
    body: 'Insights summarises earnings trends, invoice performance, top clients, tax hints, and assistant suggestions so you can spot what needs attention fast.',
    position: 'center',
  },
  {
    id: 'calendar_intro',
    screenId: 'calendar',
    route: '/calendar',
    title: 'Never miss a due date',
    body: 'Your calendar keeps invoices, reminders, milestones, project deadlines, and synced Google Calendar events in one planning timeline.',
    position: 'top',
  },
  {
    id: 'settings_intro',
    screenId: 'settings',
    route: '/settings',
    title: 'Connect tools and manage billing',
    body: 'Settings is where you update profile details, replay this walkthrough, connect Gmail, Calendar, Drive, and Docs, manage assistant notifications, and switch billing cadence.',
    position: 'bottom',
  },
];

export const WEB_TOTAL_STEPS = WEB_TUTORIAL_STEPS.length;
