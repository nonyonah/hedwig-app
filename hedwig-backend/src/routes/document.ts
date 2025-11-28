import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { AppError } from '../middleware/errorHandler';

const router = Router();

/**
 * POST /api/documents/invoice
 * Create a new invoice
 */
router.post('/invoice', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { amount, description, recipientEmail, items, dueDate, clientName } = req.body;
        const privyId = req.user!.privyId;

        // Get internal user ID
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single();

        if (userError || !user) {
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
                    items: items || []
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
        const { amount, currency, description } = req.body;
        const privyId = req.user!.privyId;

        // Get internal user ID
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single();

        if (userError || !user) {
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
                payment_link_url: `https://hedwig.app/pay/${Date.now()}` // Simulated URL
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
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single();

        if (userError || !user) {
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
                    last_name
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

export default router;
