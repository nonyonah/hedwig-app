import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { EmailService } from '../services/email';
import { createCalendarEventFromSource } from './calendar';
import { createLogger } from '../utils/logger';
import BlockradarService from '../services/blockradar';

const logger = createLogger('Milestone');

const router = Router();

/**
 * GET /api/milestones
 * Get milestones for a project
 */
router.get('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;
        const { projectId } = req.query;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!projectId) {
            res.status(400).json({ success: false, error: { message: 'Project ID is required' } });
            return;
        }

        // Verify project belongs to user
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .eq('user_id', user.id)
            .single();

        if (projectError || !project) {
            res.status(404).json({ success: false, error: { message: 'Project not found' } });
            return;
        }

        const { data: milestones, error } = await supabase
            .from('milestones')
            .select('*')
            .eq('project_id', projectId)
            .order('due_date', { ascending: true });

        if (error) {
            throw new Error(`Failed to fetch milestones: ${error.message}`);
        }

        const formattedMilestones = (milestones || []).map(m => ({
            id: m.id,
            projectId: m.project_id,
            title: m.title,
            amount: parseFloat(m.amount),
            dueDate: m.due_date,
            status: m.status,
            invoiceId: m.invoice_id,
            createdAt: m.created_at,
            updatedAt: m.updated_at,
        }));

        res.json({
            success: true,
            data: { milestones: formattedMilestones },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/milestones/:id
 * Get a specific milestone
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const { data: milestone, error } = await supabase
            .from('milestones')
            .select(`
                *,
                project:projects(id, name, user_id)
            `)
            .eq('id', id)
            .single();

        if (error || !milestone) {
            res.status(404).json({ success: false, error: { message: 'Milestone not found' } });
            return;
        }

        // Verify ownership
        if (milestone.project?.user_id !== user.id) {
            res.status(403).json({ success: false, error: { message: 'Access denied' } });
            return;
        }

        res.json({
            success: true,
            data: {
                milestone: {
                    id: milestone.id,
                    projectId: milestone.project_id,
                    title: milestone.title,
                    amount: parseFloat(milestone.amount),
                    dueDate: milestone.due_date,
                    status: milestone.status,
                    invoiceId: milestone.invoice_id,
                    createdAt: milestone.created_at,
                    updatedAt: milestone.updated_at,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/milestones
 * Create a new milestone
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { projectId, title, amount, dueDate } = req.body;
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!projectId) {
            res.status(400).json({ success: false, error: { message: 'Project ID is required' } });
            return;
        }

        if (!title) {
            res.status(400).json({ success: false, error: { message: 'Title is required' } });
            return;
        }

        if (!amount || amount <= 0) {
            res.status(400).json({ success: false, error: { message: 'Valid amount is required' } });
            return;
        }

        if (!dueDate) {
            res.status(400).json({ success: false, error: { message: 'Due date is required for milestones' } });
            return;
        }

        // Verify project belongs to user
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, name')
            .eq('id', projectId)
            .eq('user_id', user.id)
            .single();

        if (projectError || !project) {
            res.status(404).json({ success: false, error: { message: 'Project not found' } });
            return;
        }

        const { data: milestone, error } = await supabase
            .from('milestones')
            .insert({
                project_id: projectId,
                title,
                amount,
                due_date: dueDate || null,
                status: 'pending',
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create milestone: ${error.message}`);
        }

        // Auto-create calendar event if milestone has due date
        if (dueDate && milestone) {
            await createCalendarEventFromSource(
                user.id,
                `Milestone due: ${title}`,
                dueDate,
                'milestone_due',
                'milestone',
                milestone.id,
                `${project.name} - ${amount} due`
            );
        }

        res.json({
            success: true,
            data: {
                milestone: {
                    id: milestone.id,
                    projectId: milestone.project_id,
                    title: milestone.title,
                    amount: parseFloat(milestone.amount),
                    dueDate: milestone.due_date,
                    status: milestone.status,
                    invoiceId: milestone.invoice_id,
                    createdAt: milestone.created_at,
                    updatedAt: milestone.updated_at,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/milestones/:id
 * Update a milestone
 */
router.put('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const { title, amount, dueDate, status } = req.body;
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // First verify ownership
        const { data: existing, error: existingError } = await supabase
            .from('milestones')
            .select(`
                *,
                project:projects(user_id)
            `)
            .eq('id', id)
            .single();

        if (existingError || !existing) {
            res.status(404).json({ success: false, error: { message: 'Milestone not found' } });
            return;
        }

        if (existing.project?.user_id !== user.id) {
            res.status(403).json({ success: false, error: { message: 'Access denied' } });
            return;
        }

        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (amount !== undefined) updateData.amount = amount;
        if (dueDate !== undefined) updateData.due_date = dueDate;
        if (status !== undefined) updateData.status = status;

        const { data: milestone, error } = await supabase
            .from('milestones')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error || !milestone) {
            res.status(500).json({ success: false, error: { message: 'Failed to update milestone' } });
            return;
        }

        res.json({
            success: true,
            data: {
                milestone: {
                    id: milestone.id,
                    projectId: milestone.project_id,
                    title: milestone.title,
                    amount: parseFloat(milestone.amount),
                    dueDate: milestone.due_date,
                    status: milestone.status,
                    invoiceId: milestone.invoice_id,
                    createdAt: milestone.created_at,
                    updatedAt: milestone.updated_at,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/milestones/:id
 * Delete a milestone
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // Verify ownership first
        const { data: existing, error: existingError } = await supabase
            .from('milestones')
            .select(`
                *,
                project:projects(user_id)
            `)
            .eq('id', id)
            .single();

        if (existingError || !existing) {
            res.status(404).json({ success: false, error: { message: 'Milestone not found' } });
            return;
        }

        if (existing.project?.user_id !== user.id) {
            res.status(403).json({ success: false, error: { message: 'Access denied' } });
            return;
        }

        const { error } = await supabase
            .from('milestones')
            .delete()
            .eq('id', id);

        if (error) {
            throw new Error(`Failed to delete milestone: ${error.message}`);
        }

        res.json({
            success: true,
            message: 'Milestone deleted successfully',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/milestones/:id/invoice
 * Generate an invoice for a milestone
 */
router.post('/:id/invoice', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const { network, token, skipInvoice } = req.body;
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // Get milestone with project and client info
        const { data: milestone, error: milestoneError } = await supabase
            .from('milestones')
            .select(`
                *,
                project:projects(
                    id, name, user_id, currency,
                    client:clients(id, name, email, company)
                )
            `)
            .eq('id', id)
            .single();

        if (milestoneError || !milestone) {
            res.status(404).json({ success: false, error: { message: 'Milestone not found' } });
            return;
        }

        // Verify access: project owner, assigned member, or workspace member
        const isOwner = milestone.project?.user_id === user.id;

        if (!isOwner) {
            const projectId = milestone.project_id || (Array.isArray(milestone.project) ? milestone.project[0]?.id : milestone.project?.id);
            const { data: proj } = await supabase
                .from('projects').select('workspace_id').eq('id', projectId).single();

            if (proj?.workspace_id) {
                const { data: membership } = await supabase
                    .from('workspace_members').select('role')
                    .eq('workspace_id', proj.workspace_id).eq('user_id', user.id).maybeSingle();
                if (!membership) {
                    res.status(403).json({ success: false, error: { message: 'Access denied' } });
                    return;
                }
            } else {
                res.status(403).json({ success: false, error: { message: 'Access denied' } });
                return;
            }
        }

        if (milestone.status !== 'pending' && milestone.status !== 'done' && milestone.status !== 'upcoming') {
            res.status(400).json({
                success: false,
                error: { message: 'Milestone already completed' }
            });
            return;
        }

        // For non-owners: just mark as done without creating an invoice
        if (skipInvoice || !isOwner) {
            const { error: updateError } = await supabase
                .from('milestones')
                .update({ status: 'done' })
                .eq('id', id);
            if (updateError) throw updateError;

            // Notify project owner and admins
            try {
                const memberName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'A member';
                const projectId = milestone.project_id || (Array.isArray(milestone.project) ? milestone.project[0]?.id : milestone.project?.id);
                const projectName = Array.isArray(milestone.project) ? milestone.project[0]?.name : milestone.project?.name;

                // Get workspace admins/owner to notify
                const { data: proj } = await supabase.from('projects').select('workspace_id').eq('id', projectId).single();
                if (proj?.workspace_id) {
                    const { data: admins } = await supabase
                        .from('workspace_members')
                        .select('user_id')
                        .eq('workspace_id', proj.workspace_id)
                        .in('role', ['owner', 'admin']);

                    for (const admin of (admins || [])) {
                        await supabase.from('notifications').insert({
                            user_id: admin.user_id,
                            workspace_id: proj.workspace_id,
                            title: `${memberName} completed a milestone`,
                            message: `"${milestone.title}" in "${projectName || 'a project'}" has been marked as complete.`,
                            type: 'milestone',
                            is_read: false,
                            metadata: { milestone_id: id, project_id: projectId, member_name: memberName },
                        });
                    }

                    // Email admins
                    const { data: adminUsers } = await supabase
                        .from('users').select('email').in('id', (admins || []).map((a: any) => a.user_id));
                    for (const admin of (adminUsers || [])) {
                        if (!admin.email) continue;
                        EmailService.sendMilestoneCompletedEmail({
                            to: admin.email,
                            memberName,
                            milestoneTitle: milestone.title,
                            projectName: projectName || 'a project',
                            projectId,
                        }).catch(() => {});
                    }
                }
            } catch {
                // Non-critical
            }

            res.json({ success: true, data: { milestone: { id, status: 'done' } } });
            return;
        }

        const client = milestone.project?.client;
        if (!client) {
            res.status(400).json({ success: false, error: { message: 'Project has no client' } });
            return;
        }

        // Create the invoice
        const invoiceTitle = `${milestone.title} - ${milestone.project.name}`;
        const projectId = milestone.project_id || (Array.isArray(milestone.project) ? milestone.project[0]?.id : milestone.project?.id);
        const { data: projectWs } = await supabase.from('projects').select('workspace_id').eq('id', projectId).single();

        const { data: invoice, error: invoiceError } = await supabase
            .from('documents')
            .insert({
                user_id: user.id,
                client_id: client.id,
                project_id: milestone.project.id,
                workspace_id: projectWs?.workspace_id || null,
                type: 'INVOICE',
                title: invoiceTitle,
                description: `Milestone: ${milestone.title}`,
                amount: milestone.amount,
                currency: milestone.project.currency || 'USD',
                status: 'DRAFT',
                content: {
                    client_name: client.name,
                    client_email: client.email,
                    client_company: client.company,
                    items: [
                        {
                            description: milestone.title,
                            quantity: 1,
                            rate: parseFloat(milestone.amount),
                            amount: parseFloat(milestone.amount),
                        }
                    ],
                    network: network || 'base',
                    token: token || 'USDC',
                    milestone_id: milestone.id,
                    project_name: milestone.project.name,
                },
            })
            .select()
            .single();

        if (invoiceError || !invoice) {
            throw new Error(`Failed to create invoice: ${invoiceError?.message}`);
        }

        // Generate BlockRadar payment link if network/token are provided
        if (network && token) {
            try {
                const WEB_CLIENT_URL = (process.env.WEB_CLIENT_URL || process.env.PUBLIC_BASE_URL || 'https://hedwig.riftlabs.xyz').replace(/\/+$/, '');
                
                // Create payment link via BlockRadar (matching document.ts implementation)
                const paymentLink = await BlockradarService.createPaymentLink({
                    name: `Invoice ${invoice.id.substring(0, 8)} - ${client.name || 'Client'}`,
                    description: `Milestone: ${milestone.title} - ${milestone.project.name}`,
                    amount: milestone.amount.toString(),
                    redirectUrl: `${WEB_CLIENT_URL}/invoice/${invoice.id}?status=success`,
                    successMessage: `Thank you for your payment! Invoice ${invoice.id.substring(0, 8)} has been paid.`,
                    metadata: {
                        documentId: invoice.id,
                        userId: user.id,
                        type: 'INVOICE',
                        clientName: client.name || 'Unknown',
                        milestoneId: milestone.id
                    }
                });

                if (paymentLink && paymentLink.url) {
                    // Update invoice with payment link details
                    await supabase
                        .from('documents')
                        .update({
                            payment_link_url: paymentLink.url,
                            content: {
                                ...invoice.content,
                                blockradar_url: paymentLink.url,
                                blockradar_uuid: paymentLink.uuid
                            }
                        })
                        .eq('id', invoice.id);
                        
                    // Update local invoice object for response
                    invoice.payment_link_url = paymentLink.url;
                    invoice.content = {
                        ...invoice.content,
                        blockradar_url: paymentLink.url,
                        blockradar_uuid: paymentLink.uuid
                    };
                }
            } catch (brError: any) {
                logger.error('Failed to generate BlockRadar link for milestone invoice', {
                    error: brError.message,
                    invoiceId: invoice.id,
                    milestoneId: milestone.id
                });
                // We don't fail the whole request, as the invoice was created
            }
        }

        // Update milestone with invoice reference and status
        const { error: updateError } = await supabase
            .from('milestones')
            .update({
                invoice_id: invoice.id,
                status: 'invoiced',
            })
            .eq('id', id);

        if (updateError) {
            logger.error('Failed to update milestone');
        }

        // Send invoice email to client if they have an email
        let emailSent = false;
        if (client.email) {
            logger.debug('Sending invoice email to client');
            try {
                // Get user's name for the email
                const { data: userData } = await supabase
                    .from('users')
                    .select('first_name, last_name')
                    .eq('id', user.id)
                    .single();

                const senderName = `${userData?.first_name || ''} ${userData?.last_name || ''}`.trim() || 'Freelancer';

                emailSent = await EmailService.sendInvoiceEmail({
                    to: client.email,
                    senderName: senderName,
                    amount: milestone.amount.toString(),
                    currency: milestone.project.currency || 'USD',
                    description: `${milestone.title} - ${milestone.project.name}`,
                    linkId: invoice.id,
                    network: network || 'base',
                    paymentUrl: invoice.payment_link_url || invoice.content?.blockradar_url // Pass BlockRadar URL if available
                });
                logger.info('Email sent');
            } catch (emailError) {
                logger.error('Failed to send invoice email');
            }
        } else {
            logger.debug('Client has no email, skipping email notification');
        }

        res.json({
            success: true,
            data: {
                invoice: {
                    id: invoice.id,
                    title: invoice.title,
                    amount: invoice.amount,
                    status: invoice.status,
                },
                milestone: {
                    id: milestone.id,
                    status: 'invoiced',
                    invoiceId: invoice.id,
                },
                emailSent,
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
