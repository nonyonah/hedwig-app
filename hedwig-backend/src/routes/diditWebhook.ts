import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import DiditService from '../services/didit';

const logger = createLogger('DiditWebhook');
const router = Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-didit-signature'] as string;
        const event = req.body;

        logger.info('Received Didit webhook', { 
            headers: req.headers,
            type: event.type,
            sessionId: event.session_id,
            status: event.status,
            decision: event.decision 
        });
        
        // Validate signature
        // Note: Didit might send different signature headers, check docs if x-didit-signature is correct
        if (!DiditService.validateWebhook(signature, req.body)) {
            logger.warn('Invalid Didit webhook signature', { received: signature });
            // For debugging, we might want to log what we computed vs what we got, but strictly we return 401
            res.status(401).send('Invalid signature');
            return;
        }

        // Handle 'verification_completed' or status updates
        // Didit V2 event types might differ, so we also check if status/decision is present
        if (event.type === 'verification_completed' || event.status || event.decision) {
            // Map Didit status to our status
            let kycStatus = 'pending';
            // Normalize to lowercase for comparison
            const decision = (event.decision || event.status || '').toLowerCase(); 

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
            const userId = event.vendor_data; 
            
            // Fallback: if vendor_data missing, try to find by kyc_session_id
            if (!userId && event.session_id) {
                 const { data: userBySession } = await supabase
                    .from('users')
                    .select('id')
                    .eq('kyc_session_id', event.session_id)
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
                logger.warn('Webhook missing vendor_data (userId) and session lookup failed', event);
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        logger.error('Didit webhook error', { error });
        res.status(500).send('Internal Server Error');
    }
});

export default router;
