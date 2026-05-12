import { useCallback } from 'react';
import { useAuth } from './useAuth';
import { joinApiUrl } from '../utils/apiBaseUrl';

export type CoinbasePayDirection = 'buy' | 'sell';

export interface CoinbasePaySessionInput {
    direction: CoinbasePayDirection;
    amount?: number;
    asset?: 'USDC';
    network?: string;
    fiatCurrency?: 'USD';
    country?: 'US';
    subdivision?: string;
}

export interface CoinbasePaySession {
    url: string;
    partnerUserRef: string;
    provider: 'coinbase';
    sessionId?: string;
    session?: CoinbasePayActivitySession;
    quote?: any;
}

export interface CoinbasePayActivitySession {
    id: string;
    direction: CoinbasePayDirection;
    provider: 'coinbase';
    partnerUserRef: string;
    coinbaseTransactionId: string | null;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    chain: string;
    token: 'USDC';
    walletAddress: string;
    txHash: string | null;
    fiatCurrency: 'USD';
    fiatAmount: number | null;
    cryptoAmount: number | null;
    exchangeRate: number | null;
    serviceFee: number | null;
    paymentMethod: string | null;
    launchUrl: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}

export const useCoinbasePay = () => {
    const { getAccessToken } = useAuth();

    const createSession = useCallback(async (input: CoinbasePaySessionInput): Promise<CoinbasePaySession> => {
        const token = await getAccessToken();
        const response = await fetch(joinApiUrl('/api/coinbase-pay/session'), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                asset: 'USDC',
                fiatCurrency: 'USD',
                country: 'US',
                ...input,
            }),
        });

        const body = await response.json().catch(() => null);
        if (!response.ok || body?.success === false) {
            const message = body?.error?.message || body?.error || `Request failed (${response.status})`;
            throw new Error(typeof message === 'string' ? message : 'Could not start Coinbase Pay');
        }

        return body?.data as CoinbasePaySession;
    }, [getAccessToken]);

    return { createSession };
};
