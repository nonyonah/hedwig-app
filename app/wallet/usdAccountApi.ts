const normalizeApiUrl = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return '';

    if (/^https?:\/\/[^/]+/i.test(trimmed)) {
        return trimmed.replace(/\/$/, '');
    }

    // Handle common typo: "http:192.168.0.2:3000"
    if (/^https?:[^/]/i.test(trimmed)) {
        const fixed = trimmed.replace(/^https?:/i, (match) => `${match}//`);
        return fixed.replace(/\/$/, '');
    }

    return trimmed.replace(/\/$/, '');
};

const getApiUrl = (): string => normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000');

const getAuthHeaders = (token: string): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
});

export interface UsdAccountStatus {
    diditKycStatus: string;
    bridgeKycStatus: string;
    accountStatus: string;
    featureEnabled: boolean;
    sandboxMode?: boolean;
    settlementChain: string;
    settlementToken: string;
    feeConfig?: {
        feePercent: number;
        feeMin: number;
        feeMax: number;
    };
    balances?: {
        availableUsd?: number | string;
        availableUSD?: number | string;
        currentUsd?: number | string;
        currentUSD?: number | string;
    };
    availableBalanceUsd?: number | string;
    available_balance_usd?: number | string;
    accountBalanceUsd?: number | string;
    account_balance_usd?: number | string;
}

export interface UsdAccountDetails {
    bridgeCustomerId: string | null;
    bridgeVirtualAccountId: string | null;
    diditKycStatus: string;
    bridgeKycStatus: string;
    accountStatus: string;
    featureEnabled: boolean;
    sandboxMode?: boolean;
    ach: {
        bankName: string | null;
        accountName?: string | null;
        accountNumber?: string | null;
        accountNumberMasked: string | null;
        routingNumber?: string | null;
        routingNumberMasked: string | null;
        rail: string;
        currency: string;
        bankAddress?: string | null;
    };
    settlement: {
        chain: string;
        token: string;
        destination: string | null;
    };
    feeConfig?: {
        feePercent: number;
        feeMin: number;
        feeMax: number;
    };
    balances?: {
        availableUsd?: number | string;
        availableUSD?: number | string;
        currentUsd?: number | string;
        currentUSD?: number | string;
    };
    availableBalanceUsd?: number | string;
    available_balance_usd?: number | string;
    accountBalanceUsd?: number | string;
    account_balance_usd?: number | string;
    usdBalance?: number | string;
    usd_balance?: number | string;
}

export interface UsdTransfer {
    id: string;
    bridgeTransferId: string;
    sourceType?: 'ACH' | 'EXTERNAL_ADDRESS' | 'UNKNOWN';
    sourceLabel?: string;
    status: string;
    grossUsd: number;
    hedwigFeeUsd: number;
    providerFeeUsd: number;
    netUsd: number;
    usdcAmountSettled: number;
    usdcTxHash?: string | null;
    createdAt: string;
    completedAt?: string | null;
}

async function authedRequest(
    getAccessToken: () => Promise<string | null>,
    path: string,
    init?: RequestInit
) {
    const apiUrl = getApiUrl();
    try {
        // Validate URL once before requests to avoid silent network failures.
        // eslint-disable-next-line no-new
        new URL(apiUrl);
    } catch {
        throw new Error(`Invalid EXPO_PUBLIC_API_URL: "${apiUrl}"`);
    }

    if (__DEV__) {
        console.log('[USD Account API] Using base URL:', apiUrl);
    }

    const token = await getAccessToken();
    if (!token) {
        if (__DEV__) {
            console.warn(`[USD Account API] No auth token for ${path}`);
        }
        throw new Error('Not authenticated');
    }

    if (__DEV__) {
        console.log('[USD Account API] Request:', `${apiUrl}${path}`, init?.method || 'GET');
    }

    let response: Response;
    try {
        response = await fetch(`${apiUrl}${path}`, {
            ...(init || {}),
            headers: {
                ...getAuthHeaders(token),
                ...(init?.headers || {}),
            },
        });
    } catch (networkError: any) {
        if (__DEV__) {
            console.error('[USD Account API] Network error:', {
                path,
                apiUrl,
                message: networkError?.message || String(networkError),
            });
        }
        throw networkError;
    }

    const payload = await response.json().catch(() => null);
    if (__DEV__) {
        console.log('[USD Account API] Response:', path, response.status, payload?.success);
    }
    if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || `Request failed (${response.status})`);
    }
    return payload;
}

export async function getUsdAccountStatus(getAccessToken: () => Promise<string | null>): Promise<UsdAccountStatus> {
    const payload = await authedRequest(getAccessToken, '/api/usd-accounts/status');
    return payload.data as UsdAccountStatus;
}

export async function enrollUsdAccount(getAccessToken: () => Promise<string | null>): Promise<void> {
    await authedRequest(getAccessToken, '/api/usd-accounts/enroll', {
        method: 'POST',
        body: JSON.stringify({}),
    });
}

export async function createUsdKycLink(getAccessToken: () => Promise<string | null>): Promise<{ url: string; expiresAt?: string | null }> {
    const payload = await authedRequest(getAccessToken, '/api/usd-accounts/kyc-link', {
        method: 'POST',
        body: JSON.stringify({}),
    });
    return payload.data;
}

export async function getUsdAccountDetails(getAccessToken: () => Promise<string | null>): Promise<UsdAccountDetails> {
    const payload = await authedRequest(getAccessToken, '/api/usd-accounts/details');
    return payload.data as UsdAccountDetails;
}

export async function getUsdTransfers(getAccessToken: () => Promise<string | null>): Promise<UsdTransfer[]> {
    const payload = await authedRequest(getAccessToken, '/api/usd-accounts/transfers');
    const transfers = Array.isArray(payload?.data?.transfers) ? payload.data.transfers : [];
    return transfers as UsdTransfer[];
}

export async function updateUsdSettlement(
    getAccessToken: () => Promise<string | null>,
    chain: 'BASE' | 'SOLANA'
): Promise<{ settlement: { chain: string; token: string; destination: string | null } }> {
    const payload = await authedRequest(getAccessToken, '/api/usd-accounts/settlement', {
        method: 'PATCH',
        body: JSON.stringify({ chain }),
    });
    return payload.data;
}
