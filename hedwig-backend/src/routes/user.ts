import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('User');

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

        logger.debug('Fetched user profile', { 
            hasWallets: !!(user.ethereum_wallet_address || user.solana_wallet_address),
            hasAvatar: !!user.avatar
        });

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
            ethereumWalletAddress: user.ethereum_wallet_address,
            baseWalletAddress: user.ethereum_wallet_address, // For backwards compatibility
            solanaWalletAddress: user.solana_wallet_address,
            stacksWalletAddress: user.stacks_wallet_address,
            monthlyTarget: user.monthly_target,
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
        const { firstName, lastName, email, avatar, monthlyTarget } = req.body;
        const privyId = req.user!.privyId;

        const updateData: any = {};
        if (firstName !== undefined) updateData.first_name = firstName;
        if (lastName !== undefined) updateData.last_name = lastName;
        if (email !== undefined) updateData.email = email;
        if (avatar !== undefined) updateData.avatar = avatar;
        if (monthlyTarget !== undefined) updateData.monthly_target = monthlyTarget;

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
            res.status(400).json({
                success: false,
                error: { message: 'No fields to update' },
            });
            return;
        }

        const { data: user, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('privy_id', privyId)
            .select()
            .maybeSingle();

        if (error) {
            throw new Error(`Failed to update profile: ${error.message}`);
        }

        if (!user) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }

        // Map snake_case to camelCase
        const formattedUser = {
            id: user.id,
            privyId: user.privy_id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            avatar: user.avatar,
            ethereumWalletAddress: user.ethereum_wallet_address,
            baseWalletAddress: user.ethereum_wallet_address, // For backwards compatibility
            solanaWalletAddress: user.solana_wallet_address,
            monthlyTarget: user.monthly_target,
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
