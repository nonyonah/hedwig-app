import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import SumsubService from '../services/sumsub';

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
            .select('id, kyc_status, kyc_applicant_id, kyc_level, kyc_reviewed_at')
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
                applicantId: user.kyc_applicant_id,
                level: user.kyc_level,
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
 * Create applicant in Sumsub and return access token for SDK
 */
router.post('/start', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;

        // Get user
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, kyc_status, kyc_applicant_id')
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

        let applicantId = user.kyc_applicant_id;

        // Create applicant if not exists
        if (!applicantId) {
            logger.info('Creating new Sumsub applicant', { userId: user.id });
            
            const applicant = await SumsubService.createApplicant(
                user.id, // Use internal user ID as external ID
                user.email
            );

            applicantId = applicant.id;

            // Update user with applicant ID
            await supabase
                .from('users')
                .update({
                    kyc_applicant_id: applicantId,
                    kyc_status: 'pending',
                })
                .eq('id', user.id);

            logger.info('Updated user with applicant ID', { userId: user.id, applicantId });
        }

        // Generate access token for SDK
        const tokenResult = await SumsubService.generateAccessToken(applicantId, user.id);

        res.json({
            success: true,
            data: {
                accessToken: tokenResult.token,
                applicantId,
                status: 'pending',
            },
        });
    } catch (error) {
        logger.error('KYC start failed', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

/**
 * POST /api/kyc/refresh-token
 * Refresh access token for SDK (tokens expire after some time)
 */
router.post('/refresh-token', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;

        // Get user with applicant ID
        const { data: user, error } = await supabase
            .from('users')
            .select('id, kyc_applicant_id')
            .eq('privy_id', privyId)
            .single();

        if (error || !user) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        if (!user.kyc_applicant_id) {
            res.status(400).json({ success: false, error: 'KYC not started' });
            return;
        }

        // Generate new access token
        const tokenResult = await SumsubService.generateAccessToken(
            user.kyc_applicant_id,
            user.id
        );

        res.json({
            success: true,
            data: {
                accessToken: tokenResult.token,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/kyc/check
 * Manually check and sync KYC status from Sumsub
 */
router.post('/check', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;

        // Get user with applicant ID
        const { data: user, error } = await supabase
            .from('users')
            .select('id, kyc_applicant_id, kyc_status')
            .eq('privy_id', privyId)
            .single();

        if (error || !user) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        if (!user.kyc_applicant_id) {
            res.json({
                success: true,
                data: { status: 'not_started' },
            });
            return;
        }

        // Get status from Sumsub
        const applicant = await SumsubService.getApplicantStatus(user.kyc_applicant_id);
        
        const newStatus = SumsubService.mapReviewToKycStatus(
            applicant.review?.reviewStatus || '',
            applicant.review?.reviewResult?.reviewAnswer
        );

        // Update if changed
        if (newStatus !== user.kyc_status) {
            await supabase
                .from('users')
                .update({
                    kyc_status: newStatus,
                    kyc_reviewed_at: new Date().toISOString(),
                })
                .eq('id', user.id);

            logger.info('KYC status updated', { userId: user.id, status: newStatus });
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
