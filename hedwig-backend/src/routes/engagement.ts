import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { supabase } from '../lib/supabase';
import BackendAnalytics from '../services/analytics';
import { createLogger } from '../utils/logger';

const logger = createLogger('EngagementRoute');
const router = Router();

router.post('/events', authenticate, async (req: Request, res: Response) => {
    try {
        const privyId = req.user!.id;
        const event = String(req.body?.event || '').trim();
        const properties = (req.body?.properties && typeof req.body.properties === 'object')
            ? req.body.properties
            : {};

        if (!event) {
            res.status(400).json({
                success: false,
                error: { message: 'event is required' },
            });
            return;
        }

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }

        const now = new Date().toISOString();
        const updates: Record<string, any> = {
            last_login: now,
            // Treat any authenticated engagement event as activity so
            // retention jobs can target users from tracked behavior too.
            last_app_opened_at: now,
        };

        if (event === 'kyc_started') {
            updates.kyc_started_at = now;
        }

        if (Object.keys(updates).length > 0) {
            await supabase
                .from('users')
                .update(updates)
                .eq('id', user.id);
        }

        await BackendAnalytics.capture(String(user.privy_id || privyId), event, {
            user_id: user.id,
            source: 'mobile_engagement_api',
            ...properties,
        });

        res.json({
            success: true,
            data: { message: 'Event recorded' },
        });
    } catch (error: any) {
        logger.error('Error recording engagement event', {
            error: error?.message,
        });
        res.status(500).json({
            success: false,
            error: { message: 'Internal server error', details: error?.message },
        });
    }
});

export default router;
