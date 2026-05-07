import { useCallback } from 'react';
import { useAuth } from './useAuth';
import { joinApiUrl } from '../utils/apiBaseUrl';

export type OnrampFiat = 'NGN' | 'KES' | 'TZS' | 'MWK' | 'UGX' | 'BRL';
export type OnrampNetwork = 'base' | 'polygon' | 'celo' | 'arbitrum';
export type OnrampToken = 'USDC';

export type OnrampStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface OnrampQuote {
    rate: string;
    fiatAmount: number;
    fiatCurrency: OnrampFiat;
    token: OnrampToken;
    network: OnrampNetwork;
    grossCryptoAmount: number;
    platformFee: number;
    netCryptoAmount: number;
}

export interface OnrampInstitution {
    code: string;
    name: string;
}

export interface OnrampOrder {
    id: string;
    paycrestOrderId: string;
    reference: string | null;
    status: OnrampStatus;
    chain: string;
    token: OnrampToken;
    cryptoAmount: number | null;
    recipientAddress: string;
    fiatCurrency: OnrampFiat;
    fiatAmount: number;
    exchangeRate: number | null;
    serviceFee: number | null;
    providerInstitution: string | null;
    providerAccountNumber: string | null;
    providerAccountName: string | null;
    providerAmountToTransfer: number | null;
    validUntil: string | null;
    refundInstitution: string | null;
    refundAccountNumber: string | null;
    refundAccountName: string | null;
    txHash: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}

interface CreateOrderInput {
    fiatAmount: number;
    fiatCurrency: OnrampFiat;
    token: OnrampToken;
    network: OnrampNetwork;
    refundAccount: {
        bankName: string;
        accountNumber: string;
        accountName: string;
    };
}

const DEMO_QUOTE = (input: { fiatAmount: number; fiatCurrency: OnrampFiat; token: OnrampToken; network: OnrampNetwork }): OnrampQuote => {
    const rateByCurrency: Record<OnrampFiat, number> = {
        NGN: 1650,
        KES: 129,
        TZS: 2588,
        MWK: 1740,
        UGX: 3731,
        BRL: 5,
    };
    const rate = rateByCurrency[input.fiatCurrency] ?? rateByCurrency.NGN;
    const grossCrypto = input.fiatAmount / rate;
    const platformFee = grossCrypto * 0.01;
    return {
        rate: String(rate),
        fiatAmount: input.fiatAmount,
        fiatCurrency: input.fiatCurrency,
        token: input.token,
        network: input.network,
        grossCryptoAmount: grossCrypto,
        platformFee,
        netCryptoAmount: grossCrypto - platformFee,
    };
};

const DEMO_INSTITUTIONS_NGN: OnrampInstitution[] = [
    { code: 'GTBINGLA', name: 'Guaranty Trust Bank' },
    { code: 'FBNINGLA', name: 'First Bank of Nigeria' },
    { code: 'OPAYNGPC', name: 'OPay' },
    { code: 'KUDANGPC', name: 'Kuda Bank' },
];

const DEMO_INSTITUTIONS_BY_CURRENCY: Record<OnrampFiat, OnrampInstitution[]> = {
    NGN: DEMO_INSTITUTIONS_NGN,
    KES: [
        { code: 'EQBLKENA', name: 'Equity Bank Kenya' },
        { code: 'KCBLKENX', name: 'KCB Bank Kenya' },
    ],
    TZS: [
        { code: 'NLCBTZTX', name: 'NMB Bank' },
        { code: 'CORUTZTZ', name: 'CRDB Bank' },
    ],
    MWK: [
        { code: 'NBMAMWMW', name: 'National Bank of Malawi' },
        { code: 'FDHFMWMW', name: 'FDH Bank' },
    ],
    UGX: [
        { code: 'SBICUGKX', name: 'Stanbic Bank Uganda' },
        { code: 'CENTUGKA', name: 'Centenary Bank' },
    ],
    BRL: [
        { code: 'BCOBBRSP', name: 'Banco do Brasil' },
        { code: 'ITAUBRSP', name: 'Itaú' },
    ],
};

const buildDemoOrder = (input: CreateOrderInput): OnrampOrder => {
    const quote = DEMO_QUOTE(input);
    const validUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    return {
        id: `onramp_demo_${Date.now()}`,
        paycrestOrderId: `paycrest_demo_${Date.now()}`,
        reference: `onramp-demo-${Date.now()}`,
        status: 'PENDING',
        chain: input.network.toUpperCase(),
        token: input.token,
        cryptoAmount: quote.netCryptoAmount,
        recipientAddress: '0xDEMO000000000000000000000000000000000001',
        fiatCurrency: input.fiatCurrency,
        fiatAmount: input.fiatAmount,
        exchangeRate: parseFloat(quote.rate),
        serviceFee: 0,
        providerInstitution: 'Wema Bank',
        providerAccountNumber: '9012345678',
        providerAccountName: 'Hedwig Demo Funding',
        providerAmountToTransfer: input.fiatAmount,
        validUntil,
        refundInstitution: input.refundAccount.bankName,
        refundAccountNumber: input.refundAccount.accountNumber,
        refundAccountName: input.refundAccount.accountName,
        txHash: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
    };
};

const apiCall = async (
    path: string,
    init: RequestInit,
    token: string | null
): Promise<any> => {
    const headers = new Headers(init.headers || {});
    headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(joinApiUrl(path), { ...init, headers });
    let body: any = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }

    if (!response.ok || (body && body.success === false)) {
        const message =
            (body && (body.error?.message || body.error || body.message)) ||
            `Request failed (${response.status})`;
        throw new Error(typeof message === 'string' ? message : 'Request failed');
    }

    return body?.data ?? body;
};

export const useOnramp = () => {
    const { getAccessToken, isDemo } = useAuth();

    const quote = useCallback(async (input: {
        fiatAmount: number;
        fiatCurrency: OnrampFiat;
        token: OnrampToken;
        network: OnrampNetwork;
    }): Promise<OnrampQuote> => {
        if (isDemo) return DEMO_QUOTE(input);
        const token = await getAccessToken();
        const params = new URLSearchParams({
            fiatAmount: String(input.fiatAmount),
            fiatCurrency: input.fiatCurrency,
            token: input.token,
            network: input.network,
        });
        return await apiCall(`/api/onramp/quote?${params.toString()}`, { method: 'GET' }, token);
    }, [getAccessToken, isDemo]);

    const listInstitutions = useCallback(async (currency: OnrampFiat): Promise<OnrampInstitution[]> => {
        if (isDemo) {
            return DEMO_INSTITUTIONS_BY_CURRENCY[currency] ?? DEMO_INSTITUTIONS_NGN;
        }
        const token = await getAccessToken();
        const params = new URLSearchParams({ currency });
        const data = await apiCall(`/api/onramp/institutions?${params.toString()}`, { method: 'GET' }, token);
        return (data?.banks ?? []) as OnrampInstitution[];
    }, [getAccessToken, isDemo]);

    const verifyAccount = useCallback(async (input: {
        bankName: string;
        accountNumber: string;
        currency: OnrampFiat;
    }): Promise<{ accountName: string; verified: boolean }> => {
        if (isDemo) {
            return { accountName: 'Demo Account Holder', verified: true };
        }
        const token = await getAccessToken();
        return await apiCall(`/api/onramp/verify-account`, {
            method: 'POST',
            body: JSON.stringify(input),
        }, token);
    }, [getAccessToken, isDemo]);

    const createOrder = useCallback(async (input: CreateOrderInput): Promise<OnrampOrder> => {
        if (isDemo) return buildDemoOrder(input);
        const token = await getAccessToken();
        const data = await apiCall(`/api/onramp/create`, {
            method: 'POST',
            body: JSON.stringify(input),
        }, token);
        return data.order as OnrampOrder;
    }, [getAccessToken, isDemo]);

    const getOrder = useCallback(async (id: string): Promise<OnrampOrder> => {
        if (isDemo) {
            return {
                ...buildDemoOrder({
                    fiatAmount: 50000,
                    fiatCurrency: 'NGN',
                    token: 'USDC',
                    network: 'base',
                    refundAccount: { bankName: 'Demo Bank', accountNumber: '0000000000', accountName: 'Demo' },
                }),
                id,
            };
        }
        const token = await getAccessToken();
        const data = await apiCall(`/api/onramp/orders/${encodeURIComponent(id)}`, { method: 'GET' }, token);
        return data.order as OnrampOrder;
    }, [getAccessToken, isDemo]);

    const listOrders = useCallback(async (): Promise<OnrampOrder[]> => {
        if (isDemo) return [];
        const token = await getAccessToken();
        const data = await apiCall(`/api/onramp/orders`, { method: 'GET' }, token);
        return (data?.orders ?? []) as OnrampOrder[];
    }, [getAccessToken, isDemo]);

    return { quote, listInstitutions, verifyAccount, createOrder, getOrder, listOrders };
};
