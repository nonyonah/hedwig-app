import { Router, Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { supabase } from '../lib/supabase';
import { authenticate } from '../middleware/auth';
import { createLogger } from '../utils/logger';

const logger = createLogger('PDF');

const router = Router();

/**
 * GET /api/documents/:id/download-pdf
 * Generate and download PDF for a document (contract/proposal)
 */
router.get('/:id/download-pdf', async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        logger.debug('Generating PDF for document');

        // Fetch document to get title and content
        const { data: docData, error: docError } = await supabase
            .from('documents')
            .select('title, type, content')
            .eq('id', id)
            .single();

        if (docError || !docData) {
            res.status(404).json({ success: false, error: { message: 'Document not found' } });
            return;
        }

        const content = docData.content?.generated_content || '';

        logger.debug('Creating PDF document');

        // Create PDF document
        const doc = new PDFDocument({
            size: 'LETTER',
            margins: {
                top: 72,    // 1 inch
                bottom: 72,
                left: 72,
                right: 72
            }
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${docData.title}.pdf"`);

        // Pipe PDF to response
        doc.pipe(res);

        // Parse markdown content
        const lines = content.split('\n');
        let isFirstHeading = true;
        let consecutiveEmptyLines = 0;

        for (const line of lines) {
            // Skip excessive empty lines to prevent blank pages
            if (!line.trim()) {
                consecutiveEmptyLines++;
                if (consecutiveEmptyLines < 2) {
                    doc.moveDown(0.4);
                }
                continue;
            }
            consecutiveEmptyLines = 0;

            // Handle headings
            if (line.startsWith('# ')) {
                if (!isFirstHeading) {
                    doc.moveDown(1.5);
                }
                doc.fontSize(24)
                    .font('Helvetica-Bold')
                    .text(line.substring(2).trim(), { align: 'center' });
                doc.moveDown(1);
                isFirstHeading = false;
            }
            else if (line.startsWith('## ')) {
                doc.moveDown(1.2);
                doc.fontSize(16)
                    .font('Helvetica-Bold')
                    .text(line.substring(3).trim().toUpperCase());
                doc.moveDown(0.6);
            }
            else if (line.startsWith('### ')) {
                doc.moveDown(0.8);
                doc.fontSize(14)
                    .font('Helvetica-Bold')
                    .text(line.substring(4).trim());
                doc.moveDown(0.4);
            }
            // Handle bold text (simple approach - split and alternate)
            else if (line.includes('**')) {
                // Remove markdown bold syntax and just bold the whole line if it has **
                const cleanLine = line.replace(/\*\*/g, '');
                doc.fontSize(11)
                    .font('Helvetica-Bold')
                    .text(cleanLine.trim(), { align: 'left' });
                doc.moveDown(0.4);
            }
            // Handle list items
            else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                const indent = (line.length - line.trimStart().length) * 3; // Calculate indentation
                doc.fontSize(11)
                    .font('Helvetica')
                    .text('• ' + line.trim().substring(2), {
                        indent: Math.max(20, indent)
                    });
                doc.moveDown(0.3);
            }
            // Handle numbered lists
            else if (/^\s*\d+\./.test(line)) {
                const indent = (line.length - line.trimStart().length) * 3;
                doc.fontSize(11)
                    .font('Helvetica')
                    .text(line.trim(), {
                        indent: Math.max(20, indent)
                    });
                doc.moveDown(0.3);
            }
            // Regular paragraph
            else {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    doc.fontSize(11)
                        .font('Helvetica')
                        .text(trimmedLine, { align: 'left', lineGap: 2 });
                    doc.moveDown(0.5);
                }
            }
        }

        // Finalize PDF
        doc.end();

        logger.info('PDF generated and sent');

    } catch (error) {
        logger.error('Error generating PDF');
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
        const privyId = req.user!.id;

        logger.debug('User signing document');

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
                status: 'VIEWED',
                content: {
                    ...doc.content,
                    signature: signatureData
                }
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) throw updateError;

        logger.info('Document signed');

        res.json({
            success: true,
            data: {
                document: updatedDoc,
                signature: signatureData
            }
        });

    } catch (error) {
        logger.error('Error signing document');
        next(error);
    }
});

/**
 * POST /api/documents/:id/sign-wallet
 * Sign a document using wallet signature (no auth required)
 */
router.post('/:id/sign-wallet', async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const { signer_address, signature, signed_at, message } = req.body;

        logger.debug('Saving wallet signature for document');

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

        // Update document with wallet signature
        const signatureData = {
            signer_address,
            signature,
            signed_at,
            message,
            signature_type: 'wallet'
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

        logger.info('Document signed by wallet');

        // Generate Invoice automatically
        try {
            const contractContent = doc.content;
            const amountStr = contractContent.payment_amount?.replace(/[^0-9.]/g, '') || '0';
            const amount = parseFloat(amountStr);

            if (amount > 0) {
                logger.debug('Generating automatic invoice for contract');

                const { error: invoiceError } = await supabase
                    .from('documents')
                    .insert({
                        user_id: doc.user_id,
                        type: 'INVOICE',
                        title: `Invoice for ${doc.title}`,
                        amount: amount,
                        description: `Automatic invoice for signed contract: ${doc.title}`,
                        status: 'DRAFT',
                        content: {
                            client_name: contractContent.client_name,
                            client_email: contractContent.client_email,
                            recipient_email: contractContent.client_email,
                            items: [
                                {
                                    description: `Project payment for ${doc.title}`,
                                    quantity: 1,
                                    unitPrice: amount,
                                    amount: amount
                                }
                            ],
                            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Due in 7 days
                            contract_id: id
                        }
                    });

                if (invoiceError) {
                    logger.error('Failed to create automatic invoice');
                } else {
                    logger.info('Automatic invoice created');
                }
            }
        } catch (invoiceErr) {
            logger.error('Error generating invoice');
        }

        res.json({
            success: true,
            data: {
                document: updatedDoc,
                signature: signatureData
            }
        });

    } catch (error) {
        logger.error('Error saving signature');
        next(error);
    }
});

export default router;
