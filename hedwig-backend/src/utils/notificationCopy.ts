type PaymentKind = 'invoice' | 'payment_link' | 'contract' | 'crypto';
type TransferSource = 'ach' | 'external_address' | 'unknown';
type OfframpStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

const formatMoney = (value: number, currency: string) => {
    if (!Number.isFinite(value)) return `0 ${currency}`;
    return `${value.toFixed(2)} ${currency}`;
};

export const buildUsdDepositCopy = (params: {
    grossUsd: number;
    usdcAmount: number;
    walletLabel: string;
    source?: TransferSource;
}) => {
    const sourceText =
        params.source === 'external_address'
            ? 'from an external address'
            : params.source === 'ach'
                ? 'via ACH'
                : 'into your USD account';

    return {
        title: 'USD deposit settled',
        body: `$${params.grossUsd.toFixed(2)} arrived ${sourceText}. ${params.usdcAmount.toFixed(2)} USDC was routed to your ${params.walletLabel.toLowerCase()}.`,
    };
};

export const buildOfframpCopy = (params: {
    status: OfframpStatus;
    fiatAmount: number;
    fiatCurrency: string;
    bankName: string;
    accountNumber?: string | null;
}) => {
    const masked = params.accountNumber ? `****${params.accountNumber.slice(-4)}` : '';
    const destination = [params.bankName, masked].filter(Boolean).join(' ');
    const amountText = formatMoney(params.fiatAmount, params.fiatCurrency);

    if (params.status === 'COMPLETED') {
        return {
            title: 'Cash is on the way',
            body: `${amountText} has been sent to ${destination}. Your withdrawal is complete.`,
        };
    }

    if (params.status === 'FAILED') {
        return {
            title: 'Withdrawal needs attention',
            body: `We could not complete your ${amountText} withdrawal to ${destination}. Please review it and try again.`,
        };
    }

    if (params.status === 'PROCESSING') {
        return {
            title: 'Withdrawal in motion',
            body: `Your ${amountText} withdrawal to ${destination} is now being processed.`,
        };
    }

    return {
        title: 'Withdrawal started',
        body: `Your ${amountText} withdrawal to ${destination} has been created and is waiting to be processed.`,
    };
};

export const buildIncomingPaymentCopy = (params: {
    kind: PaymentKind;
    clientOrSender: string;
    reference: string;
    amountText: string;
    networkLabel?: string;
}) => {
    if (params.kind === 'invoice') {
        return {
            title: 'Invoice paid',
            body: `${params.clientOrSender} paid ${params.reference}. ${params.amountText} is now in your wallet.`,
        };
    }

    if (params.kind === 'payment_link') {
        return {
            title: 'Payment link paid',
            body: `${params.clientOrSender} completed ${params.reference}. You received ${params.amountText}.`,
        };
    }

    if (params.kind === 'contract') {
        return {
            title: 'Contract payment received',
            body: `${params.clientOrSender} paid ${params.reference}. ${params.amountText} was received successfully.`,
        };
    }

    return {
        title: 'Crypto received',
        body: `You received ${params.amountText} from ${params.clientOrSender}${params.networkLabel ? ` on ${params.networkLabel}` : ''}.`,
    };
};
