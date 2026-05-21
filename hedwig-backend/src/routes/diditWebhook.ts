import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import DiditService from '../services/didit';
import NotificationService from '../services/notifications';
import { EmailService } from '../services/email';

const logger = createLogger('DiditWebhook');
const router = Router();

const normalizeDiditStatus = (value?: string | null): string => {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
};

const mapDiditStatus = (value?: string | null): 'pending' | 'approved' | 'rejected' | 'retry_required' => {
    const decision = normalizeDiditStatus(value);

    if (['approved', 'verified', 'completed', 'complete'].includes(decision)) {
        return 'approved';
    }
    if (['declined', 'rejected', 'failed', 'denied', 'expired', 'abandoned'].includes(decision)) {
        return 'rejected';
    }
    if (['resubmission_requested', 'retry', 'retry_required', 'resubmit', 'requires_resubmission'].includes(decision)) {
        return 'retry_required';
    }
    return 'pending';
};

const readString = (value: unknown): string => typeof value === 'string' ? value : '';

const resolveDiditEvent = (body: any): Record<string, any> => {
    if (body?.data && typeof body.data === 'object') return body.data;
    if (body?.event && typeof body.event === 'object') return body.event;
    return body && typeof body === 'object' ? body : {};
};

const resolveDiditStatusValue = (event: Record<string, any>): string => {
    return (
        readString(event?.decision?.status) ||
        readString(event?.result?.decision?.status) ||
        readString(event?.verification?.decision?.status) ||
        readString(event?.decision) ||
        readString(event?.result?.decision) ||
        readString(event?.verification?.decision) ||
        readString(event?.status) ||
        readString(event?.result?.status) ||
        readString(event?.verification?.status)
    );
};

const resolveDiditWebhookType = (body: any, event: Record<string, any>): string => {
    return normalizeDiditStatus(
        event?.webhook_type ||
        event?.webhookType ||
        event?.type ||
        (typeof body?.event === 'string' ? body.event : '') ||
        body?.webhook_type ||
        body?.webhookType
    );
};

const describeError = (error: unknown): Record<string, unknown> => {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }
    if (error && typeof error === 'object') {
        return {
            message: (error as any).message || null,
            code: (error as any).code || null,
            details: (error as any).details || null,
            hint: (error as any).hint || null,
            raw: error,
        };
    }
    return { message: String(error) };
};

const resolveUserId = async (vendorData?: string | null, sessionId?: string | null): Promise<string | null> => {
    if (vendorData) return vendorData;
    if (!sessionId) return null;

    const { data: userBySession, error } = await supabase
        .from('users')
        .select('id')
        .eq('kyc_session_id', sessionId)
        .maybeSingle();

    if (error) {
        logger.warn('Didit user lookup by session failed', { sessionId, error: error.message });
    }

    return userBySession?.id || null;
};

const syncSessionDecision = async (sessionId: string, fallbackVendorData?: string | null): Promise<{ userId: string | null; status: string }> => {
    const sessionData = await DiditService.getSessionStatus(sessionId);
    const status = mapDiditStatus(sessionData.decision || sessionData.status);
    const userId = await resolveUserId(sessionData.vendorData || fallbackVendorData, sessionData.sessionId || sessionId);

    if (userId) {
        const { data: previousUser } = await supabase
            .from('users')
            .select('kyc_status')
            .eq('id', userId)
            .maybeSingle();

        const { error } = await supabase
            .from('users')
            .update({
                kyc_status: status,
                kyc_reviewed_at: new Date().toISOString(),
            })
            .eq('id', userId);

        if (error) {
            throw new Error(`Failed to update KYC status from Didit decision: ${error.message}`);
        }

        if (status === 'approved' && (previousUser as any)?.kyc_status !== 'approved') {
            await notifyKycApproved(userId);
        }
    }

    return { userId, status };
};

const notifyKycApproved = async (userId: string): Promise<void> => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, first_name')
            .eq('id', userId)
            .maybeSingle();

        if (error || !user) {
            logger.warn('Could not load user for KYC approved notification', { userId, error: error?.message });
            return;
        }

        await NotificationService.notifyUser(userId, {
            title: 'Verification approved',
            body: 'Your identity verification is approved. Withdrawals and payout features are now available.',
            data: { type: 'kyc_approved', route: '/settings/index' },
        });

        if ((user as any).email) {
            await EmailService.sendKycApprovedEmail({
                to: (user as any).email,
                firstName: (user as any).first_name || null,
            });
        }
    } catch (error: any) {
        logger.warn('Failed to send KYC approved notification', { userId, error: error?.message });
    }
};

router.get('/', async (req: Request, res: Response) => {
    const sessionId = String(
        req.query.verificationSessionId ||
        req.query.session_id ||
        req.query.sessionId ||
        ''
    );

    try {
        if (sessionId) {
            const result = await syncSessionDecision(sessionId, String(req.query.vendor_data || req.query.vendorData || ''));
            logger.info('Synced Didit status from redirect callback', {
                sessionId,
                userId: result.userId,
                status: result.status,
            });
        } else {
            logger.warn('Didit redirect callback missing session id', { query: req.query });
        }
    } catch (error: any) {
        logger.warn('Didit redirect callback sync failed', { sessionId, error: error?.message });
    }

    res.status(200).send(`
        <!doctype html>
        <html>
            <head>
                <meta name="viewport" content="width=device-width,initial-scale=1" />
                <title>Verification submitted</title>
                <style>
                    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #111827; }
                    main { max-width: 360px; padding: 32px; text-align: center; }
                    h1 { font-size: 22px; margin: 0 0 12px; }
                    p { color: #6b7280; line-height: 1.5; margin: 0; }
                </style>
            </head>
            <body>
                <main>
                    <h1>Verification submitted</h1>
                    <p>You can close this page and return to Hedwig. We will update your verification status shortly.</p>
                </main>
            </body>
        </html>
    `);
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const signature = (req.headers['x-didit-signature'] ||
            req.headers['x-didit-signature-256'] ||
            req.headers['x-signature']) as string | undefined;
        const signatureV2 = req.headers['x-signature-v2'] as string | undefined;
            const signatureSimple = req.headers['x-signature-simple'] as string | undefined;
            const timestamp = req.headers['x-timestamp'] as string | undefined;
            const rawBody = (req as any).rawBody;
        const event = resolveDiditEvent(req.body);
        const rawDecision = resolveDiditStatusValue(event);
        const decision = normalizeDiditStatus(rawDecision);
        const webhookType = resolveDiditWebhookType(req.body, event);
        const sessionId = event?.session_id || event?.sessionId || event?.verificationSessionId || event?.session?.id;
        const vendorData = event?.vendor_data || event?.vendorData || event?.session?.vendor_data;

        logger.info('Received Didit webhook', { 
            hasLegacySignature: !!signature,
            hasSignatureV2: !!signatureV2,
            hasSignatureSimple: !!signatureSimple,
            type: event?.webhook_type || event?.type || req.body?.event,
            sessionId,
            status: event?.status,
            decision,
            bodyKeys: Object.keys(req.body || {}),
            eventKeys: Object.keys(event || {}),
        });
        
        // Validate signature
        if (!DiditService.validateWebhook({
            signature,
            signatureV2,
            signatureSimple,
            timestamp,
            rawBody,
            body: req.body,
        })) {
            logger.warn('Invalid Didit webhook signature');
            res.status(401).send('Invalid signature');
            return;
        }

        if (webhookType === 'status.updated' || webhookType === 'verification_completed' || decision) {
            let kycStatus = mapDiditStatus(rawDecision);
            let userId = await resolveUserId(vendorData, sessionId);

            logger.info('Processing Didit decision/status', { decision, kycStatus, webhookType, sessionId, userId });

            if (sessionId && !rawDecision) {
                try {
                    const synced = await syncSessionDecision(sessionId, vendorData);
                    kycStatus = synced.status as typeof kycStatus;
                    userId = synced.userId || userId;
                } catch (syncError: any) {
                    logger.warn('Didit decision fallback sync failed', { sessionId, error: syncError?.message });
                }
            }

            if (userId) {
                const { data: previousUser } = await supabase
                    .from('users')
                    .select('kyc_status')
                    .eq('id', userId)
                    .maybeSingle();

                const { error: updateError } = await supabase
                    .from('users')
                    .update({
                        kyc_status: kycStatus,
                        kyc_reviewed_at: new Date().toISOString(),
                    })
                    .eq('id', userId);

                if (updateError) {
                    throw new Error(`Failed to update KYC status from Didit webhook: ${updateError.message}`);
                }

                logger.info('Updated KYC status from webhook', { userId, status: kycStatus });
                if (kycStatus === 'approved' && (previousUser as any)?.kyc_status !== 'approved') {
                    await notifyKycApproved(userId);
                }
            } else {
                logger.warn('Webhook missing vendor_data (userId) and session lookup failed', {
                    sessionId,
                    payloadKeys: Object.keys(event || {}),
                });
            }
        }

        res.status(200).send('OK');
    } catch (error) {
        logger.error('Didit webhook error', {
            error: describeError(error),
            bodyKeys: Object.keys(req.body || {}),
            rawBodyPreview: String((req as any).rawBody || '').slice(0, 500),
        });
        res.status(200).json({ success: true, status: 'accepted_with_processing_error' });
    }
});

export default router;
