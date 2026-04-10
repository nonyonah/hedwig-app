import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger';
import { ingestRevenueCatWebhook, isRevenueCatWebhookAuthorized } from '../services/revenuecat';

const logger = createLogger('RevenueCatWebhook');
const router = Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const authHeader = (req.headers.authorization as string | undefined)
            || (req.headers['x-authorization'] as string | undefined)
            || (req.headers['x-webhook-auth'] as string | undefined);

        if (!isRevenueCatWebhookAuthorized(authHeader)) {
            logger.warn('RevenueCat webhook authorization failed');
            res.status(401).json({ success: false, error: 'Unauthorized webhook' });
            return;
        }

        const result = await ingestRevenueCatWebhook(req.body);

        logger.info('RevenueCat webhook ingested', {
            duplicate: result.duplicate,
            appUserId: result.appUserId,
            hasLinkedUser: Boolean(result.userId),
        });

        res.json({
            success: true,
            data: {
                received: true,
                duplicate: result.duplicate,
                appUserId: result.appUserId,
                linkedUserId: result.userId || null,
            },
        });
    } catch (error: any) {
        logger.error('RevenueCat webhook processing failed', {
            error: error?.message || 'Unknown',
        });
        res.status(400).json({
            success: false,
            error: error?.message || 'Invalid RevenueCat webhook payload',
        });
    }
});

export default router;

