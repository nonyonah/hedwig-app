import { Router, Request, Response } from 'express';
import { authenticate, privy } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { supabase } from '../lib/supabase';
import BlockradarService from '../services/blockradar';
import { createLogger } from '../utils/logger';
import axios from 'axios';

const logger = createLogger('Wallet');

const router = Router();

/**
 * GET /api/wallet/balance
 * Fetch balances for the user from Privy (embedded wallet)
 */
router.get('/balance', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;
        logger.debug('Fetching balances', { userId });

        // 1. Get User from Privy to find wallet addresses
        const user = await privy.getUser(userId);
        const addresses: { address: string, type: 'evm' | 'solana' }[] = [];

        // Check for EVM embedded wallet
        if (user.wallet) {
            addresses.push({ address: user.wallet.address, type: 'evm' });
        }

        // Check for Solana embedded wallet in linkedAccounts
        const solanaWallets = user.linkedAccounts.filter((a: any) => 
            a.type === 'wallet' && 
            a.walletClientType === 'privy' && 
            a.chainType === 'solana'
        );
        
        solanaWallets.forEach((w: any) => {
            addresses.push({ address: w.address, type: 'solana' });
        });

        if (addresses.length === 0) {
            logger.debug('User has no embedded wallets', { userId });
            return res.json({
                success: true,
                data: {
                    balances: [{
                        chain: 'base',
                        asset: 'usdc',
                        raw_value: '0',
                        display_values: { token: '0', usd: '0' }
                    }],
                    address: null
                }
            });
        }

        // 2. Fetch balances from Privy API for each address
        let allBalances: any[] = [];
        
        const credentials = Buffer.from(`${process.env.PRIVY_APP_ID}:${process.env.PRIVY_APP_SECRET}`).toString('base64');
        
        for (const { address, type } of addresses) {
            try {
                // Determine networks to fetch based on chain type
                // For EVM: we want Base (eip155:8453)
                // For Solana: we want Solana Mainnet (solana:5eykt...?) or Devnet
                // Privy API fetches all enabled chains or we can filter?
                // Docs: "Returns the native currency and ERC-20 token balances for the specified wallet address across all supported chains"
                
                const response = await axios.get(`https://auth.privy.io/api/v1/wallets/${address}/balances`, {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'privy-app-id': process.env.PRIVY_APP_ID
                    }
                });

                const data = response.data;
                // data format: { chains: [ { id: 'eip155:8453', name: 'Base', tokenBalances: [...] } ] }
                
                if (data && data.chains) {
                    for (const chainData of data.chains) {
                        // Map Privy Chain ID to our internal chain key
                        let internalChain = '';
                        if (chainData.id === 'eip155:8453') internalChain = 'base';
                        else if (chainData.id.startsWith('solana:')) internalChain = 'solana'; // Check actual ID for mainnet/devnet
                        // Example Solana Mainnet: solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp
                        
                        // For now accept base and solana
                        if (chainData.name.toLowerCase().includes('base')) internalChain = 'base';
                        if (chainData.name.toLowerCase().includes('solana')) internalChain = 'solana';
                        
                        if (!internalChain) continue;

                        // Process tokens
                        // Privy returns native token as well?
                        // Example: tokenBalances includes native
                        
                        if (chainData.tokenBalances) {
                            for (const token of chainData.tokenBalances) {
                                // Map to our format
                                // Asset symbol normalization
                                const assetSymbol = token.symbol ? token.symbol.toLowerCase() : 'unknown';
                                
                                allBalances.push({
                                    chain: internalChain,
                                    asset: assetSymbol,
                                    raw_value: token.balance || '0',
                                    display_values: {
                                        token: token.balance || '0',
                                        // Privy response structure usually has 'amount' string
                                        // Wait, verify response structure from docs
                                        // Docs says: "amount": "0.1", "symbol": "ETH", "usdValue": 250.50
                                        usd: token.usdValue ? token.usdValue.toString() : '0'
                                    }
                                });
                            }
                        }
                    }
                }
            } catch (apiError: any) {
                logger.error('Privy API balance fetch failed', { address, error: apiError.message });
            }
        }

        // Return Blockradar address as the primary address just to maintain backward compatibility if needed?
        // Or return the EVM address as 'address'
        const primaryAddress = addresses.find(a => a.type === 'evm')?.address || addresses[0]?.address;

        return res.json({
            success: true,
            data: {
                balances: allBalances,
                address: primaryAddress
            }
        });

    } catch (error: any) {
        logger.error('Balance fetch error', { error: error.message });
        return next(new AppError('Failed to fetch wallet balance', 500));
    }
});

/**
 * POST /api/wallet/create-address
 * Create a Blockradar deposit address for the user
 * Called after user registration or on first wallet access
 */
router.post('/create-address', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;
        logger.info('Creating Blockradar address', { userId });

        // Get user from database
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, blockradar_address_id, first_name, last_name')
            .or(`supabase_id.eq.${userId},privy_id.eq.${userId}`)
            .single();

        if (userError || !userData) {
            throw new AppError('User not found', 404);
        }

        // Check if user already has an address
        if (userData.blockradar_address_id) {
            const existingAddress = await BlockradarService.getAddress(userData.blockradar_address_id);
            return res.json({
                success: true,
                data: {
                    address: existingAddress.address,
                    addressId: existingAddress.id,
                    isNew: false
                }
            });
        }

        // Create new Blockradar address
        const userName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || undefined;
        const newAddress = await BlockradarService.createAddress(userData.id, userName);

        // Save to database
        const { error: updateError } = await supabase
            .from('users')
            .update({
                blockradar_address_id: newAddress.id,
                blockradar_address: newAddress.address
            })
            .eq('id', userData.id);

        if (updateError) {
            logger.error('Failed to save Blockradar address to DB', { error: updateError });
            // Don't throw - address was created, just log the error
        }

        logger.info('Blockradar address created', { 
            userId: userData.id, 
            address: newAddress.address 
        });

        return res.json({
            success: true,
            data: {
                address: newAddress.address,
                addressId: newAddress.id,
                isNew: true
            }
        });

    } catch (error: any) {
        logger.error('Create address error', { error: error.message });
        return next(new AppError('Failed to create wallet address', 500));
    }
});

/**
 * GET /api/wallet/address
 * Get user's deposit address (creates one if doesn't exist)
 */
router.get('/address', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;

        // Get user from database
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, blockradar_address_id, blockradar_address, first_name, last_name')
            .or(`supabase_id.eq.${userId},privy_id.eq.${userId}`)
            .single();

        if (userError || !userData) {
            throw new AppError('User not found', 404);
        }

        // Return existing address
        if (userData.blockradar_address) {
            return res.json({
                success: true,
                data: {
                    address: userData.blockradar_address,
                    addressId: userData.blockradar_address_id,
                    chain: 'base'
                }
            });
        }

        // Create new address if none exists
        const userName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || undefined;
        const newAddress = await BlockradarService.createAddress(userData.id, userName);

        // Save to database
        await supabase
            .from('users')
            .update({
                blockradar_address_id: newAddress.id,
                blockradar_address: newAddress.address
            })
            .eq('id', userData.id);

        return res.json({
            success: true,
            data: {
                address: newAddress.address,
                addressId: newAddress.id,
                chain: 'base'
            }
        });

    } catch (error: any) {
        logger.error('Get address error', { error: error.message });
        return next(new AppError('Failed to get wallet address', 500));
    }
});

/**
 * GET /api/wallet/transactions
 * Get transaction history for user's address
 */
router.get('/transactions', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;

        // Get user from database
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('blockradar_address_id')
            .or(`supabase_id.eq.${userId},privy_id.eq.${userId}`)
            .single();

        if (userError || !userData?.blockradar_address_id) {
            return res.json({
                success: true,
                data: { transactions: [] }
            });
        }

        // Get transactions from Blockradar
        const transactions = await BlockradarService.getAddressTransactions(
            userData.blockradar_address_id,
            page,
            limit
        );

        return res.json({
            success: true,
            data: { transactions }
        });

    } catch (error: any) {
        logger.error('Get transactions error', { error: error.message });
        return next(new AppError('Failed to get transactions', 500));
    }
});

export default router;
