import * as crypto from 'crypto';

/**
 * Alchemy Webhook Event Types - Address Activity for EVM and Solana
 */
export interface AlchemyWebhookEvent {
    webhookId: string;
    id: string;
    createdAt: string;
    type: 'ADDRESS_ACTIVITY';
    event: AlchemyAddressActivityEvent | AlchemySolanaAddressActivityEvent;
}

/**
 * EVM Address Activity Event (Base, etc.)
 */
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
 * Solana Address Activity Event (Beta - Devnet)
 */
export interface AlchemySolanaAddressActivityEvent {
    network: 'SOLANA_DEVNET' | 'SOLANA_MAINNET';
    transaction: SolanaTransaction[];
    slot: number;
}

export interface SolanaTransaction {
    signature: string;
    transaction: {
        signatures: string[];
        message: {
            header: {
                num_required_signatures: number;
                num_readonly_signed_accounts: number;
                num_readonly_unsigned_accounts: number;
            };
            instructions: SolanaInstruction[];
            versioned: boolean;
            account_keys: string[];
            recent_blockhash: string;
        };
    }[];
    meta: {
        fee: number;
        pre_balances: number[];
        post_balances: number[];
        inner_instructions_none: boolean;
        log_messages: string[];
        log_messages_none: boolean;
        return_data_none: boolean;
        compute_units_consumed: number;
    }[];
    index: number;
    is_vote: boolean;
}

export interface SolanaInstruction {
    data: string;
    program_id_index: number;
    accounts?: number[];
}

/**
 * AlchemyWebhooksService - Validates and processes Alchemy webhook events
 * Supports EVM chains (Base) and Solana (Beta - Devnet)
 */
class AlchemyWebhooksService {
    /**
     * Validate Alchemy webhook signature using HMAC SHA256
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
     */
    getSigningKey(network: string): string | null {
        const networkLower = network.toLowerCase().replace(/[_-]/g, '');
        console.log(`[Alchemy] Looking up signing key for network: ${network} (normalized: ${networkLower})`);

        // Base networks (base, basesepolia, base-sepolia, BASE_SEPOLIA, etc.)
        if (networkLower.includes('base')) {
            const key = process.env.ALCHEMY_SIGNING_KEY_BASE || null;
            console.log(`[Alchemy] Using Base signing key: ${key ? 'present' : 'MISSING'}`);
            return key;
        }

        // Solana networks
        if (networkLower.includes('solana')) {
            const key = process.env.ALCHEMY_SIGNING_KEY_SOLANA || null;
            console.log(`[Alchemy] Using Solana signing key: ${key ? 'present' : 'MISSING'}`);
            return key;
        }

        // Fallback to generic key if set
        const fallbackKey = process.env.ALCHEMY_SIGNING_KEY || null;
        console.log(`[Alchemy] Using fallback signing key: ${fallbackKey ? 'present' : 'MISSING'}`);
        return fallbackKey;
    }

    /**
     * Check if the event is a Solana event
     */
    isSolanaEvent(event: AlchemyWebhookEvent): boolean {
        const network = this.getNetworkFromEvent(event);
        return network.toLowerCase().includes('solana');
    }

    /**
     * Get network from event (handles both EVM and Solana structures)
     */
    getNetworkFromEvent(event: AlchemyWebhookEvent): string {
        if ('network' in event.event) {
            return event.event.network;
        }
        return 'unknown';
    }

    /**
     * Parse and validate an incoming webhook event
     */
    parseAndValidate(rawBody: string, signature: string): { valid: boolean; event?: AlchemyWebhookEvent; error?: string } {
        try {
            const event = JSON.parse(rawBody) as AlchemyWebhookEvent;

            // Get network from event
            const network = this.getNetworkFromEvent(event);
            console.log(`[Alchemy] Webhook event type: ${event.type}, network: ${network}`);

            // Get signing key for this network
            const signingKey = this.getSigningKey(network);

            if (!signingKey) {
                console.warn(`[Alchemy] No signing key found for network: ${network}`);
                // Allow processing without validation in development
                if (process.env.NODE_ENV === 'development') {
                    console.log('[Alchemy] Skipping signature validation in development mode');
                    return { valid: true, event };
                }
                return { valid: false, error: 'No signing key configured for this network' };
            }

            // Validate signature
            if (!this.validateSignature(rawBody, signature, signingKey)) {
                console.warn(`[Alchemy] Signature mismatch for network: ${network}`);
                return { valid: false, error: 'Invalid signature' };
            }

            console.log('[Alchemy] Signature validated successfully');
            return { valid: true, event };
        } catch (error: any) {
            return { valid: false, error: `Parse error: ${error.message}` };
        }
    }

    /**
     * Extract relevant transfer information from EVM activity
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

    /**
     * Extract relevant transfer information from Solana transaction
     */
    extractSolanaTransferInfo(tx: SolanaTransaction, slot: number) {
        // Handle different possible data structures from Alchemy
        const meta = Array.isArray(tx.meta) ? tx.meta[0] : tx.meta;
        const txData = Array.isArray(tx.transaction) ? tx.transaction[0] : tx.transaction;
        const message = txData?.message;

        // Calculate balance changes to detect transfers
        const balanceChanges: { account: string; change: number }[] = [];

        // Safely access account_keys - may not exist in all webhook payloads
        const accountKeys = message?.account_keys || [];
        const preBalances = meta?.pre_balances || [];
        const postBalances = meta?.post_balances || [];

        if (meta && accountKeys.length > 0) {
            for (let i = 0; i < accountKeys.length; i++) {
                const preBalance = preBalances[i] || 0;
                const postBalance = postBalances[i] || 0;
                const change = postBalance - preBalance;
                if (change !== 0) {
                    balanceChanges.push({
                        account: accountKeys[i],
                        change: change / 1e9, // Convert lamports to SOL
                    });
                }
            }
        }

        // Find sender (negative balance change) and receiver (positive balance change)
        const sender = balanceChanges.find(b => b.change < 0);
        const receiver = balanceChanges.find(b => b.change > 0 && b.account !== sender?.account);

        return {
            signature: tx.signature,
            slot,
            fee: meta?.fee ? meta.fee / 1e9 : 0,
            from: sender?.account || accountKeys[0] || '',
            to: receiver?.account || '',
            value: receiver?.change || Math.abs(sender?.change || 0),
            asset: 'SOL',
            computeUnits: meta?.compute_units_consumed || 0,
            isVote: tx.is_vote,
            balanceChanges,
        };
    }
}

export default new AlchemyWebhooksService();
