import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import DiditService from '../services/didit';

const logger = createLogger('KYC');
const router = Router();

/**
 * GET /api/kyc/status
 * Get user's current KYC verification status
 */
router.get('/status', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;

        // Get user with KYC fields
        const { data: user, error } = await supabase
            .from('users')
            .select('id, kyc_status, kyc_session_id, kyc_reviewed_at')
            .eq('privy_id', privyId)
            .single();

        if (error || !user) {
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

        // Get user
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, kyc_status, kyc_session_id')
            .eq('privy_id', privyId)
            .single();

        if (userError || !user) {
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
            userId: user.id, // Use internal user ID as vendor data
            email: user.email
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

        // Get user with session ID
        const { data: user, error } = await supabase
            .from('users')
            .select('id, kyc_session_id, kyc_status')
            .eq('privy_id', privyId)
            .single();

        if (error || !user) {
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
        
        let newStatus = user.kyc_status;
        const decision = sessionData.decision || sessionData.status;

        // Map status
        if (decision === 'approved' || decision === 'verified') {
            newStatus = 'approved';
        } else if (decision === 'declined' || decision === 'rejected') {
            newStatus = 'rejected';
        } else if (decision === 'resubmission_requested') {
            newStatus = 'retry_required';
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
