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
 * EVM Address Activity Event (Base, Celo, etc.)
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
 * Supports EVM chains (Base, Celo) and Solana (Beta - Devnet)
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
        const networkLower = network.toLowerCase();

        if (networkLower.includes('base') || networkLower === 'base-sepolia') {
            return process.env.ALCHEMY_SIGNING_KEY_BASE || null;
        }

        if (networkLower.includes('celo') || networkLower === 'celo-alfajores') {
            return process.env.ALCHEMY_SIGNING_KEY_CELO || null;
        }

        // Solana networks
        if (networkLower.includes('solana')) {
            return process.env.ALCHEMY_SIGNING_KEY_SOLANA || null;
        }

        // Fallback to generic key if set
        return process.env.ALCHEMY_SIGNING_KEY || null;
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
        const meta = tx.meta[0];
        const message = tx.transaction[0]?.message;

        // Calculate balance changes to detect transfers
        const balanceChanges: { account: string; change: number }[] = [];
        if (meta && message) {
            for (let i = 0; i < message.account_keys.length; i++) {
                const preBalance = meta.pre_balances[i] || 0;
                const postBalance = meta.post_balances[i] || 0;
                const change = postBalance - preBalance;
                if (change !== 0) {
                    balanceChanges.push({
                        account: message.account_keys[i],
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
            from: sender?.account || message?.account_keys[0] || '',
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
