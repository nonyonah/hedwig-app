import { Router, Request, Response } from 'express';
import { authenticate, privy } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { supabase } from '../lib/supabase';
import BlockradarService from '../services/blockradar';
import { createLogger } from '../utils/logger';
import { PrivyClient } from '@privy-io/node';

const logger = createLogger('Wallet');

const router = Router();

// Initialize Privy Node API client for wallet operations
const privyNode = new PrivyClient({
    appId: process.env.PRIVY_APP_ID!,
    appSecret: process.env.PRIVY_APP_SECRET!
});

/**
 * GET /api/wallet/balance
 * Fetch balances for the user from Privy (embedded wallet)
 */
router.get('/balance', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;
        logger.debug('Fetching balances', { userId });

        // 1. Get User from Privy to find wallet addresses and IDs
        const user = await privy.getUser(userId);
        
        // Extract wallets with both id and address
        // The balance API requires wallet_id, not address
        interface WalletInfo {
            id: string | null;
            address: string;
            type: 'evm' | 'solana';
        }
        
        const wallets: WalletInfo[] = [];

        // Check for EVM embedded wallet in linkedAccounts
        const evmEmbeddedWallets = user.linkedAccounts.filter((a: any) => 
            a.type === 'wallet' && 
            a.walletClientType === 'privy' && 
            a.chainType === 'ethereum'
        );
        
        evmEmbeddedWallets.forEach((w: any) => {
            wallets.push({ 
                id: w.id || null, 
                address: w.address, 
                type: 'evm' 
            });
        });

        // Check for Solana embedded wallet in linkedAccounts
        const solanaWallets = user.linkedAccounts.filter((a: any) => 
            a.type === 'wallet' && 
            a.walletClientType === 'privy' && 
            a.chainType === 'solana'
        );
        
        solanaWallets.forEach((w: any) => {
            wallets.push({ 
                id: w.id || null, 
                address: w.address, 
                type: 'solana' 
            });
        });
        
        // Fallback: if user.wallet exists and we didn't find EVM wallet above
        if (user.wallet && !wallets.find(w => w.type === 'evm')) {
            wallets.push({
                id: (user.wallet as any).id || null,
                address: user.wallet.address,
                type: 'evm'
            });
        }

        logger.debug('Found wallets', { wallets: wallets.map(w => ({ type: w.type, hasId: !!w.id, address: w.address?.slice(0,10) })) });

        if (wallets.length === 0) {
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
                    address: null,
                    solanaAddress: null
                }
            });
        }

        // 2. Fetch balances from Privy API for each wallet
        let allBalances: any[] = [];
        
        for (const wallet of wallets) {
            // Skip if no wallet_id - balance API requires it
            if (!wallet.id) {
                logger.warn('Wallet missing id, skipping balance fetch', { address: wallet.address?.slice(0,10), type: wallet.type });
                continue;
            }
            
            // Determine chain and assets based on wallet type
            let chainType: string;
            let assets: string[];

            if (wallet.type === 'evm') {
                chainType = 'base';
                assets = ['eth', 'usdc'];
            } else if (wallet.type === 'solana') {
                chainType = 'solana';
                assets = ['sol', 'usdc'];
            } else {
                continue;
            }

            // Make a separate API call for each asset (API doesn't support array)
            for (const asset of assets) {
                try {
                    logger.debug('Fetching balance for wallet', { walletId: wallet.id, chain: chainType, asset });

                    // Use Privy Node SDK to fetch balance with single asset
                    const response = await privyNode.wallets().balance.get(wallet.id, {
                        chain: chainType as any,
                        asset: asset as any,
                        include_currency: 'usd'
                    });

                    logger.debug('Balance response', { walletId: wallet.id, asset, response });

                    if (response && response.balances) {
                        for (const bal of response.balances) {
                            allBalances.push({
                                chain: bal.chain,
                                asset: bal.asset,
                                raw_value: bal.raw_value,
                                display_values: {
                                    token: bal.display_values?.token || '0',
                                    usd: bal.display_values?.usd || '0'
                                }
                            });
                        }
                    }
                } catch (apiError: any) {
                    logger.error('Privy API balance fetch failed', { 
                        walletId: wallet.id, 
                        asset,
                        error: apiError.message?.slice(0, 200)
                    });
                }
            }
        }

        const primaryAddress = wallets.find(w => w.type === 'evm')?.address || wallets[0]?.address;
        const solanaAddress = wallets.find(w => w.type === 'solana')?.address;

        return res.json({
            success: true,
            data: {
                balances: allBalances,
                address: primaryAddress,
                solanaAddress: solanaAddress
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

/**
 * GET /api/wallet/blockradar-assets
 * Get available assets in Blockradar wallet (for debugging)
 */
router.get('/blockradar-assets', authenticate, async (_req: Request, res: Response, next) => {
    try {
        logger.info('Fetching Blockradar wallet assets');

        const assets = await BlockradarService.getAssets();
        const balance = await BlockradarService.getMasterWalletBalance();

        logger.info('Blockradar assets fetched', { 
            assetCount: assets.length,
            balanceCount: balance.length,
            rawAssets: assets // Log full structure
        });

        return res.json({
            success: true,
            data: {
                assets: assets.map(a => ({
                    id: a.id,
                    symbol: a.symbol || a.asset?.symbol,
                    name: a.name || a.asset?.name,
                    decimals: a.decimals || a.asset?.decimals,
                    blockchain: a.blockchain || a.asset?.blockchain,
                    raw: a // Include full object for debugging
                })),
                balances: balance.map(b => ({
                    assetId: b.assetId,
                    symbol: b.asset.symbol,
                    balance: b.balanceFormatted,
                    rawBalance: b.balance
                }))
            }
        });

    } catch (error: any) {
        logger.error('Get Blockradar assets error', { error: error.message });
        return next(new AppError('Failed to get Blockradar assets', 500));
    }
});

export default router;
