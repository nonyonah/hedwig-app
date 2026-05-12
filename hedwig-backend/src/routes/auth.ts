import { Router, Request, Response } from 'express';
import { authenticate, getPrivyAuthClient } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';
import AlchemyAddressService from '../services/alchemyAddress';
import { EmailService } from '../services/email';
import { ensurePrivyEmbeddedWallets } from '../services/privyWallets';
import { createLogger } from '../utils/logger';

const logger = createLogger('Auth');

const router = Router();

type WalletAddresses = {
    ethereum?: string | null;
    solana?: string | null;
    stacks?: string | null;
};

function normalizeWalletAddresses(value: any): WalletAddresses {
    if (!value || typeof value !== 'object') return {};
    return {
        ethereum: typeof value.ethereum === 'string' && value.ethereum.trim() ? value.ethereum.trim() : null,
        solana: typeof value.solana === 'string' && value.solana.trim() ? value.solana.trim() : null,
        stacks: typeof value.stacks === 'string' && value.stacks.trim() ? value.stacks.trim() : null,
    };
}

function extractEmailFromPrivyUser(privyUser: any): string {
    return String(
        privyUser?.email?.address ||
        privyUser?.google?.email ||
        privyUser?.apple?.email ||
        (Array.isArray(privyUser?.linkedAccounts)
            ? privyUser.linkedAccounts.find((account: any) => account?.type === 'email')?.address
            : '') ||
        ''
    ).trim().toLowerCase();
}

function extractNameFromPrivyUser(privyUser: any): { firstName: string; lastName: string } {
    const googleName = typeof privyUser?.google?.name === 'string' ? privyUser.google.name.trim() : '';
    const googleParts = googleName ? googleName.split(/\s+/) : [];
    return {
        firstName: String(privyUser?.apple?.firstName || privyUser?.firstName || googleParts[0] || '').trim(),
        lastName: String(privyUser?.apple?.lastName || privyUser?.lastName || googleParts.slice(1).join(' ') || '').trim(),
    };
}

function looksLikeEvmAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

function looksLikeSolanaAddress(address: string): boolean {
    const normalized = address.trim();
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(normalized) && !looksLikeEvmAddress(normalized);
}

function extractWalletsFromPrivyUser(privyUser: any): WalletAddresses {
    const wallets: WalletAddresses = {};

    const linkedAccounts = Array.isArray(privyUser?.linkedAccounts) ? privyUser.linkedAccounts : [];
    for (const account of linkedAccounts) {
        const address = typeof account?.address === 'string' ? account.address.trim() : '';
        if (!address) continue;

        const chainType = String(account?.chainType || account?.chain_type || '').toLowerCase();
        const type = String(account?.type || '').toLowerCase();
        const walletClientType = String(account?.walletClientType || account?.wallet_client_type || '').toLowerCase();
        if (type === 'smart_wallet') continue;

        if (!wallets.ethereum && type === 'wallet' && walletClientType === 'privy' && chainType === 'ethereum') {
            wallets.ethereum = address;
            continue;
        }

        if (!wallets.solana && type === 'wallet' && walletClientType === 'privy' && chainType === 'solana') {
            wallets.solana = address;
        }
    }

    const primaryWalletAddress = typeof privyUser?.wallet?.address === 'string'
        ? privyUser.wallet.address.trim()
        : '';
    if (!wallets.ethereum && looksLikeEvmAddress(primaryWalletAddress)) {
        wallets.ethereum = primaryWalletAddress;
    } else if (!wallets.solana && looksLikeSolanaAddress(primaryWalletAddress)) {
        wallets.solana = primaryWalletAddress;
    }

    for (const account of linkedAccounts) {
        const address = typeof account?.address === 'string' ? account.address.trim() : '';
        if (!address) continue;

        const chainType = String(account?.chainType || account?.chain_type || '').toLowerCase();
        const type = String(account?.type || '').toLowerCase();
        if (type === 'smart_wallet') continue;

        if (!wallets.ethereum && (chainType === 'ethereum' || chainType === 'evm' || type === 'ethereum' || looksLikeEvmAddress(address))) {
            wallets.ethereum = address;
            continue;
        }

        if (!wallets.solana && (chainType === 'solana' || type === 'solana' || looksLikeSolanaAddress(address))) {
            wallets.solana = address;
        }
    }

    return wallets;
}

/**
 * POST /api/auth/register
 * Register or login a user with Privy
 */
router.post('/register', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { avatar } = req.body;
        const privyId = req.user!.id;
        const requestWallets = normalizeWalletAddresses(req.body.walletAddresses);

        let privyUser: any = null;
        if (!req.body.email || !requestWallets.ethereum || !requestWallets.solana) {
            try {
                privyUser = await getPrivyAuthClient().getUser(privyId);
            } catch (privyError: any) {
                logger.warn('Could not fetch Privy user during registration', {
                    privyId,
                    error: privyError?.message || 'Unknown error',
                });
            }
        }

        let privyWallets = extractWalletsFromPrivyUser(privyUser);
        if (!requestWallets.ethereum || !requestWallets.solana) {
            try {
                const ensuredWallets = await ensurePrivyEmbeddedWallets(privyId, {
                    ethereum: !requestWallets.ethereum,
                    solana: !requestWallets.solana,
                });
                privyWallets = {
                    ethereum: privyWallets.ethereum || ensuredWallets.ethereum || null,
                    solana: privyWallets.solana || ensuredWallets.solana || null,
                };
            } catch (walletError: any) {
                logger.warn('Could not ensure Privy embedded wallets during registration', {
                    privyId,
                    error: walletError?.message || 'Unknown error',
                });
            }
        }
        const privyName = extractNameFromPrivyUser(privyUser);
        const email = String(req.body.email || extractEmailFromPrivyUser(privyUser) || '').trim().toLowerCase();
        const firstName = String(req.body.firstName || privyName.firstName || '').trim();
        const lastName = String(req.body.lastName !== undefined ? req.body.lastName : privyName.lastName || '').trim();
        const walletAddresses: WalletAddresses = {
            ethereum: requestWallets.ethereum || privyWallets.ethereum || null,
            solana: requestWallets.solana || privyWallets.solana || null,
            stacks: requestWallets.stacks || null,
        };

        if (!email) {
            throw new AppError('Email is required to register a user', 400);
        }

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
                    subscription_status: 'inactive',
                    subscription_provider: null,
                    subscription_expiry: null,
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

            // Send app download email to new users (fire-and-forget)
            if (email) {
                void EmailService.sendAppDownloadEmail({
                    to: email,
                    firstName: firstName || '',
                }).catch(() => {})
            }
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
                    subscription_status: user.subscription_status || 'inactive',
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

        // Register wallet addresses with Alchemy webhooks for real-time notifications.
        // Use persisted DB values so this also works when request payload omits walletAddresses.
        if (
            process.env.ALCHEMY_WEBHOOK_REGISTRATION_ENABLED !== 'false' &&
            (user?.ethereum_wallet_address || user?.solana_wallet_address)
        ) {
            try {
                await AlchemyAddressService.registerUserWallets({
                    ethereum: user.ethereum_wallet_address,
                    solana: user.solana_wallet_address
                });
                logger.info('Registered wallets with Alchemy webhooks');
            } catch (webhookError: any) {
                // Don't fail registration if webhook registration fails
                logger.error('Failed to register wallets with Alchemy', { error: webhookError.message });
            }
        } else {
            logger.warn('Skipping Alchemy wallet registration because user has no saved wallet address', {
                userId: user?.id,
            });
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
                kyc_status,
                created_at,
                updated_at,
                privy_id,
                subscription_status,
                subscription_provider,
                subscription_expiry
            `)
            .eq('privy_id', req.user!.id)
            .single();

        // If not found by privy_id, try to find by email (for returning users)
        if (error || !user) {
            logger.debug('User not found by privy_id, trying to fetch email from Privy', { privyId: req.user!.privyId });
            
            try {
                // Fetch user details from Privy to get their email
                const privyUserId = req.user!.privyId || req.user!.id;
                const privyUser = await getPrivyAuthClient().getUser(privyUserId);
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
                            kyc_status,
                            created_at,
                            updated_at,
                            privy_id,
                            subscription_status,
                            subscription_provider,
                            subscription_expiry
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

        if (!user.ethereum_wallet_address || !user.solana_wallet_address) {
            try {
                const privyWallets = await ensurePrivyEmbeddedWallets(req.user!.privyId || req.user!.id, {
                    ethereum: !user.ethereum_wallet_address,
                    solana: !user.solana_wallet_address,
                });
                const updatePayload: Record<string, string> = {};

                if (!user.ethereum_wallet_address && privyWallets.ethereum) {
                    updatePayload.ethereum_wallet_address = privyWallets.ethereum;
                }
                if (!user.solana_wallet_address && privyWallets.solana) {
                    updatePayload.solana_wallet_address = privyWallets.solana;
                }

                if (Object.keys(updatePayload).length > 0) {
                    const { data: syncedUser, error: syncError } = await supabase
                        .from('users')
                        .update(updatePayload)
                        .eq('id', user.id)
                        .select(`
                            id,
                            email,
                            first_name,
                            last_name,
                            avatar,
                            ethereum_wallet_address,
                            solana_wallet_address,
                            stacks_wallet_address,
                            kyc_status,
                            created_at,
                            updated_at,
                            privy_id,
                            subscription_status,
                            subscription_provider,
                            subscription_expiry
                        `)
                        .single();

                    if (syncError) {
                        logger.warn('Failed to sync missing Privy wallets to user', {
                            userId: user.id,
                            error: syncError.message,
                        });
                    } else {
                        user = syncedUser;

                        if (process.env.ALCHEMY_WEBHOOK_REGISTRATION_ENABLED !== 'false') {
                            try {
                                await AlchemyAddressService.registerUserWallets({
                                    ethereum: user.ethereum_wallet_address,
                                    solana: user.solana_wallet_address,
                                });
                                logger.info('Registered synced wallets with Alchemy webhooks', { userId: user.id });
                            } catch (webhookError: any) {
                                logger.error('Failed to register synced wallets with Alchemy', {
                                    userId: user.id,
                                    error: webhookError?.message || 'Unknown error',
                                });
                            }
                        }
                    }
                }
            } catch (privyError: any) {
                logger.warn('Could not fetch Privy user to sync missing wallets', {
                    userId: user.id,
                    error: privyError?.message || 'Unknown error',
                });
            }
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
            kycStatus: user.kyc_status || 'not_started',
            subscriptionStatus: user.subscription_status || 'inactive',
            subscriptionProvider: user.subscription_provider || null,
            subscriptionExpiry: user.subscription_expiry || null,
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
