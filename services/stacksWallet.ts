/**
 * Stacks Wallet Service
 * 
 * Handles Stacks (Bitcoin L2) wallet generation, storage, and transactions.
 * Uses expo-secure-store for secure seed phrase storage.
 */

import * as SecureStore from 'expo-secure-store';
import { generateSecretKey, generateWallet, getStxAddress } from '@stacks/wallet-sdk';
import { StacksTestnet } from '@stacks/network';
import { TransactionVersion } from '@stacks/transactions';

// Secure storage keys
const STACKS_SEED_KEY = 'hedwig_stacks_seed';
const STACKS_ADDRESS_KEY = 'hedwig_stacks_address';

// Network configuration - using testnet
const STACKS_NETWORK = new StacksTestnet();
const TRANSACTION_VERSION = TransactionVersion.Testnet;

export interface StacksWalletInfo {
    address: string;
    publicKey?: string;
}

/**
 * Check if a Stacks wallet already exists
 */
export async function hasStacksWallet(): Promise<boolean> {
    try {
        const address = await SecureStore.getItemAsync(STACKS_ADDRESS_KEY);
        return !!address;
    } catch (error) {
        console.log('[StacksWallet] Error checking wallet existence:', error);
        return false;
    }
}

/**
 * Generate a new Stacks wallet and store it securely
 * Returns the wallet address (seed phrase is never exposed)
 */
export async function generateStacksWallet(): Promise<StacksWalletInfo | null> {
    try {
        console.log('[StacksWallet] Generating new wallet...');

        // Generate a new 24-word seed phrase
        const secretKey = generateSecretKey(256);

        // Create wallet from seed
        const wallet = await generateWallet({
            secretKey,
            password: '', // No additional password for embedded wallet
        });

        // Get the first account's address
        const account = wallet.accounts[0];
        const address = getStxAddress({
            account,
            transactionVersion: TRANSACTION_VERSION,
        });

        // Store seed phrase securely (never exposed to user)
        await SecureStore.setItemAsync(STACKS_SEED_KEY, secretKey, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });

        // Store address for quick access
        await SecureStore.setItemAsync(STACKS_ADDRESS_KEY, address);

        console.log('[StacksWallet] Wallet created with address:', address);

        return {
            address,
            publicKey: account.stxPublicKey,
        };
    } catch (error) {
        console.error('[StacksWallet] Error generating wallet:', error);
        return null;
    }
}

/**
 * Load existing Stacks wallet from secure storage
 * Returns null if no wallet exists
 */
export async function loadStacksWallet(): Promise<StacksWalletInfo | null> {
    try {
        const address = await SecureStore.getItemAsync(STACKS_ADDRESS_KEY);

        if (!address) {
            console.log('[StacksWallet] No existing wallet found');
            return null;
        }

        console.log('[StacksWallet] Loaded wallet address:', address);
        return { address };
    } catch (error) {
        console.error('[StacksWallet] Error loading wallet:', error);
        return null;
    }
}

/**
 * Get or create Stacks wallet
 * Auto-generates if doesn't exist
 */
export async function getOrCreateStacksWallet(): Promise<StacksWalletInfo | null> {
    try {
        // First try to load existing wallet
        const existing = await loadStacksWallet();
        if (existing) {
            return existing;
        }

        // No existing wallet, generate new one
        console.log('[StacksWallet] No existing wallet, generating new one...');
        return await generateStacksWallet();
    } catch (error) {
        console.error('[StacksWallet] Error in getOrCreateStacksWallet:', error);
        return null;
    }
}

/**
 * Get the wallet's secret key for signing (internal use only)
 * NEVER expose this to the UI
 */
async function getSecretKey(): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(STACKS_SEED_KEY);
    } catch (error) {
        console.error('[StacksWallet] Error getting secret key:', error);
        return null;
    }
}

/**
 * Get wallet account for signing transactions
 */
export async function getStacksAccount() {
    try {
        const secretKey = await getSecretKey();
        if (!secretKey) {
            console.log('[StacksWallet] No secret key found');
            return null;
        }

        const wallet = await generateWallet({
            secretKey,
            password: '',
        });

        return wallet.accounts[0];
    } catch (error) {
        console.error('[StacksWallet] Error getting account:', error);
        return null;
    }
}

/**
 * Get the Stacks network instance
 */
export function getStacksNetwork() {
    return STACKS_NETWORK;
}

/**
 * Delete the Stacks wallet (for logout/reset)
 */
export async function deleteStacksWallet(): Promise<boolean> {
    try {
        await SecureStore.deleteItemAsync(STACKS_SEED_KEY);
        await SecureStore.deleteItemAsync(STACKS_ADDRESS_KEY);
        console.log('[StacksWallet] Wallet deleted');
        return true;
    } catch (error) {
        console.error('[StacksWallet] Error deleting wallet:', error);
        return false;
    }
}

/**
 * Fetch STX balance from Stacks API
 */
export async function getSTXBalance(address: string): Promise<string> {
    try {
        const response = await fetch(
            `https://stacks-node-api.testnet.stacks.co/extended/v1/address/${address}/balances`
        );

        if (!response.ok) {
            throw new Error('Failed to fetch balance');
        }

        const data = await response.json();
        // Balance is in microSTX, convert to STX
        const balanceInMicroSTX = BigInt(data.stx?.balance || '0');
        const balanceInSTX = Number(balanceInMicroSTX) / 1_000_000;

        return balanceInSTX.toFixed(6);
    } catch (error) {
        console.error('[StacksWallet] Error fetching balance:', error);
        return '0';
    }
}
