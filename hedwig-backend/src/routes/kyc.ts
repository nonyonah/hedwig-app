import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import DiditService from '../services/didit';
import { getOrCreateUser } from '../utils/userHelper';

const logger = createLogger('KYC');
const router = Router();

/**
 * GET /api/kyc/status
 * Get user's current KYC verification status
 */
router.get('/status', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;

        // Use getOrCreateUser to handle privy_id changes
        let user;
        try {
            user = await getOrCreateUser(privyId);
        } catch (syncError) {
            logger.warn('User not found for KYC status', { privyId });
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        res.json({
            success: true,
            data: {
                status: user.kyc_status || 'not_started',
                sessionId: user.kyc_session_id,
                reviewedAt: user.kyc_reviewed_at,
                isApproved: user.kyc_status === 'approved',
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/kyc/start
 * Create verification session in Didit and return URL
 */
router.post('/start', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;

        // Use getOrCreateUser to handle privy_id changes
        let user;
        try {
            user = await getOrCreateUser(privyId);
        } catch (syncError) {
            logger.warn('User not found for KYC start', { privyId });
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        // Check if already approved
        if (user.kyc_status === 'approved') {
            res.json({
                success: true,
                data: {
                    status: 'approved',
                    message: 'KYC already approved',
                },
            });
            return;
        }

        // Create session
        logger.info('Creating new Didit session', { userId: user.id });
        
        const session = await DiditService.createSession({
            userId: user.id,
            email: user.email || `user-${user.id}@hedwig.app`
        });

        // Update user with session ID
        await supabase
            .from('users')
            .update({
                kyc_session_id: session.id,
                kyc_status: 'pending',
            })
            .eq('id', user.id);

        logger.info('Updated user with Didit session ID', { userId: user.id, sessionId: session.id });

        res.json({
            success: true,
            data: {
                url: session.url,
                sessionId: session.id,
                status: 'pending',
            },
        });
    } catch (error) {
        logger.error('KYC start failed', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

/**
 * POST /api/kyc/check
 * Manually check and sync KYC status from Didit
 */
router.post('/check', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;

        // Use getOrCreateUser to handle privy_id changes
        let user;
        try {
            user = await getOrCreateUser(privyId);
        } catch (syncError) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        if (!user.kyc_session_id) {
            res.json({
                success: true,
                data: { status: 'not_started' },
            });
            return;
        }

        // Get status from Didit
        const sessionData = await DiditService.getSessionStatus(user.kyc_session_id);
        
        logger.info('Didit manual check response', { 
            sessionId: user.kyc_session_id, 
            data: sessionData 
        });

        let newStatus = user.kyc_status;
        const decision = (sessionData.decision || sessionData.status || '').toLowerCase();

        // Map status
        if (decision === 'approved' || decision === 'verified' || decision === 'completed') {
            newStatus = 'approved';
        } else if (decision === 'declined' || decision === 'rejected' || decision === 'failed') {
            newStatus = 'rejected';
        } else if (decision === 'resubmission_requested' || decision === 'retry') {
            newStatus = 'retry_required';
        } else if (decision === 'review_needed' || decision === 'review' || decision === 'pending') {
            // Keep pending
        }

        // Update if changed
        if (newStatus !== user.kyc_status) {
            await supabase
                .from('users')
                .update({
                    kyc_status: newStatus,
                    kyc_reviewed_at: new Date().toISOString(),
                })
                .eq('id', user.id);

            logger.info('KYC status updated manually', { userId: user.id, status: newStatus });
        }

        res.json({
            success: true,
            data: {
                status: newStatus,
                isApproved: newStatus === 'approved',
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
