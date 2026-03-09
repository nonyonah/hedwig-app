import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import NotificationService from '../services/notifications';
import { getOrCreateUser } from '../utils/userHelper';
import { createLogger } from '../utils/logger';

const logger = createLogger('NotificationsRoute');

const router = Router();

const canSendBroadcast = (user: any): boolean => {
    if (process.env.NOTIFICATION_BROADCAST_ENABLED !== 'true') return false;

    const allowlist = String(process.env.NOTIFICATION_BROADCAST_ALLOWLIST || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

    if (allowlist.length === 0) return false;

    const userId = String(user?.id || '').toLowerCase();
    const userEmail = String(user?.email || '').toLowerCase();
    const userPrivyId = String(user?.privy_id || '').toLowerCase();

    return allowlist.includes(userId) || allowlist.includes(userEmail) || allowlist.includes(userPrivyId);
};

/**
 * POST /api/notifications/register
 * Register a device push token for the authenticated user
 */
router.post('/register', authenticate, async (req: Request, res: Response) => {
    try {
        const privyId = req.user!.id;
        const { expoPushToken, platform } = req.body;

        logger.debug('Register request received');

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
            logger.error('User not found');
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }

        logger.debug('Registering device token');

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
        logger.error('Error registering token');
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
        logger.error('Error removing token');
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
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }
        const userId = user.id;
        logger.debug('Creating test in-app notification');

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
            logger.error('Error inserting test notification');
            throw new Error(`Failed to create notification: ${insertError.message}`);
        }

        logger.info('Created test notification');

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
        logger.error('Error sending test');
        res.status(500).json({
            success: false,
            error: { message: error.message || 'Internal server error' },
        });
    }
});

/**
 * POST /api/notifications/broadcast
 * Send announcement/highlight notification to all users.
 * Protected by NOTIFICATION_BROADCAST_ENABLED + NOTIFICATION_BROADCAST_ALLOWLIST.
 */
router.post('/broadcast', authenticate, async (req: Request, res: Response) => {
    try {
        const privyId = req.user!.id;
        const sender = await getOrCreateUser(privyId);
        if (!sender) {
            res.status(404).json({
                success: false,
                error: { message: 'Sender not found' },
            });
            return;
        }

        if (!canSendBroadcast(sender)) {
            res.status(403).json({
                success: false,
                error: { message: 'Broadcast notifications are not enabled for this user' },
            });
            return;
        }

        const {
            title,
            body,
            type = 'announcement',
            data = {},
            createInApp = true,
            sendPush = true,
        } = req.body || {};

        if (!title || !body) {
            res.status(400).json({
                success: false,
                error: { message: 'title and body are required' },
            });
            return;
        }

        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id')
            .not('id', 'is', null);

        if (usersError) {
            throw new Error(`Failed to load users: ${usersError.message}`);
        }

        const userIds = (users || []).map((u: any) => u.id).filter(Boolean);
        if (userIds.length === 0) {
            res.json({
                success: true,
                data: { recipients: 0, inAppInserted: 0, pushedToTokens: 0, tickets: [] },
            });
            return;
        }

        let inAppInserted = 0;
        if (createInApp) {
            const rows = userIds.map((userId: string) => ({
                user_id: userId,
                type,
                title,
                message: body,
                metadata: {
                    ...data,
                    broadcast: true,
                    sentBy: sender.id,
                    sentAt: new Date().toISOString(),
                },
                is_read: false,
            }));

            const { error: insertError } = await supabase
                .from('notifications')
                .insert(rows);

            if (insertError) {
                throw new Error(`Failed to create in-app broadcast notifications: ${insertError.message}`);
            }
            inAppInserted = rows.length;
        }

        let pushedToTokens = 0;
        let tickets: any[] = [];
        if (sendPush) {
            if (NotificationService.isOneSignalConfigured()) {
                tickets = await NotificationService.sendOneSignalBroadcast({
                    title,
                    body,
                    data: {
                        type,
                        ...data,
                        broadcast: true,
                    },
                });
                pushedToTokens = userIds.length;
            } else {
                const { data: tokens, error: tokenError } = await supabase
                    .from('device_tokens')
                    .select('expo_push_token');

                if (tokenError) {
                    throw new Error(`Failed to load device tokens: ${tokenError.message}`);
                }

                const uniqueTokens = Array.from(
                    new Set((tokens || []).map((t: any) => t.expo_push_token).filter(Boolean))
                );

                if (uniqueTokens.length > 0) {
                    tickets = await NotificationService.sendBulkNotifications(uniqueTokens, {
                        title,
                        body,
                        data: {
                            type,
                            ...data,
                            broadcast: true,
                        },
                    });
                    pushedToTokens = uniqueTokens.length;
                }
            }
        }

        logger.info('Broadcast notification sent', {
            senderId: sender.id,
            recipients: userIds.length,
            inAppInserted,
            pushedToTokens,
        });

        res.json({
            success: true,
            data: {
                recipients: userIds.length,
                inAppInserted,
                pushedToTokens,
                tickets,
            },
        });
    } catch (error: any) {
        logger.error('Error sending broadcast notification');
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
            logger.debug('User not found for Privy ID');
            res.json({
                success: true,
                data: { notifications: [], total: 0, limit, offset },
            });
            return;
        }

        const internalUserId = userData.id; // This is the email (nonyonah@gmail.com)
        logger.debug('Fetching notifications');

        const { data: notifications, error, count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact' })
            .eq('user_id', internalUserId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            throw new Error(`Failed to fetch notifications: ${error.message}`);
        }

        logger.debug('Found notifications', { count: notifications?.length || 0 });

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
        logger.error('Error fetching notifications');
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
        logger.error('Error counting unread');
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
        logger.error('Error marking as read');
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error' },
        });
    }
});

/**
 * DELETE /api/notifications/:id
 * Delete a single notification
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const privyId = req.user!.id;
        const notificationId = req.params.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }

        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId)
            .eq('user_id', user.id);

        if (error) {
            throw new Error(`Failed to delete notification: ${error.message}`);
        }

        res.json({
            success: true,
            data: { message: 'Notification deleted' },
        });
    } catch (error: any) {
        logger.error('Error deleting notification');
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
        logger.error('Error marking all as read');
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error' },
        });
    }
});

export default router;
