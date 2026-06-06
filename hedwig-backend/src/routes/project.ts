import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { EmailService } from '../services/email';
import { createLogger } from '../utils/logger';
import { upsertCalendarEventFromSource, updateCalendarEventStatusBySource } from './calendar';
import { checkDocumentCreationLimit, requireProFeatureAccess } from '../services/billingRules';
import { getWorkspaceRole, isOwnerOrAdmin, getMemberAssignedProjectIds } from '../middleware/workspaceRole';
import { getEffectiveWorkspaceId } from '../utils/workspace';

const logger = createLogger('Projects');

const router = Router();

const createProjectInAppNotification = async (params: {
    userId: string;
    projectId: string;
    title: string;
    message: string;
    type: string;
}) => {
    const { error } = await supabase.from('notifications').insert({
        user_id: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        metadata: {
            project_id: params.projectId,
            href: `/projects/${params.projectId}`,
            entityId: params.projectId,
            entityType: 'project',
        },
        is_read: false,
    });

    if (error) {
        logger.warn('Failed to create project notification', {
            projectId: params.projectId,
            type: params.type,
            error: error.message,
        });
    }
};

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

        const effectiveWsId = await getEffectiveWorkspaceId(req, user.id);
        const role = await getWorkspaceRole(req, user.id);

        // Build query — members see assigned projects only
        let query = supabase
            .from('projects')
            .select(`
                *,
                client:clients(id, name, email, company),
                milestones(id, title, amount, due_date, status)
            `)
            .eq('workspace_id', effectiveWsId)
            .order('created_at', { ascending: false });

        if (role === 'member') {
            const assignedIds = await getMemberAssignedProjectIds(user.id, role, effectiveWsId);
            if (!assignedIds || assignedIds.length === 0) {
                res.json({ success: true, data: { projects: [] } });
                return;
            }
            query = query.in('id', assignedIds);
        }
        // Owner and admin see all projects in the workspace — no user_id filter

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

        // Fetch member payouts if user is a member
        let payoutsByProject: Record<string, number | null> = {};
        if (role === 'member' && projectIds.length > 0) {
            const { data: payouts } = await supabase
                .from('workspace_project_assignments')
                .select('project_id, payout_amount')
                .eq('user_id', user.id)
                .in('project_id', projectIds);
            (payouts || []).forEach((p: any) => {
                payoutsByProject[p.project_id] = p.payout_amount;
            });
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
            budget: role === 'member' ? null : project.budget,
            memberPayout: payoutsByProject[project.id] ?? null,
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

        const workspaceId = await getEffectiveWorkspaceId(req, user.id);
        const role = await getWorkspaceRole(req, user.id);

        // Build query — members find via assignment, owners/admins by ownership
        let projectQuery = supabase
            .from('projects')
            .select(`
                *,
                client:clients(id, name, email, company, phone),
                milestones(id, title, amount, due_date, status, invoice_id, created_at, updated_at)
            `)
            .eq('id', id)
            .eq('workspace_id', workspaceId);

        if (role === 'member') {
            const { data: assignment } = await supabase
                .from('workspace_project_assignments')
                .select('project_id')
                .eq('project_id', id)
                .eq('user_id', user.id)
                .maybeSingle();
            if (!assignment) {
                res.status(404).json({ success: false, error: { message: 'Project not found' } });
                return;
            }
        } else {
            projectQuery = projectQuery.eq('user_id', user.id);
        }

        const { data: project, error } = await projectQuery.single();

        if (error || !project) {
            res.status(404).json({
                success: false,
                error: { message: 'Project not found' },
            });
            return;
        }

        // Look up member's personal payout for this project
        let memberPayout: number | null = null;
        if (role === 'member') {
            const { data: assignment } = await supabase
                .from('workspace_project_assignments')
                .select('payout_amount')
                .eq('project_id', id)
                .eq('user_id', user.id)
                .maybeSingle();
            memberPayout = assignment?.payout_amount ?? null;
        }

        const milestones = project.milestones || [];
        const totalMilestones = milestones.length;
        // Count both 'invoiced' and 'paid' as completed for progress
        const completedMilestones = milestones.filter((m: any) => ['invoiced', 'paid'].includes(m.status)).length;
        const totalAmount = milestones.reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);
        const paidAmount = milestones
            .filter((m: any) => m.status === 'paid')
            .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);

        const { data: relatedDocuments } = await supabase
            .from('documents')
            .select('id, title, amount, status, type, client_id, project_id, created_at, updated_at, description, content')
            .eq('user_id', user.id)
            .or(`project_id.eq.${id},client_id.eq.${project.client_id}`);

        const contractDoc = (relatedDocuments || []).find((doc: any) => doc.type === 'CONTRACT' && doc.project_id === id) || null;
        const invoiceDocs = (relatedDocuments || []).filter((doc: any) => {
            if (doc.type !== 'INVOICE') return false;
            if (doc.project_id === id) return true;

            const content = doc.content && typeof doc.content === 'object' ? doc.content : {};
            const invoiceDescription = String(doc.description || '').toLowerCase();
            const projectName = String(project.name || '').toLowerCase();

            return (
                content.project_id === id ||
                (projectName && invoiceDescription.includes(projectName))
            );
        });

        const formattedProject = {
            id: project.id,
            clientId: project.client_id,
            client: project.client,
            title: project.name,
            description: project.description,
            status: project.status?.toLowerCase() || 'ongoing',
            budget: role === 'member' ? null : project.budget,
            memberPayout,
            currency: project.currency,
            startDate: project.start_date,
            deadline: project.deadline || project.end_date,
            createdAt: project.created_at,
            updatedAt: project.updated_at,
            hasContract: !!contractDoc,
            contract: contractDoc
                ? {
                    id: contractDoc.id,
                    title: contractDoc.title,
                    status: contractDoc.status?.toLowerCase() || 'draft',
                }
                : null,
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
            invoices: invoiceDocs.map((doc: any) => ({
                id: doc.id,
                title: doc.title,
                amount: parseFloat(doc.amount || 0),
                status: doc.status?.toLowerCase() || 'draft',
                dueDate: doc.content?.due_date || doc.updated_at || doc.created_at,
            })),
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

        const role = await getWorkspaceRole(req, user.id);
        if (!isOwnerOrAdmin(role)) {
            res.status(403).json({ success: false, error: { message: 'Only owners and admins can create projects' } });
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

            // Use centralized ClientService for robust deduplication
            const { ClientService } = await import('../services/clientService');
            const { id: foundClientId, isNew } = await ClientService.getOrCreateClient(
                user.id,
                clientName,
                clientEmail,
                { workspaceId: await getEffectiveWorkspaceId(req, user.id) }
            );
            
            clientId = foundClientId;
            logger.info('Project creation: Client resolved', { clientId, isNew });
        }

        if (!title) {
            res.status(400).json({ success: false, error: { message: 'Title is required' } });
            return;
        }

        if (!deadline) {
            res.status(400).json({ success: false, error: { message: 'Deadline is required for projects' } });
            return;
        }

        // Verify client belongs to user — allow clients from any workspace
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, name, email, company')
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
                workspace_id: await getEffectiveWorkspaceId(req, user.id),
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

        // Create or update calendar deadline event for project end date
        if (project.deadline) {
            const clientName = (client as any)?.name || 'Client';
            await upsertCalendarEventFromSource(
                user.id,
                `Project ending: ${project.name} (${clientName})`,
                project.deadline,
                'project_deadline',
                'project',
                project.id,
                `Project deadline for ${project.name} · Client: ${clientName}`
            );
        }

        // Create milestones if provided
        let createdMilestones: any[] = [];
        let createdInvoiceCount = 0;
        let createdContract: { id: string; title: string; status: string } | null = null;
        let contractEmailSent = false;
        let contractLimitReached = false;
        let milestoneAutomationLocked = false;
        if (milestones && Array.isArray(milestones) && milestones.length > 0) {
            logger.info('Creating milestones', { count: milestones.length, projectId: project.id });
            
            const milestonesData = milestones.map((m: any) => ({
                project_id: project.id,
                title: m.title,
                amount: parseFloat(m.amount) || 0,
                status: 'pending',
                due_date: m.dueDate || null,
            }));

            logger.debug('Milestone data to insert', { milestonesData });

            const { data: newMilestones, error: milestoneError } = await supabase
                .from('milestones')
                .insert(milestonesData)
                .select();

            if (milestoneError) {
                logger.error('Failed to create milestones', { 
                    error: milestoneError.message,
                    code: milestoneError.code,
                    details: milestoneError.details,
                    hint: milestoneError.hint
                });
                // We don't fail the whole request, but we log it
            } else {
                createdMilestones = newMilestones || [];
                logger.info('Milestones created successfully', { count: createdMilestones.length });
            }
        }

        const milestoneItems = createdMilestones.map((milestone: any) => ({
            title: milestone.title,
            amount: parseFloat(milestone.amount || 0),
            dueDate: milestone.due_date || null,
            description: milestone.title,
        }));
        const fallbackProjectAmount = parseFloat(project.budget || 0) || 0;
        const totalAmount = milestoneItems.length > 0
            ? milestoneItems.reduce((sum, item) => sum + item.amount, 0)
            : fallbackProjectAmount;
        const approvalToken = crypto.randomBytes(32).toString('hex');

        const contractLimit = await checkDocumentCreationLimit({ user, type: 'CONTRACT' });
        if (!contractLimit.allowed) {
            contractLimitReached = true;
        } else {
            let generatedContent = '';
            try {
                const { llmService } = await import('../services/llm');
                const { data: fullUser } = await supabase
                    .from('users')
                    .select('first_name, last_name, email')
                    .eq('id', user.id)
                    .single();

                const freelancerName = fullUser
                    ? (fullUser.first_name
                        ? `${fullUser.first_name} ${fullUser.last_name || ''}`.trim()
                        : fullUser.email)
                    : 'Freelancer';
                const freelancerEmail = fullUser?.email || '';
                const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

                const milestoneSection = milestoneItems.length > 0
                    ? milestoneItems.map((item) => `- ${item.title}: $${item.amount}`).join('\n')
                    : '- Full project delivery (single scope)';

                const contractPrompt = `You are an expert legal contract generator.
CRITICAL INSTRUCTIONS:
1. USE '${today}' as the "Date of Agreement". Do NOT use placeholders like "[Date]" or "[Insert Date]".
2. Parties:
   - Client: ${client.name} ${client.company ? `(${client.company})` : ''}
   - Freelancer: ${freelancerName} (${freelancerEmail})
3. ADDRESS RULE: NO addresses are provided. DO NOT invent addresses. DO NOT use placeholders like "[Address]". Simply state the names and emails.
4. FORMAT: Markdown ONLY. No HTML. No conversational text.

Project Details:
Project Name: ${project.name}
Scope: ${description || title}
Total Value: $${totalAmount}
Milestones:
${milestoneSection}

GENERATE THE CONTRACT NOW, starting with the title.`;

                generatedContent = (await llmService.generateText(contractPrompt) || '')
                    .replace(/<think>[\s\S]*?<\/think>/gi, '')
                    .replace(/```(json|markdown)?\n?|\n?```/g, '')
                    .replace(/^(Here is|Sure|Certainly).+?\n\n/si, '')
                    .trim();
            } catch (contractError) {
                logger.warn('Project creation contract generation fell back to basic content', {
                    error: contractError instanceof Error ? contractError.message : String(contractError),
                    projectId: project.id,
                });
            }

            const contractContent = {
                client_name: client.name,
                client_email: client.email || req.body.clientEmail || null,
                scope_of_work: description || title,
                milestones: milestoneItems,
                payment_amount: totalAmount.toString(),
                payment_terms: milestoneItems.length > 0 ? 'Milestone-based payments' : 'Lump-sum payment',
                generated_content: generatedContent,
                html_content: generatedContent,
                approval_token: approvalToken,
            };

            const { data: contractDoc, error: contractError } = await supabase
                .from('documents')
                .insert({
                    user_id: user.id,
                    client_id: clientId,
                    project_id: project.id,
                    workspace_id: await getEffectiveWorkspaceId(req, user.id),
                    type: 'CONTRACT',
                    title: `${project.name} Contract`,
                    amount: totalAmount,
                    description: description || `Contract for project: ${project.name}`,
                    status: 'DRAFT',
                    content: contractContent,
                })
                .select()
                .single();

            if (contractError) {
                logger.error('Failed to auto-create contract for project', {
                    error: contractError.message,
                    projectId: project.id,
                });
            } else if (contractDoc) {
                createdContract = {
                    id: contractDoc.id,
                    title: contractDoc.title,
                    status: 'draft',
                };

                if (client.email) {
                    try {
                        const { data: senderProfile } = await supabase
                            .from('users')
                            .select('first_name, last_name')
                            .eq('id', user.id)
                            .single();

                        const senderName = senderProfile
                            ? `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 'Hedwig User'
                            : 'Hedwig User';

                        const emailSent = await EmailService.sendContractEmail({
                            to: client.email,
                            senderName,
                            contractTitle: contractDoc.title,
                            contractId: contractDoc.id,
                            approvalToken,
                            totalAmount: totalAmount.toString(),
                            milestoneCount: milestoneItems.length,
                        });

                        if (emailSent) {
                            await supabase.from('documents').update({ status: 'SENT' }).eq('id', contractDoc.id);
                            createdContract.status = 'sent';
                            contractEmailSent = true;
                        }
                    } catch (emailError) {
                        logger.error('Failed to send auto-created project contract email', {
                            error: emailError instanceof Error ? emailError.message : String(emailError),
                            projectId: project.id,
                        });
                    }
                }
            }
        }

        const milestoneAutomationAccess = await requireProFeatureAccess(user, 'milestone_invoice_automation');
        if (!milestoneAutomationAccess.allowed) {
            milestoneAutomationLocked = milestoneItems.length > 0;
        } else {
            for (const milestone of milestoneItems) {
                const { error: invoiceError } = await supabase
                    .from('documents')
                    .insert({
                        user_id: user.id,
                        client_id: clientId,
                        project_id: project.id,
                        workspace_id: await getEffectiveWorkspaceId(req, user.id),
                        type: 'INVOICE',
                        title: `Invoice: ${milestone.title}`,
                        amount: milestone.amount,
                        description: `Milestone for ${project.name}`,
                        status: 'DRAFT',
                        content: {
                            recipient_email: client.email || req.body.clientEmail || null,
                            client_name: client.name,
                            due_date: milestone.dueDate || project.deadline,
                            items: [{ description: milestone.title, amount: milestone.amount }],
                            reminders_enabled: true,
                        },
                    });

                if (invoiceError) {
                    logger.error('Failed to auto-create milestone invoice', {
                        error: invoiceError.message,
                        projectId: project.id,
                        milestoneTitle: milestone.title,
                    });
                    continue;
                }

                createdInvoiceCount += 1;
            }
        }

        logger.info('Project created successfully', { 
            projectId: project.id,
            milestonesCreated: createdMilestones.length,
            contractCreated: Boolean(createdContract),
            contractEmailSent,
            createdInvoiceCount,
        });

        await createProjectInAppNotification({
            userId: user.id,
            projectId: project.id,
            type: 'project_created',
            title: 'Project created',
            message: `${project.name} is set up and ready for delivery.`,
        });

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
                    hasContract: Boolean(createdContract),
                    contract: createdContract,
                    contractEmailSent,
                    createdInvoiceCount,
                    contractLimitReached,
                    milestoneAutomationLocked,
                    milestones: createdMilestones.map((m: any) => ({
                        id: m.id,
                        title: m.title,
                        amount: parseFloat(m.amount),
                        dueDate: m.due_date,
                        status: m.status,
                    })),
                },
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
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
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

        const role = await getWorkspaceRole(req, user.id);
        const workspaceId = await getEffectiveWorkspaceId(req, user.id);

        // Validate status transitions
        if (status !== undefined) {
            const newStatus = status.toUpperCase();
            const validMemberStatuses = ['REVIEW'];
            if (role === 'member' && !validMemberStatuses.includes(newStatus)) {
                res.status(403).json({ success: false, error: { message: 'Members can only mark projects as review' } });
                return;
            }
            if (['COMPLETED', 'CANCELLED'].includes(newStatus) && role !== 'owner') {
                res.status(403).json({ success: false, error: { message: 'Only the workspace owner can complete or cancel projects' } });
                return;
            }
        }

        // Members can only update status, not other fields
        if (role === 'member' && (title !== undefined || description !== undefined || startDate !== undefined || deadline !== undefined || budget !== undefined || currency !== undefined)) {
            res.status(403).json({ success: false, error: { message: 'Members can only update project status' } });
            return;
        }

        // Build update query — members find via assignment, owners/admins by ownership
        let updateQuery = supabase
            .from('projects')
            .update(updateData)
            .eq('id', id)
            .eq('workspace_id', workspaceId);

        if (role === 'member') {
            const { data: assignment } = await supabase
                .from('workspace_project_assignments')
                .select('project_id')
                .eq('project_id', id)
                .eq('user_id', user.id)
                .maybeSingle();
            if (!assignment) {
                res.status(403).json({ success: false, error: { message: 'You are not assigned to this project' } });
                return;
            }
        } else {
            updateQuery = updateQuery.eq('user_id', user.id);
        }

        const { data: project, error } = await updateQuery.select().single();

        if (error || !project) {
            logger.warn('Project update failed', { id, userId: user.id, role, error: error?.message || 'project not found', updateData });
            res.status(404).json({
                success: false,
                error: { message: 'Project not found or update failed' },
            });
            return;
        }

        // Send notifications based on status transition
        if (status && role) {
            try {
                const adminName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Admin';
                const newStatus = project.status;

                // Get assignees for this project
                const { data: assignees } = await supabase
                    .from('workspace_project_assignments')
                    .select('user_id, payout_amount')
                    .eq('project_id', id);

                const assigneeIds = (assignees || []).map((a: any) => a.user_id);

                if (newStatus === 'REVIEW' && role === 'member') {
                    // Member submitted → notify admins
                    const memberName = adminName;
                    const memberPayout = assignees?.find((a: any) => a.user_id === user.id)?.payout_amount;

                    const { data: admins } = await supabase
                        .from('workspace_members')
                        .select('user_id')
                        .eq('workspace_id', workspaceId)
                        .in('role', ['owner', 'admin']);

                    const adminIds = (admins || []).map((a: any) => a.user_id);
                    for (const adminId of adminIds) {
                        await supabase.from('notifications').insert({
                            user_id: adminId, workspace_id: workspaceId,
                            title: `${memberName} submitted work for review`,
                            message: `${memberName} marked "${project.name}" as complete.${memberPayout ? ` Payout: $${Number(memberPayout).toLocaleString()}` : ''}`,
                            type: 'project', is_read: false,
                            metadata: { project_id: id, member_name: memberName, status: 'REVIEW' },
                        });
                    }

                    const { data: adminUsers } = await supabase
                        .from('users').select('id, email, first_name, last_name').in('id', adminIds);
                    for (const admin of (adminUsers || [])) {
                        if (!admin.email) continue;
                        await EmailService.sendProjectReviewEmail({
                            to: admin.email,
                            adminName: [admin.first_name, admin.last_name].filter(Boolean).join(' ') || 'Admin',
                            memberName,
                            projectName: project.name,
                            projectId: id,
                        }).catch(() => {});
                    }
                } else if (newStatus === 'APPROVED' && (role === 'owner' || role === 'admin')) {
                    // Admin approved → notify assignees
                    for (const a of (assignees || [])) {
                        await supabase.from('notifications').insert({
                            user_id: a.user_id, workspace_id: workspaceId,
                            title: `${adminName} approved "${project.name}"`,
                            message: `Your work on "${project.name}" has been approved.${a.payout_amount ? ` Your payout: $${Number(a.payout_amount).toLocaleString()}` : ''}`,
                            type: 'project', is_read: false,
                            metadata: { project_id: id, admin_name: adminName, status: 'APPROVED' },
                        });
                    }
                    // Notify owners too
                    const { data: owners } = await supabase
                        .from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'owner');
                    for (const o of (owners || [])) {
                        if (assigneeIds.includes(o.user_id)) continue;
                        await supabase.from('notifications').insert({
                            user_id: o.user_id, workspace_id: workspaceId,
                            title: `${adminName} approved "${project.name}"`,
                            message: `"${project.name}" has been approved by ${adminName}.`,
                            type: 'project', is_read: false,
                            metadata: { project_id: id },
                        });
                    }
                } else if (newStatus === 'CHANGES_REQUESTED' && (role === 'owner' || role === 'admin')) {
                    // Admin requested changes → notify assignees
                    for (const a of (assignees || [])) {
                        await supabase.from('notifications').insert({
                            user_id: a.user_id, workspace_id: workspaceId,
                            title: `${adminName} requested changes on "${project.name}"`,
                            message: `${adminName} has requested changes on "${project.name}". Please review and resubmit.`,
                            type: 'project', is_read: false,
                            metadata: { project_id: id, admin_name: adminName, status: 'CHANGES_REQUESTED' },
                        });
                    }
                } else if (newStatus === 'COMPLETED' && role === 'owner') {
                    // Owner completed → notify assignees with payout info
                    for (const a of (assignees || [])) {
                        const payoutInfo = a.payout_amount ? ` Your payout: $${Number(a.payout_amount).toLocaleString()}.` : '';
                        await supabase.from('notifications').insert({
                            user_id: a.user_id, workspace_id: workspaceId,
                            title: `"${project.name}" has been completed`,
                            message: `The project "${project.name}" has been completed by ${adminName}.${payoutInfo}`,
                            type: 'project', is_read: false,
                            metadata: { project_id: id, status: 'COMPLETED' },
                        });

                        // Email assignee
                        const { data: assigneeUser } = await supabase
                            .from('users').select('email, first_name').eq('id', a.user_id).single();
                        if (assigneeUser?.email) {
                            EmailService.sendProjectCompletedEmail({
                                to: assigneeUser.email,
                                memberName: [assigneeUser.first_name].filter(Boolean).join(' ') || 'Team member',
                                projectName: project.name,
                                payoutAmount: a.payout_amount ? Number(a.payout_amount) : 0,
                            }).catch(() => {});
                        }
                    }
                }
            } catch (notifyError: any) {
                logger.warn('Notification failed', { error: notifyError.message });
            }
        }

        // Keep calendar deadline event in sync when deadline/title/status changes

        // Keep calendar deadline event in sync when deadline/title/status changes
        const { data: projectClient } = await supabase
            .from('clients')
            .select('name')
            .eq('id', project.client_id)
            .maybeSingle();
        const projectClientName = projectClient?.name || 'Client';

        if (project.deadline && project.status !== 'COMPLETED') {
            await upsertCalendarEventFromSource(
                user.id,
                `Project ending: ${project.name} (${projectClientName})`,
                project.deadline,
                'project_deadline',
                'project',
                project.id,
                `Project deadline for ${project.name} · Client: ${projectClientName}`
            );
        }

        if (project.status === 'COMPLETED') {
            await updateCalendarEventStatusBySource('project', project.id, 'completed');
        }
        if (project.status === 'CANCELLED') {
            await updateCalendarEventStatusBySource('project', project.id, 'cancelled');
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

        const normalizedStatus = String(project.status || '').toUpperCase();
        await createProjectInAppNotification({
            userId: user.id,
            projectId: project.id,
            type: normalizedStatus === 'COMPLETED' ? 'project_completed' : 'project_updated',
            title: normalizedStatus === 'COMPLETED' ? 'Project completed' : 'Project updated',
            message: normalizedStatus === 'COMPLETED'
                ? `${project.name} was marked as completed.`
                : `${project.name} details were updated.`,
        });

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
        const projectId = Array.isArray(id) ? id[0] : id;
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', projectId)
            .eq('user_id', user.id)
            .eq('workspace_id', await getEffectiveWorkspaceId(req, user.id));

        if (error) {
            throw new Error(`Failed to delete project: ${error.message}`);
        }

        // Ensure related calendar deadline events no longer show as upcoming
        await updateCalendarEventStatusBySource('project', projectId, 'cancelled');

        res.json({
            success: true,
            message: 'Project deleted successfully',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/projects/:id/assign
 * Assign a member to a project (owner/admin only)
 */
router.post('/:id/assign', authenticate, async (req: Request, res: Response, next) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const { userId, payoutAmount } = req.body;
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!userId) {
            res.status(400).json({ success: false, error: { message: 'userId is required' } });
            return;
        }

        const role = await getWorkspaceRole(req, user.id);
        if (!isOwnerOrAdmin(role)) {
            res.status(403).json({ success: false, error: { message: 'Only owners and admins can assign members' } });
            return;
        }

        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id, workspace_id')
            .eq('id', id)
            .single();

        if (projectError || !project) {
            res.status(404).json({ success: false, error: { message: 'Project not found' } });
            return;
        }

        const wsId = project.workspace_id || await getEffectiveWorkspaceId(req, user.id);

        const { error } = await supabase
            .from('workspace_project_assignments')
            .insert({
                workspace_id: wsId,
                project_id: id,
                user_id: userId,
                assigned_by: user.id,
                payout_amount: payoutAmount ? parseFloat(payoutAmount) : null,
            });

        if (error) {
            if (error.code === '23505') {
                res.status(409).json({ success: false, error: { message: 'Member is already assigned to this project' } });
                return;
            }
            throw error;
        }

        // Notify the assigned member via email
        try {
            const { data: assignedUser } = await supabase
                .from('users')
                .select('email, first_name, last_name')
                .eq('id', userId)
                .single();

            const { data: projectDetails } = await supabase
                .from('projects')
                .select('name, budget')
                .eq('id', id)
                .single();

            const { data: workspace } = await supabase
                .from('workspaces')
                .select('name')
                .eq('id', wsId)
                .single();

            if (assignedUser?.email) {
                const payout = payoutAmount ? parseFloat(payoutAmount) : 0;
                await EmailService.sendProjectAssignmentEmail({
                    to: assignedUser.email,
                    memberName: [assignedUser.first_name, assignedUser.last_name].filter(Boolean).join(' ') || 'Team member',
                    projectName: projectDetails?.name || 'a project',
                    workspaceName: workspace?.name || 'a workspace',
                    payoutAmount: payout,
                    projectId: id,
                }).catch((e: any) => logger.warn('Failed to send assignment email', { error: e.message }));
            }
        } catch (notifyError: any) {
            logger.warn('Failed to send assignment notification', { error: notifyError.message });
        }

        res.json({ success: true, message: 'Member assigned to project' });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/projects/:id/assign/:userId
 * Remove a member from a project (owner/admin only)
 */
router.delete('/:id/assign/:userId', authenticate, async (req: Request, res: Response, next) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
        const privyId = req.user!.id;

        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const role = await getWorkspaceRole(req, user.id);
        if (!isOwnerOrAdmin(role)) {
            res.status(403).json({ success: false, error: { message: 'Only owners and admins can remove assignments' } });
            return;
        }

        const { error } = await supabase
            .from('workspace_project_assignments')
            .delete()
            .eq('project_id', id)
            .eq('user_id', userId);

        if (error) throw error;

        res.json({ success: true, message: 'Member removed from project' });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/projects/:id/assignments
 * List assigned members on a project
 */
router.get('/:id/assignments', authenticate, async (req: Request, res: Response, next) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const { data, error } = await supabase
            .from('workspace_project_assignments')
            .select('user_id, assigned_by, created_at, payout_amount')
            .eq('project_id', id);

        if (error) throw error;

        res.json({ success: true, data: { assignments: data || [] } });
    } catch (error) {
        next(error);
    }
});

export default router;
