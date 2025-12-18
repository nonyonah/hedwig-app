import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';

const router = Router();

/**
 * POST /api/auth/register
 * Register or login a user with Privy
 */
router.post('/register', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { email, firstName, lastName, walletAddresses, avatar } = req.body;
        const privyId = req.user!.privyId;

        console.log('Registration request:', { email, firstName, lastName, walletAddresses });

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

            console.log('Creating new user with data:', {
                id: userId,
                privy_id: privyId,
                email,
                first_name: firstName,
                last_name: lastName,
                ethereum_wallet_address: walletAddresses?.ethereum,
                solana_wallet_address: walletAddresses?.solana,
                avatar,
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
            user = newUser;
        } else {
            // Update last login and wallet addresses if changed
            console.log('[Auth] Updating existing user:', {
                userId: user.id,
                currentEthWallet: user.ethereum_wallet_address,
                newEthWallet: walletAddresses?.ethereum,
                currentSolWallet: user.solana_wallet_address,
                newSolWallet: walletAddresses?.solana,
                newAvatar: avatar
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

            console.log('[Auth] User updated:', {
                id: updatedUser.id,
                privyId: updatedUser.privy_id,
                ethereumWallet: updatedUser.ethereum_wallet_address,
                solanaWallet: updatedUser.solana_wallet_address
            });
            user = updatedUser;
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
        const { data: user, error } = await supabase
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
                updated_at
            `)
            .eq('privy_id', req.user!.privyId)
            .single();

        if (error || !user) {
            console.error('[Auth] /me error:', error || 'User not found in DB');
            console.log('[Auth] Checked privy_id:', req.user!.privyId);
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

export default router;
