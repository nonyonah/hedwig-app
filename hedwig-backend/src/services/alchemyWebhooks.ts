import * as crypto from 'crypto';

/**
 * Alchemy Webhook Event Types
 */
export interface AlchemyWebhookEvent {
    webhookId: string;
    id: string;
    createdAt: string;
    type: 'ADDRESS_ACTIVITY' | 'MINED_TRANSACTION' | 'DROPPED_TRANSACTION' | 'NFT_ACTIVITY' | 'NFT_METADATA_UPDATE';
    event: AlchemyAddressActivityEvent | any;
}

export interface AlchemyAddressActivityEvent {
    network: string;
    activity: AlchemyActivity[];
}

export interface AlchemyActivity {
    fromAddress: string;
    toAddress: string;
    blockNum: string;
    hash: string;
    value: number;
    asset: string;
    category: 'external' | 'internal' | 'erc20' | 'erc721' | 'erc1155' | 'specialnft';
    rawContract: {
        rawValue: string;
        address?: string;
        decimals?: number;
    };
    log?: {
        address: string;
        topics: string[];
        data: string;
        blockNumber: string;
        transactionHash: string;
        transactionIndex: string;
        blockHash: string;
        logIndex: string;
        removed: boolean;
    };
}

/**
 * AlchemyWebhooksService - Validates and processes Alchemy webhook events
 */
class AlchemyWebhooksService {
    /**
     * Validate Alchemy webhook signature using HMAC SHA256
     * @param rawBody - Raw request body as string
     * @param signature - X-Alchemy-Signature header value
     * @param signingKey - Signing key from Alchemy dashboard
     */
    validateSignature(rawBody: string, signature: string, signingKey: string): boolean {
        try {
            const hmac = crypto.createHmac('sha256', signingKey);
            hmac.update(rawBody, 'utf8');
            const digest = hmac.digest('hex');
            return signature === digest;
        } catch (error) {
            console.error('[Alchemy] Signature validation error:', error);
            return false;
        }
    }

    /**
     * Get the appropriate signing key based on network
     * @param network - Network name from webhook event
     */
    getSigningKey(network: string): string | null {
        const networkLower = network.toLowerCase();

        if (networkLower.includes('base') || networkLower === 'base-sepolia') {
            return process.env.ALCHEMY_SIGNING_KEY_BASE || null;
        }

        if (networkLower.includes('celo') || networkLower === 'celo-alfajores') {
            return process.env.ALCHEMY_SIGNING_KEY_CELO || null;
        }

        // Fallback to generic key if set
        return process.env.ALCHEMY_SIGNING_KEY || null;
    }

    /**
     * Parse and validate an incoming webhook event
     * @param rawBody - Raw request body
     * @param signature - X-Alchemy-Signature header
     */
    parseAndValidate(rawBody: string, signature: string): { valid: boolean; event?: AlchemyWebhookEvent; error?: string } {
        try {
            const event = JSON.parse(rawBody) as AlchemyWebhookEvent;

            // Get network from event
            let network = 'unknown';
            if (event.event && 'network' in event.event) {
                network = event.event.network;
            }

            // Get signing key for this network
            const signingKey = this.getSigningKey(network);

            if (!signingKey) {
                console.warn(`[Alchemy] No signing key found for network: ${network}`);
                // Allow processing without validation in development
                if (process.env.NODE_ENV === 'development') {
                    return { valid: true, event };
                }
                return { valid: false, error: 'No signing key configured for this network' };
            }

            // Validate signature
            if (!this.validateSignature(rawBody, signature, signingKey)) {
                return { valid: false, error: 'Invalid signature' };
            }

            return { valid: true, event };
        } catch (error: any) {
            return { valid: false, error: `Parse error: ${error.message}` };
        }
    }

    /**
     * Extract relevant transfer information from activity
     */
    extractTransferInfo(activity: AlchemyActivity) {
        return {
            from: activity.fromAddress,
            to: activity.toAddress,
            value: activity.value,
            asset: activity.asset,
            category: activity.category,
            txHash: activity.hash,
            blockNumber: activity.blockNum,
            contractAddress: activity.rawContract?.address,
        };
    }
}

export default new AlchemyWebhooksService();
