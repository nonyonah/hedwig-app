import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';
import AlchemyAddressService from '../services/alchemyAddress';
import { createLogger } from '../utils/logger';
import { PrivyClient } from '@privy-io/server-auth';

const logger = createLogger('Auth');

const router = Router();

// Initialize Privy client for fetching user details
const privy = new PrivyClient(
    process.env.PRIVY_APP_ID!,
    process.env.PRIVY_APP_SECRET!
);

/**
 * POST /api/auth/register
 * Register or login a user with Privy
 */
router.post('/register', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { email, firstName, lastName, walletAddresses, avatar } = req.body;
        const privyId = req.user!.id;

        logger.info('Registration request received', { 
            firstName, 
            lastName, 
            hasWallets: !!walletAddresses,
            ethereumWallet: walletAddresses?.ethereum || 'none',
            solanaWallet: walletAddresses?.solana || 'none',
            stacksWallet: walletAddresses?.stacks || 'none'
        });

        // Check if user already exists by privy_id or email
        const { data: existingUsers, error: findError } = await supabase
            .from('users')
            .select('*')
            .or(`privy_id.eq.${privyId},id.eq.${email}`);

        if (findError) {
            throw new AppError(`Database error: ${findError.message}`, 500);
        }

        let user = existingUsers && existingUsers.length > 0 ? existingUsers[0] : null;

        if (!user) {
            // Create new user
            // Use email as the ID as requested
            const userId = email;

            logger.info('Creating new user', { 
                hasEthWallet: !!walletAddresses?.ethereum, 
                hasSolWallet: !!walletAddresses?.solana,
                ethAddress: walletAddresses?.ethereum || 'none',
                solAddress: walletAddresses?.solana || 'none'
            });

            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert({
                    id: userId, // Explicitly set ID to email
                    privy_id: privyId,
                    email,
                    first_name: firstName,
                    last_name: lastName,
                    ethereum_wallet_address: walletAddresses?.ethereum,
                    solana_wallet_address: walletAddresses?.solana,
                    stacks_wallet_address: walletAddresses?.stacks,
                    last_login: new Date().toISOString(),
                    avatar,
                })
                .select()
                .single();

            if (createError) {
                throw new AppError(`Failed to create user: ${createError.message}`, 500);
            }
            
            logger.info('User created successfully', {
                userId: newUser.id,
                ethereumWallet: newUser.ethereum_wallet_address || 'none',
                solanaWallet: newUser.solana_wallet_address || 'none'
            });
            
            user = newUser;
        } else {
            // Update last login and wallet addresses if changed
            logger.debug('Updating existing user', { 
                hasNewEthWallet: !!walletAddresses?.ethereum, 
                hasNewSolWallet: !!walletAddresses?.solana,
                currentEthWallet: user.ethereum_wallet_address || 'none',
                newEthWallet: walletAddresses?.ethereum || 'none'
            });

            const { data: updatedUser, error: updateError } = await supabase
                .from('users')
                .update({
                    privy_id: privyId, // Ensure privy_id is synced if we matched by email
                    last_login: new Date().toISOString(),
                    first_name: firstName || user.first_name,
                    last_name: lastName !== undefined ? lastName : user.last_name,
                    ethereum_wallet_address: walletAddresses?.ethereum || user.ethereum_wallet_address,
                    solana_wallet_address: walletAddresses?.solana || user.solana_wallet_address,
                    stacks_wallet_address: walletAddresses?.stacks || user.stacks_wallet_address,
                    avatar: avatar || user.avatar,
                })
                .eq('id', user.id)
                .select()
                .single();

            if (updateError) {
                throw new AppError(`Failed to update user: ${updateError.message}`, 500);
            }

            logger.info('User updated successfully', {
                userId: updatedUser.id,
                ethereumWallet: updatedUser.ethereum_wallet_address || 'none',
                solanaWallet: updatedUser.solana_wallet_address || 'none'
            });
            user = updatedUser;
        }

        // Register wallet addresses with Alchemy webhooks for real-time notifications
        if (walletAddresses?.ethereum || walletAddresses?.solana) {
            try {
                await AlchemyAddressService.registerUserWallets({
                    ethereum: walletAddresses.ethereum,
                    solana: walletAddresses.solana
                });
                logger.info('Registered wallets with Alchemy webhooks');
            } catch (webhookError: any) {
                // Don't fail registration if webhook registration fails
                logger.error('Failed to register wallets with Alchemy', { error: webhookError.message });
            }
        }

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    wallets: {
                        ethereum: user.ethereum_wallet_address,
                        solana: user.solana_wallet_address,
                    },
                    createdAt: user.created_at,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', authenticate, async (req: Request, res: Response, next) => {
    try {
        // First try to find by privy_id
        let { data: user, error } = await supabase
            .from('users')
            .select(`
                id,
                email,
                first_name,
                last_name,
                avatar,
                ethereum_wallet_address,
                solana_wallet_address,
                stacks_wallet_address,
                created_at,
                updated_at,
                privy_id
            `)
            .eq('privy_id', req.user!.id)
            .single();

        // If not found by privy_id, try to find by email (for returning users)
        if (error || !user) {
            logger.debug('User not found by privy_id, trying to fetch email from Privy', { privyId: req.user!.privyId });
            
            try {
                // Fetch user details from Privy to get their email
                const privyUserId = req.user!.privyId || req.user!.id;
                const privyUser = await privy.getUser(privyUserId);
                const email = privyUser?.email?.address || privyUser?.google?.email || privyUser?.apple?.email;
                
                if (email) {
                    logger.debug('Found email from Privy, searching by email', { email });
                    const result = await supabase
                        .from('users')
                        .select(`
                            id,
                            email,
                            first_name,
                            last_name,
                            avatar,
                            ethereum_wallet_address,
                            solana_wallet_address,
                            stacks_wallet_address,
                            created_at,
                            updated_at,
                            privy_id
                        `)
                        .eq('email', email)
                        .single();
                    
                    user = result.data;
                    error = result.error;
                    
                    // If found by email, update the privy_id to keep them in sync
                    if (user && user.privy_id !== req.user!.privyId) {
                        logger.info('Updating privy_id for existing user', { email, oldPrivyId: user.privy_id, newPrivyId: req.user!.privyId });
                        await supabase
                            .from('users')
                            .update({ privy_id: req.user!.privyId, last_login: new Date().toISOString() })
                            .eq('id', user.id);
                    }
                } else {
                    logger.debug('No email found in Privy user object');
                }
            } catch (privyError: any) {
                logger.warn('Failed to fetch user from Privy', { error: privyError.message });
            }
        }

        if (error || !user) {
            logger.warn('User not found', { error: error?.message || 'User not found in DB' });
            throw new AppError('User not found', 404);
        }

        // Map snake_case to camelCase for API response
        const formattedUser = {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            avatar: user.avatar,
            ethereumWalletAddress: user.ethereum_wallet_address,
            solanaWalletAddress: user.solana_wallet_address,
            stacksWalletAddress: user.stacks_wallet_address,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
        };

        res.json({
            success: true,
            data: { user: formattedUser },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/auth/check-user?email=<email>
 * Check if a user exists by email
 */
router.get('/check-user', async (req: Request, res: Response, next) => {
    try {
        const { email } = req.query;

        if (!email || typeof email !== 'string') {
            throw new AppError('Email is required', 400);
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw new AppError(`Database error: ${error.message}`, 500);
        }

        res.json({
            success: true,
            data: { exists: !!user },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/auth/user-wallets?email=<email>
 * Get wallet addresses for a user by email (for debugging)
 */
router.get('/user-wallets', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { email } = req.query;

        if (!email || typeof email !== 'string') {
            throw new AppError('Email is required', 400);
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, ethereum_wallet_address, solana_wallet_address, stacks_wallet_address, created_at')
            .eq('email', email)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                throw new AppError('User not found', 404);
            }
            throw new AppError(`Database error: ${error.message}`, 500);
        }

        logger.info('Wallet lookup', {
            email: user.email,
            ethereumWallet: user.ethereum_wallet_address || 'NOT SET',
            solanaWallet: user.solana_wallet_address || 'NOT SET',
            stacksWallet: user.stacks_wallet_address || 'NOT SET'
        });

        res.json({
            success: true,
            data: {
                userId: user.id,
                email: user.email,
                wallets: {
                    ethereum: user.ethereum_wallet_address || null,
                    solana: user.solana_wallet_address || null,
                    stacks: user.stacks_wallet_address || null,
                },
                createdAt: user.created_at
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/auth/test-auto-withdrawal
 * Test endpoint to verify auto-withdrawal flow would work for a user
 * This simulates what happens when a payment link deposit is received
 */
router.post('/test-auto-withdrawal', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { userId, amount } = req.body;

        if (!userId) {
            throw new AppError('userId is required', 400);
        }

        const testAmount = parseFloat(amount) || 100;
        const PLATFORM_FEE_PERCENT = 0.005; // 0.5%
        const platformFee = testAmount * PLATFORM_FEE_PERCENT;
        const freelancerAmount = testAmount - platformFee;

        logger.info('Testing auto-withdrawal flow', { userId, testAmount });

        // Get user wallet info (same query as auto-withdrawal)
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, ethereum_wallet_address, solana_wallet_address')
            .eq('id', userId)
            .single();

        if (userError) {
            throw new AppError(`Database error: ${userError.message}`, 500);
        }

        if (!user) {
            throw new AppError('User not found', 404);
        }

        const result: any = {
            userId: user.id,
            email: user.email,
            testAmount,
            platformFee,
            freelancerAmount,
            wallets: {
                ethereum: user.ethereum_wallet_address || null,
                solana: user.solana_wallet_address || null,
            },
            autoWithdrawalReady: false,
            issues: []
        };

        // Check if auto-withdrawal would work
        if (!user.ethereum_wallet_address && !user.solana_wallet_address) {
            result.issues.push('No wallet address found (ETH or SOL) - user needs to complete biometrics setup');
        } else {
            result.autoWithdrawalReady = true;
            
            // Default to Base/USDC for test if no specific chain requested
            // In real flow, this depends on the incoming payment
            if (user.ethereum_wallet_address) {
                result.withdrawalDetails = {
                    toAddress: user.ethereum_wallet_address,
                    amount: freelancerAmount,
                    chain: 'BASE',
                    asset: 'USDC',
                    note: 'Primary ETH wallet available'
                };
            } else if (user.solana_wallet_address) {
                 result.withdrawalDetails = {
                    toAddress: user.solana_wallet_address,
                    amount: freelancerAmount,
                    chain: 'SOLANA',
                    asset: 'USDC',
                    note: 'Solana wallet available'
                };
            }
        }

        logger.info('Auto-withdrawal test result', {
            userId: user.id,
            ready: result.autoWithdrawalReady,
            hasEthWallet: !!user.ethereum_wallet_address,
            hasSolWallet: !!user.solana_wallet_address
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/auth/demo-login
 * Demo login for Apple App Review
 * Accepts demo email and code 123456
 */
router.post('/demo-login', async (req: Request, res: Response, next) => {
    try {
        const { email, code } = req.body;
        
        const DEMO_EMAIL = process.env.DEMO_ACCOUNT_EMAIL || 'demo@hedwig.app';
        const DEMO_CODE = process.env.DEMO_ACCOUNT_CODE || '123456';
        
        // Only allow demo login for the specific demo email
        if (email !== DEMO_EMAIL) {
            throw new AppError('Invalid demo credentials', 401);
        }
        
        // Verify demo code
        if (code !== DEMO_CODE) {
            throw new AppError('Invalid verification code', 401);
        }
        
        // Fetch demo user
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', DEMO_EMAIL)
            .single();
            
        if (error || !user) {
            logger.error('Demo user not found', { error: error?.message });
            throw new AppError('Demo account not configured', 500);
        }
        
        // Update last login
        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);
        
        logger.info('Demo login successful', { email: DEMO_EMAIL });
        
        // Return demo user data with a special demo token
        // The demo token is a simple base64 encoded privy_id for demo purposes
        const demoToken = Buffer.from(`demo:${user.privy_id}:${Date.now()}`).toString('base64');
        
        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    avatar: user.avatar,
                    ethereumWalletAddress: user.ethereum_wallet_address,
                    solanaWalletAddress: user.solana_wallet_address,
                },
                demoToken,
                isDemo: true,
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
