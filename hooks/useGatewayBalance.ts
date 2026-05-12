import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './useAuth';
import { getApiBaseUrl } from '../utils/apiBaseUrl';

const POLL_INTERVAL_MS = 60_000;

export interface GatewayPerDomainBalance {
    domain: number;
    /** USDC subunits (6 decimals) as a base-10 string. */
    balance: string;
    pending?: string;
    depositor?: string;
}

export interface GatewayBalanceState {
    available: bigint;
    pending: bigint;
    perDomain: GatewayPerDomainBalance[];
    evmAddress: string | null;
    solanaAddress: string | null;
    testnet: boolean;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

const formatUsdc = (subunits: bigint): string => {
    const dollars = subunits / 1_000_000n;
    const cents = subunits % 1_000_000n;
    return `${dollars.toString()}.${cents.toString().padStart(6, '0').slice(0, 2)}`;
};

export const formatGatewayUsdc = (subunits: bigint): string => formatUsdc(subunits);

/**
 * Polls the backend `/api/gateway/balance` proxy and exposes a unified USDC
 * balance for the signed-in user. Per-domain liquidity is kept on the side
 * for diagnostics — never surface chain breakdowns in the user-facing UI.
 */
export const useGatewayBalance = (): GatewayBalanceState => {
    const { getAccessToken, isReady } = useAuth();
    const [available, setAvailable] = useState<bigint>(0n);
    const [pending, setPending] = useState<bigint>(0n);
    const [perDomain, setPerDomain] = useState<GatewayPerDomainBalance[]>([]);
    const [evmAddress, setEvmAddress] = useState<string | null>(null);
    const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
    const [testnet, setTestnet] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchOnce = useCallback(async () => {
        if (Platform.OS === 'web') return;
        setIsLoading(true);
        try {
            const token = await getAccessToken();
            if (!token) {
                setError('Not authenticated');
                return;
            }
            const base = getApiBaseUrl();
            const res = await fetch(`${base}/api/gateway/balance`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok || !data?.success) {
                throw new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
            }
            const payload = data.data ?? {};
            setAvailable(BigInt(payload.available ?? '0'));
            setPending(BigInt(payload.pending ?? '0'));
            setPerDomain(Array.isArray(payload.perDomain) ? payload.perDomain : []);
            setEvmAddress(payload.evmAddress ?? null);
            setSolanaAddress(payload.solanaAddress ?? null);
            setTestnet(Boolean(payload.testnet));
            setError(null);
        } catch (err: any) {
            setError(err?.message || 'Failed to load balance');
        } finally {
            setIsLoading(false);
        }
    }, [getAccessToken]);

    useEffect(() => {
        if (!isReady) return;
        fetchOnce();
        intervalRef.current = setInterval(fetchOnce, POLL_INTERVAL_MS);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isReady, fetchOnce]);

    return {
        available,
        pending,
        perDomain,
        evmAddress,
        solanaAddress,
        testnet,
        isLoading,
        error,
        refresh: fetchOnce,
    };
};
