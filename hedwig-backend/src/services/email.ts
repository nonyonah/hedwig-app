
import { Resend } from 'resend';
import { createLogger } from '../utils/logger';

const logger = createLogger('EmailService');
// Initialize Resend lazily inside functions to ensure env vars are loaded

const SHARED_STYLES = `
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; margin-top: 40px; margin-bottom: 40px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
    .header { background-color: #ffffff; padding: 24px; text-align: center; border-bottom: 1px solid #f3f4f6; }
    .logo { font-size: 24px; font-weight: bold; color: #4F46E5; text-decoration: none; }
    .content { padding: 32px 24px; }
    .card { background-color: #f9fafb; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px; border: 1px solid #e5e7eb; }
    .amount-label { font-size: 14px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
    .amount-value { font-size: 36px; color: #111827; font-weight: 700; margin: 0; }
    .description { color: #4b5563; font-size: 16px; line-height: 1.5; margin-bottom: 24px; text-align: center; }
    .btn-container { text-align: center; margin-top: 32px; }
    .btn { display: inline-block; background-color: #4F46E5; color: #ffffff; font-weight: 600; padding: 16px 32px; border-radius: 30px; text-decoration: none; font-size: 16px; transition: background-color 0.2s; }
    .btn:hover { background-color: #4338ca; }
    .footer { background-color: #f9fafb; padding: 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
    .footer a { color: #6b7280; text-decoration: underline; }
`;

interface EmailData {
    to: string;
    senderName: string;
    amount: string;
    currency: string;
    description?: string;
    linkId: string;
    network?: string;
}

export const EmailService = {
    async sendInvoiceEmail(data: EmailData): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const invoiceUrl = `https://hedwig.app/invoice/${data.linkId}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>${SHARED_STYLES}</style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <p class="description"><strong>${data.senderName}</strong> has sent you an invoice.</p>
                    
                    <div class="card">
                        <p class="amount-label">Amount Due</p>
                        <h1 class="amount-value">${data.amount} ${data.currency}</h1>
                    </div>

                    ${data.description ? `<p class="description">${data.description}</p>` : ''}
                    
                    <div class="btn-container">
                        <a href="${invoiceUrl}" class="btn">View Invoice</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Powered by <a href="https://hedwig.app">Hedwig</a> — The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <noreply@resend.dev>', // Update this with a verified domain if user has one
                to: [data.to],
                subject: `New Invoice from ${data.senderName}`,
                html: html,
            });
            logger.info('Invoice email sent');
            return true;
        } catch (error) {
            logger.error('Invoice email failed', { error: error instanceof Error ? error.message : 'Unknown' });
            return false;
        }
    },

    async sendPaymentLinkEmail(data: EmailData): Promise<boolean> {
        // ... existing implementation ...
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const paymentUrl = `https://hedwig.app/pay/${data.linkId}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>${SHARED_STYLES}</style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <p class="description"><strong>${data.senderName}</strong> has requested a payment.</p>
                    
                    <div class="card">
                        <p class="amount-label">Amount Requested</p>
                        <h1 class="amount-value">${data.amount} ${data.currency}</h1>
                        ${data.network ? `<p style="margin-top: 8px; color: #6b7280; font-size: 14px;">on ${data.network}</p>` : ''}
                    </div>

                    ${data.description ? `<p class="description">${data.description}</p>` : ''}
                    
                    <div class="btn-container">
                        <a href="${paymentUrl}" class="btn">Pay Now</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Powered by <a href="https://hedwig.app">Hedwig</a> — The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <noreply@resend.dev>',
                to: [data.to],
                subject: `Payment Request from ${data.senderName}`,
                html: html,
            });
            logger.info('Payment link email sent');
            return true;
        } catch (error) {
            logger.error('Payment link email failed', { error: error instanceof Error ? error.message : 'Unknown' });
            return false;
        }
    },

    async sendPaymentReceivedEmail(data: {
        to: string;
        recipientName: string;
        senderName?: string;
        amount: string;
        currency: string;
        txHash: string;
        documentTitle?: string;
        linkId: string;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const receiptUrl = `https://hedwig.app/receipt/${data.linkId}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>${SHARED_STYLES}</style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <p class="description">Hi <strong>${data.recipientName}</strong>,</p>
                    <p class="description">You've successfully received a payment${data.senderName ? ` from <strong>${data.senderName}</strong>` : ''}.</p>
                    
                    <div class="card">
                        <p class="amount-label">Payment Received</p>
                        <h1 class="amount-value">${data.amount} ${data.currency}</h1>
                        ${data.documentTitle ? `<p style="margin-top: 8px; color: #6b7280; font-size: 14px;">For: ${data.documentTitle}</p>` : ''}
                    </div>

                    <p class="description" style="font-size: 14px; text-align: center;">Transaction Hash: <a href="https://basescan.org/tx/${data.txHash}" style="color: #4F46E5;">${data.txHash.substring(0, 8)}...${data.txHash.substring(data.txHash.length - 6)}</a></p>
                    
                    <div class="btn-container">
                        <a href="${receiptUrl}" class="btn">View Receipt</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Powered by <a href="https://hedwig.app">Hedwig</a> — The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <noreply@resend.dev>',
                to: [data.to],
                subject: `Payment Received: ${data.amount} ${data.currency}`,
                html: html,
            });
            logger.info('Payment received email sent');
            return true;
        } catch (error) {
            logger.error('Payment received email failed', { error: error instanceof Error ? error.message : 'Unknown' });
            return false;
        }
    },

    async sendSmartReminder(to: string, subject: string, htmlContent: string, actionLink?: string, actionText?: string): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>${SHARED_STYLES}</style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    ${htmlContent}
                    
                    ${actionLink ? `
                    <div class="btn-container">
                        <a href="${actionLink}" class="btn">${actionText || 'View Details'}</a>
                    </div>
                    ` : ''}
                </div>
                <div class="footer">
                    <p>Powered by <a href="https://hedwig.app">Hedwig</a> — The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <noreply@resend.dev>',
                to: [to],
                subject: subject,
                html: html,
            });
            logger.info('Smart reminder sent');
            return true;
        } catch (error) {
            logger.error('Smart reminder failed', { error: error instanceof Error ? error.message : 'Unknown' });
            return false;
        }
    },

    async sendContractEmail(data: {
        to: string;
        senderName: string;
        contractTitle: string;
        contractId: string;
        approvalToken: string;
        totalAmount?: string;
        milestoneCount?: number;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const baseUrl = process.env.API_URL || 'https://hedwig.app';
        const contractUrl = `${baseUrl}/contract/${data.contractId}?token=${data.approvalToken}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                ${SHARED_STYLES}
                .milestone-info { background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0; }
                .milestone-info p { margin: 0; color: #166534; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <p class="description"><strong>${data.senderName}</strong> has sent you a contract for review and approval.</p>
                    
                    <div class="card">
                        <p class="amount-label">Contract</p>
                        <h1 style="font-size: 24px; color: #111827; font-weight: 700; margin: 0;">${data.contractTitle}</h1>
                        ${data.totalAmount ? `<p style="margin-top: 12px; font-size: 20px; color: #059669; font-weight: 600;">$${data.totalAmount}</p>` : ''}
                    </div>

                    ${data.milestoneCount ? `
                    <div class="milestone-info">
                        <p>📋 This contract includes <strong>${data.milestoneCount} milestone${data.milestoneCount > 1 ? 's' : ''}</strong></p>
                    </div>
                    ` : ''}
                    
                    <p class="description">Click the button below to review the full contract and approve it.</p>
                    
                    <div class="btn-container">
                        <a href="${contractUrl}" class="btn" style="background-color: #059669;">Review & Approve Contract</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Powered by <a href="https://hedwig.app">Hedwig</a> — The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <noreply@resend.dev>',
                to: [data.to],
                subject: `Contract for Review: ${data.contractTitle} from ${data.senderName}`,
                html: html,
            });
            logger.info('Contract email sent');
            return true;
        } catch (error) {
            logger.error('Contract email failed', { error: error instanceof Error ? error.message : 'Unknown' });
            return false;
        }
    },

    async sendContractApprovedNotification(data: {
        to: string;
        clientName: string;
        contractTitle: string;
        contractId: string;
        invoiceCount?: number;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const baseUrl = process.env.API_URL || 'https://hedwig.app';
        const contractUrl = `${baseUrl}/contract/${data.contractId}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                ${SHARED_STYLES}
                .success-card { background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px; }
                .success-icon { font-size: 48px; margin-bottom: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <div class="success-card">
                        <div class="success-icon">🎉</div>
                        <h2 style="margin: 0; color: #166534; font-size: 20px;">Contract Approved!</h2>
                    </div>
                    
                    <p class="description"><strong>${data.clientName}</strong> has approved your contract:</p>
                    
                    <div class="card">
                        <h1 style="font-size: 20px; color: #111827; font-weight: 700; margin: 0;">${data.contractTitle}</h1>
                    </div>

                    ${data.invoiceCount ? `
                    <p class="description">✨ <strong>${data.invoiceCount} milestone invoice${data.invoiceCount > 1 ? 's have' : ' has'}</strong> been automatically generated and sent to your client.</p>
                    ` : ''}
                    
                    <div class="btn-container">
                        <a href="${contractUrl}" class="btn">View Contract</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Powered by <a href="https://hedwig.app">Hedwig</a> — The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <noreply@resend.dev>',
                to: [data.to],
                subject: `🎉 Contract Approved: ${data.contractTitle}`,
                html: html,
            });
            logger.info('Contract approved notification sent');
            return true;
        } catch (error) {
            logger.error('Contract approved notification failed', { error: error instanceof Error ? error.message : 'Unknown' });
            return false;
        }
    },

    async sendProposalEmail(data: {
        to: string;
        freelancerName: string;
        clientName: string;
        proposalTitle: string;
        proposalId: string;
        totalCost: string;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const baseUrl = process.env.API_URL || 'http://localhost:3000';
        const proposalUrl = `${baseUrl}/proposal/${data.proposalId}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>${SHARED_STYLES}</style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <h2 style="text-align: center; color: #111827; margin-bottom: 24px;">New Proposal</h2>
                    
                    <p class="description">
                        Hi ${data.clientName},<br><br>
                        <strong>${data.freelancerName}</strong> has sent you a proposal.
                    </p>
                    
                    <div class="card">
                        <p class="amount-label">Project Proposal</p>
                        <h1 class="amount-value" style="font-size: 24px;">${data.proposalTitle}</h1>
                        ${data.totalCost ? `<p style="color: #4F46E5; font-weight: 600; margin-top: 16px;">Estimated: ${data.totalCost}</p>` : ''}
                    </div>
                    
                    <p class="description">Review the full proposal to see the scope, timeline, and deliverables.</p>
                    
                    <div class="btn-container">
                        <a href="${proposalUrl}" class="btn">View Proposal</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Powered by <a href="https://hedwig.app">Hedwig</a> — The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <noreply@resend.dev>',
                to: [data.to],
                subject: `📋 New Proposal: ${data.proposalTitle}`,
                html: html,
            });
            logger.info('Proposal email sent');
            return true;
        } catch (error) {
            logger.error('Proposal email failed', { error: error instanceof Error ? error.message : 'Unknown' });
            return false;
        }
    },

    async sendProposalAcceptedNotification(data: {
        to: string;
        clientName: string;
        proposalTitle: string;
        proposalId: string;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const baseUrl = process.env.API_URL || 'http://localhost:3000';
        const proposalUrl = `${baseUrl}/proposal/${data.proposalId}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>${SHARED_STYLES}</style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <div style="width: 64px; height: 64px; background-color: #D1FAE5; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                            <svg style="width: 32px; height: 32px; color: #059669;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                        </div>
                        <h2 style="color: #059669; font-size: 24px; margin: 0;">Proposal Accepted!</h2>
                    </div>
                    
                    <p class="description">
                        Great news! <strong>${data.clientName}</strong> has accepted your proposal.
                    </p>
                    
                    <div class="card">
                        <p class="amount-label">Accepted Proposal</p>
                        <h1 class="amount-value" style="font-size: 20px;">${data.proposalTitle}</h1>
                    </div>
                    
                    <p class="description">You can now proceed with the project. Consider sending a contract to formalize the agreement.</p>
                    
                    <div class="btn-container">
                        <a href="${proposalUrl}" class="btn" style="background-color: #059669;">View Proposal</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Powered by <a href="https://hedwig.app">Hedwig</a> — The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <noreply@resend.dev>',
                to: [data.to],
                subject: `🎉 Proposal Accepted: ${data.proposalTitle}`,
                html: html,
            });
            logger.info('Proposal accepted notification sent');
            return true;
        } catch (error) {
            logger.error('Proposal accepted notification failed', { error: error instanceof Error ? error.message : 'Unknown' });
            return false;
        }
    }
};
