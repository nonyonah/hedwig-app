import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import NotificationService from '../services/notifications';
import { getOrCreateUser } from '../utils/userHelper';

const router = Router();

/**
 * POST /api/notifications/register
 * Register a device push token for the authenticated user
 */
router.post('/register', authenticate, async (req: Request, res: Response) => {
    try {
        const privyId = req.user!.privyId;
        const { expoPushToken, platform } = req.body;

        console.log('[Notifications] Register request:', { privyId, expoPushToken: expoPushToken?.substring(0, 30), platform });

        if (!expoPushToken) {
            res.status(400).json({
                success: false,
                error: { message: 'expoPushToken is required' },
            });
            return;
        }

        // Validate token format
        if (!expoPushToken.startsWith('ExponentPushToken[') && !expoPushToken.startsWith('ExpoPushToken[')) {
            res.status(400).json({
                success: false,
                error: { message: 'Invalid Expo push token format' },
            });
            return;
        }

        // Get the actual user ID from database (email)
        const user = await getOrCreateUser(privyId);
        if (!user) {
            console.error('[Notifications] User not found for privyId:', privyId);
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }

        console.log('[Notifications] Registering device token for user:', user.id);

        const success = await NotificationService.registerDeviceToken(
            user.id,
            expoPushToken,
            platform || 'ios'
        );

        if (!success) {
            res.status(500).json({
                success: false,
                error: { message: 'Failed to register device token' },
            });
            return;
        }

        res.json({
            success: true,
            data: { message: 'Device token registered successfully' },
        });
    } catch (error: any) {
        console.error('[Notifications] Error registering token:', error.message, error.stack);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error', details: error.message },
        });
    }
});

/**
 * DELETE /api/notifications/unregister
 * Remove a device push token
 */
router.delete('/unregister', authenticate, async (req: Request, res: Response) => {
    try {
        const { expoPushToken } = req.body;

        if (!expoPushToken) {
            res.status(400).json({
                success: false,
                error: { message: 'expoPushToken is required' },
            });
            return;
        }

        await NotificationService.removeDeviceToken(expoPushToken);

        res.json({
            success: true,
            data: { message: 'Device token removed successfully' },
        });
    } catch (error: any) {
        console.error('[Notifications] Error removing token:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error' },
        });
    }
});

/**
 * POST /api/notifications/test
 * Send a test notification to the authenticated user (development only)
 */
router.post('/test', authenticate, async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production') {
        res.status(403).json({
            success: false,
            error: { message: 'Test notifications not available in production' },
        });
        return;
    }

    try {
        const userId = req.user!.id;
        console.log('[Notifications] Creating test in-app notification for user:', userId);

        // Create in-app notification in database
        const { data: notification, error: insertError } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                type: 'payment_received',
                title: '💰 Test Payment Received!',
                message: `This is a test notification. You received $10 USDC from a client.`,
                metadata: { test: true, amount: '10', token: 'USDC' },
            })
            .select()
            .single();

        if (insertError) {
            console.error('[Notifications] Error inserting test notification:', insertError);
            throw new Error(`Failed to create notification: ${insertError.message}`);
        }

        console.log('[Notifications] Created test notification:', notification?.id);

        // Also send push notification
        const tickets = await NotificationService.notifyUser(userId, {
            title: '🔔 Test Notification',
            body: 'This is a test notification from Hedwig!',
            data: { type: 'test' },
        });

        res.json({
            success: true,
            data: { notification, pushTickets: tickets },
        });
    } catch (error: any) {
        console.error('[Notifications] Error sending test:', error);
        res.status(500).json({
            success: false,
            error: { message: error.message || 'Internal server error' },
        });
    }
});

// ========== IN-APP NOTIFICATIONS ==========

import { supabase } from '../lib/supabase';

/**
 * GET /api/notifications
 * Get user's in-app notifications (paginated)
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        const privyId = req.user!.id; // This is the Privy ID (did:privy:...)
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;

        // First, get the internal user ID from Privy ID
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single();

        if (userError || !userData) {
            console.log('[Notifications] User not found for Privy ID:', privyId);
            res.json({
                success: true,
                data: { notifications: [], total: 0, limit, offset },
            });
            return;
        }

        const internalUserId = userData.id; // This is the email (nonyonah@gmail.com)
        console.log('[Notifications] Fetching notifications for user:', internalUserId);

        const { data: notifications, error, count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact' })
            .eq('user_id', internalUserId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            throw new Error(`Failed to fetch notifications: ${error.message}`);
        }

        console.log('[Notifications] Found notifications:', notifications?.length || 0);

        res.json({
            success: true,
            data: {
                notifications: notifications || [],
                total: count || 0,
                limit,
                offset,
            },
        });
    } catch (error: any) {
        console.error('[Notifications] Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error' },
        });
    }
});

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications
 */
router.get('/unread-count', authenticate, async (req: Request, res: Response) => {
    try {
        const privyId = req.user!.id;

        // Get internal user ID from Privy ID
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single();

        if (userError || !userData) {
            res.json({ success: true, data: { unreadCount: 0 } });
            return;
        }

        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userData.id)
            .eq('is_read', false);

        if (error) {
            throw new Error(`Failed to count notifications: ${error.message}`);
        }

        res.json({
            success: true,
            data: { unreadCount: count || 0 },
        });
    } catch (error: any) {
        console.error('[Notifications] Error counting unread:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error' },
        });
    }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
router.patch('/:id/read', authenticate, async (req: Request, res: Response) => {
    try {
        const privyId = req.user!.id;
        const notificationId = req.params.id;

        // Get internal user ID from Privy ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single();

        if (!userData) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('user_id', userData.id);

        if (error) {
            throw new Error(`Failed to mark as read: ${error.message}`);
        }

        res.json({
            success: true,
            data: { message: 'Notification marked as read' },
        });
    } catch (error: any) {
        console.error('[Notifications] Error marking as read:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error' },
        });
    }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
router.post('/read-all', authenticate, async (req: Request, res: Response) => {
    try {
        const privyId = req.user!.id;

        // Get internal user ID from Privy ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single();

        if (!userData) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userData.id)
            .eq('is_read', false);

        if (error) {
            throw new Error(`Failed to mark all as read: ${error.message}`);
        }

        res.json({
            success: true,
            data: { message: 'All notifications marked as read' },
        });
    } catch (error: any) {
        console.error('[Notifications] Error marking all as read:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error' },
        });
    }
});

export default router;
