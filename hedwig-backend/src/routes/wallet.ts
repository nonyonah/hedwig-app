import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { supabase } from '../lib/supabase';
import BlockradarService from '../services/blockradar';
import { createLogger } from '../utils/logger';

const logger = createLogger('Wallet');

const router = Router();

/**
 * GET /api/wallet/balance
 * Fetch balances for the user from Blockradar (custodial wallet)
 * Returns cached balance from database (updated via webhooks)
 */
router.get('/balance', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;
        logger.debug('Fetching balances', { userId });

        // Get user's Blockradar address from database
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, blockradar_address_id, blockradar_address')
            .or(`supabase_id.eq.${userId},privy_id.eq.${userId}`)
            .single();

        if (userError || !userData) {
            logger.warn('User not found', { userId });
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

        // If user doesn't have a Blockradar address yet, return zero balance
        if (!userData.blockradar_address_id) {
            logger.debug('User has no Blockradar address yet', { userId: userData.id });
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

        // Try to get balance from Blockradar API (real-time)
        let balances: any[] = [];
        try {
            const blockradarBalances = await BlockradarService.getAddressBalance(userData.blockradar_address_id);
            
            if (blockradarBalances && blockradarBalances.length > 0) {
                balances = blockradarBalances.map((bal: any) => ({
                    chain: 'base',
                    asset: bal.asset?.symbol?.toLowerCase() || 'usdc',
                    raw_value: bal.balance || '0',
                    display_values: {
                        token: bal.balanceFormatted || bal.balance || '0',
                        usd: bal.balanceFormatted || bal.balance || '0' // USDC = $1
                    }
                }));
            }
        } catch (blockradarError) {
            logger.warn('Failed to fetch from Blockradar, using cached balance', { 
                error: blockradarError instanceof Error ? blockradarError.message : 'Unknown' 
            });
            
            // Fall back to cached balance from database
            const { data: cachedBalances } = await supabase
                .from('user_balances')
                .select('*')
                .eq('user_id', userData.id);

            if (cachedBalances && cachedBalances.length > 0) {
                balances = cachedBalances.map((bal: any) => ({
                    chain: bal.chain,
                    asset: bal.asset,
                    raw_value: bal.amount?.toString() || '0',
                    display_values: {
                        token: bal.amount?.toString() || '0',
                        usd: bal.amount?.toString() || '0'
                    }
                }));
            }
        }

        // Ensure at least one balance entry for Base USDC
        if (balances.length === 0) {
            balances.push({
                chain: 'base',
                asset: 'usdc',
                raw_value: '0',
                display_values: { token: '0', usd: '0' }
            });
        }

        logger.debug('Balances fetched', { count: balances.length });

        return res.json({
            success: true,
            data: {
                balances,
                address: userData.blockradar_address
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
