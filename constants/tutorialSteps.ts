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
        id: 'intro_invoices',
        screenId: 'home',
        title: 'Invoices',
        body: 'Create client-ready invoices with an amount, due date, and client email. Hedwig sends the invoice automatically when it is ready.',
        anchorPosition: 'center',
    },
    {
        id: 'intro_payment_links',
        screenId: 'home',
        title: 'Payment links',
        body: 'Create a quick payment request for one-off work, deposits, retainers, or small follow-ups without building a full invoice.',
        anchorPosition: 'center',
    },
    {
        id: 'intro_clients',
        screenId: 'home',
        title: 'Clients',
        body: 'Keep client details, invoices, payment links, projects, and payment history tied together from the first request.',
        anchorPosition: 'center',
    },
    {
        id: 'intro_receive_payments',
        screenId: 'home',
        title: 'Receive payments',
        body: 'Get paid into your Hedwig wallet, track incoming payments, and see what is paid, pending, or overdue.',
        anchorPosition: 'center',
    },
    {
        id: 'intro_send_to_bank',
        screenId: 'home',
        title: 'Send to bank account',
        body: 'Move available funds from Hedwig to your bank account when you are ready to cash out.',
        anchorPosition: 'bottom',
    },
];

export const TOTAL_STEPS = TUTORIAL_STEPS.length;
