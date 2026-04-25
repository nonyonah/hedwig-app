export type AnchorPosition = 'top' | 'center' | 'bottom';

export interface TutorialStep {
    id: string;
    /** Which screen this step is shown on.  */
    screenId: 'home' | 'invoices' | 'links' | 'wallet' | 'insights' | 'transactions' | 'withdrawals' | 'projects' | 'clients' | 'settings';
    title: string;
    body: string;
    anchorPosition: AnchorPosition;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'home_activity',
        screenId: 'home',
        title: 'Your activity at a glance',
        body: 'This is your home screen. Overdue invoices, active projects, and upcoming deadlines all surface here automatically.',
        anchorPosition: 'center',
    },
    {
        id: 'home_fab',
        screenId: 'home',
        title: 'Create anything with +',
        body: 'Tap the blue + button to create invoices, payment links, contracts, or send tokens — all from one place.',
        anchorPosition: 'bottom',
    },
    {
        id: 'invoices_intro',
        screenId: 'invoices',
        title: 'Send invoices, get paid faster',
        body: 'Create professional invoices in seconds. Track their status from sent to paid, all in one place.',
        anchorPosition: 'top',
    },
    {
        id: 'links_intro',
        screenId: 'links',
        title: 'Payment links for quick requests',
        body: 'Generate a payment link and share it anywhere — no invoice needed. Perfect for one-off payments.',
        anchorPosition: 'top',
    },
    {
        id: 'wallet_intro',
        screenId: 'wallet',
        title: 'Your embedded wallet',
        body: 'Your crypto wallet is built right in. Send, receive, and off-ramp funds to your bank without leaving the app.',
        anchorPosition: 'center',
    },
    {
        id: 'insights_intro',
        screenId: 'insights',
        title: 'Track your performance trends',
        body: 'Insights summarizes earnings, invoice performance, and client activity so you can spot what needs attention fast.',
        anchorPosition: 'center',
    },
    {
        id: 'transactions_intro',
        screenId: 'transactions',
        title: 'Review all wallet activity',
        body: 'Use Transactions to monitor incoming and outgoing payments, then open any entry to copy details or view on-chain.',
        anchorPosition: 'center',
    },
    {
        id: 'withdrawals_intro',
        screenId: 'withdrawals',
        title: 'Follow every withdrawal status',
        body: 'Withdrawals shows each off-ramp order from pending to completed so you can confirm settlement at a glance.',
        anchorPosition: 'center',
    },
    {
        id: 'projects_intro',
        screenId: 'projects',
        title: 'Manage projects and milestones',
        body: 'Projects helps you track deliverables, progress, and invoice-ready milestones from start to completion.',
        anchorPosition: 'center',
    },
    {
        id: 'clients_intro',
        screenId: 'clients',
        title: 'Keep client records organized',
        body: 'Clients stores contact info and earnings history so you can manage relationships and billing in one place.',
        anchorPosition: 'center',
    },
    {
        id: 'settings_intro',
        screenId: 'settings',
        title: "You're all set",
        body: 'Head to Settings anytime to update your theme, notifications, or replay this tutorial.',
        anchorPosition: 'bottom',
    },
];

export const TOTAL_STEPS = TUTORIAL_STEPS.length;
