import { Router, Request, Response } from 'express';
import puppeteer from 'puppeteer';
import { supabase } from '../lib/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/documents/:id/download-pdf
 * Generate and download PDF for a document (contract/proposal)
 */
router.get('/:id/download-pdf', async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        console.log('[PDF] Generating PDF for document:', id);

        // Fetch document to get title and type
        const { data: docData, error: docError } = await supabase
            .from('documents')
            .select('title, type')
            .eq('id', id)
            .single();

        if (docError || !docData) {
            res.status(404).json({ success: false, error: { message: 'Document not found' } });
            return;
        }

        // Determine which page to render
        const pageType = docData.type === 'CONTRACT' ? 'contract' : 'proposal';
        const pageUrl = `${process.env.API_URL || 'http://localhost:3000'}/${pageType}/${id}`;

        console.log('[PDF] Rendering URL:', pageUrl);

        // Launch Puppeteer
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        // Set viewport for consistent rendering
        await page.setViewport({ width: 1200, height: 1600 });

        // Navigate to the page
        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait for content to load
        await page.waitForSelector('.markdown-body', { timeout: 10000 });

        // Generate PDF
        const pdf = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: {
                top: '0.5in',
                bottom: '0.5in',
                left: '0.5in',
                right: '0.5in'
            }
        });

        await browser.close();

        // Set headers for download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${docData.title}.pdf"`);
        res.send(pdf);

        console.log('[PDF] PDF generated successfully');

    } catch (error) {
        console.error('[PDF] Error generating PDF:', error);
        next(error);
    }
});

/**
 * POST /api/documents/:id/sign
 * Sign a document (contract/proposal)
 */
router.post('/:id/sign', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.privyId;

        console.log('[Signature] User signing document:', id);

        // Get user data
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, email, first_name, last_name')
            .eq('privy_id', privyId)
            .single();

        if (userError || !userData) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // Fetch document
        const { data: doc, error: docError } = await supabase
            .from('documents')
            .select('*')
            .eq('id', id)
            .single();

        if (docError || !doc) {
            res.status(404).json({ success: false, error: { message: 'Document not found' } });
            return;
        }

        // Update document with signature
        const signatureData = {
            signed_by: userData.id,
            signed_at: new Date().toISOString(),
            signer_name: `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
            signer_email: userData.email
        };

        const { data: updatedDoc, error: updateError } = await supabase
            .from('documents')
            .update({
                status: 'SIGNED',
                content: {
                    ...doc.content,
                    signature: signatureData
                }
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        console.log('[Signature] Document signed successfully');

        res.json({
            success: true,
            data: {
                document: updatedDoc,
                signature: signatureData
            }
        });

    } catch (error) {
        console.error('[Signature] Error signing document:', error);
        next(error);
    }
});

export default router;
