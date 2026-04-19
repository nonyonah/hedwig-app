import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { EmailService } from '../services/email';
import { createLogger } from '../utils/logger';

const logger = createLogger('User');

const router = Router();

/**
 * GET /api/users/profile
 * Get user profile
 */
router.get('/profile', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;

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
        const privyId = req.user!.id;

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

/**
 * DELETE /api/users/account
 * Permanently delete the user account and all associated data.
 */
router.delete('/account', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;

        logger.info('Account deletion requested', { privyId });

        // Fetch user first so we have email/name for the confirmation email
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('id, email, first_name')
            .eq('privy_id', privyId)
            .maybeSingle();

        if (fetchError) {
            throw new Error(`Failed to fetch user: ${fetchError.message}`);
        }

        if (!user) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }

        // Hard delete — cascades to all related records via FK constraints
        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('privy_id', privyId);

        if (deleteError) {
            throw new Error(`Failed to delete account: ${deleteError.message}`);
        }

        logger.info('Account permanently deleted', { userId: user.id, email: user.email });

        // Send confirmation email (fire-and-forget — don't block the response)
        EmailService.sendAccountDeletionEmail({
            to: user.email,
            firstName: user.first_name,
        }).catch((err) => {
            logger.error('Failed to send account deletion email', { error: err?.message });
        });

        res.json({
            success: true,
            data: { message: 'Account permanently deleted.' },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/users/account/restore
 * Cancel account deletion (if within 90-day grace period)
 */
router.post('/account/restore', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;

        // Clear deletion timestamps
        const { data: user, error } = await supabase
            .from('users')
            .update({
                deleted_at: null,
                deletion_scheduled_for: null,
            })
            .eq('privy_id', privyId)
            .select('id, email, first_name')
            .maybeSingle();

        if (error) {
            throw new Error(`Failed to restore account: ${error.message}`);
        }

        if (!user) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }

        logger.info('Account deletion cancelled', { userId: user.id, email: user.email });

        res.json({
            success: true,
            data: {
                message: 'Account restored successfully',
            },
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/users/preferences
router.get('/preferences', authenticate, async (req, res, next) => {
    try {
        const privyId = req.user!.id;
        const { data: user, error } = await supabase.from('users').select('id, client_reminders_enabled').eq('privy_id', privyId).single();
        if (error || !user) { res.status(404).json({ success: false }); return; }
        res.json({ success: true, data: { clientRemindersEnabled: user.client_reminders_enabled ?? true } });
    } catch (error) { next(error); }
});

// PATCH /api/users/preferences
router.patch('/preferences', authenticate, async (req, res, next) => {
    try {
        const privyId = req.user!.id;
        const { data: user, error } = await supabase.from('users').select('id').eq('privy_id', privyId).single();
        if (error || !user) { res.status(404).json({ success: false }); return; }
        const { clientRemindersEnabled } = req.body;
        await supabase.from('users').update({
            client_reminders_enabled: Boolean(clientRemindersEnabled),
            updated_at: new Date().toISOString(),
        }).eq('id', user.id);
        res.json({ success: true, data: { clientRemindersEnabled: Boolean(clientRemindersEnabled) } });
    } catch (error) { next(error); }
});

export default router;
