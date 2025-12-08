import { supabase } from '../lib/supabase';

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

            case 'CREATE_PROPOSAL':
                return await handleCreateProposal(params, user);

            case 'CREATE_CONTRACT':
                return await handleCreateContract(params, user);

            case 'GET_WALLET_BALANCE':
                return await handleGetWalletBalance(params, user);

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

async function handleGetWalletBalance(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        // Get user's wallet addresses from database
        const { data: userData, error } = await supabase
            .from('users')
            .select('base_wallet_address, celo_wallet_address, solana_wallet_address')
            .eq('privy_id', user.privyId)
            .single();

        if (error || !userData) {
            return { text: "I couldn't find your wallet information. Please make sure you are logged in." };
        }

        const network = params.network?.toLowerCase();
        let responseText = "Here are your wallet details:\n\n";

        if (network === 'base' || !network) {
            responseText += `🔵 **Base**: \`${userData.base_wallet_address || 'Not created'}\`\n`;
        }
        if (network === 'celo' || !network) {
            responseText += `🟢 **Celo**: \`${userData.celo_wallet_address || 'Not created'}\`\n`;
        }
        if (network === 'solana' || !network) {
            responseText += `🟣 **Solana**: \`${userData.solana_wallet_address || 'Not created'}\`\n`;
        }

        responseText += "\n(Real-time balance fetching requires CDP integration which is currently being set up. For now, I can only show your addresses.)";

        return { text: responseText };
    } catch (error) {
        console.error('[Actions] Error getting wallet balance:', error);
        return { text: "Failed to fetch wallet information." };
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
        if (network.includes('celo')) chain = 'CELO';
        if (network.includes('solana')) chain = 'SOLANA';
        if (network.includes('arbitrum')) chain = 'ARBITRUM'; // Note: ARBITRUM not in enum yet, defaulting to BASE or need to add it
        if (network.includes('optimism')) chain = 'OPTIMISM'; // Note: OPTIMISM not in enum yet

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
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

        return {
            text: `Done! I've created a payment link for ${amount} ${token}${description && description !== 'Payment' ? ` for ${description}` : ''}. Here's the link: /payment-link/${doc.id}\n\nYou can share this with your client to collect payment.`,
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
        if (network.includes('celo')) chain = 'CELO';
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
            .select('id')
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

        // Generate response with item breakdown
        const itemsList = items.map(item => `  • ${item.description}${item.quantity > 1 ? ` (x${item.quantity})` : ''}: $${item.amount * item.quantity}`).join('\n');
        const itemsText = items.length > 1
            ? `\n\nItems:\n${itemsList}\n\nTotal: $${totalAmount}`
            : `\n\n📄 ${items[0].description}: $${totalAmount}`;

        return {
            text: `Perfect! I've created an invoice for ${clientName}.${itemsText}\n\nView invoice: /invoice/${doc.id}\n\nYou can send this to ${clientEmail || clientName} to request payment.`,
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
        const clientName = params.client_name;
        const clientEmail = params.client_email;
        const problemStatement = params.problem_statement || params.problem;
        const proposedSolution = params.proposed_solution || params.solution;
        const deliverables = params.deliverables || [];
        const timeline = params.timeline;
        const milestones = params.milestones || [];
        const pricingBreakdown = params.pricing_breakdown || params.pricing || [];
        const totalCost = params.total_cost || params.total;
        const paymentTerms = params.payment_terms;

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

        // Create contract record
        const { data: doc, error } = await supabase
            .from('documents')
            .insert({
                user_id: userData.id,
                type: 'CONTRACT',
                title,
                status: 'DRAFT',
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

        return {
            text: `🤝 **Contract Created Successfully**\n\n` +
                `Title: ${title}\n` +
                `Client: ${clientName}\n` +
                `Payment: ${paymentAmount}\n` +
                `Milestones: ${milestones.length}\n\n` +
                `I've generated a complete contract for you!\n\n` +
                `[View & Download Contract](${contractUrl})`
        };
    } catch (error) {
        console.error('[Actions] Error creating contract:', error);
        return { text: "Failed to create contract. Please try again." };
    }
}
