
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { Network, Alchemy, AssetTransfersCategory, SortingOrder } from 'alchemy-sdk';
import { Connection, PublicKey } from '@solana/web3.js';

const router = Router();

// Initialize Alchemy for Base Sepolia
const baseConfig = {
    apiKey: process.env.ALCHEMY_API_KEY,
    network: Network.BASE_SEPOLIA,
};
const baseAlchemy = new Alchemy(baseConfig);

// Initialize Alchemy for Celo Sepolia (using custom URL since SDK doesn't have CELO_SEPOLIA enum yet)
const celoConfig = {
    apiKey: process.env.ALCHEMY_API_KEY,
    url: `https://celo-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
};
const celoAlchemy = new Alchemy(celoConfig);

// Initialize Solana Connection using Alchemy RPC
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || `https://solana-devnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');

interface TransactionItem {
    id: string;
    type: 'IN' | 'OUT';
    description: string;
    amount: string;
    token: string;
    date: string; // ISO string
    hash: string;
    network: 'base' | 'celo' | 'solana';
    status: 'completed' | 'pending' | 'failed';
    from: string;
    to: string;
}

router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        console.log('[Transactions] Route hit');
        const privyId = req.user!.privyId;
        console.log('[Transactions] User privyId:', privyId);

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
                });

                // Process Base Outgoing
                outgoing.transfers.forEach(tx => {
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
                });

            } catch (err) {
                console.error('[Transactions] Error fetching Base transactions:', err);
            }

            // 2. Fetch Celo Transactions (Alchemy SDK with Celo Sepolia)
            try {
                // Incoming
                const incomingCelo = await celoAlchemy.core.getAssetTransfers({
                    fromBlock: "0x0",
                    toAddress: ethAddress,
                    excludeZeroValue: true,
                    category: [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20],
                    order: SortingOrder.DESCENDING,
                    maxCount: 20,
                    withMetadata: true
                });

                // Outgoing
                const outgoingCelo = await celoAlchemy.core.getAssetTransfers({
                    fromBlock: "0x0",
                    fromAddress: ethAddress,
                    excludeZeroValue: true,
                    category: [AssetTransfersCategory.EXTERNAL, AssetTransfersCategory.ERC20],
                    order: SortingOrder.DESCENDING,
                    maxCount: 20,
                    withMetadata: true
                });

                // Process Celo Incoming
                incomingCelo.transfers.forEach(tx => {
                    allTransactions.push({
                        id: `celo-${tx.hash}`,
                        type: 'IN',
                        description: `Received from ${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`,
                        amount: tx.value?.toString() || '0',
                        token: tx.asset || 'CELO',
                        date: tx.metadata?.blockTimestamp || new Date().toISOString(),
                        hash: tx.hash,
                        network: 'celo',
                        status: 'completed',
                        from: tx.from,
                        to: tx.to || ethAddress
                    });
                });

                // Process Celo Outgoing
                outgoingCelo.transfers.forEach(tx => {
                    allTransactions.push({
                        id: `celo-${tx.hash}`,
                        type: 'OUT',
                        description: `Sent to ${tx.to?.slice(0, 6)}...${tx.to?.slice(-4)}`,
                        amount: tx.value?.toString() || '0',
                        token: tx.asset || 'CELO',
                        date: tx.metadata?.blockTimestamp || new Date().toISOString(),
                        hash: tx.hash,
                        network: 'celo',
                        status: 'completed',
                        from: tx.from,
                        to: tx.to || ''
                    });
                });

            } catch (err) {
                console.error('[Transactions] Error fetching Celo transactions:', err);
            }
        }

        // 3. Fetch Solana Transactions
        if (solAddress) {
            try {
                console.log('[Transactions] Fetching Solana transactions for:', solAddress);
                const pubKey = new PublicKey(solAddress);
                // Get signatures (history)
                const signatures = await solanaConnection.getSignaturesForAddress(pubKey, { limit: 20 });
                console.log('[Transactions] Solana signatures found:', signatures.length);

                // Get parsed details for each signature
                // Note: This can be slow if we fetch too many. Limit is 20.
                // We'll process them in parallel or batch? 
                // For simplified MVP, we just take signatures and block time. 
                // To get amounts, we need `getParsedTransactions`.

                const validSignatures = signatures.filter(s => !s.err);
                const txIds = validSignatures.map(s => s.signature);

                if (txIds.length > 0) {
                    const txDetails = await solanaConnection.getParsedTransactions(txIds, { maxSupportedTransactionVersion: 0 });

                    txDetails.forEach((tx, idx) => {
                        if (!tx) return;

                        const signatureInfo = validSignatures[idx];
                        const date = signatureInfo.blockTime ? new Date(signatureInfo.blockTime * 1000).toISOString() : new Date().toISOString();

                        // Heuristic to check if Incoming or Outgoing
                        // We check the pre/post balances of our account.
                        const accountIndex = tx.transaction.message.accountKeys.findIndex((key: any) => key.pubkey.toBase58() === solAddress);

                        let amount = 0;
                        let type: 'IN' | 'OUT' = 'IN'; // default

                        if (accountIndex !== -1 && tx.meta) {
                            const preBalance = tx.meta.preBalances[accountIndex];
                            const postBalance = tx.meta.postBalances[accountIndex];
                            const diff = postBalance - preBalance;

                            if (diff > 0) {
                                type = 'IN';
                                amount = diff / 1e9; // lamports to SOL
                            } else {
                                type = 'OUT';
                                amount = Math.abs(diff) / 1e9;
                            }
                        }

                        // Determine sender/receiver (simplified)
                        const from = tx.transaction.message.accountKeys[0].pubkey.toBase58();

                        allTransactions.push({
                            id: `sol-${signatureInfo.signature}`,
                            type: type,
                            description: type === 'IN' ? `Received from ${from.slice(0, 4)}...${from.slice(-4)}` : `Sent SOL`,
                            amount: amount.toFixed(4),
                            token: 'SOL', // Only handling native SOL for simplicity right now
                            date: date,
                            hash: signatureInfo.signature,
                            network: 'solana',
                            status: 'completed',
                            from: from,
                            to: solAddress // placeholder
                        });
                    });
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
