import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { EmailService } from '../services/email';
import { createLogger } from '../utils/logger';

const logger = createLogger('Projects');

const router = Router();

/**
 * GET /api/projects
 * Get all projects for the authenticated user
 */
router.get('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;
        const { status, clientId } = req.query;

        // Get internal user ID
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // Build query
        let query = supabase
            .from('projects')
            .select(`
                *,
                client:clients(id, name, email, company),
                milestones(id, title, amount, due_date, status)
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        // Filter by status if provided
        if (status && typeof status === 'string') {
            query = query.eq('status', status.toUpperCase());
        }

        // Filter by client if provided
        if (clientId && typeof clientId === 'string') {
            query = query.eq('client_id', clientId);
        }

        const { data: projects, error } = await query;

        if (error) {
            logger.error('Error fetching projects');
            throw new Error(`Failed to fetch projects: ${error.message}`);
        }

        logger.debug('Fetched projects', { count: projects?.length });
        if (projects && projects.length > 0) {
            logger.debug('First project has milestones', { count: projects[0]?.milestones?.length });
        }

        // Fetch contracts linked to these projects
        const projectIds = (projects || []).map(p => p.id);
        let contractsByProject: Record<string, { id: string; title: string; status: string }> = {};
        
        if (projectIds.length > 0) {
            const { data: contracts } = await supabase
                .from('documents')
                .select('id, title, status, project_id')
                .in('project_id', projectIds)
                .eq('type', 'CONTRACT');
            
            if (contracts) {
                contracts.forEach(contract => {
                    if (contract.project_id) {
                        contractsByProject[contract.project_id] = {
                            id: contract.id,
                            title: contract.title,
                            status: contract.status?.toLowerCase() || 'draft',
                        };
                    }
                });
            }
        }

        // Format projects with milestone progress
        const formattedProjects = (projects || []).map(project => {
            const milestones = project.milestones || [];
            const totalMilestones = milestones.length;
            // Count both 'invoiced' and 'paid' as completed for progress
            const completedMilestones = milestones.filter((m: any) => ['invoiced', 'paid'].includes(m.status)).length;
            const totalAmount = milestones.reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);
            const paidAmount = milestones
                .filter((m: any) => m.status === 'paid')
                .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);

            const linkedContract = contractsByProject[project.id];

            return {
                id: project.id,
                clientId: project.client_id,
                client: project.client,
                title: project.name,
                description: project.description,
                status: project.status?.toLowerCase() || 'ongoing',
                budget: project.budget,
                currency: project.currency,
                startDate: project.start_date,
                deadline: project.deadline || project.end_date,
                createdAt: project.created_at,
                updatedAt: project.updated_at,
                hasContract: !!linkedContract,
                contract: linkedContract || null,
                milestones: milestones.map((m: any) => ({
                    id: m.id,
                    title: m.title,
                    amount: parseFloat(m.amount || 0),
                    dueDate: m.due_date,
                    status: m.status,
                })),
                progress: {
                    totalMilestones,
                    completedMilestones,
                    percentage: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0,
                    totalAmount,
                    paidAmount,
                },
            };
        });

        res.json({
            success: true,
            data: { projects: formattedProjects },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/projects/:id
 * Get a specific project with its milestones
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

        const { data: project, error } = await supabase
            .from('projects')
            .select(`
                *,
                client:clients(id, name, email, company, phone),
                milestones(id, title, amount, due_date, status, invoice_id, created_at, updated_at)
            `)
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (error || !project) {
            res.status(404).json({
                success: false,
                error: { message: 'Project not found' },
            });
            return;
        }

        const milestones = project.milestones || [];
        const totalMilestones = milestones.length;
        // Count both 'invoiced' and 'paid' as completed for progress
        const completedMilestones = milestones.filter((m: any) => ['invoiced', 'paid'].includes(m.status)).length;
        const totalAmount = milestones.reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);
        const paidAmount = milestones
            .filter((m: any) => m.status === 'paid')
            .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);

        const formattedProject = {
            id: project.id,
            clientId: project.client_id,
            client: project.client,
            title: project.name,
            description: project.description,
            status: project.status?.toLowerCase() || 'ongoing',
            budget: project.budget,
            currency: project.currency,
            startDate: project.start_date,
            deadline: project.deadline || project.end_date,
            createdAt: project.created_at,
            updatedAt: project.updated_at,
            milestones: milestones.map((m: any) => ({
                id: m.id,
                title: m.title,
                amount: parseFloat(m.amount),
                dueDate: m.due_date,
                status: m.status,
                invoiceId: m.invoice_id,
                createdAt: m.created_at,
                updatedAt: m.updated_at,
            })),
            progress: {
                totalMilestones,
                completedMilestones,
                percentage: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0,
                totalAmount,
                paidAmount,
            },
        };

        res.json({
            success: true,
            data: { project: formattedProject },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        let { clientId } = req.body;
        const { title, description, startDate, deadline, budget, currency, milestones } = req.body;
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        // If no clientId, try to find or create client
        if (!clientId) {
            if (!req.body.clientName) {
                res.status(400).json({ success: false, error: { message: 'Client ID or Client Name is required' } });
                return;
            }

            const clientName = req.body.clientName;
            const clientEmail = req.body.clientEmail;

            // Try to find existing client by email or name
            let query = supabase
                .from('clients')
                .select('id')
                .eq('user_id', user.id);

            if (clientEmail) {
                query = query.eq('email', clientEmail);
            } else {
                query = query.eq('name', clientName);
            }

            const { data: existingClient } = await query.maybeSingle();

            if (existingClient) {
                clientId = existingClient.id;
            } else {
                // Create new client
                const { data: newClient, error: createError } = await supabase
                    .from('clients')
                    .insert({
                        user_id: user.id,
                        name: clientName,
                        email: clientEmail || null
                    })
                    .select('id')
                    .single();

                if (createError || !newClient) {
                    throw new Error(`Failed to create client: ${createError?.message}`);
                }
                clientId = newClient.id;
            }
        }

        if (!title) {
            res.status(400).json({ success: false, error: { message: 'Title is required' } });
            return;
        }

        if (!deadline) {
            res.status(400).json({ success: false, error: { message: 'Deadline is required for projects' } });
            return;
        }

        // Verify client belongs to user (implicit if we just found/created it, but good check if passed externally)
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id')
            .eq('id', clientId)
            .eq('user_id', user.id)
            .single();

        if (clientError || !client) {
            res.status(400).json({ success: false, error: { message: 'Invalid client' } });
            return;
        }

        const { data: project, error } = await supabase
            .from('projects')
            .insert({
                client_id: clientId,
                user_id: user.id,
                name: title,
                description,
                start_date: startDate,
                deadline: deadline,
                end_date: deadline,
                budget: budget || null,
                currency: currency || 'USD',
                status: 'ONGOING',
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create project: ${error.message}`);
        }

        // Create milestones if provided
        let createdMilestones: any[] = [];
        if (milestones && Array.isArray(milestones) && milestones.length > 0) {
            const milestonesData = milestones.map((m: any) => ({
                project_id: project.id,
                title: m.title,
                amount: parseFloat(m.amount) || 0,
                status: 'pending',
                due_date: m.dueDate || null, // Optional now
                user_id: user.id
            }));

            const { data: newMilestones, error: milestoneError } = await supabase
                .from('milestones')
                .insert(milestonesData)
                .select();

            if (milestoneError) {
                logger.error('Failed to create milestones', { error: milestoneError.message });
                // We don't fail the whole request, but we log it
            } else {
                createdMilestones = newMilestones || [];
            }
        }

        res.json({
            success: true,
            data: {
                project: {
                    id: project.id,
                    clientId: project.client_id,
                    title: project.name,
                    description: project.description,
                    status: 'ongoing',
                    budget: project.budget,
                    currency: project.currency,
                    startDate: project.start_date,
                    deadline: project.deadline,
                    createdAt: project.created_at,
                    updatedAt: project.updated_at,
                },
                milestones: createdMilestones
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/projects/:id
 * Update a project
 */
router.put('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const { title, description, status, startDate, deadline, budget, currency } = req.body;
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const updateData: any = {};
        if (title !== undefined) updateData.name = title;
        if (description !== undefined) updateData.description = description;
        if (status !== undefined) updateData.status = status.toUpperCase();
        if (startDate !== undefined) updateData.start_date = startDate;
        if (deadline !== undefined) {
            updateData.deadline = deadline;
            updateData.end_date = deadline;
        }
        if (budget !== undefined) updateData.budget = budget;
        if (currency !== undefined) updateData.currency = currency;

        const { data: project, error } = await supabase
            .from('projects')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error || !project) {
            res.status(404).json({
                success: false,
                error: { message: 'Project not found or update failed' },
            });
            return;
        }

        // Handle project completion - send emails and auto-invoice pending milestones
        let completionEmailSent = false;
        let pendingInvoicesSent: string[] = [];

        if (status?.toUpperCase() === 'COMPLETED') {
            logger.debug('Project marked as COMPLETED, handling completion notifications');

            // Get project with client and milestones info
            const { data: fullProject } = await supabase
                .from('projects')
                .select(`
                    *,
                    client:clients(id, name, email, company),
                    milestones(*)
                `)
                .eq('id', id)
                .single();

            if (fullProject) {
                const client = fullProject.client as any;
                const milestones = fullProject.milestones || [];

                // Get user's name for emails
                const { data: userData } = await supabase
                    .from('users')
                    .select('first_name, last_name')
                    .eq('id', user.id)
                    .single();

                const senderName = userData?.first_name && userData?.last_name
                    ? `${userData.first_name} ${userData.last_name}`
                    : 'Freelancer';

                // Find pending milestones that need to be invoiced
                const pendingMilestones = milestones.filter((m: any) => m.status === 'pending');

                // Auto-invoice pending milestones and send emails
                for (const milestone of pendingMilestones) {
                    try {
                        // Create invoice for milestone
                        const invoiceTitle = `${milestone.title} - ${fullProject.name}`;
                        const { data: invoice, error: invoiceError } = await supabase
                            .from('documents')
                            .insert({
                                user_id: user.id,
                                client_id: client?.id,
                                project_id: fullProject.id,
                                type: 'INVOICE',
                                title: invoiceTitle,
                                description: `Milestone: ${milestone.title}`,
                                amount: milestone.amount,
                                currency: fullProject.currency || 'USD',
                                status: 'DRAFT',
                                content: {
                                    client_name: client?.name,
                                    client_email: client?.email,
                                    items: [{
                                        description: milestone.title,
                                        quantity: 1,
                                        rate: parseFloat(milestone.amount),
                                        amount: parseFloat(milestone.amount),
                                    }],
                                    network: 'base',
                                    token: 'USDC',
                                    milestone_id: milestone.id,
                                    project_name: fullProject.name,
                                },
                            })
                            .select()
                            .single();

                        if (!invoiceError && invoice) {
                            // Update milestone status
                            await supabase
                                .from('milestones')
                                .update({ invoice_id: invoice.id, status: 'invoiced' })
                                .eq('id', milestone.id);

                            // Send invoice email if client has email
                            if (client?.email) {
                                try {
                                    await EmailService.sendInvoiceEmail({
                                        to: client.email,
                                        senderName,
                                        amount: milestone.amount.toString(),
                                        currency: fullProject.currency || 'USD',
                                        description: `${milestone.title} - ${fullProject.name}`,
                                        linkId: invoice.id,
                                        network: 'base',
                                    });
                                    pendingInvoicesSent.push(milestone.title);
                                    logger.info('Invoice email sent for milestone');
                                } catch (emailErr) {
                                    logger.error('Failed to send invoice email');
                                }
                            }
                        }
                    } catch (milestoneErr) {
                        logger.error('Error invoicing milestone');
                    }
                }

                // Send project completion email to client
                if (client?.email) {
                    try {
                        const totalAmount = milestones.reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);
                        const htmlContent = `
                            <h2 style="color: #111827; margin-bottom: 16px;">🎉 Project Completed!</h2>
                            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Great news! <strong>${senderName}</strong> has marked the project <strong>"${fullProject.name}"</strong> as completed.
                            </p>
                            <div style="background: #f3f4f6; border-radius: 12px; padding: 20px; margin: 24px 0;">
                                <p style="margin: 0 0 8px 0; color: #6b7280;">Project Total</p>
                                <p style="margin: 0; font-size: 28px; font-weight: bold; color: #111827;">$${totalAmount.toFixed(2)} ${fullProject.currency || 'USD'}</p>
                            </div>
                            ${pendingInvoicesSent.length > 0 ? `
                                <p style="color: #4b5563; font-size: 14px;">
                                    <strong>Invoices sent:</strong> ${pendingInvoicesSent.join(', ')}
                                </p>
                            ` : ''}
                            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                                Thank you for your business! If you have any questions, please reach out.
                            </p>
                        `;

                        await EmailService.sendSmartReminder(
                            client.email,
                            `Project Completed: ${fullProject.name}`,
                            htmlContent
                        );
                        completionEmailSent = true;
                        logger.info('Project completion email sent');
                    } catch (emailErr) {
                        logger.error('Failed to send completion email');
                    }
                }
            }
        }

        res.json({
            success: true,
            data: {
                project: {
                    id: project.id,
                    clientId: project.client_id,
                    title: project.name,
                    description: project.description,
                    status: project.status?.toLowerCase() || 'ongoing',
                    budget: project.budget,
                    currency: project.currency,
                    startDate: project.start_date,
                    deadline: project.deadline,
                    createdAt: project.created_at,
                    updatedAt: project.updated_at,
                },
                completionEmailSent,
                pendingInvoicesSent,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/projects/:id
 * Delete a project
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

        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) {
            throw new Error(`Failed to delete project: ${error.message}`);
        }

        res.json({
            success: true,
            message: 'Project deleted successfully',
        });
    } catch (error) {
        next(error);
    }
});

export default router;
