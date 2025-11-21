import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';

const router = Router();

/**
 * GET /api/users/profile
 * Get user profile
 */
router.get('/profile', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.privyId;

        // Fetch user profile
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('privy_id', privyId)
            .single();

        if (error || !user) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }

        // Fetch counts (optional, but good to have if the frontend expects it)
        // We can do this in parallel
        const [
            { count: documentsCount },
            { count: transactionsCount },
            { count: clientsCount }
        ] = await Promise.all([
            supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
            supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
            supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
        ]);

        // Map snake_case to camelCase
        const formattedUser = {
            id: user.id,
            privyId: user.privy_id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            avatar: user.avatar,
            baseWalletAddress: user.base_wallet_address,
            celoWalletAddress: user.celo_wallet_address,
            solanaWalletAddress: user.solana_wallet_address,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            lastLogin: user.last_login,
            _count: {
                documents: documentsCount || 0,
                transactions: transactionsCount || 0,
                clients: clientsCount || 0,
            }
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
 * PATCH /api/users/profile
 * Update user profile
 */
router.patch('/profile', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { firstName, lastName, email } = req.body;
        const privyId = req.user!.privyId;

        const { data: user, error } = await supabase
            .from('users')
            .update({
                first_name: firstName,
                last_name: lastName,
                email,
            })
            .eq('privy_id', privyId)
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to update profile: ${error.message}`);
        }

        // Map snake_case to camelCase
        const formattedUser = {
            id: user.id,
            privyId: user.privy_id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            avatar: user.avatar,
            baseWalletAddress: user.base_wallet_address,
            celoWalletAddress: user.celo_wallet_address,
            solanaWalletAddress: user.solana_wallet_address,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            lastLogin: user.last_login,
        };

        res.json({
            success: true,
            data: { user: formattedUser },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
