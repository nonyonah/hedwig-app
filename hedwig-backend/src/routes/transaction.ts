import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { Network, Alchemy, AssetTransfersCategory, SortingOrder } from 'alchemy-sdk';
import { Connection, PublicKey } from '@solana/web3.js';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('Transactions');

const router = Router();

// Initialize Alchemy for Base Mainnet using RPC URL from env
const baseConfig = {
    apiKey: process.env.ALCHEMY_API_KEY || 'demo', // Fallback for SDK requirement
    url: process.env.BASE_RPC_URL, // Use explicit RPC URL from env
    network: Network.BASE_MAINNET,
};
const baseAlchemy = new Alchemy(baseConfig);

// Initialize Solana Connection using RPC URL from env
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
logger.debug('Solana connection initialized');
const solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');

interface TransactionItem {
    id: string;
    type: 'IN' | 'OUT';
    description: string;
    amount: string;
    token: string;
    date: string; // ISO string
    hash: string;
    network: 'base' | 'solana';
    status: 'completed' | 'pending' | 'failed';
    from: string;
    to: string;
}

router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        logger.debug('Transactions route hit');
        const privyId = req.user!.privyId;
        const userId = req.user!.id;
        logger.debug('Processing user request');

        const user = await getOrCreateUser(privyId);

        if (!user) {
            logger.debug('User not found');
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const ethAddress = user.ethereum_wallet_address;
        const solAddress = user.solana_wallet_address;
        logger.debug('Fetching transactions');
        logger.debug('API keys configured', { alchemyPresent: !!process.env.ALCHEMY_API_KEY });

        const allTransactions: TransactionItem[] = [];

        // 0. Fetch Local DB Transactions (Source of truth for app actions)
        const { data: dbTransactions } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (dbTransactions) {
            dbTransactions.forEach(tx => {
                allTransactions.push({
                    id: tx.id,
                    type: tx.type === 'PAYMENT_RECEIVED' ? 'IN' : 'OUT',
                    description: tx.description || (tx.type === 'OFFRAMP' ? 'Offramp to Bank' : 'Transaction'),
                    amount: tx.amount.toString(),
                    token: tx.token,
                    date: tx.created_at,
                    hash: tx.tx_hash || '',
                    network: tx.chain.toLowerCase(),
                    status: tx.status.toLowerCase(),
                    from: tx.from_address,
                    to: tx.to_address,
                });
            });
        }

        // 1. Fetch Base Transactions (Alchemy)
        if (ethAddress) {
            try {
                // Incoming
                const incoming = await baseAlchemy.core.getAssetTransfers({
                    fromBlock: "0x0",
                    toAddress: ethAddress,
                    excludeZeroValue: true,
                    category: [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20],
                    order: SortingOrder.DESCENDING,
                    maxCount: 20,
                    withMetadata: true
                });

                // Outgoing
                const outgoing = await baseAlchemy.core.getAssetTransfers({
                    fromBlock: "0x0",
                    fromAddress: ethAddress,
                    excludeZeroValue: true,
                    category: [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20],
                    order: SortingOrder.DESCENDING,
                    maxCount: 20,
                    withMetadata: true
                });

                // Process Base Incoming
                incoming.transfers.forEach(tx => {
                    // Avoid duplicates if matching hash exists from DB
                    if (!allTransactions.some(t => t.hash === tx.hash)) {
                        allTransactions.push({
                            id: `base-${tx.hash}`,
                            type: 'IN',
                            description: `Received from ${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`,
                            amount: tx.value?.toString() || '0',
                            token: tx.asset || 'ETH',
                            date: tx.metadata?.blockTimestamp || new Date().toISOString(),
                            hash: tx.hash,
                            network: 'base',
                            status: 'completed',
                            from: tx.from,
                            to: tx.to || ethAddress
                        });
                    }
                });

                // Process Base Outgoing
                outgoing.transfers.forEach(tx => {
                    if (!allTransactions.some(t => t.hash === tx.hash)) {
                        allTransactions.push({
                            id: `base-${tx.hash}`,
                            type: 'OUT',
                            description: `Sent to ${tx.to?.slice(0, 6)}...${tx.to?.slice(-4)}`,
                            amount: tx.value?.toString() || '0',
                            token: tx.asset || 'ETH',
                            date: tx.metadata?.blockTimestamp || new Date().toISOString(),
                            hash: tx.hash,
                            network: 'base',
                            status: 'completed',
                            from: tx.from,
                            to: tx.to || ''
                        });
                    }
                });

            } catch (error) {
                logger.error('Error fetching Base transactions');
            }
        }

        // 3. Fetch Solana Transactions
        if (solAddress) {
            try {
                logger.debug('Fetching Solana transactions');
                const pubKey = new PublicKey(solAddress);
                // Get signatures (history) - limit to 10 to reduce rate limiting issues
                const signatures = await solanaConnection.getSignaturesForAddress(pubKey, { limit: 10 });
                logger.debug('Solana signatures found', { count: signatures.length });

                const validSignatures = signatures.filter(s => !s.err);

                // Process transactions one at a time with delay to avoid rate limiting
                for (let i = 0; i < validSignatures.length; i++) {
                    const signatureInfo = validSignatures[i];

                    try {
                        // Add delay between requests to avoid hitting rate limits
                        if (i > 0) {
                            await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay
                        }

                        const txDetails = await solanaConnection.getParsedTransaction(
                            signatureInfo.signature,
                            { maxSupportedTransactionVersion: 0 }
                        );

                        if (!txDetails || !txDetails.meta) continue;

                        const date = signatureInfo.blockTime
                            ? new Date(signatureInfo.blockTime * 1000).toISOString()
                            : new Date().toISOString();

                        // Check for SPL token transfers (USDC, etc.)
                        const tokenTransfers = txDetails.meta.postTokenBalances || [];
                        const preTokenBalances = txDetails.meta.preTokenBalances || [];

                        // Known USDC mint addresses on Solana
                        const USDC_MINTS = [
                            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mainnet
                            '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC devnet
                        ];

                        let tokenSymbol = 'SOL';
                        let amount = 0;
                        let type: 'IN' | 'OUT' = 'IN';
                        let isTokenTx = false;

                        // Check for token transfers
                        for (const postBalance of tokenTransfers) {
                            const preBalance = preTokenBalances.find(
                                (p: any) => p.accountIndex === postBalance.accountIndex
                            );

                            if (postBalance.owner === solAddress || preBalance?.owner === solAddress) {
                                const mint = postBalance.mint;
                                const postAmount = parseFloat(postBalance.uiTokenAmount?.uiAmountString || '0');
                                const preAmount = parseFloat(preBalance?.uiTokenAmount?.uiAmountString || '0');
                                const diff = postAmount - preAmount;

                                if (Math.abs(diff) > 0.000001) {
                                    isTokenTx = true;
                                    if (USDC_MINTS.includes(mint)) {
                                        tokenSymbol = 'USDC';
                                    } else {
                                        tokenSymbol = 'SPL'; // Generic SPL token
                                    }

                                    if (diff > 0) {
                                        type = 'IN';
                                        amount = diff;
                                    } else {
                                        type = 'OUT';
                                        amount = Math.abs(diff);
                                    }
                                    break;
                                }
                            }
                        }

                        // If not a token transfer, check native SOL
                        if (!isTokenTx) {
                            const accountIndex = txDetails.transaction.message.accountKeys.findIndex(
                                (key: any) => key.pubkey.toBase58() === solAddress
                            );

                            if (accountIndex !== -1) {
                                const preBalance = txDetails.meta.preBalances[accountIndex];
                                const postBalance = txDetails.meta.postBalances[accountIndex];
                                const diff = postBalance - preBalance;

                                // Only include if significant amount (> 0.001 SOL, excludes fee-only txs)
                                if (Math.abs(diff) > 1000000) { // 0.001 SOL in lamports
                                    if (diff > 0) {
                                        type = 'IN';
                                        amount = diff / 1e9;
                                    } else {
                                        type = 'OUT';
                                        amount = Math.abs(diff) / 1e9;
                                    }
                                    tokenSymbol = 'SOL';
                                } else {
                                    continue; // Skip tiny txs (likely just fees)
                                }
                            }
                        }

                        // Skip if no meaningful transfer found
                        if (amount === 0) continue;

                        const from = txDetails.transaction.message.accountKeys[0].pubkey.toBase58();

                        allTransactions.push({
                            id: `sol-${signatureInfo.signature}`,
                            type: type,
                            description: type === 'IN'
                                ? `Received ${tokenSymbol} from ${from.slice(0, 4)}...${from.slice(-4)}`
                                : `Sent ${tokenSymbol}`,
                            amount: tokenSymbol === 'USDC' ? amount.toFixed(2) : amount.toFixed(4),
                            token: tokenSymbol,
                            date: date,
                            hash: signatureInfo.signature,
                            network: 'solana',
                            status: 'completed',
                            from: from,
                            to: solAddress
                        });
                    } catch (txErr) {
                        logger.debug('Error fetching Solana tx');
                        // Continue with next transaction
                    }
                }

            } catch (err) {
                logger.error('Error fetching Solana transactions');
            }
        }

        // Sort all by date descending
        allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return res.json({
            success: true,
            data: allTransactions
        });

    } catch (error) {
        logger.error('Global error in transactions');
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/transactions
 * Log a transaction from the frontend (for offramps, sends, etc.)
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const {
            type,        // 'PAYMENT_RECEIVED' | 'PAYMENT_SENT' | 'OFFRAMP' | 'FEE_COLLECTION'
            txHash,
            amount,
            token,
            chain,       // 'BASE' | 'SOLANA' | 'CELO'
            fromAddress,
            toAddress,
            documentId,
            status = 'PENDING',
            amountInNgn,
            platformFee = 0,
            networkFee,
        } = req.body;

        // Validate required fields
        if (!type || !amount || !token || !chain || !fromAddress || !toAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: type, amount, token, chain, fromAddress, toAddress'
            });
        }

        // Insert transaction into database
        const { data: transaction, error } = await supabase
            .from('transactions')
            .insert({
                user_id: userId,
                document_id: documentId || null,
                type: type,
                status: status,
                chain: chain,
                tx_hash: txHash || null,
                from_address: fromAddress,
                to_address: toAddress,
                amount: parseFloat(amount),
                amount_in_ngn: amountInNgn ? parseFloat(amountInNgn) : null,
                token: token,
                platform_fee: parseFloat(platformFee) || 0,
                network_fee: networkFee ? parseFloat(networkFee) : null,
                timestamp: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to create transaction');
            return res.status(500).json({ success: false, error: 'Failed to create transaction' });
        }

        logger.info('Transaction created');

        return res.status(201).json({
            success: true,
            data: transaction
        });

    } catch (error) {
        logger.error('Error creating transaction');
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * PATCH /api/transactions/:id
 * Update transaction status (e.g., when tx confirms on chain)
 */
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const { status, txHash, blockNumber, errorMessage } = req.body;

        const updateData: any = {};
        if (status) updateData.status = status;
        if (txHash) updateData.tx_hash = txHash;
        if (blockNumber) updateData.block_number = blockNumber;
        if (errorMessage) updateData.error_message = errorMessage;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, error: 'No update data provided' });
        }

        const { data: transaction, error } = await supabase
            .from('transactions')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', userId) // Ensure user owns this transaction
            .select()
            .single();

        if (error) {
            logger.error('Failed to update transaction');
            return res.status(500).json({ success: false, error: 'Failed to update transaction' });
        }

        if (!transaction) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        logger.info('Transaction updated');

        return res.json({
            success: true,
            data: transaction
        });

    } catch (error) {
        logger.error('Error updating transaction');
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
