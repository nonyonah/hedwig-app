import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './useAuth';

interface Balance {
    chain: string;
    asset: string;
    raw_value: string;
    display_values: {
        token: string;
        usd: string;
    };
}

interface WalletData {
    balances: Balance[];
    address: string | null;
}

// Web mock
const useWalletWeb = () => ({
    balances: [],
    address: null,
    isLoading: false,
    error: null,
    fetchBalances: async () => {},
    createAddress: async () => null,
    getUsdcBalance: () => '0',
    getTotalUsd: () => '0',
});

export const useWallet = () => {
    const [balances, setBalances] = useState<Balance[]>([]);
    const [address, setAddress] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { getAccessToken } = useAuth();

    // Use web mock on web platform
    if (Platform.OS === 'web') {
        return useWalletWeb();
    }

    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

    // Fetch wallet balances from backend
    const fetchBalances = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const token = await getAccessToken();
            if (!token) {
                setError('Not authenticated');
                return;
            }

            const response = await fetch(`${apiUrl}/api/wallet/balance`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch balances');
            }

            const data = await response.json();
            
            if (data.success) {
                setBalances(data.data.balances || []);
                setAddress(data.data.address || null);
            } else {
                throw new Error(data.error || 'Failed to fetch balances');
            }
        } catch (err) {
            console.error('Fetch balances error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, [getAccessToken, apiUrl]);

    // Create or get deposit address
    const createAddress = useCallback(async (): Promise<string | null> => {
        try {
            const token = await getAccessToken();
            if (!token) {
                setError('Not authenticated');
                return null;
            }

            const response = await fetch(`${apiUrl}/api/wallet/address`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to get address');
            }

            const data = await response.json();
            
            if (data.success && data.data.address) {
                setAddress(data.data.address);
                return data.data.address;
            }
            
            return null;
        } catch (err) {
            console.error('Create address error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
            return null;
        }
    }, [getAccessToken, apiUrl]);

    // Get USDC balance specifically (most common use case)
    const getUsdcBalance = useCallback((): string => {
        const usdcBalance = balances.find(
            b => b.chain === 'base' && b.asset === 'usdc'
        );
        return usdcBalance?.display_values?.token || '0';
    }, [balances]);

    // Get total balance in USD
    const getTotalUsd = useCallback((): string => {
        let total = 0;
        for (const balance of balances) {
            const usd = parseFloat(balance.display_values?.usd || '0');
            if (!isNaN(usd)) {
                total += usd;
            }
        }
        return total.toFixed(2);
    }, [balances]);

    return {
        balances,
        address,
        isLoading,
        error,
        fetchBalances,
        createAddress,
        getUsdcBalance,
        getTotalUsd,
    };
};
