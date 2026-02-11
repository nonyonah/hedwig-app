import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('ClientService');

export class ClientService {
    /**
     * Find or create a client with strict deduplication logic.
     * Looks up by email (normalized) AND name (normalized, case-insensitive).
     */
    static async getOrCreateClient(
        userId: string,
        name: string | null | undefined,
        email: string | null | undefined,
        additionalInfo?: {
            company?: string;
            phone?: string;
            createdFrom?: string;
        }
    ): Promise<{ id: string; isNew: boolean; client: any }> {
        // 1. Normalize inputs
        const safeName = name ? name.trim() : null;
        const safeEmail = email ? email.trim().toLowerCase() : null;

        if (!safeName && !safeEmail) {
            throw new Error('Cannot create client: Name or Email is required');
        }

        // 2. Build flexible query to find existing client
        // We want to match if EITHER email matches OR name matches (case-insensitive)
        let query = supabase
            .from('clients')
            .select('*')
            .eq('user_id', userId);

        const conditions = [];
        if (safeEmail) conditions.push(`email.ilike.${safeEmail}`);
        if (safeName) conditions.push(`name.ilike.${safeName}`);

        if (conditions.length > 0) {
            query = query.or(conditions.join(','));
        }

        const { data: existingClients, error: findError } = await query;

        if (findError) {
            logger.error('Error finding client', { error: findError });
            throw new Error(`Failed to check existing clients: ${findError.message}`);
        }

        // 3. Analyze potential matches
        // Prioritize email match, then exact name match, then case-insensitive name match
        let match = null;
        
        if (existingClients && existingClients.length > 0) {
            // A. Exact Email Match
            if (safeEmail) {
                match = existingClients.find(c => c.email && c.email.toLowerCase() === safeEmail);
            }
            // B. Exact Name Match (if no email match)
            if (!match && safeName) {
                match = existingClients.find(c => c.name === safeName);
            }
            // C. Fuzzy Name Match (if no exact name match)
            if (!match && safeName) {
                match = existingClients.find(c => c.name.toLowerCase() === safeName.toLowerCase());
            }
        }

        // Return existing client if found
        if (match) {
            logger.info('Found existing client', { clientId: match.id, reason: 'deduplication' });
            
            // Optional: Update missing fields if new info provided (e.g. adding email to a name-only client)
            const updates: any = {};
            if (safeEmail && !match.email) updates.email = safeEmail;
            if (additionalInfo?.company && !match.company) updates.company = additionalInfo.company;
            if (additionalInfo?.phone && !match.phone) updates.phone = additionalInfo.phone;
            
            if (Object.keys(updates).length > 0) {
                await supabase.from('clients').update(updates).eq('id', match.id);
                logger.info('Updated existing client with new info', { clientId: match.id, updates });
            }

            return { id: match.id, isNew: false, client: match };
        }

        // 4. Create new client if no match found
        logger.info('Creating new client', { name: safeName, email: safeEmail });
        
        const newClientData = {
            user_id: userId,
            name: safeName || safeEmail?.split('@')[0] || 'Unknown Client',
            email: safeEmail, // can be null
            company: additionalInfo?.company || null,
            phone: additionalInfo?.phone || null,
            // Assuming 'created_from' might be a metadata field or handled differently in schema
            // If schema doesn't have it, it will be ignored or cause error depending on strictness
        };

        const { data: newClient, error: createError } = await supabase
            .from('clients')
            .insert(newClientData)
            .select()
            .single();

        if (createError || !newClient) {
            logger.error('Failed to create client', { error: createError });
            throw new Error(`Failed to create client: ${createError?.message}`);
        }

        return { id: newClient.id, isNew: true, client: newClient };
    }

    /**
     * Recalculate and update a client's total earnings and outstanding balance.
     * Should be called whenever an invoice/payment status changes.
     */
    static async updateClientStats(clientId: string): Promise<void> {
        try {
            logger.info('Updating stats for client', { clientId });

            // Fetch all documents for this client
            const { data: documents, error } = await supabase
                .from('documents')
                .select('amount, status, type')
                .eq('client_id', clientId);

            if (error) throw error;

            let totalEarnings = 0;
            let outstandingBalance = 0;

            if (documents) {
                for (const doc of documents) {
                    const amount = doc.amount || 0;
                    
                    // Logic for Earnings: PAID invoices or payments
                    if (doc.status === 'PAID') {
                        totalEarnings += amount;
                    } 
                    // Logic for Outstanding: SENT/VIEWED invoices (not yet paid)
                    else if ((doc.status === 'SENT' || doc.status === 'VIEWED') && doc.type === 'INVOICE') {
                        outstandingBalance += amount;
                    }
                }
            }

            // Update client record
            const { error: updateError } = await supabase
                .from('clients')
                .update({
                    total_earnings: totalEarnings,
                    outstanding_balance: outstandingBalance,
                    updated_at: new Date().toISOString()
                })
                .eq('id', clientId);

            if (updateError) throw updateError;

            logger.info('Client stats updated', { clientId, totalEarnings, outstandingBalance });

        } catch (err) {
            logger.error('Failed to update client stats', { error: err, clientId });
            // Don't throw, just log - this is a background task usually
        }
    }
}
