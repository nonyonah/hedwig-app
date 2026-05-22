export type AnchorPosition = 'top' | 'center' | 'bottom';

export interface TutorialStep {
    id: string;
    /** Which screen this step is shown on.  */
    screenId: 'home' | 'wallet' | 'settings';
    title: string;
    body: string;
    anchorPosition: AnchorPosition;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'intro_receive',
        screenId: 'home',
        title: 'Receive stablecoins',
        body: 'Get paid in USDC from clients, friends, or anywhere. Just share your wallet address or QR code.',
        anchorPosition: 'center',
    },
    {
        id: 'intro_send_to_bank',
        screenId: 'home',
        title: 'Send to bank account',
        body: 'Cash out your stablecoins directly to your bank account whenever you need them.',
        anchorPosition: 'center',
    },
    {
        id: 'intro_wallet_control',
        screenId: 'home',
        title: 'Your wallet, your control',
        body: 'Track every transaction, manage your tokens, and always know your balance — all in one place.',
        anchorPosition: 'bottom',
    },
];

export const TOTAL_STEPS = TUTORIAL_STEPS.length;
