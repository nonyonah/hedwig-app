/**
 * Stacks Wallet Service
 * 
 * Handles Stacks (Bitcoin L2) wallet generation, storage, and transactions.
 * Uses expo-secure-store for secure seed phrase storage.
 */

import * as SecureStore from 'expo-secure-store';
import { generateSecretKey, generateWallet, getStxAddress } from '@stacks/wallet-sdk';
import { STACKS_TESTNET } from '@stacks/network';

// Secure storage keys
const STACKS_SEED_KEY = 'hedwig_stacks_seed';
const STACKS_ADDRESS_KEY = 'hedwig_stacks_address';

// Network configuration - using testnet
const STACKS_NETWORK = STACKS_TESTNET;

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
 * 
 * OPTIMIZED: Uses direct derivation without PBKDF2 password hashing
 * to significantly speed up wallet generation on mobile devices
 */
export async function generateStacksWallet(): Promise<StacksWalletInfo | null> {
    try {
        const startTime = Date.now();
        console.log('[StacksWallet] Generating new wallet...');

        // Generate a new 24-word seed phrase (this is fast)
        console.log('[StacksWallet] 1. Calling generateSecretKey...');
        const secretKey = generateSecretKey(256);
        console.log('[StacksWallet] 2. generateSecretKey done. Secret key length:', secretKey.length);

        // OPTIMIZATION: Do NOT provide a password.
        // Providing any password (even empty string) triggers encryption which uses Scrypt.
        // Scrypt is extremely slow on React Native (Hermes).
        // We store the secretKey securely in Expo SecureStore anyway, so we don't need
        // the Wallet object itself to be encrypted in memory.
        console.log('[StacksWallet] 3. Calling generateWallet...');
        const wallet = await generateWallet({
            secretKey,
        } as any);
        console.log('[StacksWallet] 4. generateWallet done.');

        // Get the first account's address
        const account = wallet.accounts[0];
        const address = getStxAddress(account, 'testnet');

        // Store seed phrase securely (never exposed to user)
        // Use background storage to not block UI
        SecureStore.setItemAsync(STACKS_SEED_KEY, secretKey, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }).catch(err => console.error('[StacksWallet] Error storing seed:', err));

        // Store address for quick access (prioritize this)
        await SecureStore.setItemAsync(STACKS_ADDRESS_KEY, address);

        const elapsed = Date.now() - startTime;
        console.log(`[StacksWallet] Wallet created in ${elapsed}ms with address:`, address);

        return {
            address,
            publicKey: (account as any).stxPublicKey,
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
        } as any);

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
