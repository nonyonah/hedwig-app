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

            case 'COLLECT_NETWORK_INFO':
                // Don't create payment link yet, Gemini will ask for network
                return { text: '' };

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
        const description = params.for || 'Project Proposal';
        const recipientEmail = params.recipient_email;

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', user.privy_id)
            .single();

        if (!userData) throw new Error('User not found');

        // Create proposal record
        const { data: doc, error } = await supabase
            .from('documents')
            .insert({
                user_id: userData.id,
                type: 'PROPOSAL',
                title: description,
                status: 'DRAFT',
                content: { recipient_email: recipientEmail }
            })
            .select()
            .single();

        if (error) throw error;
        console.log('[Actions] Created document:', doc);

        return {
            text: `📝 **Proposal Draft Created**\n\n` +
                `Title: ${description}\n` +
                (recipientEmail ? `Recipient: ${recipientEmail}\n` : '') +
                `\nI've started a draft proposal for you.`
        };
    } catch (error) {
        console.error('[Actions] Error creating proposal:', error);
        return { text: "Failed to create proposal. Please try again." };
    }
}

async function handleCreateContract(params: ActionParams, user: any): Promise<ActionResult> {
    try {
        const description = params.for || 'Service Agreement';
        const recipientEmail = params.recipient_email;

        // Get internal user ID
        const { data: userData } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', user.privy_id)
            .single();

        if (!userData) throw new Error('User not found');

        // Create contract record
        const { data: doc, error } = await supabase
            .from('documents')
            .insert({
                user_id: userData.id,
                type: 'CONTRACT',
                title: description,
                status: 'DRAFT',
                content: { recipient_email: recipientEmail }
            })
            .select()
            .single();

        if (error) throw error;
        console.log('[Actions] Created document:', doc);

        return {
            text: `🤝 **Contract Draft Created**\n\n` +
                `Title: ${description}\n` +
                (recipientEmail ? `Recipient: ${recipientEmail}\n` : '') +
                `\nI've created a draft contract for you.`
        };
    } catch (error) {
        console.error('[Actions] Error creating contract:', error);
        return { text: "Failed to create contract. Please try again." };
    }
}
