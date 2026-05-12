// Detects USDC sitting at the user's embedded EOA and silently moves it
// into Circle Gateway's unified balance. Mirrors useOnrampAutoDeposit but
// reacts to ambient EOA balance changes rather than a single onramp order.
//
// Idempotency: AsyncStorage marker per (chain, amount). Once we successfully
// deposit X USDC from a given chain, we won't retry that exact bucket — but
// if more USDC arrives later the new balance bucket will trigger a fresh
// deposit. This avoids a tight loop while still draining incoming funds.

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEmbeddedEthereumWallet, useEmbeddedSolanaWallet } from '@privy-io/expo';
import { depositSolanaToGateway, depositToGateway } from '../lib/gateway';
import type { GatewayChainKey, GatewayEvmChainKey } from '../lib/gateway/constants';

const STORAGE_PREFIX = '@hedwig/eoa_auto_deposit:';
const MIN_DEPOSIT_USDC = 0.05; // ignore dust below 5¢ to avoid burning gas on noise

export type EoaAutoDepositStatus = 'idle' | 'depositing' | 'completed' | 'failed';

export interface ChainAutoDepositState {
    chainKey: GatewayChainKey;
    status: EoaAutoDepositStatus;
    error: string | null;
}

export type EoaUsdcByChain = Partial<Record<GatewayChainKey, number>>;

interface Options {
    enabled?: boolean;
    onComplete?: (chainKey: GatewayChainKey) => void;
}

export const useEoaUsdcAutoDeposit = (
    eoaUsdcByChain: EoaUsdcByChain,
    options: Options = {}
): { perChain: Record<string, ChainAutoDepositState> } => {
    const { enabled = true, onComplete } = options;
    const ethereumWallet = useEmbeddedEthereumWallet();
    const solanaWallet = useEmbeddedSolanaWallet();
    const [perChain, setPerChain] = useState<Record<string, ChainAutoDepositState>>({});
    const inFlightRef = useRef<Set<string>>(new Set());

    const setChainStatus = useCallback((chainKey: GatewayChainKey, status: EoaAutoDepositStatus, error: string | null = null) => {
        setPerChain((prev) => ({ ...prev, [chainKey]: { chainKey, status, error } }));
    }, []);

    useEffect(() => {
        if (!enabled) return;
        const evmWallets = (ethereumWallet as any)?.wallets || [];
        const solanaWallets = (solanaWallet as any)?.wallets || [];

        const chainKeys: GatewayChainKey[] = ['base', 'arbitrum', 'polygon', 'solana'];

        chainKeys.forEach(async (chainKey) => {
            const balance = eoaUsdcByChain[chainKey] ?? 0;
            if (balance < MIN_DEPOSIT_USDC) return;
            if (chainKey === 'solana' ? solanaWallets.length === 0 : evmWallets.length === 0) return;

            // Bucket the amount to 6dp so identical balances aren't redeposited.
            const subunits = BigInt(Math.floor(balance * 1_000_000));
            const storageKey = STORAGE_PREFIX + `${chainKey}:${subunits.toString()}`;
            const existing = await AsyncStorage.getItem(storageKey);
            if (existing === 'done') return;
            if (inFlightRef.current.has(chainKey)) return;
            inFlightRef.current.add(chainKey);

            try {
                setChainStatus(chainKey, 'depositing');
                if (chainKey === 'solana') {
                    await depositSolanaToGateway({
                        wallet: solanaWallets[0],
                        amountSubunits: subunits,
                    });
                } else {
                    const provider = await evmWallets[0].getProvider();
                    if (!provider) throw new Error('Wallet provider not ready');

                    await depositToGateway({
                        chainKey: chainKey as GatewayEvmChainKey,
                        eip1193Provider: provider,
                        amountSubunits: subunits,
                    });
                }

                await AsyncStorage.setItem(storageKey, 'done');
                setChainStatus(chainKey, 'completed');
                if (onComplete) onComplete(chainKey);
            } catch (err: any) {
                setChainStatus(chainKey, 'failed', err?.message || 'Auto-deposit failed');
            } finally {
                inFlightRef.current.delete(chainKey);
            }
        });
        // We deliberately avoid depending on `setChainStatus`/`onComplete`
        // identity — only react when the underlying balance values change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        enabled,
        eoaUsdcByChain.base,
        eoaUsdcByChain.arbitrum,
        eoaUsdcByChain.polygon,
        eoaUsdcByChain.solana,
        ethereumWallet,
        solanaWallet,
    ]);

    return { perChain };
};
