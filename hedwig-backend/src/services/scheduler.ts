import cron from 'node-cron';
import { supabase } from '../lib/supabase';
import { GeminiService } from './gemini';
import { EmailService } from './email';
import { differenceInDays, parseISO } from 'date-fns';

export const SchedulerService = {
    initScheduler() {
        console.log('[Scheduler] Initializing Reminder Scheduler...');

        // Run every day at 10:00 AM UTC
        // Cron format: Minute Hour DayMonth Month DayWeek
        cron.schedule('0 10 * * *', async () => {
            console.log('[Scheduler] Running daily automated check for overdue payments...');
            await this.checkAndRemind();
        });
    },

    async checkAndRemind() {
        try {
            // Fetch documents older than 7 days that are not paid
            const { data: documents, error } = await supabase
                .from('documents')
                .select(`
                    *,
                    user:users(
                        first_name,
                        last_name,
                        email
                    )
                `)
                .in('status', ['SENT', 'DRAFT'])
                .neq('type', 'CONTRACT')
                .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Older than 7 days

            if (error) {
                console.error('[Scheduler] Failed to fetch documents:', error);
                return;
            }

            if (!documents || documents.length === 0) {
                console.log('[Scheduler] No overdue documents found.');
                return;
            }

            console.log(`[Scheduler] Found ${documents.length} potentially overdue documents.`);

            for (const doc of documents) {
                await this.processDocumentReminder(doc);
            }

        } catch (error) {
            console.error('[Scheduler] Error in checkAndRemind:', error);
        }
    },

    async processDocumentReminder(doc: any) {
        try {
            const content = doc.content || {};
            const recipientEmail = content.recipient_email || content.client_email;
            const clientName = content.client_name || 'Client';

            // Check if reminders are enabled for this document (default: true for backwards compatibility)
            const remindersEnabled = content.reminders_enabled !== false;
            if (!remindersEnabled) {
                console.log(`[Scheduler] Skipping doc ${doc.id}: Reminders disabled.`);
                return;
            }

            // If no recipient email, we can't send a reminder
            if (!recipientEmail) {
                console.log(`[Scheduler] Skipping doc ${doc.id}: No recipient email.`);
                return;
            }

            // Check if we already sent a reminder recently (every 7 days)
            const lastReminded = content.last_reminder_sent_at;
            if (lastReminded) {
                const daysSinceReminder = differenceInDays(new Date(), parseISO(lastReminded));
                if (daysSinceReminder < 7) {
                    console.log(`[Scheduler] Skipping doc ${doc.id}: Reminded ${daysSinceReminder} days ago.`);
                    return;
                }
            }

            // Calculate days since creation
            const createdDate = parseISO(doc.created_at);
            const daysSinceCreation = differenceInDays(new Date(), createdDate);

            if (daysSinceCreation < 7) {
                // Not old enough for a reminder
                return;
            }

            console.log(`[Scheduler] Generating reminder for doc ${doc.id} (${daysSinceCreation} days since creation)`);

            const senderName = `${doc.user?.first_name || 'Hedwig'} ${doc.user?.last_name || ''}`.trim();

            // Generate AI Content
            const aiResponse = await GeminiService.generatePaymentReminder(
                clientName,
                `${doc.amount} ${doc.currency || 'USDC'}`,
                daysSinceCreation,
                doc.type === 'INVOICE' ? 'Invoice' : 'Payment Link',
                doc.title,
                senderName
            );

            // Determine action link
            const actionLink = doc.type === 'INVOICE'
                ? `https://hedwig.app/invoice/${doc.id}`
                : `https://hedwig.app/pay/${doc.id}`; // Assuming pay link format

            // Send Email
            const sent = await EmailService.sendSmartReminder(
                recipientEmail,
                aiResponse.subject,
                aiResponse.body,
                actionLink,
                "Pay Now"
            );

            if (sent) {
                // Update document with last_reminder_sent_at
                await supabase
                    .from('documents')
                    .update({
                        content: {
                            ...content,
                            last_reminder_sent_at: new Date().toISOString()
                        }
                    })
                    .eq('id', doc.id);

                console.log(`[Scheduler] Reminder sent & recorded for doc ${doc.id}`);
            }

        } catch (error) {
            console.error(`[Scheduler] Failed to process doc ${doc.id}:`, error);
        }
    }
};
