// Automatically push USDC from the Privy EOA into the unified Gateway
// balance after an onramp order settles. Idempotent per-order — we persist
// "already deposited" markers in AsyncStorage so the deposit dance only
// runs once even if the user reopens the order screen.

import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEmbeddedEthereumWallet, useEmbeddedSolanaWallet } from '@privy-io/expo';
import { depositSolanaToGateway, depositToGateway } from '../lib/gateway';
import type { GatewayChainKey, GatewayEvmChainKey } from '../lib/gateway/constants';
import type { OnrampOrder } from './useOnramp';

const STORAGE_PREFIX = '@hedwig/onramp_auto_deposit:';

const chainFromOrderChain = (chain: string | null | undefined): GatewayChainKey | null => {
    const c = String(chain ?? '').toLowerCase();
    if (c === 'base' || c === 'arbitrum' || c === 'polygon') return c;
    if (c === 'solana' || c === 'solana_devnet' || c === 'solana devnet') return 'solana';
    return null;
};

export type OnrampAutoDepositStatus =
    | 'idle'
    | 'eligible'
    | 'depositing'
    | 'completed'
    | 'failed'
    | 'unsupported';

export interface OnrampAutoDepositState {
    status: OnrampAutoDepositStatus;
    error: string | null;
    statusLabel: string | null;
    /** Manually retry — useful when the auto-attempt failed (e.g. no gas). */
    retry: () => Promise<void>;
}

/**
 * Watches the given onramp order and, on COMPLETED, calls Gateway's
 * approve+deposit pair from the user's Privy embedded EOA. Deposits a
 * second time are skipped via an AsyncStorage marker keyed on order id.
 */
export const useOnrampAutoDeposit = (
    order: OnrampOrder | null,
    options: { enabled?: boolean } = {}
): OnrampAutoDepositState => {
    const { enabled = true } = options;
    const ethereumWallet = useEmbeddedEthereumWallet();
    const solanaWallet = useEmbeddedSolanaWallet();
    const [status, setStatus] = useState<OnrampAutoDepositStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [statusLabel, setStatusLabel] = useState<string | null>(null);
    const triggeredRef = useRef<string | null>(null);

    const runDeposit = async () => {
        if (!order) return;
        const chainKey = chainFromOrderChain(order.chain);
        if (!chainKey) {
            setStatus('unsupported');
            return;
        }
        const cryptoAmount = Number(order.cryptoAmount ?? 0);
        if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
            setStatus('idle');
            return;
        }

        const storageKey = STORAGE_PREFIX + order.id;
        const existing = await AsyncStorage.getItem(storageKey);
        if (existing === 'done') {
            setStatus('completed');
            return;
        }

        const wallets = chainKey === 'solana'
            ? ((solanaWallet as any)?.wallets || [])
            : ((ethereumWallet as any)?.wallets || []);
        if (wallets.length === 0) {
            setStatus('failed');
            setError(chainKey === 'solana'
                ? 'No Solana wallet available — open the app to retry.'
                : 'No EVM wallet available — open the app to retry.');
            return;
        }

        try {
            setStatus('depositing');
            setError(null);
            const subunits = BigInt(Math.floor(cryptoAmount * 1_000_000));
            const evmProvider = chainKey === 'solana' ? null : await wallets[0].getProvider();
            if (chainKey !== 'solana' && !evmProvider) throw new Error('Wallet provider not ready');
            const result = chainKey === 'solana'
                ? await depositSolanaToGateway({
                    wallet: wallets[0],
                    amountSubunits: subunits,
                    onStatus: (label) => setStatusLabel(label),
                })
                : await depositToGateway({
                    chainKey: chainKey as GatewayEvmChainKey,
                    eip1193Provider: evmProvider,
                    amountSubunits: subunits,
                    onStatus: (label) => setStatusLabel(label),
                });

            await AsyncStorage.setItem(storageKey, 'done');
            setStatus('completed');
            setStatusLabel(`Deposit tx ${result.depositTxHash.slice(0, 10)}…`);
        } catch (err: any) {
            setStatus('failed');
            const message = err?.message || 'Auto-deposit failed';
            // Privy/viem surfaces "insufficient funds" when no native gas. We
            // do NOT mark the order as completed in that case so the user can
            // retry manually after topping up gas.
            setError(message);
        }
    };

    useEffect(() => {
        if (!enabled) return;
        if (!order) return;
        if (order.status !== 'COMPLETED') {
            setStatus(order.status === 'FAILED' || order.status === 'CANCELLED' ? 'unsupported' : 'idle');
            return;
        }
        // Eligible — run once per order id.
        if (triggeredRef.current === order.id) return;
        triggeredRef.current = order.id;
        setStatus('eligible');
        void runDeposit();
    }, [enabled, order?.id, order?.status]);

    return { status, error, statusLabel, retry: runDeposit };
};
