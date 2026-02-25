import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import DiditService from '../services/didit';

const logger = createLogger('DiditWebhook');
const router = Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const signature = (req.headers['x-didit-signature'] ||
            req.headers['x-didit-signature-256'] ||
            req.headers['x-signature']) as string | undefined;
        const rawBody = (req as any).rawBody;
        const event = req.body?.event || req.body?.data || req.body;
        const decision = (
            event?.decision ||
            event?.result?.decision ||
            event?.verification?.decision ||
            event?.status ||
            event?.result?.status ||
            event?.verification?.status ||
            ''
        ).toLowerCase();
        const sessionId = event?.session_id || event?.sessionId || event?.session?.id;
        const vendorData = event?.vendor_data || event?.vendorData || event?.session?.vendor_data;

        logger.info('Received Didit webhook', { 
            hasSignature: !!signature,
            type: event?.type,
            sessionId,
            status: event?.status,
            decision,
        });
        
        // Validate signature
        if (!DiditService.validateWebhook(signature, rawBody || req.body)) {
            logger.warn('Invalid Didit webhook signature', { received: signature });
            res.status(401).send('Invalid signature');
            return;
        }

        // Handle completion/status updates from different Didit payload shapes
        if (event?.type === 'verification_completed' || decision) {
            // Map Didit status to our status
            let kycStatus = 'pending';

            logger.info('Processing Didit decision/status', { decision, raw: event });

            if (decision === 'approved' || decision === 'verified' || decision === 'completed') {
                kycStatus = 'approved';
            } else if (decision === 'declined' || decision === 'rejected' || decision === 'failed') {
                kycStatus = 'rejected';
            } else if (decision === 'resubmission_requested' || decision === 'retry') {
                kycStatus = 'retry_required';
            } else if (decision === 'review_needed' || decision === 'review' || decision === 'pending') {
                kycStatus = 'pending'; 
            } else if (decision === 'not_started' || decision === 'created') {
                kycStatus = 'pending'; // Treat as pending
            }

            // Find user by vendor_data (this is where we put the userId)
            const userId = vendorData; 
            
            // Fallback: if vendor_data missing, try to find by kyc_session_id
            if (!userId && sessionId) {
                 const { data: userBySession } = await supabase
                    .from('users')
                    .select('id')
                    .eq('kyc_session_id', sessionId)
                    .single();
                 
                 if (userBySession) {
                     logger.info('Found user by session_id fallback', { userId: userBySession.id });
                     // We can proceed with this userId
                     await supabase
                        .from('users')
                        .update({
                            kyc_status: kycStatus,
                            kyc_reviewed_at: new Date().toISOString(),
                        })
                        .eq('id', userBySession.id);
                        
                     logger.info('Updated KYC status from webhook (session lookup)', { userId: userBySession.id, status: kycStatus });
                     res.status(200).send('OK');
                     return;
                 }
            }

            if (userId) {
                await supabase
                    .from('users')
                    .update({
                        kyc_status: kycStatus,
                        kyc_reviewed_at: new Date().toISOString(),
                    })
                    .eq('id', userId);

                logger.info('Updated KYC status from webhook', { userId, status: kycStatus });
            } else {
                logger.warn('Webhook missing vendor_data (userId) and session lookup failed', {
                    sessionId,
                    payloadKeys: Object.keys(event || {}),
                });
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        logger.error('Didit webhook error', { error });
        res.status(500).send('Internal Server Error');
    }
});

export default router;
