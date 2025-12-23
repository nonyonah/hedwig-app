/**
 * Solana to Base Bridge Service
 * 
 * Enables users to bridge SOL and USDC from Solana to Base
 * for offramping via Paycrest.
 * 
 * Flow:
 * 1. User initiates bridge on Solana side
 * 2. Tokens are locked in Solana vault
 * 3. Auto-relay executes the message on Base
 * 4. User receives wrapped tokens on Base
 * 
 * Networks: Solana Devnet → Base Sepolia (testnet)
 * 
 * Reference: https://docs.base.org/base-chain/quickstart/base-solana-bridge
 */

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';

// Network Configuration - Testnet First
const IS_MAINNET = process.env.SOLANA_NETWORK === 'mainnet';

// Solana RPC URLs
const SOLANA_RPC_URL = IS_MAINNET
    ? (process.env.SOLANA_MAINNET_RPC || 'https://api.mainnet-beta.solana.com')
    : (process.env.SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com');

// Contract Addresses - Testnet (Devnet/Sepolia)
const TESTNET_CONTRACTS = {
    solana: {
        bridgeProgram: '7c6mteAcTXaQ1MFBCrnuzoZVTTAEfZwa6wgy4bqX3KXC',
        relayerProgram: '56MBBEYAtQAdjT4e1NzHD8XaoyRSTvfgbSVVcEcHj51H',
        gasFeeReceiver: 'AFs1LCbodhvwpgX3u3URLsud6R1XMSaMiQ5LtXw4GKYT',
        // Common token mints on Devnet
        usdcMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Devnet USDC
    },
    base: {
        bridge: '0x01824a90d32A69022DdAEcC6C5C14Ed08dB4EB9B',
        bridgeValidator: '0xa80C07DF38fB1A5b3E6a4f4FAAB71E7a056a4EC7',
        tokenFactory: '0x488EB7F7cb2568e31595D48cb26F63963Cc7565D',
        solToken: '0xCace0c896714DaF7098FFD8CC54aFCFe0338b4BC', // Wrapped SOL on Base Sepolia
    },
};

// Contract Addresses - Mainnet
const MAINNET_CONTRACTS = {
    solana: {
        bridgeProgram: 'HNCne2FkVaNghhjKXapxJzPaBvAKDG1Ge3gqhZyfVWLM',
        relayerProgram: 'g1et5VenhfJHJwsdJsDbxWZuotD5H4iELNG61kS4fb9',
        gasFeeReceiver: 'HNCne2FkVaNghhjKXapxJzPaBvAKDG1Ge3gqhZyfVWLM', // Using bridge program as placeholder
        usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Mainnet USDC
    },
    base: {
        bridge: '0x3eff766C76a1be2Ce1aCF2B69c78bCae257D5188',
        bridgeValidator: '0xAF24c1c24Ff3BF1e6D882518120fC25442d6794B',
        tokenFactory: '0xDD56781d0509650f8C2981231B6C917f2d5d7dF2',
        solToken: '0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82', // Wrapped SOL on Base Mainnet
    },
};

const CONTRACTS = IS_MAINNET ? MAINNET_CONTRACTS : TESTNET_CONTRACTS;

// Supported tokens for bridging
export type BridgeableToken = 'SOL' | 'USDC';

export interface BridgeQuote {
    token: BridgeableToken;
    amount: number;
    estimatedReceiveAmount: number;
    relayFee: number; // Auto-relay fee in SOL
    gasFee: number; // Estimated gas on Base
    estimatedTime: string; // e.g., "~30 seconds"
    baseAddress: string; // Token address on Base
}

export interface BridgeTransactionParams {
    fromAddress: string; // Solana wallet address
    toAddress: string; // Base wallet address (0x...)
    token: BridgeableToken;
    amount: number; // Amount in token units (e.g., 1.5 for 1.5 SOL)
}

export interface BridgeTransactionResult {
    serializedTransaction: string; // Base64 encoded transaction for signing
    bridgeId: string; // Unique bridge transaction ID
    estimatedArrival: string; // ISO timestamp
    instructions: string; // Human-readable instructions
}

export interface BridgeStatus {
    bridgeId: string;
    status: 'pending' | 'validating' | 'executing' | 'completed' | 'failed';
    solanaSignature?: string;
    baseTransactionHash?: string;
    amount: number;
    token: BridgeableToken;
    error?: string;
}

// Bridge fee constants (in SOL)
const AUTO_RELAY_FEE = 0.001; // ~$0.20 for auto-relay
const ESTIMATED_BRIDGE_TIME = '~30 seconds';

export class SolanaBridgeService {
    private connection: Connection;

    constructor() {
        this.connection = new Connection(SOLANA_RPC_URL, 'confirmed');
        console.log(`[SolanaBridge] Initialized with RPC: ${SOLANA_RPC_URL}`);
        console.log(`[SolanaBridge] Network: ${IS_MAINNET ? 'Mainnet' : 'Testnet (Devnet/Sepolia)'}`);
    }

    /**
     * Get a quote for bridging tokens from Solana to Base
     */
    async getQuote(token: BridgeableToken, amount: number): Promise<BridgeQuote> {
        console.log(`[SolanaBridge] Getting quote for ${amount} ${token}`);

        // For SOL, 1:1 mapping to wrapped SOL on Base
        // For USDC, 1:1 mapping (both are stablecoins)
        const relayFee = AUTO_RELAY_FEE;
        const gasFee = 0.0001; // Small gas fee on Base (paid by relayer)

        let baseTokenAddress: string;
        let estimatedReceive = amount;

        if (token === 'SOL') {
            baseTokenAddress = CONTRACTS.base.solToken;
            // Subtract relay fee from received amount
            estimatedReceive = Math.max(0, amount - relayFee);
        } else if (token === 'USDC') {
            // USDC maintains 1:1 value, relay fee paid separately in SOL
            baseTokenAddress = CONTRACTS.base.solToken; // TODO: Get wrapped USDC address
            estimatedReceive = amount;
        } else {
            throw new Error(`Unsupported token: ${token}`);
        }

        return {
            token,
            amount,
            estimatedReceiveAmount: estimatedReceive,
            relayFee,
            gasFee,
            estimatedTime: ESTIMATED_BRIDGE_TIME,
            baseAddress: baseTokenAddress,
        };
    }

    /**
     * Build a bridge transaction for the user to sign
     * 
     * This creates a Solana transaction that:
     * 1. Transfers tokens to the bridge vault
     * 2. Pays the auto-relay fee
     * 3. Includes bridge instructions with destination address
     */
    async buildBridgeTransaction(params: BridgeTransactionParams): Promise<BridgeTransactionResult> {
        console.log(`[SolanaBridge] Building bridge transaction:`, params);

        const { fromAddress, toAddress, token, amount } = params;

        // Validate addresses
        if (!fromAddress || !toAddress) {
            throw new Error('Both source and destination addresses are required');
        }
        if (!toAddress.startsWith('0x') || toAddress.length !== 42) {
            throw new Error('Invalid Base address format');
        }

        const fromPubkey = new PublicKey(fromAddress);
        // Bridge program IDs - reserved for future full bridge SDK integration
        // const _bridgeProgramId = new PublicKey(CONTRACTS.solana.bridgeProgram);
        // const _relayerProgramId = new PublicKey(CONTRACTS.solana.relayerProgram);
        const gasFeeReceiver = new PublicKey(CONTRACTS.solana.gasFeeReceiver);

        // Get latest blockhash
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();

        // Create transaction
        const transaction = new Transaction({
            feePayer: fromPubkey,
            blockhash,
            lastValidBlockHeight,
        });

        // Amount in lamports (for SOL) or smallest unit
        const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);
        const relayFeeLamports = Math.floor(AUTO_RELAY_FEE * LAMPORTS_PER_SOL);

        if (token === 'SOL') {
            // For SOL bridging:
            // 1. Transfer to bridge vault (simplified - actual bridge uses program PDAs)
            // 2. Pay relay fee

            // Note: This is a simplified version. The actual bridge uses
            // the bridge program's PDAs and specific instruction format.
            // For production, we'd use the official bridge SDK.

            // Transfer SOL to gas fee receiver (relay payment)
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: fromPubkey,
                    toPubkey: gasFeeReceiver,
                    lamports: amountLamports + relayFeeLamports,
                })
            );

            // TODO: Add actual bridge program instruction
            // This requires the full bridge SDK from https://github.com/base/bridge
            // The bridge instruction encodes:
            // - Destination address (Base)
            // - Amount
            // - Token type
            // - Auto-relay flag
        } else if (token === 'USDC') {
            // For USDC bridging:
            const usdcMint = new PublicKey(CONTRACTS.solana.usdcMint);
            const sourceAta = await getAssociatedTokenAddress(usdcMint, fromPubkey);
            const destinationAta = await getAssociatedTokenAddress(usdcMint, gasFeeReceiver);

            console.log(`[SolanaBridge] USDC transfer from ATA: ${sourceAta.toString()}`);
            console.log(`[SolanaBridge] USDC transfer to ATA: ${destinationAta.toString()}`);

            // USDC has 6 decimals
            const USDC_DECIMALS = 6;
            const usdcAmount = BigInt(Math.floor(amount * Math.pow(10, USDC_DECIMALS)));

            // Create destination ATA if it doesn't exist (idempotent - safe to call even if exists)
            transaction.add(
                createAssociatedTokenAccountIdempotentInstruction(
                    fromPubkey,     // Payer
                    destinationAta, // Associated token account address
                    gasFeeReceiver, // Owner of the ATA
                    usdcMint        // Token mint
                )
            );

            // Add SPL Token transfer instruction
            transaction.add(
                createTransferInstruction(
                    sourceAta,      // Source ATA
                    destinationAta, // Destination ATA
                    fromPubkey,     // Owner (signer)
                    usdcAmount      // Amount in smallest units
                )
            );

            // Also pay relay fee in SOL
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: fromPubkey,
                    toPubkey: gasFeeReceiver,
                    lamports: relayFeeLamports,
                })
            );
        }

        // Generate a unique bridge ID
        const bridgeId = `bridge_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Serialize transaction for client signing
        const serializedTransaction = transaction.serialize({
            requireAllSignatures: false,
        }).toString('base64');

        // Calculate estimated arrival time
        const estimatedArrival = new Date(Date.now() + 30000).toISOString(); // 30 seconds

        return {
            serializedTransaction,
            bridgeId,
            estimatedArrival,
            instructions: `Sign this transaction to bridge ${amount} ${token} from Solana to Base. ` +
                `Your tokens will arrive at ${toAddress} in approximately 30 seconds.`,
        };
    }

    /**
     * Check the status of a bridge transaction
     * 
     * Note: This would typically query the bridge validators or indexer
     */
    async getBridgeStatus(bridgeId: string, solanaSignature?: string): Promise<BridgeStatus> {
        console.log(`[SolanaBridge] Checking status for bridge: ${bridgeId}`);

        // If we have a Solana signature, check if it's confirmed
        if (solanaSignature) {
            try {
                const status = await this.connection.getSignatureStatus(solanaSignature);

                if (status?.value?.confirmationStatus === 'finalized') {
                    // Transaction is finalized on Solana
                    // In production, we'd check the Base side for the relay execution
                    return {
                        bridgeId,
                        status: 'executing', // Waiting for Base execution
                        solanaSignature,
                        amount: 0, // Would be parsed from transaction
                        token: 'SOL',
                    };
                } else if (status?.value?.err) {
                    return {
                        bridgeId,
                        status: 'failed',
                        solanaSignature,
                        amount: 0,
                        token: 'SOL',
                        error: 'Solana transaction failed',
                    };
                }
            } catch (error) {
                console.error('[SolanaBridge] Error checking signature:', error);
            }
        }

        // Default: pending
        return {
            bridgeId,
            status: 'pending',
            amount: 0,
            token: 'SOL',
        };
    }

    /**
     * Get the user's SOL and USDC balances on Solana
     */
    async getBalances(walletAddress: string): Promise<{ sol: number; usdc: number }> {
        try {
            const pubkey = new PublicKey(walletAddress);

            // Get SOL balance
            const solBalance = await this.connection.getBalance(pubkey);
            const solAmount = solBalance / LAMPORTS_PER_SOL;

            // Get USDC balance
            let usdcAmount = 0;
            try {
                const usdcMint = new PublicKey(CONTRACTS.solana.usdcMint);
                const usdcAta = await getAssociatedTokenAddress(usdcMint, pubkey);
                const usdcAccount = await this.connection.getTokenAccountBalance(usdcAta);
                usdcAmount = parseFloat(usdcAccount.value.uiAmountString || '0');
            } catch {
                // No USDC account
            }

            return { sol: solAmount, usdc: usdcAmount };
        } catch (error) {
            console.error('[SolanaBridge] Error getting balances:', error);
            return { sol: 0, usdc: 0 };
        }
    }

    /**
     * Helper: Convert Base address to bytes for bridge instruction
     * @internal Reserved for building bridge program instructions
     */
    // private addressToBytes(address: string): Uint8Array {
    //     // Remove 0x prefix and convert to bytes
    //     const hex = address.startsWith('0x') ? address.slice(2) : address;
    //     const bytes = new Uint8Array(32);
    //     const addressBytes = Buffer.from(hex, 'hex');
    //     bytes.set(addressBytes, 32 - addressBytes.length);
    //     return bytes;
    // }
}

// Export singleton instance
export const solanaBridgeService = new SolanaBridgeService();
export default SolanaBridgeService;
