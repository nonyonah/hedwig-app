import { ChainhooksClient, CHAINHOOKS_BASE_URL } from '@hirosystems/chainhooks-client';

/**
 * ChainhooksService - Manages Stacks blockchain event subscriptions via Hiro Chainhooks SDK
 */
class ChainhooksService {
    private client: ChainhooksClient | null = null;
    private isInitialized = false;

    /**
     * Initialize the Chainhooks client
     */
    private initialize(): ChainhooksClient {
        if (this.client && this.isInitialized) {
            return this.client;
        }

        const apiKey = process.env.HIRO_API_KEY;
        if (!apiKey) {
            throw new Error('HIRO_API_KEY environment variable is not set');
        }

        const network = process.env.STACKS_NETWORK || 'testnet';
        const baseUrl = network === 'mainnet'
            ? CHAINHOOKS_BASE_URL.mainnet
            : CHAINHOOKS_BASE_URL.testnet;

        this.client = new ChainhooksClient({
            baseUrl,
            apiKey,
        });

        this.isInitialized = true;
        console.log(`[Chainhooks] Initialized client for ${network}`);
        return this.client;
    }

    /**
     * Register a chainhook to monitor hedwig-payment contract calls
     * @param contractAddress - The deployed hedwig-payment contract address
     * @param webhookUrl - The URL to receive webhook notifications
     */
    async registerPaymentHook(contractAddress: string, webhookUrl: string): Promise<any> {
        const client = this.initialize();

        const network = process.env.STACKS_NETWORK || 'testnet';

        try {
            const chainhook = await client.registerChainhook({
                version: '1',
                name: 'hedwig-payment-monitor',
                chain: 'stacks',
                network: network as 'testnet' | 'mainnet',
                filters: {
                    events: [
                        {
                            type: 'contract_call',
                            contract_identifier: contractAddress,
                            function_name: 'pay-invoice',
                        },
                        {
                            type: 'contract_call',
                            contract_identifier: contractAddress,
                            function_name: 'pay',
                        },
                    ],
                },
                action: {
                    type: 'http_post',
                    url: webhookUrl,
                },
                options: {
                    decode_clarity_values: true,
                    enable_on_registration: true,
                },
            });

            console.log(`[Chainhooks] Registered payment hook: ${chainhook.uuid}`);
            return chainhook;
        } catch (error: any) {
            console.error('[Chainhooks] Failed to register payment hook:', error.message);
            throw error;
        }
    }

    /**
     * List all registered chainhooks
     */
    async listHooks(): Promise<any[]> {
        const client = this.initialize();

        try {
            const response = await client.getChainhooks();
            const hooks = response.results || [];
            console.log(`[Chainhooks] Found ${hooks.length} registered hooks`);
            return hooks;
        } catch (error: any) {
            console.error('[Chainhooks] Failed to list hooks:', error.message);
            throw error;
        }
    }

    /**
     * Get a specific chainhook by UUID
     */
    async getHook(uuid: string): Promise<any> {
        const client = this.initialize();

        try {
            const hook = await client.getChainhook(uuid);
            return hook;
        } catch (error: any) {
            console.error(`[Chainhooks] Failed to get hook ${uuid}:`, error.message);
            throw error;
        }
    }

    /**
     * Disable a chainhook
     */
    async disableHook(uuid: string): Promise<void> {
        const client = this.initialize();

        try {
            // Use enableChainhook with false to disable
            await client.enableChainhook(uuid, false);
            console.log(`[Chainhooks] Disabled hook: ${uuid}`);
        } catch (error: any) {
            console.error(`[Chainhooks] Failed to disable hook ${uuid}:`, error.message);
            throw error;
        }
    }

    /**
     * Delete a chainhook
     */
    async deleteHook(uuid: string): Promise<void> {
        const client = this.initialize();

        try {
            await client.deleteChainhook(uuid);
            console.log(`[Chainhooks] Deleted hook: ${uuid}`);
        } catch (error: any) {
            console.error(`[Chainhooks] Failed to delete hook ${uuid}:`, error.message);
            throw error;
        }
    }
}

export default new ChainhooksService();
