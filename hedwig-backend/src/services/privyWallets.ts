import { PrivyClient as PrivyNodeClient } from '@privy-io/node';
import { getPrivyAuthClient } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger('PrivyWallets');

export type PrivyWalletAddresses = {
    ethereum?: string | null;
    solana?: string | null;
};

let privyNodeClient: PrivyNodeClient | null = null;

function getPrivyNodeClient(): PrivyNodeClient {
    if (privyNodeClient) return privyNodeClient;

    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    if (!appId || !appSecret) {
        throw new AppError('Privy is not configured on the backend (missing PRIVY_APP_ID/PRIVY_APP_SECRET)', 500);
    }

    privyNodeClient = new PrivyNodeClient({ appId, appSecret });
    return privyNodeClient;
}

function looksLikeEvmAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

function looksLikeSolanaAddress(address: string): boolean {
    const normalized = address.trim();
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(normalized) && !looksLikeEvmAddress(normalized);
}

export function extractPrivyWalletAddresses(privyUser: any): PrivyWalletAddresses {
    const wallets: PrivyWalletAddresses = {};

    const linkedAccounts = Array.isArray(privyUser?.linkedAccounts)
        ? privyUser.linkedAccounts
        : (Array.isArray(privyUser?.linked_accounts) ? privyUser.linked_accounts : []);

    for (const account of linkedAccounts) {
        const address = typeof account?.address === 'string' ? account.address.trim() : '';
        if (!address) continue;

        const chainType = String(account?.chainType || account?.chain_type || '').toLowerCase();
        const type = String(account?.type || '').toLowerCase();
        const walletClientType = String(account?.walletClientType || account?.wallet_client_type || '').toLowerCase();

        if (type === 'smart_wallet') continue;

        if (!wallets.ethereum && type === 'wallet' && walletClientType === 'privy' && chainType === 'ethereum') {
            wallets.ethereum = address;
            continue;
        }

        if (!wallets.solana && type === 'wallet' && walletClientType === 'privy' && chainType === 'solana') {
            wallets.solana = address;
        }
    }

    const primaryWalletAddress = typeof privyUser?.wallet?.address === 'string'
        ? privyUser.wallet.address.trim()
        : '';
    if (!wallets.ethereum && looksLikeEvmAddress(primaryWalletAddress)) {
        wallets.ethereum = primaryWalletAddress;
    } else if (!wallets.solana && looksLikeSolanaAddress(primaryWalletAddress)) {
        wallets.solana = primaryWalletAddress;
    }

    for (const account of linkedAccounts) {
        const address = typeof account?.address === 'string' ? account.address.trim() : '';
        if (!address) continue;

        const chainType = String(account?.chainType || account?.chain_type || '').toLowerCase();
        const type = String(account?.type || '').toLowerCase();
        if (type === 'smart_wallet') continue;

        if (!wallets.ethereum && (chainType === 'ethereum' || chainType === 'evm' || type === 'ethereum' || looksLikeEvmAddress(address))) {
            wallets.ethereum = address;
            continue;
        }

        if (!wallets.solana && (chainType === 'solana' || type === 'solana' || looksLikeSolanaAddress(address))) {
            wallets.solana = address;
        }
    }

    return wallets;
}

export async function ensurePrivyEmbeddedWallets(
    privyId: string,
    desired: { ethereum?: boolean; solana?: boolean } = { ethereum: true, solana: true },
): Promise<PrivyWalletAddresses> {
    const authClient = getPrivyAuthClient();
    const existingUser = await authClient.getUser(privyId);
    const existingWallets = extractPrivyWalletAddresses(existingUser);

    const walletsToCreate: Array<{ chain_type: 'ethereum' | 'solana' }> = [];
    if (desired.ethereum !== false && !existingWallets.ethereum) {
        walletsToCreate.push({ chain_type: 'ethereum' });
    }
    if (desired.solana !== false && !existingWallets.solana) {
        walletsToCreate.push({ chain_type: 'solana' });
    }

    if (walletsToCreate.length === 0) {
        return existingWallets;
    }

    try {
        const pregeneratedUser = await getPrivyNodeClient()
            .users()
            .pregenerateWallets(privyId, { wallets: walletsToCreate });

        const wallets = extractPrivyWalletAddresses(pregeneratedUser);
        logger.info('Pregenerated missing Privy embedded wallets', {
            privyId,
            requestedChains: walletsToCreate.map((wallet) => wallet.chain_type),
            hasEthereum: Boolean(wallets.ethereum),
            hasSolana: Boolean(wallets.solana),
        });
        return wallets;
    } catch (error: any) {
        logger.error('Failed to pregenerate Privy embedded wallets', {
            privyId,
            requestedChains: walletsToCreate.map((wallet) => wallet.chain_type),
            error: error?.message || 'Unknown error',
        });
        throw error;
    }
}
