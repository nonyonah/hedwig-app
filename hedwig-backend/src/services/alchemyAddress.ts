import axios from 'axios';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('AlchemyAddress');

/**
 * AlchemyAddressService - Manages wallet addresses for Alchemy Address Activity webhooks
 * This allows automatic registration of new user wallets for real-time transaction notifications.
 */

interface AlchemyUpdateResponse {
    success: boolean;
    message?: string;
}

type EvmChain = 'base' | 'arbitrum' | 'optimism' | 'polygon' | 'celo';
type ChainRegistrationResult = Record<EvmChain | 'solana', boolean>;

type WalletRegistrationInput = {
    ethereum?: string | null;
    solana?: string | null;
};

class AlchemyAddressService {
    private baseUrl = 'https://dashboard.alchemy.com/api';
    private authToken: string;

    // Webhook IDs for different networks (set these in environment variables)
    private evmWebhookIds: Record<EvmChain, string>;
    private solanaWebhookId: string;

    constructor() {
        this.authToken = process.env.ALCHEMY_AUTH_TOKEN || '';
        this.evmWebhookIds = {
            base: process.env.ALCHEMY_BASE_WEBHOOK_ID || '',
            arbitrum: process.env.ALCHEMY_ARBITRUM_WEBHOOK_ID || '',
            optimism: process.env.ALCHEMY_OPTIMISM_WEBHOOK_ID || '',
            polygon: process.env.ALCHEMY_POLYGON_WEBHOOK_ID || '',
            celo: process.env.ALCHEMY_CELO_WEBHOOK_ID || '',
        };
        this.solanaWebhookId = process.env.ALCHEMY_SOLANA_WEBHOOK_ID || '';
    }

    private getConfiguredEvmWebhooks(): Array<{ chain: EvmChain; webhookId: string }> {
        return (Object.entries(this.evmWebhookIds) as Array<[EvmChain, string]>)
            .filter(([, webhookId]) => Boolean(webhookId))
            .map(([chain, webhookId]) => ({ chain, webhookId }));
    }

    private normalizeEvmAddress(address?: string | null): string | null {
        if (!address) return null;
        const trimmed = address.trim().toLowerCase();
        if (!trimmed) return null;
        if (!/^0x[a-f0-9]{40}$/.test(trimmed)) {
            return null;
        }
        return trimmed;
    }

    private normalizeSolanaAddress(address?: string | null): string | null {
        if (!address) return null;
        const trimmed = address.trim();
        return trimmed || null;
    }

    private splitIntoChunks<T>(items: T[], chunkSize: number): T[][] {
        const result: T[][] = [];
        for (let i = 0; i < items.length; i += chunkSize) {
            result.push(items.slice(i, i + chunkSize));
        }
        return result;
    }

    /**
     * Add addresses to an Alchemy Address Activity webhook
     */
    private async addAddressesToWebhook(webhookId: string, addresses: string[]): Promise<AlchemyUpdateResponse> {
        if (!this.authToken) {
            logger.warn('No ALCHEMY_AUTH_TOKEN set, skipping address registration');
            return { success: false, message: 'No auth token' };
        }

        if (!webhookId) {
            logger.warn('No webhook ID provided');
            return { success: false, message: 'No webhook ID' };
        }

        if (addresses.length === 0) {
            return { success: true, message: 'No addresses to add' };
        }

        try {
            await axios.patch(
                `${this.baseUrl}/update-webhook-addresses`,
                {
                    webhook_id: webhookId,
                    addresses_to_add: Array.from(new Set(addresses.filter(Boolean))),
                    addresses_to_remove: []
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Alchemy-Token': this.authToken
                    }
                }
            );

            logger.debug('Added addresses to webhook', { count: addresses.length });
            return { success: true };
        } catch (error: any) {
            const detail =
                error?.response?.data?.message ||
                error?.response?.data?.error ||
                error?.message ||
                'Unknown error';
            logger.error('Failed to add addresses', {
                error: detail,
                webhookId,
                attemptedCount: addresses.length,
            });
            return { success: false, message: detail };
        }
    }

    /**
     * Remove addresses from an Alchemy Address Activity webhook
     */
    private async removeAddressesFromWebhook(webhookId: string, addresses: string[]): Promise<AlchemyUpdateResponse> {
        if (!this.authToken || !webhookId || addresses.length === 0) {
            return { success: false, message: 'Missing required parameters' };
        }

        try {
            await axios.patch(
                `${this.baseUrl}/update-webhook-addresses`,
                {
                    webhook_id: webhookId,
                    addresses_to_add: [],
                    addresses_to_remove: addresses
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Alchemy-Token': this.authToken
                    }
                }
            );

            logger.debug('Removed addresses from webhook', { count: addresses.length });
            return { success: true };
        } catch (error: any) {
            const detail =
                error?.response?.data?.message ||
                error?.response?.data?.error ||
                error?.message ||
                'Unknown error';
            logger.error('Failed to remove addresses', {
                error: detail,
                webhookId,
                attemptedCount: addresses.length,
            });
            return { success: false, message: detail };
        }
    }

    /**
     * Register a user's wallet addresses with all appropriate Alchemy webhooks
     * Call this when a new user is created or when wallet addresses are updated
     */
    async registerUserWallets(wallets: WalletRegistrationInput): Promise<ChainRegistrationResult> {
        const results: ChainRegistrationResult = {
            base: false,
            arbitrum: false,
            optimism: false,
            polygon: false,
            celo: false,
            solana: false,
        };

        const evmAddress = this.normalizeEvmAddress(wallets.ethereum);
        const solanaAddress = this.normalizeSolanaAddress(wallets.solana);

        if (evmAddress) {
            for (const { chain, webhookId } of this.getConfiguredEvmWebhooks()) {
                const addResult = await this.addAddressesToWebhook(webhookId, [evmAddress]);
                results[chain] = addResult.success;
            }
        }

        if (solanaAddress && this.solanaWebhookId) {
            const solanaResult = await this.addAddressesToWebhook(this.solanaWebhookId, [solanaAddress]);
            results.solana = solanaResult.success;
        }

        logger.debug('Wallet registration results', {
            hasEvmAddress: Boolean(evmAddress),
            hasSolanaAddress: Boolean(solanaAddress),
            results,
        });
        return results;
    }

    /**
     * Unregister a user's wallet addresses from all webhooks
     * Call this when a user is deleted or wallet addresses are changed
     */
    async unregisterUserWallets(wallets: WalletRegistrationInput): Promise<void> {
        const evmAddress = this.normalizeEvmAddress(wallets.ethereum);
        const solanaAddress = this.normalizeSolanaAddress(wallets.solana);

        if (evmAddress) {
            for (const { webhookId } of this.getConfiguredEvmWebhooks()) {
                await this.removeAddressesFromWebhook(webhookId, [evmAddress]);
            }
        }

        if (solanaAddress && this.solanaWebhookId) {
            await this.removeAddressesFromWebhook(this.solanaWebhookId, [solanaAddress]);
        }
    }

    /**
     * Backfill all existing user wallets to all configured Alchemy webhooks.
     * Useful when enabling webhook support for newly added chains.
     */
    async syncAllExistingWalletAddresses(options?: { chunkSize?: number }) {
        const chunkSize = Math.max(1, Math.min(500, options?.chunkSize || 100));
        const evmWebhookTargets = this.getConfiguredEvmWebhooks();
        const summary = {
            scannedUsers: 0,
            uniqueEvmAddresses: 0,
            uniqueSolanaAddresses: 0,
            configuredEvmChains: evmWebhookTargets.map((item) => item.chain),
            solanaWebhookConfigured: Boolean(this.solanaWebhookId),
            chainResults: {
                base: { attempted: 0, succeeded: 0 },
                arbitrum: { attempted: 0, succeeded: 0 },
                optimism: { attempted: 0, succeeded: 0 },
                polygon: { attempted: 0, succeeded: 0 },
                celo: { attempted: 0, succeeded: 0 },
                solana: { attempted: 0, succeeded: 0 },
            },
        };

        const { data: users, error } = await supabase
            .from('users')
            .select('id, ethereum_wallet_address, solana_wallet_address')
            .order('created_at', { ascending: true })
            .limit(200000);

        if (error) {
            throw new Error(`Failed to fetch users for Alchemy webhook sync: ${error.message}`);
        }

        const rows = users || [];
        summary.scannedUsers = rows.length;

        const evmAddresses = Array.from(
            new Set(
                rows
                    .map((row: any) => this.normalizeEvmAddress(row.ethereum_wallet_address))
                    .filter((value): value is string => Boolean(value))
            )
        );
        const solanaAddresses = Array.from(
            new Set(
                rows
                    .map((row: any) => this.normalizeSolanaAddress(row.solana_wallet_address))
                    .filter((value): value is string => Boolean(value))
            )
        );

        summary.uniqueEvmAddresses = evmAddresses.length;
        summary.uniqueSolanaAddresses = solanaAddresses.length;

        for (const { chain, webhookId } of evmWebhookTargets) {
            if (!evmAddresses.length) continue;
            const chunks = this.splitIntoChunks(evmAddresses, chunkSize);
            summary.chainResults[chain].attempted = chunks.length;
            for (const addresses of chunks) {
                const result = await this.addAddressesToWebhook(webhookId, addresses);
                if (result.success) {
                    summary.chainResults[chain].succeeded += 1;
                }
            }
        }

        if (this.solanaWebhookId && solanaAddresses.length) {
            const chunks = this.splitIntoChunks(solanaAddresses, chunkSize);
            summary.chainResults.solana.attempted = chunks.length;
            for (const addresses of chunks) {
                const result = await this.addAddressesToWebhook(this.solanaWebhookId, addresses);
                if (result.success) {
                    summary.chainResults.solana.succeeded += 1;
                }
            }
        }

        logger.info('Alchemy webhook address backfill completed', summary);
        return summary;
    }
}

export default new AlchemyAddressService();
