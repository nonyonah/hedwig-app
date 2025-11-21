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
        const { email, walletAddresses } = req.body;
        const privyId = req.user!.privyId;

        // Check if user already exists
        const { data: existingUser, error: findError } = await supabase
            .from('users')
            .select('*')
            .eq('privy_id', privyId)
            .single();

        if (findError && findError.code !== 'PGRST116') { // PGRST116 is "The result contains 0 rows"
            throw new AppError(`Database error: ${findError.message}`, 500);
        }

        let user = existingUser;

        if (!user) {
            // Create new user
            // Use email as the ID as requested
            const userId = email;

            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert({
                    id: userId, // Explicitly set ID to email
                    privy_id: privyId,
                    email,
                    base_wallet_address: walletAddresses?.base,
                    celo_wallet_address: walletAddresses?.celo,
                    solana_wallet_address: walletAddresses?.solana,
                    last_login: new Date().toISOString(),
                })
                .select()
                .single();

            if (createError) {
                throw new AppError(`Failed to create user: ${createError.message}`, 500);
            }
            user = newUser;
        } else {
            // Update last login and wallet addresses if changed
            const { data: updatedUser, error: updateError } = await supabase
                .from('users')
                .update({
                    last_login: new Date().toISOString(),
                    base_wallet_address: walletAddresses?.base || user.base_wallet_address,
                    celo_wallet_address: walletAddresses?.celo || user.celo_wallet_address,
                    solana_wallet_address: walletAddresses?.solana || user.solana_wallet_address,
                })
                .eq('id', user.id)
                .select()
                .single();

            if (updateError) {
                throw new AppError(`Failed to update user: ${updateError.message}`, 500);
            }
            user = updatedUser;
        }

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    wallets: {
                        base: user.base_wallet_address,
                        celo: user.celo_wallet_address,
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
                base_wallet_address,
                celo_wallet_address,
                solana_wallet_address,
                created_at,
                updated_at
            `)
            .eq('privy_id', req.user!.privyId)
            .single();

        if (error || !user) {
            throw new AppError('User not found', 404);
        }

        // Map snake_case to camelCase for API response
        const formattedUser = {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            avatar: user.avatar,
            baseWalletAddress: user.base_wallet_address,
            celoWalletAddress: user.celo_wallet_address,
            solanaWalletAddress: user.solana_wallet_address,
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
