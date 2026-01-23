import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import DiditService from '../services/didit';

const logger = createLogger('DiditWebhook');
const router = Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-didit-signature'] as string;
        
        // Validate signature
        if (!DiditService.validateWebhook(signature, req.body)) {
            logger.warn('Invalid Didit webhook signature');
            res.status(401).send('Invalid signature');
            return;
        }

        const event = req.body;
        logger.info('Received Didit webhook', { type: event.type, sessionId: event.session_id });

        // Handle 'verification_completed'
        if (event.type === 'verification_completed' || event.status) {
            // Map Didit status to our status
            let kycStatus = 'pending';
            const decision = event.decision || event.status; // Adjust based on actual payload

            if (decision === 'approved' || decision === 'verified') {
                kycStatus = 'approved';
            } else if (decision === 'declined' || decision === 'rejected') {
                kycStatus = 'rejected';
            } else if (decision === 'resubmission_requested') {
                kycStatus = 'retry_required';
            } else if (decision === 'review_needed' || decision === 'review') {
                kycStatus = 'pending'; // Treat review as pending internal review/completion
            }

            // Find user by session_id or vendor_data
            const userId = event.vendor_data; 

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
                logger.warn('Webhook missing vendor_data (userId)', event);
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        logger.error('Didit webhook error', { error });
        res.status(500).send('Internal Server Error');
    }
});

export default router;
