import { supabase } from '../lib/supabase';
import { EmailService } from './email';

export interface ActionParams {
    [key: string]: any;
    amount?: string;
    token?: string;
    network?: string;
    for?: string;
    recipient_email?: string;
    description?: string;
}

export interface ActionResult {
    text: string;
    data?: any;
}

/**
 * Parse natural language date strings to ISO format
 */
function parseNaturalDate(dateStr: string): string | null {
    if (!dateStr) return null;

    // Try to parse with built-in Date
    let date = new Date(dateStr);

    // If invalid, try some common patterns
    if (isNaN(date.getTime())) {
        // Remove ordinal suffixes (1st, 2nd, 3rd, 4th, etc.)
        const cleanedStr = dateStr.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
        date = new Date(cleanedStr);
    }

    // If still invalid, try different formats
    if (isNaN(date.getTime())) {
        // Try "28 November 2025" format
        const parts = dateStr.replace(/(\d+)(st|nd|rd|th)/gi, '$1').split(/\s+/);
        if (parts.length >= 3) {
            const months: Record<string, number> = {
                january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
                july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
                jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
            };
            const day = parseInt(parts[0]);
            const month = months[parts[1].toLowerCase()];
            const year = parseInt(parts[2]);
            if (!isNaN(day) && month !== undefined && !isNaN(year)) {
                date = new Date(year, month, day);
            }
        }
    }

    // Try DD/MM/YYYY or DD-MM-YYYY format
    if (isNaN(date.getTime())) {
        const slashMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (slashMatch) {
            const day = parseInt(slashMatch[1]);
            const month = parseInt(slashMatch[2]) - 1; // Months are 0-indexed
            const year = parseInt(slashMatch[3]);
            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                date = new Date(year, month, day);
            }
        }
    }

    if (isNaN(date.getTime())) {
        console.log('[parseNaturalDate] Could not parse date:', dateStr);
        return null;
    }

    return date.toISOString();
}

/**
 * Handle user actions based on intent
 */
export async function handleAction(intent: string, params: ActionParams, user: any): Promise<ActionResult> {
    console.log(`[Actions] Handling intent: ${intent}`, params);

    try {
        switch (intent.toUpperCase()) {
            case 'CREATE_PAYMENT_LINK':
                return await handleCreatePaymentLink(params, user);

            case 'CREATE_INVOICE':
                return await handleCreateInvoice(params, user);

            case 'COLLECT_INVOICE_INFO':
                // Don't create invoice yet, Gemini will handle the conversation
                return { text: '' };

            case 'COLLECT_PAYMENT_INFO':
                // Don't create payment link yet, Gemini will ask for amount
                return { text: '' };

            case 'COLLECT_NETWORK_INFO':
                // Don't create payment link yet, Gemini will ask for network
                return { text: '' };

            case 'COLLECT_CONTRACT_INFO':
                // Don't create contract yet, Gemini will collect all fields
                return { text: '' };

            case 'COLLECT_PROPOSAL_INFO':
                // Don't create proposal yet, Gemini will collect all fields
                return { text: '' };

            case 'COLLECT_TRANSACTION_INFO':
                // Don't execute transaction yet, Gemini will collect all fields
                return { text: '' };

            case 'CONFIRM_TRANSACTION':
                // Return transaction data for frontend to show confirmation modal
                return {
                    text: '',
                    data: {
                        requiresConfirmation: true,
                        transaction: {
                            amount: params.amount,
                            token: params.token || 'USDC',
                            recipient: params.recipient,
                            network: params.network || 'base'
                        }
                    }
                };

            case 'CONFIRM_OFFRAMP':
                // Return offramp data for frontend to show confirmation modal
                return {
                    text: '',
                    data: {
                        requiresOfframpConfirmation: true,
                        offramp: {
                            amount: params.amount,
                            token: params.token || 'USDC',
                            network: params.network || 'base',
                            fiatCurrency: params.fiatCurrency || 'NGN',
                            bankName: params.bankName,
                            accountNumber: params.accountNumber,
                            accountName: params.accountName
                        }
                    }
                };

            case 'CONFIRM_SOLANA_BRIDGE':
                // Return bridge data for Solana -> Base bridge + offramp flow
                return {
                    text: '',
                    data: {
                        requiresSolanaBridge: true,
                        bridge: {
                            amount: parseFloat(params.amount || '0'),
                            token: params.token || 'SOL',
                            sourceNetwork: 'solana',
                            destinationNetwork: 'base',
                        },
                        offramp: {
                            fiatCurrency: params.fiatCurrency || 'NGN',
                            bankName: params.bankName,
                            accountNumber: params.accountNumber,
                            accountName: params.accountName
                        }
                    }
                };

            case 'COLLECT_OFFRAMP_INFO':
                // Don't execute offramp yet, Gemini will collect all fields
                return { text: '' };

            case 'CREATE_PROPOSAL':
                return await handleCreateProposal(params, user);

            case 'CREATE_CONTRACT':
                return await handleCreateContract(params, user);

            case 'COLLECT_CONTRACT_INFO':
                // Don't create contract yet, Gemini will ask for missing info
                return { text: '' };

            // Project and Milestone intents
            case 'CREATE_PROJECT':
                return await handleCreateProject(params, user);

            case 'UPDATE_CLIENT':
                return await handleUpdateClient(params, user);

            case 'COLLECT_PROJECT_INFO':
                // Don't create project yet, Gemini will ask for missing info
                return { text: '' };

            case 'ADD_MILESTONE':
                return await handleAddMilestone(params, user);

            case 'COLLECT_MILESTONE_INFO':
                // Check if we have all required fields - if so, add the milestone directly
                if (params.project_name && (params.title || params.milestone_name) && params.amount) {
                    console.log('[Actions] COLLECT_MILESTONE_INFO has all required fields, creating milestone directly');
                    return await handleAddMilestone(params, user);
                }
                // Don't add milestone yet, Gemini will collect all fields
                return { text: '' };

            case 'UPDATE_MILESTONE':
                return await handleUpdateMilestone(params, user);

            case 'COMPLETE_MILESTONE':
                return await handleCompleteMilestone(params, user);

            case 'INVOICE_MILESTONE':
                return await handleInvoiceMilestone(params, user);

            case 'MARK_MILESTONE_PAID':
                return await handleMarkMilestonePaid(params, user);

            case 'LIST_PROJECTS':
                return await handleListProjects(params, user);

            case 'PROJECT_DETAILS':
                return await handleProjectDetails(params, user);

            case 'GENERAL_CHAT':
                return { text: '' };

            default:
                console.log(`[Actions] Unknown intent: ${intent}`);
                return { text: '' };
        }
    } catch (error) {
        console.error(`[Actions] Error handling intent ${intent}:`, error);
        return {
            text: "I encountered an error while processing your request. Please try again."
        };
    }
}

async function handleCreatePaymentLink(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        const amount = parseFloat(params.amount || '0');
        const token = params.token || 'USDC';
        const network = params.network?.toLowerCase() || 'base';
        console.log(`[Actions] Creating payment link on ${network}`);
        const description = params.for || params.description || 'Payment';

        // Map network to chain enum
        let chain = 'BASE';
        if (network.includes('solana')) chain = 'SOLANA';
        if (network.includes('arbitrum')) chain = 'ARBITRUM'; // Note: ARBITRUM not in enum yet, defaulting to BASE or need to add it
        if (network.includes('optimism')) chain = 'OPTIMISM'; // Note: OPTIMISM not in enum yet

        // Get internal user ID and details
        const { data: userData } = await supabase
            .from('users')
            .select('id, first_name, last_name')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        // Create payment link record
        const { data: doc, error } = await supabase
            .from('documents')
            .insert({
                user_id: userData.id,
                type: 'PAYMENT_LINK',
                title: description,
                amount: amount,
                currency: token,
                chain: chain,
                status: 'DRAFT',
                payment_link_url: `https://hedwig.app/pay/${Date.now()}` // Simulated URL
            })
            .select()
            .single();

        if (error) throw error;
        console.log('[Actions] Created document:', doc);

        // Send email if recipient provided
        let emailSent = false;
        const recipientEmail = params.recipient_email || params.client_email;
        if (recipientEmail) {
            const senderName = userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : 'A Hedwig User';
            emailSent = await EmailService.sendPaymentLinkEmail({
                to: recipientEmail,
                senderName,
                amount: amount.toString(),
                currency: token,
                description,
                linkId: doc.id,
                network: chain
            });
        }

        return {
            text: `Done! I've created a payment link for ${amount} ${token}${description && description !== 'Payment' ? ` for ${description}` : ''}. Here's the link: /payment-link/${doc.id}\n\nYou can share this with your client to collect payment.${emailSent ? `\n\n✅ I also sent the link to ${recipientEmail}.` : ''}\n\n💡 Note: A 1% platform fee will be deducted when payment is received.`,
            data: { documentId: doc.id, type: 'PAYMENT_LINK' }
        };
    } catch (error) {
        console.error('[Actions] Error creating payment link:', error);
        return { text: "Failed to create payment link. Please try again." };
    }
}

async function handleCreateInvoice(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        console.log('[Actions] Creating invoice with params:', params);

        // Extract required fields
        const clientName = params.client_name || 'Client';
        const clientEmail = params.client_email || params.recipient_email;

        // Handle items (either array or single description/amount)
        let items: Array<{ description: string, amount: number, quantity: number }> = [];

        const network = params.network?.toLowerCase() || 'base';
        let chain = 'BASE';
        if (network.includes('solana')) chain = 'SOLANA';
        if (network.includes('arbitrum')) chain = 'ARBITRUM';
        if (network.includes('optimism')) chain = 'OPTIMISM';

        if (params.items && Array.isArray(params.items)) {
            // Multi-item invoice
            items = params.items.map((item: any) => ({
                description: item.description || 'Service',
                amount: parseFloat(item.amount || '0'),
                quantity: item.quantity || 1
            }));
        } else {
            // Single item invoice (legacy)
            const description = params.description || params.for || 'Services';
            const amount = parseFloat(params.amount || '0');
            items = [{ description, amount, quantity: 1 }];
        }

        // Calculate total
        const totalAmount = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id, first_name, last_name')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        // Create invoice record
        const { data: doc, error } = await supabase
            .from('documents')
            .insert({
                user_id: userData.id,
                type: 'INVOICE',
                title: `Invoice for ${clientName}`,
                amount: totalAmount,
                description: items.map(i => i.description).join(', '),
                status: 'DRAFT',
                chain: chain,
                content: {
                    client_name: clientName,
                    recipient_email: clientEmail,
                    items: items
                }
            })
            .select()
            .single();

        if (error) throw error;
        console.log('[Actions] Created invoice:', doc);

        // Send email if recipient provided
        let emailSent = false;
        if (clientEmail) {
            const senderName = userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : 'A Hedwig User';
            emailSent = await EmailService.sendInvoiceEmail({
                to: clientEmail,
                senderName,
                amount: totalAmount.toString(),
                currency: 'USD', // Invoices currently default to USD in main flow logic, though chain is stored
                description: items.length === 1 ? items[0].description : `${items.length} items`,
                linkId: doc.id
            });
        }

        // Generate response with item breakdown
        const itemsList = items.map(item => `  • ${item.description}${item.quantity > 1 ? ` (x${item.quantity})` : ''}: $${item.amount * item.quantity}`).join('\n');
        const itemsText = items.length > 1
            ? `\n\nItems:\n${itemsList}\n\nTotal: $${totalAmount}`
            : `\n\n📄 ${items[0].description}: $${totalAmount}`;

        return {
            text: `Perfect! I've created an invoice for ${clientName}.${itemsText}\n\nView invoice: /invoice/${doc.id}\n\nYou can send this to ${clientEmail || clientName} to request payment.${emailSent ? `\n\n✅ I also sent the invoice to ${clientEmail}.` : ''}\n\n💡 Note: A 1% platform fee will be deducted when payment is received.`,
            data: { documentId: doc.id, type: 'INVOICE' }
        };
    } catch (error) {
        console.error('[Actions] Error creating invoice:', error);
        return { text: "Failed to create invoice. Please try again." };
    }
}

async function handleCreateProposal(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        const title = params.title || params.for || 'Project Proposal';
        const clientName = params.client_name || 'Client';
        const clientEmail = params.client_email || '';
        const problemStatement = params.problem_statement || params.problem || `Providing professional services for ${title}.`;
        const proposedSolution = params.proposed_solution || params.solution || `I will deliver high-quality work for this project, including all agreed-upon deliverables.`;
        const deliverables = params.deliverables || [];
        const timeline = params.timeline || 'To be discussed based on project requirements.';
        const milestones = params.milestones || [];
        const pricingBreakdown = params.pricing_breakdown || params.pricing || [];
        const totalCost = params.total_cost || params.total || 'To be discussed based on scope.';
        const paymentTerms = params.payment_terms || '';

        // Get user data for freelancer info
        const { data: userData } = await supabase
            .from('users')
            .select('id, email, first_name, last_name')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        const freelancerName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'Freelancer';

        // Import template
        const { generateProposalTemplate } = await import('../templates/proposal');

        // Generate proposal content
        const proposalContent = generateProposalTemplate({
            client_name: clientName,
            client_email: clientEmail,
            title,
            problem_statement: problemStatement,
            proposed_solution: proposedSolution,
            deliverables: Array.isArray(deliverables) ? deliverables : [deliverables].filter(Boolean),
            timeline,
            milestones: Array.isArray(milestones) ? milestones : [],
            pricing_breakdown: Array.isArray(pricingBreakdown) ? pricingBreakdown : [],
            total_cost: totalCost,
            payment_terms: paymentTerms,
            about_freelancer: `Professional freelancer with expertise in ${title}.`,
            freelancer_name: freelancerName,
            freelancer_email: userData.email
        });

        // Create proposal record
        const { data: doc, error } = await supabase
            .from('documents')
            .insert({
                user_id: userData.id,
                type: 'PROPOSAL',
                title,
                status: 'DRAFT',
                content: {
                    client_name: clientName,
                    client_email: clientEmail,
                    problem_statement: problemStatement,
                    proposed_solution: proposedSolution,
                    deliverables,
                    timeline,
                    milestones,
                    pricing_breakdown: pricingBreakdown,
                    total_cost: totalCost,
                    payment_terms: paymentTerms,
                    generated_content: proposalContent
                }
            })
            .select()
            .single();

        if (error) throw error;
        console.log('[Actions] Created proposal:', doc);

        const proposalUrl = `${process.env.API_URL || 'http://localhost:3000'}/proposal/${doc.id}`;

        return {
            text: `📋 **Proposal Created Successfully**\n\n` +
                `Title: ${title}\n` +
                `Client: ${clientName}\n` +
                `Total: ${totalCost}\n\n` +
                `I've generated a complete proposal for you!\n\n` +
                `[View & Download Proposal](${proposalUrl})`
        };
    } catch (error) {
        console.error('[Actions] Error creating proposal:', error);
        return { text: "Failed to create proposal. Please try again." };
    }
}

async function handleCreateContract(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        const title = params.title || params.for || 'Service Agreement';
        const clientName = params.client_name;
        const clientEmail = params.client_email;
        const clientAddress = params.client_address;
        const scopeOfWork = params.scope_of_work || params.scope;
        const deliverables = params.deliverables || [];
        const milestones = params.milestones || [];
        const paymentAmount = params.payment_amount || params.amount;
        const paymentTerms = params.payment_terms;
        const projectName = params.project_name;

        console.log('[Contract] Payment fields:', {
            payment_amount: params.payment_amount,
            amount: params.amount,
            payment_terms: params.payment_terms,
            finalAmount: paymentAmount,
            finalTerms: paymentTerms
        });

        const startDate = params.start_date;
        const endDate = params.end_date;
        const revisions = params.revisions;
        const terminationClause = params.termination_clause;
        const confidentiality = params.confidentiality;
        const governingLaw = params.governing_law;

        // Get user data for freelancer info
        const { data: userData } = await supabase
            .from('users')
            .select('id, email, first_name, last_name')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        const freelancerName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'Freelancer';

        // ============== AUTO-CREATE CLIENT IF NOT EXISTS ==============
        let clientId: string | null = null;
        if (clientEmail) {
            // Check if client exists by email
            const { data: existingClient } = await supabase
                .from('clients')
                .select('id, name')
                .eq('user_id', userData.id)
                .eq('email', clientEmail)
                .single();

            if (existingClient) {
                clientId = existingClient.id;
                console.log('[Contract] Found existing client:', existingClient.id, existingClient.name);
            } else {
                // Create new client
                const { data: newClient, error: clientError } = await supabase
                    .from('clients')
                    .insert({
                        user_id: userData.id,
                        name: clientName || 'Unknown Client',
                        email: clientEmail,
                    })
                    .select('id')
                    .single();

                if (!clientError && newClient) {
                    clientId = newClient.id;
                    console.log('[Contract] Created new client:', newClient.id);
                }
            }
        }

        // ============== LINK TO PROJECT IF SPECIFIED ==============
        let projectId: string | null = null;
        if (projectName) {
            // Search for project by name (case-insensitive partial match)
            const { data: projects } = await supabase
                .from('projects')
                .select('id, name')
                .eq('user_id', userData.id)
                .ilike('name', `%${projectName}%`);

            if (projects && projects.length > 0) {
                projectId = projects[0].id;
                console.log('[Contract] Linked to project:', projects[0].name);
            }
        }

        // Import template
        const { generateContractTemplate } = await import('../templates/contract');

        // Generate contract content
        const contractContent = generateContractTemplate({
            client_name: clientName,
            client_email: clientEmail,
            client_address: clientAddress,
            title,
            scope_of_work: scopeOfWork,
            deliverables: Array.isArray(deliverables) ? deliverables : [deliverables].filter(Boolean),
            milestones: Array.isArray(milestones) ? milestones : [],
            payment_amount: paymentAmount,
            payment_terms: paymentTerms,
            start_date: startDate,
            end_date: endDate,
            revisions,
            termination_clause: terminationClause,
            confidentiality,
            governing_law: governingLaw,
            freelancer_name: freelancerName,
            freelancer_email: userData.email
        });

        // Create contract record with client_id and project_id
        const { data: doc, error } = await supabase
            .from('documents')
            .insert({
                user_id: userData.id,
                client_id: clientId,
                project_id: projectId,
                type: 'CONTRACT',
                title,
                status: 'DRAFT',
                amount: paymentAmount ? parseFloat(paymentAmount) : null,
                content: {
                    client_name: clientName,
                    client_email: clientEmail,
                    client_address: clientAddress,
                    scope_of_work: scopeOfWork,
                    deliverables,
                    milestones,
                    payment_amount: paymentAmount,
                    payment_terms: paymentTerms,
                    start_date: startDate,
                    end_date: endDate,
                    revisions,
                    termination_clause: terminationClause,
                    confidentiality,
                    governing_law: governingLaw,
                    generated_content: contractContent
                }
            })
            .select()
            .single();

        if (error) throw error;
        console.log('[Actions] Created contract:', doc);

        const contractUrl = `${process.env.API_URL || 'http://localhost:3000'}/contract/${doc.id}`;

        let responseText = `🤝 **Contract Created Successfully**\n\n` +
            `Title: ${title}\n` +
            `Client: ${clientName}`;
        
        if (clientId && !params.client_existed) {
            responseText += ` ✅ (New client saved)`;
        }
        
        responseText += `\nPayment: ${paymentAmount ? `$${paymentAmount}` : 'Not specified'}\n`;
        
        if (projectId) {
            responseText += `📁 Linked to project: ${projectName}\n`;
        }
        
        responseText += `Milestones: ${milestones.length}\n\n` +
            `I've generated a complete contract for you!\n\n` +
            `[View & Download Contract](${contractUrl})`;

        return { text: responseText };
    } catch (error) {
        console.error('[Actions] Error creating contract:', error);
        return { text: "Failed to create contract. Please try again." };
    }
}


// ============== PROJECT HANDLERS ==============

async function handleCreateProject(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        const clientName = params.client_name;
        const clientEmail = params.client_email;
        const title = params.title || params.project_name;
        const description = params.description || '';
        const startDate = params.start_date;
        const deadline = params.deadline;

        console.log('[Actions] Handling intent: CREATE_PROJECT', { client_name: clientName, client_email: clientEmail, title });

        // Validate required fields - if title is missing, ask for it
        if (!title) {
            return {
                text: `I can help create a project for ${clientName || 'your client'}! What would you like to name this project?`
            };
        }

        if (!clientName) {
            return {
                text: `What client is this project "${title}" for?`
            };
        }

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        // Find client by name (exact match, case-insensitive)
        let { data: clients } = await supabase
            .from('clients')
            .select('id, name, email')
            .eq('user_id', userData.id)
            .ilike('name', clientName)
            .limit(1);

        let client;
        let clientCreated = false;

        if (!clients || clients.length === 0) {
            // Auto-create the client with email if provided
            const { data: newClient, error: clientError } = await supabase
                .from('clients')
                .insert({
                    user_id: userData.id,
                    name: clientName,
                    email: clientEmail || null,
                })
                .select()
                .single();

            if (clientError) {
                console.error('[Actions] Error creating client:', clientError);
                return { text: `I couldn't create a client named "${clientName}". Please try again.` };
            }
            client = newClient;
            clientCreated = true;
        } else {
            client = clients[0];
            // If client exists but has no email, and one was provided, update it
            if (!client.email && clientEmail) {
                await supabase
                    .from('clients')
                    .update({ email: clientEmail })
                    .eq('id', client.id);
                client.email = clientEmail;
            }
        }

        // Create the project
        const { data: project, error } = await supabase
            .from('projects')
            .insert({
                client_id: client.id,
                user_id: userData.id,
                name: title,
                description,
                start_date: startDate || new Date().toISOString(),
                deadline: deadline,
                end_date: deadline,
                status: 'ONGOING',
                currency: 'USD',
            })
            .select()
            .single();

        if (error) throw error;

        let responseText = `📁 **Project Created!**\n\n` +
            `**${title}** for ${client.name}\n`;

        if (clientCreated) {
            responseText += `✨ I also created a new client "${client.name}" for you.\n`;
            if (!client.email) {
                responseText += `\n📧 **Tip:** Add ${client.name}'s email so I can automatically send them invoices. Just say "Set ${client.name}'s email to [email address]"\n`;
            }
        }

        if (deadline) {
            responseText += `📅 Deadline: ${new Date(deadline).toLocaleDateString()}\n`;
        }

        responseText += `\nWould you like to add milestones to this project?`;

        return {
            text: responseText,
            data: { projectId: project.id, clientId: client.id, type: 'PROJECT' }
        };
    } catch (error) {
        console.error('[Actions] Error creating project:', error);
        return { text: "Failed to create project. Please try again." };
    }
}

async function handleUpdateClient(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        const clientName = params.client_name;
        const newEmail = params.email || params.client_email;
        const newPhone = params.phone;

        console.log('[Actions] Handling intent: UPDATE_CLIENT', { client_name: clientName, email: newEmail });

        if (!clientName) {
            return { text: "Which client would you like to update?" };
        }

        if (!newEmail && !newPhone) {
            return { text: `What would you like to update for ${clientName}? You can set their email or phone.` };
        }

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        // Find client by name
        const { data: clients } = await supabase
            .from('clients')
            .select('id, name, email')
            .eq('user_id', userData.id)
            .ilike('name', `%${clientName}%`)
            .limit(1);

        if (!clients || clients.length === 0) {
            return { text: `I couldn't find a client named "${clientName}".` };
        }

        const client = clients[0];

        // Build update data
        const updateData: any = {};
        if (newEmail) updateData.email = newEmail;
        if (newPhone) updateData.phone = newPhone;

        const { error } = await supabase
            .from('clients')
            .update(updateData)
            .eq('id', client.id);

        if (error) throw error;

        const updates: string[] = [];
        if (newEmail) updates.push(`📧 Email: ${newEmail}`);
        if (newPhone) updates.push(`📱 Phone: ${newPhone}`);

        return {
            text: `✅ **Client Updated!**\n\n` +
                `**${client.name}**\n` +
                updates.join('\n') + `\n\n` +
                `Now when you invoice this client, they'll receive the invoice via email!`
        };
    } catch (error) {
        console.error('[Actions] Error updating client:', error);
        return { text: "Failed to update client. Please try again." };
    }
}

async function handleAddMilestone(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        const projectName = params.project_name;
        const title = params.title || params.milestone_name;
        const amount = parseFloat(params.amount || '0');
        const rawDueDate = params.due_date;
        const dueDate = rawDueDate ? parseNaturalDate(rawDueDate) : null;

        console.log('[Actions] handleAddMilestone dueDate parsing:', { raw: rawDueDate, parsed: dueDate });

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        // Find project by name
        const { data: projects } = await supabase
            .from('projects')
            .select('id, name')
            .eq('user_id', userData.id)
            .ilike('name', `%${projectName}%`)
            .limit(1);

        if (!projects || projects.length === 0) {
            return {
                text: `I couldn't find a project named "${projectName}". Please check the project name or create a new project first.`
            };
        }

        const project = projects[0];

        // Create the milestone
        const { data: milestone, error } = await supabase
            .from('milestones')
            .insert({
                project_id: project.id,
                title,
                amount,
                due_date: dueDate,
                status: 'pending',
            })
            .select()
            .single();

        if (error) throw error;

        return {
            text: `✅ **Milestone Added!**\n\n` +
                `**${title}** - $${amount}\n` +
                `Project: ${project.name}\n` +
                (dueDate ? `📅 Due: ${new Date(dueDate).toLocaleDateString()}\n` : '📅 No deadline set\n'),
            data: { milestoneId: milestone.id, projectId: project.id, type: 'MILESTONE' }
        };
    } catch (error) {
        console.error('[Actions] Error adding milestone:', error);
        return { text: "Failed to add milestone. Please try again." };
    }
}

async function handleUpdateMilestone(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        const milestoneTitle = params.milestone_title;
        const projectName = params.project_name;
        const newDueDate = params.new_due_date;
        const newAmount = params.new_amount ? parseFloat(params.new_amount) : undefined;

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        // Find project first (if provided)
        let projectId: string | undefined;
        if (projectName) {
            const { data: projects } = await supabase
                .from('projects')
                .select('id')
                .eq('user_id', userData.id)
                .ilike('name', `%${projectName}%`)
                .limit(1);
            if (projects && projects.length > 0) {
                projectId = projects[0].id;
            }
        }

        // Find milestone by title
        let query = supabase
            .from('milestones')
            .select('*, project:projects(id, name, user_id)')
            .ilike('title', `%${milestoneTitle}%`);

        if (projectId) {
            query = query.eq('project_id', projectId);
        }

        const { data: milestones } = await query.limit(1);

        if (!milestones || milestones.length === 0) {
            return { text: `I couldn't find a milestone named "${milestoneTitle}".` };
        }

        const milestone = milestones[0];
        if ((milestone.project as any)?.user_id !== userData.id) {
            return { text: "You don't have access to this milestone." };
        }

        // Build update data
        const updateData: any = {};
        let parsedDueDate: string | null = null;
        if (newDueDate) {
            parsedDueDate = parseNaturalDate(newDueDate);
            if (parsedDueDate) {
                updateData.due_date = parsedDueDate;
            } else {
                return { text: `I couldn't understand the date "${newDueDate}". Please try a format like "January 15, 2025" or "2025-01-15".` };
            }
        }
        if (newAmount !== undefined) updateData.amount = newAmount;

        const { error } = await supabase
            .from('milestones')
            .update(updateData)
            .eq('id', milestone.id);

        if (error) throw error;

        const changes: string[] = [];
        if (parsedDueDate) changes.push(`📅 Due date → ${new Date(parsedDueDate).toLocaleDateString()}`);
        if (newAmount !== undefined) changes.push(`💰 Amount → $${newAmount}`);

        return {
            text: `✅ **Milestone Updated!**\n\n` +
                `**${milestone.title}** (${(milestone.project as any)?.name})\n\n` +
                `Changes:\n${changes.join('\n')}`
        };
    } catch (error) {
        console.error('[Actions] Error updating milestone:', error);
        return { text: "Failed to update milestone. Please try again." };
    }
}

async function handleCompleteMilestone(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        const milestoneTitle = params.milestone_title;

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        // First get user's projects
        const { data: userProjects } = await supabase
            .from('projects')
            .select('id')
            .eq('user_id', userData.id);

        if (!userProjects || userProjects.length === 0) {
            return { text: "You don't have any projects yet. Create a project first!" };
        }

        const projectIds = userProjects.map(p => p.id);

        // Find milestone by title within user's projects
        const { data: milestones, error: milestoneError } = await supabase
            .from('milestones')
            .select('*, project:projects(id, name, user_id)')
            .in('project_id', projectIds)
            .ilike('title', `%${milestoneTitle}%`)
            .limit(1);

        console.log('[Actions] Milestone search:', { milestoneTitle, projectIds, found: milestones?.length, error: milestoneError });

        if (milestoneError) {
            console.error('[Actions] Milestone query error:', milestoneError);
        }

        if (!milestones || milestones.length === 0) {
            // List available milestones to help user
            const { data: allMilestones } = await supabase
                .from('milestones')
                .select('title, project:projects(name)')
                .in('project_id', projectIds)
                .limit(5);

            const available = allMilestones?.map((m: any) => `"${m.title}" (${m.project?.name})`).join(', ') || 'none';
            return { text: `I couldn't find a milestone named "${milestoneTitle}". Available milestones: ${available}` };
        }

        const milestone = milestones[0];

        return {
            text: `✅ **Milestone "${milestone.title}" is ready for invoicing!**\n\n` +
                `Amount: $${milestone.amount}\n` +
                `Project: ${(milestone.project as any)?.name}\n\n` +
                `Would you like me to generate an invoice for this milestone?`
        };
    } catch (error) {
        console.error('[Actions] Error completing milestone:', error);
        return { text: "Failed to complete milestone. Please try again." };
    }
}

async function handleMarkMilestonePaid(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        const milestoneTitle = params.milestone_title;

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        // First get user's projects
        const { data: userProjects } = await supabase
            .from('projects')
            .select('id')
            .eq('user_id', userData.id);

        if (!userProjects || userProjects.length === 0) {
            return { text: "You don't have any projects yet." };
        }

        const projectIds = userProjects.map(p => p.id);

        // Find milestone by title within user's projects
        const { data: milestones } = await supabase
            .from('milestones')
            .select('*, project:projects(id, name)')
            .in('project_id', projectIds)
            .ilike('title', `%${milestoneTitle}%`)
            .limit(1);

        if (!milestones || milestones.length === 0) {
            return { text: `I couldn't find a milestone named "${milestoneTitle}".` };
        }

        const milestone = milestones[0];

        if (milestone.status === 'paid') {
            return { text: `The milestone "${milestone.title}" is already marked as paid.` };
        }

        // Update milestone status to paid
        const { error: updateError } = await supabase
            .from('milestones')
            .update({ status: 'paid' })
            .eq('id', milestone.id);

        if (updateError) throw updateError;

        return {
            text: `✅ **Milestone Marked as Paid!**\n\n` +
                `**${milestone.title}** - $${milestone.amount}\n` +
                `Project: ${(milestone.project as any)?.name}\n\n` +
                `The project progress has been updated.`,
            data: { milestoneId: milestone.id, type: 'MILESTONE_PAID' }
        };
    } catch (error) {
        console.error('[Actions] Error marking milestone as paid:', error);
        return { text: "Failed to mark milestone as paid. Please try again." };
    }
}

async function handleInvoiceMilestone(params: ActionParams, user: any): Promise<ActionResult> {
    console.log('[Actions] ========== INVOICE MILESTONE HANDLER CALLED ==========');
    console.log('[Actions] Params:', JSON.stringify(params));
    try {
        const milestoneTitle = params.milestone_title;
        const network = params.network?.toLowerCase() || 'base';
        const token = params.token || 'USDC';

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id, first_name, last_name')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        // First get user's projects
        const { data: userProjects } = await supabase
            .from('projects')
            .select('id')
            .eq('user_id', userData.id);

        if (!userProjects || userProjects.length === 0) {
            return { text: "You don't have any projects yet." };
        }

        const projectIds = userProjects.map(p => p.id);

        // Find milestone with project and client info
        const { data: milestones } = await supabase
            .from('milestones')
            .select(`
                *,
                project:projects(
                    id, name, user_id, currency,
                    client:clients(id, name, email, company)
                )
            `)
            .in('project_id', projectIds)
            .ilike('title', `%${milestoneTitle}%`)
            .limit(1);

        if (!milestones || milestones.length === 0) {
            return { text: `I couldn't find a milestone named "${milestoneTitle}".` };
        }

        const milestone = milestones[0];
        const project = milestone.project as any;

        if (milestone.status !== 'pending') {
            return { text: `This milestone has already been invoiced (Status: ${milestone.status}).` };
        }

        const client = project?.client;
        if (!client) {
            return { text: "This project doesn't have a client associated with it." };
        }

        console.log('[Actions] Invoice client info:', { clientId: client.id, clientName: client.name, clientEmail: client.email });

        // Map network to chain enum
        let chain = 'BASE';
        if (network.includes('solana')) chain = 'SOLANA';

        // Create the invoice
        const invoiceTitle = `${milestone.title} - ${project.name}`;

        const { data: invoice, error: invoiceError } = await supabase
            .from('documents')
            .insert({
                user_id: userData.id,
                client_id: client.id,
                project_id: project.id,
                type: 'INVOICE',
                title: invoiceTitle,
                description: `Milestone: ${milestone.title}`,
                amount: milestone.amount,
                currency: project.currency || 'USD',
                chain: chain,
                status: 'DRAFT',
                content: {
                    client_name: client.name,
                    client_email: client.email,
                    items: [
                        {
                            description: milestone.title,
                            quantity: 1,
                            rate: parseFloat(milestone.amount),
                            amount: parseFloat(milestone.amount),
                        }
                    ],
                    network: network,
                    token: token,
                    milestone_id: milestone.id,
                    project_name: project.name,
                },
            })
            .select()
            .single();

        if (invoiceError) throw invoiceError;

        // Update milestone with invoice reference and status
        await supabase
            .from('milestones')
            .update({
                invoice_id: invoice.id,
                status: 'invoiced',
            })
            .eq('id', milestone.id);

        // Send invoice email to client if they have an email
        let emailSent = false;
        console.log('[Actions] Checking if client has email for invoice notification...');
        if (client.email) {
            console.log('[Actions] Client has email, attempting to send invoice email to:', client.email);
            const senderName = userData.first_name && userData.last_name
                ? `${userData.first_name} ${userData.last_name}`
                : 'Freelancer';

            try {
                emailSent = await EmailService.sendInvoiceEmail({
                    to: client.email,
                    senderName: senderName,
                    amount: milestone.amount.toString(),
                    currency: project.currency || 'USD',
                    description: `${milestone.title} - ${project.name}`,
                    linkId: invoice.id,
                    network: chain,
                });
                console.log('[Actions] Email send result:', emailSent);
            } catch (emailError) {
                console.error('[Actions] Failed to send invoice email:', emailError);
            }
        } else {
            console.log('[Actions] Client has no email, skipping invoice email notification');
        }

        let responseText = `🧾 **Invoice Created for Milestone!**\n\n` +
            `**${milestone.title}** - $${milestone.amount}\n` +
            `Client: ${client.name}\n` +
            `Network: ${chain}\n\n`;

        if (emailSent) {
            responseText += `📧 Invoice email sent to ${client.email}\n\n`;
        } else if (!client.email) {
            responseText += `⚠️ No email on file for ${client.name}. Add their email to send invoices automatically.\n\n`;
        }

        responseText += `View invoice: /invoice/${invoice.id}\n\n` +
            `The milestone is now marked as "invoiced".`;

        return {
            text: responseText,
            data: { invoiceId: invoice.id, milestoneId: milestone.id, type: 'INVOICE' }
        };
    } catch (error) {
        console.error('[Actions] Error invoicing milestone:', error);
        return { text: "Failed to create invoice for milestone. Please try again." };
    }
}

async function handleListProjects(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        const status = params.status;

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        // Build query
        let query = supabase
            .from('projects')
            .select(`
                id, name, status, deadline,
                client:clients(name),
                milestones(id, status)
            `)
            .eq('user_id', userData.id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (status) {
            query = query.eq('status', status.toUpperCase());
        }

        const { data: projects, error } = await query;

        if (error) throw error;

        if (!projects || projects.length === 0) {
            return { text: "You don't have any projects yet. Would you like to create one?" };
        }

        const projectList = projects.map((p: any) => {
            const milestones = p.milestones || [];
            const total = milestones.length;
            const completed = milestones.filter((m: any) => m.status === 'paid').length;
            const progress = total > 0 ? `${completed}/${total}` : 'No milestones';

            return `📁 **${p.name}** (${p.client?.name || 'No client'})\n` +
                `   Status: ${p.status?.toLowerCase() || 'ongoing'} | Milestones: ${progress}` +
                (p.deadline ? ` | 📅 ${new Date(p.deadline).toLocaleDateString()}` : '');
        }).join('\n\n');

        return {
            text: `📋 **Your Projects:**\n\n${projectList}\n\n` +
                `Say "show [project name]" to see details and milestones.`
        };
    } catch (error) {
        console.error('[Actions] Error listing projects:', error);
        return { text: "Failed to fetch projects. Please try again." };
    }
}

async function handleProjectDetails(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        const projectName = params.project_name;

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', user.privyId)
            .single();

        if (!userData) throw new Error('User not found');

        // Find project by name
        const { data: projects } = await supabase
            .from('projects')
            .select(`
                id, name, description, status, deadline, budget, currency,
                client:clients(name, email, company),
                milestones(id, title, amount, due_date, status, invoice_id)
            `)
            .eq('user_id', userData.id)
            .ilike('name', `%${projectName}%`)
            .limit(1);

        if (!projects || projects.length === 0) {
            return { text: `I couldn't find a project named "${projectName}".` };
        }

        const project = projects[0] as any;
        const milestones = project.milestones || [];
        const totalAmount = milestones.reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);
        const paidAmount = milestones
            .filter((m: any) => m.status === 'paid')
            .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0);

        let milestonesText = 'No milestones yet.';
        if (milestones.length > 0) {
            milestonesText = milestones.map((m: any) => {
                const statusEmoji = m.status === 'paid' ? '✅' : m.status === 'invoiced' ? '📤' : '⏳';
                return `${statusEmoji} **${m.title}** - $${m.amount} (${m.status})` +
                    (m.due_date ? ` | Due: ${new Date(m.due_date).toLocaleDateString()}` : '');
            }).join('\n');
        }

        return {
            text: `📁 **${project.name}**\n\n` +
                `👤 Client: ${project.client?.name || 'No client'}\n` +
                `📊 Status: ${project.status?.toLowerCase() || 'ongoing'}\n` +
                (project.deadline ? `📅 Deadline: ${new Date(project.deadline).toLocaleDateString()}\n` : '') +
                (project.description ? `📝 ${project.description}\n` : '') +
                `\n💰 **Progress:** $${paidAmount} / $${totalAmount}\n\n` +
                `**Milestones:**\n${milestonesText}\n\n` +
                `_Say "add milestone" or "invoice [milestone name]" to take action._`
        };
    } catch (error) {
        console.error('[Actions] Error getting project details:', error);
        return { text: "Failed to fetch project details. Please try again." };
    }
}
