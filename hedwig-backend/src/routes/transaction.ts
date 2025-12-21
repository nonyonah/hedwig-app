import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { Network, Alchemy, AssetTransfersCategory, SortingOrder } from 'alchemy-sdk';
import { Connection, PublicKey } from '@solana/web3.js';
import { supabase } from '../lib/supabase';

const router = Router();

// Initialize Alchemy for Base Sepolia using RPC URL from env
const baseConfig = {
    apiKey: process.env.ALCHEMY_API_KEY || 'demo', // Fallback for SDK requirement
    url: process.env.BASE_RPC_URL, // Use explicit RPC URL from env
    network: Network.BASE_SEPOLIA,
};
const baseAlchemy = new Alchemy(baseConfig);

// Initialize Solana Connection using RPC URL from env
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
console.log('[Transactions] Solana RPC URL:', SOLANA_RPC_URL.substring(0, 50) + '...');
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
        console.log('[Transactions] Route hit');
        const privyId = req.user!.privyId;
        const userId = req.user!.id;
        console.log('[Transactions] User:', { privyId, userId });

        const user = await getOrCreateUser(privyId);

        if (!user) {
            console.log('[Transactions] User not found');
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const ethAddress = user.ethereum_wallet_address;
        const solAddress = user.solana_wallet_address;
        console.log('[Transactions] Addresses - ETH:', ethAddress, 'SOL:', solAddress);
        console.log('[Transactions] ALCHEMY_API_KEY present:', !!process.env.ALCHEMY_API_KEY);

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
                console.error('[Transactions] Error fetching Base transactions:', error);
            }
        }

        // 3. Fetch Solana Transactions
        if (solAddress) {
            try {
                console.log('[Transactions] Fetching Solana transactions for:', solAddress);
                const pubKey = new PublicKey(solAddress);
                // Get signatures (history) - limit to 10 to reduce rate limiting issues
                const signatures = await solanaConnection.getSignaturesForAddress(pubKey, { limit: 10 });
                console.log('[Transactions] Solana signatures found:', signatures.length);

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
                        console.log('[Transactions] Error fetching Solana tx:', signatureInfo.signature.slice(0, 10), txErr);
                        // Continue with next transaction
                    }
                }

            } catch (err) {
                console.error('[Transactions] Error fetching Solana transactions:', err);
            }
        }

        // Sort all by date descending
        allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return res.json({
            success: true,
            data: allTransactions
        });

    } catch (error) {
        console.error('[Transactions] Global error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;
