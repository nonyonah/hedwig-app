export type AnchorPosition = 'top' | 'center' | 'bottom';

export interface TutorialStep {
    id: string;
    /** Which screen this step is shown on.  */
    screenId: 'home' | 'invoices' | 'links' | 'wallet' | 'settings';
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
        id: 'settings_intro',
        screenId: 'settings',
        title: "You're all set",
        body: 'Head to Settings anytime to update your theme, notifications, or replay this tutorial.',
        anchorPosition: 'bottom',
    },
];

export const TOTAL_STEPS = TUTORIAL_STEPS.length;
