import cron from 'node-cron';
import { supabase } from '../lib/supabase';
import { GeminiService } from './gemini';
import { EmailService } from './email';
import NotificationService from './notifications';
import { differenceInDays, parseISO, addDays, isSameDay } from 'date-fns';

export const SchedulerService = {
    initScheduler() {
        console.log('[Scheduler] Initializing Reminder Scheduler...');

        // Run every day at 10:00 AM UTC - check for overdue payments
        cron.schedule('0 10 * * *', async () => {
            console.log('[Scheduler] Running daily automated check for overdue payments...');
            await this.checkAndRemind();
        });

        // Run every day at 9:00 AM UTC - check for upcoming due dates
        cron.schedule('0 9 * * *', async () => {
            console.log('[Scheduler] Running daily due date reminder check...');
            await this.checkDueDateReminders();
        });
    },

    /**
     * Check for upcoming due dates and send reminders
     * - 3 days before due: Send gentle reminder
     * - 1 day before due: Send urgent reminder
     * - On due date: Send final notice
     */
    async checkDueDateReminders() {
        try {
            const today = new Date();
            const threeDaysFromNow = addDays(today, 3);
            const oneDayFromNow = addDays(today, 1);

            // Fetch all unpaid documents with due dates
            const { data: documents, error } = await supabase
                .from('documents')
                .select(`
                    *,
                    user:users(id, first_name, last_name, email)
                `)
                .in('status', ['DRAFT', 'SENT', 'PENDING'])
                .not('content->due_date', 'is', null);

            if (error) {
                console.error('[Scheduler] Failed to fetch documents for due date reminders:', error);
                return;
            }

            if (!documents || documents.length === 0) {
                console.log('[Scheduler] No documents with due dates found.');
                return;
            }

            console.log(`[Scheduler] Checking ${documents.length} documents for due date reminders...`);

            for (const doc of documents) {
                await this.processDueDateReminder(doc, today, threeDaysFromNow, oneDayFromNow);
            }

            // Also check milestones
            await this.checkMilestoneDueDates(today, threeDaysFromNow, oneDayFromNow);

        } catch (error) {
            console.error('[Scheduler] Error in checkDueDateReminders:', error);
        }
    },

    async processDueDateReminder(doc: any, today: Date, threeDays: Date, oneDay: Date) {
        try {
            const content = doc.content || {};
            const dueDateStr = content.due_date;
            
            if (!dueDateStr) return;

            const dueDate = parseISO(dueDateStr);
            const recipientEmail = content.recipient_email || content.client_email;
            const clientName = content.client_name || 'Client';
            const userId = doc.user?.id;

            // Check if reminders are enabled
            if (content.reminders_enabled === false) return;

            // Determine reminder type
            let reminderType: '3_day' | '1_day' | 'due_today' | null = null;
            
            if (isSameDay(dueDate, threeDays)) {
                reminderType = '3_day';
            } else if (isSameDay(dueDate, oneDay)) {
                reminderType = '1_day';
            } else if (isSameDay(dueDate, today)) {
                reminderType = 'due_today';
            }

            if (!reminderType) return;

            // Check if we already sent this type of reminder
            const reminderKey = `reminder_${reminderType}_sent`;
            if (content[reminderKey]) return;

            console.log(`[Scheduler] Sending ${reminderType} reminder for doc ${doc.id}`);

            const senderName = `${doc.user?.first_name || ''} ${doc.user?.last_name || ''}`.trim() || 'Freelancer';
            const docType = doc.type === 'INVOICE' ? 'invoice' : 'payment';
            const daysUntilDue = differenceInDays(dueDate, today);

            // Send reminder to CLIENT via email
            if (recipientEmail) {
                const urgency = reminderType === 'due_today' ? 'urgent' : reminderType === '1_day' ? 'important' : 'friendly';
                const subject = reminderType === 'due_today' 
                    ? `⚠️ Payment Due Today - ${doc.title || docType}`
                    : `Reminder: ${doc.title || docType} due ${reminderType === '1_day' ? 'tomorrow' : 'in 3 days'}`;
                
                const body = reminderType === 'due_today'
                    ? `Hi ${clientName},\n\nThis is a reminder that your ${docType} for ${doc.amount} USDC from ${senderName} is due today. Please complete the payment at your earliest convenience.\n\nThank you!`
                    : `Hi ${clientName},\n\nJust a ${urgency} reminder that you have a ${docType} for ${doc.amount} USDC from ${senderName} due ${daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}.\n\nBest regards`;

                const actionLink = doc.type === 'INVOICE'
                    ? `https://hedwig.app/invoice/${doc.id}`
                    : `https://hedwig.app/pay/${doc.id}`;

                await EmailService.sendSmartReminder(
                    recipientEmail,
                    subject,
                    body,
                    actionLink,
                    'Pay Now'
                );
            }

            // Send notification to FREELANCER via push
            if (userId) {
                const title = reminderType === 'due_today' 
                    ? `⚠️ ${docType} Due Today!`
                    : `📅 ${docType} due ${daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}`;
                
                await NotificationService.notifyUser(userId, {
                    title,
                    body: `${clientName} has a ${docType} for $${doc.amount} due${reminderType === 'due_today' ? ' today' : ''}`,
                    data: { type: 'due_date_reminder', documentId: doc.id, reminderType }
                });
            }

            // Mark reminder as sent
            await supabase
                .from('documents')
                .update({
                    content: {
                        ...content,
                        [reminderKey]: new Date().toISOString()
                    }
                })
                .eq('id', doc.id);

            console.log(`[Scheduler] ${reminderType} reminder sent for doc ${doc.id}`);

        } catch (error) {
            console.error(`[Scheduler] Failed to process due date reminder for doc ${doc.id}:`, error);
        }
    },

    async checkMilestoneDueDates(today: Date, threeDays: Date, oneDay: Date) {
        try {
            const { data: milestones, error } = await supabase
                .from('milestones')
                .select(`
                    *,
                    project:projects(
                        id, name, user_id,
                        user:users(id, first_name, last_name),
                        client:clients(id, name, email)
                    )
                `)
                .in('status', ['pending', 'invoiced'])
                .not('due_date', 'is', null);

            if (error || !milestones) return;

            for (const milestone of milestones) {
                const dueDate = parseISO(milestone.due_date);
                const userId = milestone.project?.user_id;
                const clientEmail = milestone.project?.client?.email;
                const clientName = milestone.project?.client?.name || 'Client';

                let reminderType: '3_day' | '1_day' | 'due_today' | null = null;
                
                if (isSameDay(dueDate, threeDays)) reminderType = '3_day';
                else if (isSameDay(dueDate, oneDay)) reminderType = '1_day';
                else if (isSameDay(dueDate, today)) reminderType = 'due_today';

                if (!reminderType) continue;

                // Notify freelancer
                if (userId) {
                    const daysUntilDue = differenceInDays(dueDate, today);
                    await NotificationService.notifyUser(userId, {
                        title: reminderType === 'due_today' 
                            ? `⚠️ Milestone Due Today!`
                            : `📅 Milestone due ${daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}`,
                        body: `"${milestone.title}" for ${clientName} - $${milestone.amount}`,
                        data: { type: 'milestone_reminder', milestoneId: milestone.id, reminderType }
                    });
                }

                // Notify client via email
                if (clientEmail) {
                    const daysUntilDue = differenceInDays(dueDate, today);
                    const subject = reminderType === 'due_today'
                        ? `⚠️ Milestone Due Today: ${milestone.title}`
                        : `Reminder: Milestone "${milestone.title}" due ${daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}`;

                    await EmailService.sendSmartReminder(
                        clientEmail,
                        subject,
                        `Hi ${clientName},\n\nThe milestone "${milestone.title}" for ${milestone.amount} USDC is ${reminderType === 'due_today' ? 'due today' : `due ${daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}`}.`,
                        'https://hedwig.app',
                        'View Details'
                    );
                }
            }
        } catch (error) {
            console.error('[Scheduler] Error checking milestone due dates:', error);
        }
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

