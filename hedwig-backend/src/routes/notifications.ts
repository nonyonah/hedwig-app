import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import NotificationService from '../services/notifications';

const router = Router();

/**
 * POST /api/notifications/register
 * Register a device push token for the authenticated user
 */
router.post('/register', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const { expoPushToken, platform } = req.body;

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

        const success = await NotificationService.registerDeviceToken(
            userId,
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
        console.error('[Notifications] Error registering token:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error' },
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

        const tickets = await NotificationService.notifyUser(userId, {
            title: '🔔 Test Notification',
            body: 'This is a test notification from Hedwig!',
            data: { type: 'test' },
        });

        res.json({
            success: true,
            data: { tickets },
        });
    } catch (error: any) {
        console.error('[Notifications] Error sending test:', error);
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error' },
        });
    }
});

export default router;
