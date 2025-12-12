import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';
import { getOrCreateUser } from '../utils/userHelper';

const router = Router();

/**
 * POST /api/documents/invoice
 * Create a new invoice
 */
router.post('/invoice', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { amount, description, recipientEmail, items, dueDate, clientName, remindersEnabled } = req.body;
        const privyId = req.user!.privyId;

        // Get internal user ID
        const user = await getOrCreateUser(privyId);

        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
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

        res.json({
            success: true,
            data: { document: doc }
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
        const { amount, currency, description, remindersEnabled, recipientEmail, clientName } = req.body;
        const privyId = req.user!.privyId;

        // Get internal user ID
        const user = await getOrCreateUser(privyId);

        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // Create payment link record
        const { data: doc, error } = await supabase
            .from('documents')
            .insert({
                user_id: user.id,
                type: 'PAYMENT_LINK',
                title: description || 'Payment Link',
                amount: parseFloat(amount),
                currency: currency || 'USDC',
                status: 'DRAFT',
                payment_link_url: `https://hedwig.app/pay/${Date.now()}`,
                content: {
                    recipient_email: recipientEmail,
                    client_name: clientName,
                    reminders_enabled: remindersEnabled !== false // Default to true
                }
            })
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data: { document: doc }
        });
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
        const privyId = req.user!.privyId;
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
 * GET /api/documents/:id
 * Get document details by ID (Public access for viewing invoices/payment links)
 */
router.get('/:id', async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        console.log('[Documents] GET request for ID:', id);

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

        console.log('[Documents] Query result - error:', error);
        console.log('[Documents] Query result - doc:', doc ? 'Found' : 'Not found');

        if (error || !doc) {
            console.error('[Documents] Document not found for ID:', id, 'Error:', error);
            res.status(404).json({ success: false, error: { message: 'Document not found' } });
            return;
        }

        console.log('[Documents] Returning document:', doc.id, 'Type:', doc.type);
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

        console.log('[Documents] Pay request for ID:', id, { txHash, chain, token, amount, payer });

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

        console.log('[Documents] Document marked as paid:', id);

        res.json({
            success: true,
            data: { document: updatedDoc }
        });
    } catch (error) {
        console.error('[Documents] Pay error:', error);
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
        const privyId = req.user!.privyId;

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
            console.error('[Contract Complete] Failed to create invoice:', invoiceError);
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
        const privyId = req.user!.privyId;

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
        const privyId = req.user!.privyId;

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

        // Trigger the reminder process for this single document
        await SchedulerService.processDocumentReminder(doc);

        res.json({
            success: true,
            data: { message: 'Reminder process initiated' }
        });
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
        const privyId = req.user!.privyId;

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

export default router;
