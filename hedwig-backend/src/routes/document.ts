import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';
import { getOrCreateUser } from '../utils/userHelper';
import NotificationService from '../services/notifications';
import { createCalendarEventFromSource, markCalendarEventCompleted } from './calendar';
import { createLogger } from '../utils/logger';
import BlockradarService from '../services/blockradar';

const logger = createLogger('Documents');

const router = Router();

// Vercel-hosted web client URL for invoice and payment link pages
const WEB_CLIENT_URL = process.env.WEB_CLIENT_URL || 'https://web-client-eight-alpha.vercel.app';

/**
 * POST /api/documents/invoice
 * Create a new invoice
 */
router.post('/invoice', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { amount, description, recipientEmail, items, dueDate, clientName, remindersEnabled } = req.body;
        const privyId = req.user!.id;

        // Validate required fields
        if (!dueDate) {
            res.status(400).json({
                success: false,
                error: { message: 'Due date is required for invoices' }
            });
            return;
        }

        // Get internal user ID
        const user = await getOrCreateUser(privyId);

        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // Unique Client Check: Lookup by Email OR Name
        let clientId = null;
        if (recipientEmail || clientName) {
            let query = supabase
                .from('clients')
                .select('id')
                .eq('user_id', user.id);
            
            // Build OR query safely
            const conditions = [];
            if (recipientEmail) conditions.push(`email.eq.${recipientEmail}`);
            if (clientName) conditions.push(`name.eq.${clientName}`);
            
            if (conditions.length > 0) {
                const { data: existingClient } = await query.or(conditions.join(',')).maybeSingle();
                
                if (existingClient) {
                    clientId = existingClient.id;
                    logger.debug('[Documents] Found existing client', { id: clientId });
                } else if (recipientEmail) {
                    logger.info('[Documents] Auto-creating client', { email: recipientEmail, name: clientName });
                    const { data: newClient } = await supabase.from('clients').insert({
                        user_id: user.id,
                        name: clientName || recipientEmail.split('@')[0],
                        email: recipientEmail,
                        created_from: 'invoice_creation'
                    }).select('id').single();
                    if (newClient) clientId = newClient.id;
                }
            }
        }

        // Create invoice record
        const { data: doc, error } = await supabase
            .from('documents')
            .insert({
                user_id: user.id,
                type: 'INVOICE',
                title: `Invoice for ${clientName || description || 'Services'}`,
                amount: parseFloat(amount),
                description: description,
                status: 'DRAFT',
                content: {
                    recipient_email: recipientEmail,
                    client_name: clientName,
                    due_date: dueDate,
                    items: items || [],
                    reminders_enabled: remindersEnabled !== false // Default to true
                }
            })
            .select()
            .single();

        if (error) throw error;

        // Auto-create calendar event if invoice has due date
        if (dueDate && doc) {
            await createCalendarEventFromSource(
                user.id,
                `Invoice due: ${clientName || description || 'Invoice'}`,
                dueDate,
                'invoice_due',
                'invoice',
                doc.id,
                `Invoice for ${doc.amount} - ${clientName || 'Client'}`
            );
        }

        // Generate BlockRadar Payment Link for Invoice
        let blockradarUrl = '';
        try {
            // Format items into a memo string
            const itemsMemo = items && Array.isArray(items) && items.length > 0
                ? items.map((i: any) => `${i.description} ($${i.amount})`).join(', ')
                : description || `Invoice for ${clientName || 'Client'}`;

            const brLink = await BlockradarService.createPaymentLink({
                name: `Invoice ${doc.id.substring(0, 8)} - ${clientName || 'Client'}`,
                description: itemsMemo,
                amount: amount.toString(),
                redirectUrl: `${WEB_CLIENT_URL}/invoice/${doc.id}?status=success`,
                successMessage: `Thank you for your payment! Invoice ${doc.id.substring(0, 8)} has been paid.`,
                metadata: {
                    documentId: doc.id,
                    userId: user.id,
                    type: 'INVOICE',
                    clientName: clientName || 'Unknown',
                    itemCount: items?.length || 0
                }
            });
            blockradarUrl = brLink.url;
            logger.info('Generated BlockRadar link for Invoice', { docId: doc.id, url: blockradarUrl });
        } catch (brError: any) {
            logger.error('Failed to create BlockRadar link', { error: brError });
            console.error('[BlockRadar Debug] Failed to create link:', brError?.response?.data || brError.message);
        }

        // Generate shareable Vercel URL for the invoice
        const shareableUrl = blockradarUrl || `${WEB_CLIENT_URL}/invoice/${doc.id}`;
        
        // Update document with BlockRadar URL
        if (blockradarUrl) {
            await supabase
                .from('documents')
                .update({ 
                    payment_link_url: shareableUrl, // Store BR link as main link
                    content: {
                        ...doc.content,
                        blockradar_url: blockradarUrl
                    }
                })
                .eq('id', doc.id);
            
            // Update local object for response
            if (doc.content) {
                (doc.content as any).blockradar_url = blockradarUrl;
            }
        }

        // Send email if recipient provided
        if (doc && recipientEmail) {
            // Fetch user name for email sender
            const { data: senderProfile } = await supabase
                .from('users')
                .select('first_name, last_name')
                .eq('id', user.id)
                .single();
                
            const senderName = senderProfile ? 
                `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 'Hedwig User' 
                : 'Hedwig User';

            const emailSent = await import('../services/email').then(m => m.EmailService.sendInvoiceEmail({
                to: recipientEmail,
                senderName,
                amount: amount.toString(),
                currency: 'USD',
                description: description || 'Invoice for services',
                linkId: doc.id,
                paymentUrl: blockradarUrl // Prioritize BlockRadar link
            }));

            if (emailSent) {
                // Update status to SENT
                await supabase.from('documents').update({ status: 'SENT' }).eq('id', doc.id);
                doc.status = 'SENT';
            }
        }

        res.json({
            success: true,
            data: { 
                document: doc,
                shareableUrl 
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/documents/payment-link
 * Create a new payment link
 */
router.post('/payment-link', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { amount, currency, description, remindersEnabled, recipientEmail, clientName, dueDate } = req.body;
        const privyId = req.user!.id;

        // Validate required fields
        if (!clientName || clientName.trim() === '') {
            res.status(400).json({
                success: false,
                error: { message: 'Client name is required for payment links' }
            });
            return;
        }

        if (!dueDate) {
            res.status(400).json({
                success: false,
                error: { message: 'Due date is required for payment links' }
            });
            return;
        }

        // Get internal user ID
        const user = await getOrCreateUser(privyId);

        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // Auto-create client if email is provided and client doesn't exist
        if (recipientEmail) {
            const { data: existingClient } = await supabase
                .from('clients')
                .select('id')
                .eq('user_id', user.id)
                .eq('email', recipientEmail)
                .single();

            if (!existingClient) {
                logger.info('[Documents] Auto-creating client', { email: recipientEmail, name: clientName });
                await supabase.from('clients').insert({
                    user_id: user.id,
                    name: clientName || recipientEmail.split('@')[0],
                    email: recipientEmail,
                    created_from: 'payment_link_creation'
                });
            }
        }

        // Create payment link record (payment_link_url will be updated after we have the ID)
        const { data: doc, error } = await supabase
            .from('documents')
            .insert({
                user_id: user.id,
                type: 'PAYMENT_LINK',
                title: description || 'Payment Link',
                amount: parseFloat(amount),
                currency: currency || 'USDC',
                status: 'DRAFT',
                content: {
                    recipient_email: recipientEmail,
                    client_name: clientName,
                    due_date: dueDate,
                    reminders_enabled: remindersEnabled !== false // Default to true
                }
            })
            .select()
            .single();

        if (error) throw error;

        // Generate BlockRadar Payment Link
        let blockradarUrl = '';
        try {
            const brLink = await BlockradarService.createPaymentLink({
                name: `Payment from ${clientName}`,
                description: description || `Payment request for ${clientName}`,
                amount: amount.toString(),
                redirectUrl: `${WEB_CLIENT_URL}/pay/${doc.id}?status=success`,
                successMessage: `Thank you for your payment!`,
                metadata: {
                    documentId: doc.id,
                    userId: user.id,
                    type: 'PAYMENT_LINK',
                    clientName: clientName || 'Unknown'
                }
            });
            blockradarUrl = brLink.url;
            logger.info('Generated BlockRadar link', { docId: doc.id, url: blockradarUrl });
        } catch (brError: any) {
            logger.error('Failed to create BlockRadar link', { error: brError });
            console.error('[BlockRadar Debug] Failed to create payment link:', brError?.response?.data || brError.message);
        }

        // Update with the shareable Vercel URL now that we have the document ID
        // Use BlockRadar URL if available, otherwise fallback to Hedwig URL
        const shareableUrl = blockradarUrl || `${WEB_CLIENT_URL}/pay/${doc.id}`;
        await supabase
            .from('documents')
            .update({ 
                payment_link_url: shareableUrl,
                content: {
                    ...doc.content,
                    blockradar_url: blockradarUrl
                }
            })
            .eq('id', doc.id);

        // Auto-create calendar event for payment link
        await createCalendarEventFromSource(
            user.id,
            `Payment due: ${clientName}`,
            dueDate,
            'invoice_due',
            'payment_link',
            doc.id,
            `Payment link for ${doc.amount} ${currency || 'USDC'}`
        );

        // Send email if recipient provided
        if (doc && recipientEmail) {
            // Fetch user name for email sender
            const { data: senderProfile } = await supabase
                .from('users')
                .select('first_name, last_name')
                .eq('id', user.id)
                .single();
                
            const senderName = senderProfile ? 
                `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 'Hedwig User' 
                : 'Hedwig User';

            const emailSent = await import('../services/email').then(m => m.EmailService.sendPaymentLinkEmail({
                to: recipientEmail,
                senderName,
                amount: amount.toString(),
                currency: currency || 'USDC',
                description: description || 'Payment Request',
                linkId: doc.id,
                network: 'Base', // defaulting to Base since we mostly support valid tokens there for now, or could extract from currency
                paymentUrl: blockradarUrl
            }));

            if (emailSent) {
                // Update status to SENT
                await supabase.from('documents').update({ status: 'SENT' }).eq('id', doc.id);
                doc.status = 'SENT';
            }
        }

        res.json({
            success: true,
            data: { 
                document: { ...doc, payment_link_url: shareableUrl }
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/documents
 * Universal create endpoint - dispatches to specific handlers based on type
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { type } = req.body;

        logger.debug('Universal create request', { type });

        if (!type) {
            res.status(400).json({
                success: false,
                error: { message: 'Document type is required' }
            });
            return;
        }

        // Normalize type
        const docType = type.toUpperCase();

        if (docType === 'INVOICE') {
            // Forward to invoice handler logic
            // We can't easily call the route handler directly without mocking req/res, 
            // so we'll redirect the request internally or duplicate the logic for now (safest for quick fix)
            // Ideally we'd refactor to controllers.
            
            // Re-using logic from /invoice route
            const { amount, description, recipientEmail, items, dueDate, clientName, remindersEnabled, title } = req.body;
            const privyId = req.user!.id;
            
            // Validate required fields
            if (!dueDate) {
                res.status(400).json({ success: false, error: { message: 'Due date is required for invoices' } });
                return;
            }

            const user = await getOrCreateUser(privyId);
            if (!user) {
                res.status(404).json({ success: false, error: { message: 'User not found' } });
                return;
            }

            // Unique Client Check: Lookup by Email OR Name
            if (recipientEmail || clientName) {
                let query = supabase
                    .from('clients')
                    .select('id')
                    .eq('user_id', user.id);
                
                const conditions = [];
                if (recipientEmail) conditions.push(`email.eq.${recipientEmail}`);
                if (clientName) conditions.push(`name.eq.${clientName}`);
                
                if (conditions.length > 0) {
                    const { data: existingClient } = await query.or(conditions.join(',')).maybeSingle();
                    
                    if (!existingClient && recipientEmail) {
                        logger.info('[Documents] Auto-creating client', { email: recipientEmail, name: clientName });
                        await supabase.from('clients').insert({
                            user_id: user.id,
                            name: clientName || recipientEmail.split('@')[0],
                            email: recipientEmail,
                            created_from: 'invoice_creation'
                        });
                    }
                }
            }

            const { data: doc, error } = await supabase
                .from('documents')
                .insert({
                    user_id: user.id,
                    type: 'INVOICE',
                    title: title || `Invoice for ${clientName || description || 'Services'}`,
                    amount: parseFloat(amount),
                    description: description,
                    status: 'DRAFT',
                    content: {
                        recipient_email: recipientEmail,
                        client_name: clientName,
                        due_date: dueDate,
                        items: items || [],
                        reminders_enabled: remindersEnabled !== false
                    }
                })
                .select()
                .single();

            if (error) throw error;

            if (dueDate && doc) {
                await createCalendarEventFromSource(
                    user.id,
                    `Invoice due: ${clientName || description || 'Invoice'}`,
                    dueDate,
                    'invoice_due',
                    'invoice',
                    doc.id,
                    `Invoice for ${doc.amount} - ${clientName || 'Client'}`
                );
            }

            // Send email if recipient provided
            if (doc && recipientEmail) {
                const { data: senderProfile } = await supabase
                    .from('users')
                    .select('first_name, last_name')
                    .eq('id', user.id)
                    .single();
                    
                const senderName = senderProfile ? 
                    `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 'Hedwig User' 
                    : 'Hedwig User';

                const emailSent = await import('../services/email').then(m => m.EmailService.sendInvoiceEmail({
                    to: recipientEmail,
                    senderName,
                    amount: amount.toString(),
                    currency: 'USD',
                    description: description || 'Invoice for services',
                    linkId: doc.id
                }));

                if (emailSent) {
                    await supabase.from('documents').update({ status: 'SENT' }).eq('id', doc.id);
                    doc.status = 'SENT';
                }
            }

            const shareableUrl = `${WEB_CLIENT_URL}/invoice/${doc.id}`;
            res.json({ success: true, data: { document: doc, shareableUrl } });
            return;

        } else if (docType === 'PAYMENT_LINK' || docType === 'PAYMENT-LINK') {
            // Re-using logic from /payment-link route
            const { amount, currency, description, remindersEnabled, recipientEmail, clientName, dueDate, title } = req.body;
            const privyId = req.user!.id;

            if (!clientName || clientName.trim() === '') {
                res.status(400).json({ success: false, error: { message: 'Client name is required' } });
                return;
            }
            if (!dueDate) {
                res.status(400).json({ success: false, error: { message: 'Due date is required' } });
                return;
            }

            const user = await getOrCreateUser(privyId);
            if (!user) {
                res.status(404).json({ success: false, error: { message: 'User not found' } });
                return;
            }

            const { data: doc, error } = await supabase
                .from('documents')
                .insert({
                    user_id: user.id,
                    type: 'PAYMENT_LINK',
                    title: title || description || 'Payment Link',
                    amount: parseFloat(amount),
                    currency: currency || 'USDC',
                    status: 'DRAFT',
                    content: {
                        recipient_email: recipientEmail,
                        client_name: clientName,
                        due_date: dueDate,
                        reminders_enabled: remindersEnabled !== false
                    }
                })
                .select()
                .single();

            if (error) throw error;

            const shareableUrl = `${WEB_CLIENT_URL}/pay/${doc.id}`;
            await supabase.from('documents').update({ payment_link_url: shareableUrl }).eq('id', doc.id);

            await createCalendarEventFromSource(
                user.id,
                `Payment due: ${clientName}`,
                dueDate,
                'invoice_due',
                'payment_link',
                doc.id,
                `Payment link for ${doc.amount} ${currency || 'USDC'}`
            );

            res.json({ success: true, data: { document: { ...doc, payment_link_url: shareableUrl } } });
            return;

        } else if (docType === 'CONTRACT') {
            // Basic contract creation support
            const { title, description, clientName, recipientEmail, content, amount } = req.body;
            const privyId = req.user!.id;

            const user = await getOrCreateUser(privyId);
            if (!user) {
                res.status(404).json({ success: false, error: { message: 'User not found' } });
                return;
            }

            const approvalToken = crypto.randomBytes(32).toString('hex');
            
            const { data: doc, error } = await supabase
                .from('documents')
                .insert({
                    user_id: user.id,
                    type: 'CONTRACT',
                    title: title || 'Contract',
                    amount: amount ? parseFloat(amount) : 0,
                    description: description,
                    status: 'DRAFT',
                    content: {
                        ...content,
                        client_name: clientName,
                        recipient_email: recipientEmail,
                        html_content: content?.html_content || '',
                        approval_token: approvalToken
                    }
                })
                .select()
                .single();

            if (error) throw error;

            // Send contract email if recipient provided
            if (doc && recipientEmail) {
                // Fetch user name for email sender
                const { data: senderProfile } = await supabase
                    .from('users')
                    .select('first_name, last_name')
                    .eq('id', user.id)
                    .single();
                    
                const senderName = senderProfile ? 
                    `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 'Hedwig User' 
                    : 'Hedwig User';

                // Calculate total amount from items if available
                const totalAmount = content?.items 
                    ? content.items.reduce((sum: number, item: any) => sum + (parseFloat(item.amount) || 0), 0)
                    : amount;

                await import('../services/email').then(m => m.EmailService.sendContractEmail({
                    to: recipientEmail,
                    senderName,
                    contractTitle: doc.title,
                    contractId: doc.id,
                    approvalToken: approvalToken,
                    totalAmount: totalAmount ? totalAmount.toString() : undefined,
                    milestoneCount: content?.items?.length
                }));
                
                // Update status to SENT
                await supabase.from('documents').update({ status: 'SENT' }).eq('id', doc.id);
                doc.status = 'SENT';
            }

            res.json({ success: true, data: { document: doc } });
            return;

        } else {
            res.status(400).json({
                success: false,
                error: { message: `Unsupported document type: ${type}` }
            });
            return;
        }

    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/documents
 * List documents for the authenticated user
 */
router.get('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;
        const { type } = req.query;

        // Get internal user ID
        const user = await getOrCreateUser(privyId);

        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        let query = supabase
            .from('documents')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (type) {
            query = query.eq('type', type);
        }

        const { data: documents, error } = await query;

        if (error) throw error;

        res.json({
            success: true,
            data: { documents }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/documents/:id/public
 * Get public document details by ID (for sharing)
 */
router.get('/:id/public', async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        logger.debug('Public GET request for document');

        const { data: doc, error } = await supabase
            .from('documents')
            .select(`
                *,
                user:users(
                    id,
                    first_name,
                    last_name,
                    email
                )
            `)
            .eq('id', id)
            .single();

        if (error || !doc) {
            logger.warn('Document not found for public access');
            res.status(404).json({ success: false, error: { message: 'Document not found' } });
            return;
        }

        logger.debug('Returning public document', { type: doc.type });
        res.json({
            success: true,
            data: { document: doc }
        });
    } catch (error) {
        logger.error('Unexpected error fetching public document', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

/**
 * GET /api/documents/:id
 * Get document details by ID (Public access for viewing invoices/payment links)
 */
router.get('/:id', async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        logger.debug('GET request for document');

        const { data: doc, error } = await supabase
            .from('documents')
            .select(`
                *,
                user:users(
                    id,
                    privy_id,
                    email,
                    first_name,
                    first_name,
                    last_name,
                    ethereum_wallet_address,
                    solana_wallet_address
                )
            `)
            .eq('id', id)
            .single();

        logger.debug('Document query completed', { found: !!doc });
        if (error) logger.debug('Query error', { code: error.code });

        if (error || !doc) {
            logger.warn('Document not found');
            res.status(404).json({ success: false, error: { message: 'Document not found' } });
            return;
        }

        logger.debug('Returning document', { type: doc.type });
        res.json({
            success: true,
            data: { document: doc }
        });
    } catch (error) {
        console.error('[Documents] Unexpected error:', error);
        next(error);
    }
});

/**
 * POST /api/documents/:id/pay
 * Mark a document (invoice or payment link) as paid
 * This is called from the payment pages after successful blockchain transaction
 */
router.post('/:id/pay', async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const { txHash, chain, token, amount, payer } = req.body;

        logger.debug('Pay request received', { chain, token, amount });

        // Fetch the document
        const { data: doc, error: fetchError } = await supabase
            .from('documents')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !doc) {
            res.status(404).json({ success: false, error: { message: 'Document not found' } });
            return;
        }

        // Update document status to PAID
        const { data: updatedDoc, error: updateError } = await supabase
            .from('documents')
            .update({
                status: 'PAID',
                content: {
                    ...doc.content,
                    paid_at: new Date().toISOString(),
                    tx_hash: txHash,
                    payment_chain: chain,
                    payment_token: token,
                    paid_amount: amount,
                    payer_address: payer
                }
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            throw new AppError(`Failed to update document: ${updateError.message}`, 500);
        }

        logger.info('Document marked as paid');

        // Send notifications to the document owner
        try {
            const docType = doc.type === 'INVOICE' ? 'Invoice' : 'Payment Link';

            // Get payer display name: prefer client_name, then email, then wallet address
            const content = doc.content as any;
            const clientName = content?.client_name;
            const payerEmail = content?.recipient_email || content?.client_email;
            const payerDisplay = clientName
                ? clientName
                : payerEmail
                    ? payerEmail
                    : payer
                        ? `${payer.slice(0, 6)}...${payer.slice(-4)}`
                        : 'A customer';

            const notificationTitle = `💰 ${docType} Paid!`;
            const notificationBody = `${payerDisplay} paid "${doc.title}" - ${doc.amount} ${doc.currency || 'USDC'} received!`;

            logger.debug('Sending payment notification');

            // Send push notification
            await NotificationService.notifyUser(doc.user_id, {
                title: notificationTitle,
                body: notificationBody,
                data: {
                    type: 'payment_received',
                    documentId: id,
                    documentType: doc.type,
                    amount: doc.amount,
                    txHash: txHash
                }
            });

            // Create in-app notification (using 'metadata' field, not 'data')
            const { error: notifError } = await supabase
                .from('notifications')
                .insert({
                    user_id: doc.user_id,
                    type: 'payment_received',
                    title: notificationTitle,
                    message: notificationBody,
                    metadata: {
                        document_id: id,
                        document_type: doc.type,
                        amount: doc.amount,
                        currency: doc.currency || 'USDC',
                        tx_hash: txHash,
                        chain: chain,
                        payer_email: payerEmail || null,
                        payer_address: payer
                    },
                    is_read: false
                });

            if (notifError) {
                logger.error('Failed to insert notification', { error: notifError.message });
            } else {
                logger.info('In-app notification created');
            }

            logger.info('Payment notification sent');
        } catch (notifyError) {
            // Don't fail the payment if notification fails
            logger.error('Failed to send payment notification', { error: notifyError instanceof Error ? notifyError.message : 'Unknown' });
        }

        // Mark associated calendar event as completed
        await markCalendarEventCompleted('invoice', id as string);

        res.json({
            success: true,
            data: { document: updatedDoc }
        });
    } catch (error) {
        logger.error('Pay endpoint error', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

/**
 * POST /api/documents/:id/complete
 * Mark a contract as completed and generate an invoice
 */
router.post('/:id/complete', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.id;

        // Get user ID first
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single();

        if (userError || !userData) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }

        // Fetch the contract
        const { data: contract, error: fetchError } = await supabase
            .from('documents')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !contract) {
            res.status(404).json({
                success: false,
                error: { message: 'Contract not found' },
            });
            return;
        }

        // Verify ownership
        if (contract.user_id !== userData.id) {
            res.status(403).json({
                success: false,
                error: { message: 'Not authorized to complete this contract' },
            });
            return;
        }

        // Verify contract is in ACTIVE or VIEWED state
        if (contract.status !== 'ACTIVE' && contract.status !== 'VIEWED') {
            res.status(400).json({
                success: false,
                error: { message: 'Only active contracts can be marked as completed' },
            });
            return;
        }

        // Mark contract as completed
        const { data: updatedContract, error: updateError } = await supabase
            .from('documents')
            .update({
                status: 'PAID',
                content: {
                    ...contract.content,
                    completed_at: new Date().toISOString()
                }
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            throw new AppError(`Failed to update contract: ${updateError.message}`, 500);
        }

        // Generate invoice for the completed contract
        const clientName = contract.client_name || contract.content?.client_name || 'Client';
        const { data: invoice, error: invoiceError } = await supabase
            .from('documents')
            .insert({
                user_id: userData.id,
                type: 'INVOICE',
                title: `Invoice for ${contract.title}`,
                amount: contract.amount,
                description: contract.description || contract.title,
                status: 'SENT',
                content: {
                    recipient_email: contract.content?.recipient_email || contract.content?.client_email,
                    client_name: clientName,
                    project_description: contract.description || contract.title,
                    contract_id: contract.id,
                    items: [
                        {
                            description: contract.title,
                            amount: contract.amount
                        }
                    ]
                }
            })
            .select()
            .single();

        if (invoiceError) {
            logger.error('Failed to create invoice from contract', { error: invoiceError.message });
            // Don't fail the request if invoice creation fails
        }

        res.json({
            success: true,
            data: {
                contract: updatedContract,
                invoice: invoice || null
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/documents/:id
 * Delete a document by ID
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.id;

        // Get user ID first
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single();

        if (userError || !userData) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }

        // Verify the document belongs to the user before deleting
        const { data: document, error: fetchError } = await supabase
            .from('documents')
            .select('id, user_id')
            .eq('id', id)
            .single();

        if (fetchError || !document) {
            res.status(404).json({
                success: false,
                error: { message: 'Document not found' },
            });
            return;
        }

        if (document.user_id !== userData.id) {
            res.status(403).json({
                success: false,
                error: { message: 'Not authorized to delete this document' },
            });
            return;
        }

        // Delete the document
        const { error: deleteError } = await supabase
            .from('documents')
            .delete()
            .eq('id', id);

        if (deleteError) {
            throw new AppError(`Failed to delete document: ${deleteError.message}`, 500);
        }

        res.json({
            success: true,
            data: { message: 'Document deleted successfully' },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/documents/:id/remind
 * Manually trigger a smart reminder for a document
 */
router.post('/:id/remind', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.id;

        // Get user ID first
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single();

        if (userError || !userData) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // Fetch document with user info
        const { data: doc, error: fetchError } = await supabase
            .from('documents')
            .select(`
                *,
                user:users(
                    first_name,
                    last_name,
                    email
                )
            `)
            .eq('id', id)
            .single();

        if (fetchError || !doc) {
            res.status(404).json({ success: false, error: { message: 'Document not found' } });
            return;
        }

        // Verify ownership
        if (doc.user_id !== userData.id) {
            res.status(403).json({ success: false, error: { message: 'Not authorized' } });
            return;
        }

        // Import dynamically to avoid circular dependencies if any, though importing at top is better
        const { SchedulerService } = require('../services/scheduler');

        // Trigger the reminder process for this single document - Force manual mode
        const result = await SchedulerService.processDocumentReminder(doc, true);

        if (result.sent) {
            res.json({
                success: true,
                data: { message: 'Reminder sent successfully' }
            });
        } else {
            res.status(400).json({
                success: false,
                error: { message: `Failed to send reminder: ${result.reason || 'Unknown error'}` }
            });
        }
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/documents/:id/toggle-reminders
 * Enable or disable reminders for a document
 */
router.post('/:id/toggle-reminders', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const { enabled } = req.body;
        const privyId = req.user!.id;

        // Get user ID first
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single();

        if (userError || !userData) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // Fetch document
        const { data: doc, error: fetchError } = await supabase
            .from('documents')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !doc) {
            res.status(404).json({ success: false, error: { message: 'Document not found' } });
            return;
        }

        // Verify ownership
        if (doc.user_id !== userData.id) {
            res.status(403).json({ success: false, error: { message: 'Not authorized' } });
            return;
        }

        // Update reminders_enabled in content
        const content = doc.content || {};
        const { data: updatedDoc, error: updateError } = await supabase
            .from('documents')
            .update({
                content: {
                    ...content,
                    reminders_enabled: enabled
                }
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            throw new AppError(`Failed to update document: ${updateError.message}`, 500);
        }

        res.json({
            success: true,
            data: {
                document: updatedDoc,
                remindersEnabled: enabled
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/documents/:id/send
 * Send a contract to client via email
 */
router.post('/:id/send', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.id;

        // Get user
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, email, first_name, last_name')
            .eq('privy_id', privyId)
            .single();

        if (userError || !userData) {
            res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
            return;
        }

        // Fetch the contract
        const { data: contract, error: fetchError } = await supabase
            .from('documents')
            .select('*')
            .eq('id', id)
            .eq('type', 'CONTRACT')
            .single();

        if (fetchError || !contract) {
            res.status(404).json({
                success: false,
                error: { message: 'Contract not found' },
            });
            return;
        }

        // Verify ownership
        if (contract.user_id !== userData.id) {
            res.status(403).json({
                success: false,
                error: { message: 'Not authorized to send this contract' },
            });
            return;
        }

        // Check if contract has client email
        const clientEmail = contract.content?.client_email || contract.content?.recipient_email;
        if (!clientEmail) {
            res.status(400).json({
                success: false,
                error: { message: 'Contract has no client email. Please add client email first.' },
            });
            return;
        }

        // Generate secure approval token
        const crypto = await import('crypto');
        const approvalToken = crypto.randomBytes(32).toString('hex');

        // Update contract status and add approval token
        const { data: updatedContract, error: updateError } = await supabase
            .from('documents')
            .update({
                status: 'SENT',
                content: {
                    ...contract.content,
                    approval_token: approvalToken,
                    sent_at: new Date().toISOString()
                }
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            throw new AppError(`Failed to update contract: ${updateError.message}`, 500);
        }

        // Send email to client
        const { EmailService } = await import('../services/email');
        const senderName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'A Hedwig User';
        const milestones = contract.content?.milestones || [];
        
        const emailSent = await EmailService.sendContractEmail({
            to: clientEmail,
            senderName,
            contractTitle: contract.title,
            contractId: contract.id,
            approvalToken,
            totalAmount: contract.content?.payment_amount || contract.amount?.toString(),
            milestoneCount: milestones.length
        });

        res.json({
            success: true,
            data: {
                contract: updatedContract,
                emailSent,
                clientEmail
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/documents/approve/:id/:token
 * Approve a contract via email link (public endpoint)
 */
router.get('/approve/:id/:token', async (req: Request, res: Response, next) => {
    try {
        const { id, token } = req.params;

        // Fetch the contract
        const { data: contract, error: fetchError } = await supabase
            .from('documents')
            .select('*')
            .eq('id', id)
            .eq('type', 'CONTRACT')
            .single();

        if (fetchError || !contract) {
            res.status(404).json({
                success: false,
                error: { message: 'Contract not found' },
            });
            return;
        }

        // Verify token
        if (!contract.content?.approval_token || contract.content.approval_token !== token) {
            res.status(403).json({
                success: false,
                error: { message: 'Invalid or expired approval link' },
            });
            return;
        }

        // Check if already approved (SIGNED or PAID indicate approval)
        if (contract.status === 'SIGNED' || contract.status === 'PAID') {
            res.status(400).json({
                success: false,
                error: { message: 'Contract has already been approved' },
            });
            return;
        }

        // Get freelancer info
        const { data: freelancer } = await supabase
            .from('users')
            .select('id, email, first_name, last_name')
            .eq('id', contract.user_id)
            .single();

        // Update contract status to SIGNED (approved)
        const { error: updateError } = await supabase
            .from('documents')
            .update({
                status: 'SIGNED',
                content: {
                    ...contract.content,
                    approved_at: new Date().toISOString(),
                    approval_token: null // Clear token after use
                }
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            throw new AppError(`Failed to approve contract: ${updateError.message}`, 500);
        }

        // Generate milestone-based invoices
        const milestones = contract.content?.milestones || [];
        const clientName = contract.content?.client_name || 'Client';
        const clientEmail = contract.content?.client_email || contract.content?.recipient_email;
        const createdInvoices: any[] = [];

        for (let i = 0; i < milestones.length; i++) {
            const milestone = milestones[i];
            const amount = parseFloat(milestone.amount?.toString().replace(/[^0-9.]/g, '') || '0');

            if (amount > 0) {
                const { data: invoice, error: invoiceError } = await supabase
                    .from('documents')
                    .insert({
                        user_id: contract.user_id,
                        type: 'INVOICE',
                        title: `Milestone ${i + 1}: ${milestone.description || milestone.title || 'Milestone'}`,
                        amount: amount,
                        status: 'DRAFT', // Start as draft, freelancer can send when ready
                        content: {
                            client_name: clientName,
                            recipient_email: clientEmail,
                            contract_id: contract.id,
                            milestone_index: i,
                            milestone_description: milestone.description || milestone.title,
                            due_date: milestone.due_date,
                            items: [{
                                description: milestone.description || milestone.title || `Milestone ${i + 1}`,
                                amount: amount,
                                quantity: 1
                            }]
                        }
                    })
                    .select()
                    .single();

                if (!invoiceError && invoice) {
                    createdInvoices.push(invoice);
                } else {
                    console.error(`[Contract Approve] Failed to create invoice for milestone ${i + 1}:`, invoiceError);
                }
            }
        }

        // Send notification to freelancer
        if (freelancer?.email) {
            const { EmailService } = await import('../services/email');
            await EmailService.sendContractApprovedNotification({
                to: freelancer.email,
                clientName,
                contractTitle: contract.title,
                contractId: contract.id,
                invoiceCount: createdInvoices.length
            });
        }

        // Create in-app notification
        if (freelancer) {
            try {
                await NotificationService.notifyContractApproved(
                    freelancer.id,
                    contract.id,
                    contract.title,
                    clientName
                );
            } catch (notifError) {
                console.error('[Contract Approve] Failed to create notification:', notifError);
            }
        }

        // Redirect to contract page with success message
        const baseUrl = process.env.API_URL || 'http://localhost:3000';
        res.redirect(`${baseUrl}/contract/${id}?approved=true`);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/documents/:id/accept
 * Accept a proposal - updates status and notifies freelancer
 */
router.post('/:id/accept', async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const { walletAddress } = req.body;

        // Fetch the proposal/document
        const { data: document, error: fetchError } = await supabase
            .from('documents')
            .select('*, user:users!documents_user_id_fkey(*)')
            .eq('id', id)
            .single();

        if (fetchError || !document) {
            res.status(404).json({
                success: false,
                error: { message: 'Document not found' }
            });
            return;
        }

        // Check if already accepted
        if (document.status === 'ACCEPTED' || document.status === 'PAID' || document.status === 'SIGNED') {
            res.status(400).json({
                success: false,
                error: { message: 'This proposal has already been accepted' }
            });
            return;
        }

        // Update document status to ACCEPTED (or SIGNED for compatibility)
        const { error: updateError } = await supabase
            .from('documents')
            .update({
                status: 'SIGNED',  // Using SIGNED as it's in the enum
                content: {
                    ...document.content,
                    accepted_at: new Date().toISOString(),
                    accepted_wallet: walletAddress || null
                }
            })
            .eq('id', id);

        if (updateError) {
            throw new AppError('Failed to accept proposal', 500);
        }

        const clientName = document.content?.client_name || 'Client';
        const freelancer = document.user;

        // Send email notification to freelancer
        if (freelancer?.email) {
            const { EmailService } = await import('../services/email');
            await EmailService.sendProposalAcceptedNotification({
                to: freelancer.email,
                clientName,
                proposalTitle: document.title,
                proposalId: document.id
            });
        }

        // Send push notification to freelancer
        if (freelancer) {
            try {
                await NotificationService.notifyProposalAccepted(
                    freelancer.id,
                    document.id,
                    document.title,
                    clientName
                );
            } catch (notifError) {
                console.error('[Proposal Accept] Failed to send notification:', notifError);
            }
        }

        res.json({
            success: true,
            data: {
                message: 'Proposal accepted successfully',
                documentId: id
            }
        });
    } catch (error) {
        next(error);
    }
});


/**
 * PUT /api/documents/:id
 * Update a document
 */
router.put('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // Verify ownership and get existing content
        const { data: existingDoc, error: fetchError } = await supabase
            .from('documents')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !existingDoc) {
            res.status(404).json({ success: false, error: { message: 'Document not found' } });
            return;
        }

        // Prepare update payload
        const updatePayload: any = {};
        
        // Handle content updates merge
        if (updates.content) {
            updatePayload.content = {
                ...existingDoc.content,
                ...updates.content
            };
        }

        // Allow updating specific top-level fields if needed
        if (updates.title) updatePayload.title = updates.title;
        if (updates.status) updatePayload.status = updates.status;
        if (updates.amount) updatePayload.amount = updates.amount;
        if (updates.description) updatePayload.description = updates.description;

        const { data: updatedDoc, error: updateError } = await supabase
            .from('documents')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            throw new Error(`Failed to update document: ${updateError.message}`);
        }

        res.json({
            success: true,
            data: { document: updatedDoc }
        });
    } catch (error) {
        next(error);
    }
});

export default router;
