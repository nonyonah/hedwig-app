import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import SumsubService from '../services/sumsub';

const logger = createLogger('SumsubWebhook');
const router = Router();

/**
 * Sumsub webhook payload structure
 */
interface SumsubWebhookPayload {
    type: string;
    applicantId: string;
    externalUserId?: string;
    reviewStatus?: string;
    reviewResult?: {
        reviewAnswer: 'GREEN' | 'RED';
        rejectLabels?: string[];
        moderationComment?: string;
        clientComment?: string;
    };
    createdAtMs?: number;
    levelName?: string;
}

/**
 * POST /api/webhooks/sumsub
 * Handle Sumsub verification webhooks
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-payload-digest'] as string;
        const rawBody = JSON.stringify(req.body);

        // Verify webhook signature (skip in development if not configured)
        if (process.env.NODE_ENV === 'production') {
            if (!signature || !SumsubService.verifyWebhookSignature(rawBody, signature)) {
                logger.warn('Invalid webhook signature');
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }
        }

        const payload = req.body as SumsubWebhookPayload;
        logger.info('Received Sumsub webhook', { 
            type: payload.type, 
            applicantId: payload.applicantId 
        });

        // Handle different webhook types
        switch (payload.type) {
            case 'applicantReviewed':
                await handleApplicantReviewed(payload);
                break;
            
            case 'applicantPending':
                await handleApplicantPending(payload);
                break;
            
            case 'applicantCreated':
                logger.info('Applicant created', { applicantId: payload.applicantId });
                break;
            
            case 'applicantOnHold':
                await handleApplicantOnHold(payload);
                break;

            case 'applicantReset':
                await handleApplicantReset(payload);
                break;

            default:
                logger.debug('Unhandled webhook type', { type: payload.type });
        }

        // Always respond with success to acknowledge receipt
        res.json({ success: true });
    } catch (error) {
        logger.error('Webhook processing failed', { 
            error: error instanceof Error ? error.message : 'Unknown' 
        });
        // Still respond with success to prevent retries for processing errors
        res.json({ success: true });
    }
});

/**
 * Handle applicantReviewed webhook - verification complete
 */
async function handleApplicantReviewed(payload: SumsubWebhookPayload) {
    const { applicantId, reviewResult, externalUserId } = payload;
    
    if (!applicantId) {
        logger.warn('No applicant ID in reviewed webhook');
        return;
    }

    const reviewAnswer = reviewResult?.reviewAnswer;
    const kycStatus = SumsubService.mapReviewToKycStatus(
        'completed',
        reviewAnswer
    );

    logger.info('Applicant reviewed', { 
        applicantId, 
        answer: reviewAnswer,
        newStatus: kycStatus 
    });

    // Find user by applicant ID or external user ID
    let userId: string | null = null;
    
    if (externalUserId) {
        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('id', externalUserId)
            .single();
        userId = user?.id || null;
    }

    if (!userId) {
        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('kyc_applicant_id', applicantId)
            .single();
        userId = user?.id || null;
    }

    if (!userId) {
        logger.warn('User not found for applicant', { applicantId, externalUserId });
        return;
    }

    // Update user KYC status
    const updateData: Record<string, unknown> = {
        kyc_status: kycStatus,
        kyc_reviewed_at: new Date().toISOString(),
    };

    // Store rejection labels internally (not exposed to user)
    if (reviewAnswer === 'RED' && reviewResult?.rejectLabels) {
        updateData.kyc_rejection_labels = reviewResult.rejectLabels;
    }

    const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId);

    if (error) {
        logger.error('Failed to update KYC status', { error: error.message, userId });
    } else {
        logger.info('KYC status updated via webhook', { userId, status: kycStatus });
    }
}

/**
 * Handle applicantPending webhook - documents submitted
 */
async function handleApplicantPending(payload: SumsubWebhookPayload) {
    const { applicantId, externalUserId } = payload;
    
    logger.info('Applicant pending', { applicantId });

    // Find user
    let userId: string | null = null;
    
    if (externalUserId) {
        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('id', externalUserId)
            .single();
        userId = user?.id || null;
    }

    if (!userId && applicantId) {
        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('kyc_applicant_id', applicantId)
            .single();
        userId = user?.id || null;
    }

    if (userId) {
        await supabase
            .from('users')
            .update({ kyc_status: 'pending' })
            .eq('id', userId);
    }
}

/**
 * Handle applicantOnHold webhook - verification paused
 */
async function handleApplicantOnHold(payload: SumsubWebhookPayload) {
    const { applicantId } = payload;
    
    logger.info('Applicant on hold', { applicantId });

    // Find user and update status
    const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('kyc_applicant_id', applicantId)
        .single();

    if (user) {
        await supabase
            .from('users')
            .update({ kyc_status: 'retry_required' })
            .eq('id', user.id);
    }
}

/**
 * Handle applicantReset webhook - verification reset
 */
async function handleApplicantReset(payload: SumsubWebhookPayload) {
    const { applicantId } = payload;
    
    logger.info('Applicant reset', { applicantId });

    const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('kyc_applicant_id', applicantId)
        .single();

    if (user) {
        await supabase
            .from('users')
            .update({ 
                kyc_status: 'not_started',
                kyc_rejection_labels: null,
                kyc_reviewed_at: null,
            })
            .eq('id', user.id);
    }
}

export default router;
