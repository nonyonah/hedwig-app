import axios from 'axios';

/**
 * AlchemyAddressService - Manages wallet addresses for Alchemy Address Activity webhooks
 * This allows automatic registration of new user wallets for real-time transaction notifications.
 */

interface AlchemyUpdateResponse {
    success: boolean;
    message?: string;
}

class AlchemyAddressService {
    private baseUrl = 'https://dashboard.alchemy.com/api';
    private authToken: string;

    // Webhook IDs for different networks (set these in environment variables)
    private baseWebhookId: string;
    private solanaWebhookId: string;

    constructor() {
        this.authToken = process.env.ALCHEMY_AUTH_TOKEN || '';
        this.baseWebhookId = process.env.ALCHEMY_BASE_WEBHOOK_ID || '';
        this.solanaWebhookId = process.env.ALCHEMY_SOLANA_WEBHOOK_ID || '';
    }

    /**
     * Add addresses to an Alchemy Address Activity webhook
     */
    private async addAddressesToWebhook(webhookId: string, addresses: string[]): Promise<AlchemyUpdateResponse> {
        if (!this.authToken) {
            console.warn('[AlchemyAddress] No ALCHEMY_AUTH_TOKEN set, skipping address registration');
            return { success: false, message: 'No auth token' };
        }

        if (!webhookId) {
            console.warn('[AlchemyAddress] No webhook ID provided');
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
                    addresses_to_add: addresses,
                    addresses_to_remove: []
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Alchemy-Token': this.authToken
                    }
                }
            );

            console.log(`[AlchemyAddress] Added ${addresses.length} address(es) to webhook ${webhookId}`);
            return { success: true };
        } catch (error: any) {
            console.error('[AlchemyAddress] Failed to add addresses:', error.response?.data || error.message);
            return { success: false, message: error.message };
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

            console.log(`[AlchemyAddress] Removed ${addresses.length} address(es) from webhook ${webhookId}`);
            return { success: true };
        } catch (error: any) {
            console.error('[AlchemyAddress] Failed to remove addresses:', error.response?.data || error.message);
            return { success: false, message: error.message };
        }
    }

    /**
     * Register a user's wallet addresses with all appropriate Alchemy webhooks
     * Call this when a new user is created or when wallet addresses are updated
     */
    async registerUserWallets(wallets: {
        ethereum?: string;
        solana?: string;
    }): Promise<{ base: boolean; solana: boolean }> {
        const results = { base: false, solana: false };

        // EVM addresses for Base webhook
        if (wallets.ethereum) {
            // Register with Base webhook
            if (this.baseWebhookId) {
                const baseResult = await this.addAddressesToWebhook(this.baseWebhookId, [wallets.ethereum]);
                results.base = baseResult.success;
            }
        }

        // Solana address for Solana webhook
        if (wallets.solana && this.solanaWebhookId) {
            const solanaResult = await this.addAddressesToWebhook(this.solanaWebhookId, [wallets.solana]);
            results.solana = solanaResult.success;
        }

        console.log('[AlchemyAddress] Wallet registration results:', results);
        return results;
    }

    /**
     * Unregister a user's wallet addresses from all webhooks
     * Call this when a user is deleted or wallet addresses are changed
     */
    async unregisterUserWallets(wallets: {
        ethereum?: string;
        solana?: string;
    }): Promise<void> {
        if (wallets.ethereum) {
            if (this.baseWebhookId) {
                await this.removeAddressesFromWebhook(this.baseWebhookId, [wallets.ethereum]);
            }
        }

        if (wallets.solana && this.solanaWebhookId) {
            await this.removeAddressesFromWebhook(this.solanaWebhookId, [wallets.solana]);
        }
    }
}

export default new AlchemyAddressService();
