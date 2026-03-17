
import { Resend } from 'resend';
import { createLogger } from '../utils/logger';

const logger = createLogger('EmailService');
// Initialize Resend lazily inside functions to ensure env vars are loaded

const SHARED_STYLES = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; margin-top: 40px; margin-bottom: 40px; border: 1px solid #e9eaeb; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.06); }
    .header { background-color: #ffffff; padding: 20px 28px; border-bottom: 1px solid #f1f2f4; }
    .logo { font-size: 20px; font-weight: 700; color: #2563eb; text-decoration: none; letter-spacing: -0.02em; }
    .content { padding: 28px 28px 32px; }
    .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #a4a7ae; margin-bottom: 6px; }
    .heading { font-size: 22px; font-weight: 700; color: #181d27; letter-spacing: -0.02em; margin: 0 0 20px; }
    .card { background-color: #f9fafb; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0; border: 1px solid #e9eaeb; }
    .amount-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #a4a7ae; margin-bottom: 8px; }
    .amount-value { font-size: 40px; color: #181d27; font-weight: 700; margin: 0; letter-spacing: -0.03em; line-height: 1.1; }
    .amount-currency { font-size: 20px; color: #535862; font-weight: 600; letter-spacing: -0.01em; }
    .description { color: #535862; font-size: 15px; line-height: 1.6; margin-bottom: 20px; }
    .divider { border: none; border-top: 1px solid #f1f2f4; margin: 24px 0; }
    .btn-container { text-align: center; margin-top: 28px; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; font-weight: 600; padding: 13px 32px; line-height: 1.4; border-radius: 50px; text-decoration: none; font-size: 15px; letter-spacing: -0.01em; mso-padding-alt: 0; }
    .footer { background-color: #f9fafb; padding: 20px 28px; text-align: center; font-size: 12px; color: #a4a7ae; border-top: 1px solid #f1f2f4; }
    .footer a { color: #717680; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
`;

interface EmailData {
    to: string;
    senderName: string;
    amount: string;
    currency: string;
    description?: string;
    linkId: string;
    network?: string;
    paymentUrl?: string;
}

export const EmailService = {
    async sendInvoiceEmail(data: EmailData): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const invoiceUrl = data.paymentUrl || `https://hedwig.app/invoice/${data.linkId}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invoice from ${data.senderName}</title>
            <style>${SHARED_STYLES}</style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <p class="eyebrow">Invoice</p>
                    <h1 class="heading">You have a new invoice</h1>
                    <p class="description"><strong style="color:#181d27;">${data.senderName}</strong> has sent you an invoice. Please review it and pay by the due date.</p>

                    <div class="card">
                        <p class="amount-label">Amount Due</p>
                        <p class="amount-value">$${data.amount} <span class="amount-currency">${data.currency}</span></p>
                    </div>

                    ${data.description ? `<p class="description" style="text-align:center;">${data.description}</p>` : ''}

                    <div class="btn-container">
                        <a href="${invoiceUrl}" class="btn">View &amp; Pay Invoice</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Sent via <a href="https://hedwig.money">Hedwig</a> &mdash; The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>', // Updated to verified domain
                to: [data.to],
                subject: `New Invoice from ${data.senderName}`,
                html: html,
            });
            logger.info('Invoice email sent');
            return true;
        } catch (error) {
            logger.error('Invoice email failed', { error: error instanceof Error ? error.message : 'Unknown', to: data.to });
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
        const paymentUrl = data.paymentUrl || `https://hedwig.app/pay/${data.linkId}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment request from ${data.senderName}</title>
            <style>${SHARED_STYLES}</style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <p class="eyebrow">Payment Request</p>
                    <h1 class="heading">You have a payment request</h1>
                    <p class="description"><strong style="color:#181d27;">${data.senderName}</strong> has sent you a payment request.</p>

                    <div class="card">
                        <p class="amount-label">Amount Requested</p>
                        <p class="amount-value">$${data.amount} <span class="amount-currency">${data.currency}</span></p>
                        ${data.network ? `<p style="margin-top: 8px; color: #a4a7ae; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;">${data.network}</p>` : ''}
                    </div>

                    ${data.description ? `<p class="description" style="text-align:center;">${data.description}</p>` : ''}

                    <div class="btn-container">
                        <a href="${paymentUrl}" class="btn">Pay Now</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Sent via <a href="https://hedwig.money">Hedwig</a> &mdash; The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
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
            <title>Payment received</title>
            <style>${SHARED_STYLES}</style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <p class="eyebrow">Payment Received</p>
                    <h1 class="heading">You got paid!</h1>
                    <p class="description">Hi <strong style="color:#181d27;">${data.recipientName}</strong>, you've successfully received a payment${data.senderName ? ` from <strong style="color:#181d27;">${data.senderName}</strong>` : ''}.</p>

                    <div class="card">
                        <p class="amount-label">Amount Received</p>
                        <p class="amount-value">$${data.amount} <span class="amount-currency">${data.currency}</span></p>
                        ${data.documentTitle ? `<p style="margin-top: 10px; color: #717680; font-size: 13px;">For: ${data.documentTitle}</p>` : ''}
                    </div>

                    <p style="text-align:center; font-size: 13px; color: #a4a7ae; margin: 0 0 24px;">
                        Tx: <a href="https://basescan.org/tx/${data.txHash}" style="color: #2563eb; text-decoration: none; font-family: monospace;">${data.txHash.substring(0, 10)}...${data.txHash.substring(data.txHash.length - 6)}</a>
                    </p>

                    <div class="btn-container">
                        <a href="${receiptUrl}" class="btn">View Receipt</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Sent via <a href="https://hedwig.money">Hedwig</a> &mdash; The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
                to: [data.to],
                subject: `Payment Received: ${data.amount} ${data.currency}`,
                html: html,
            });
            logger.info('Payment received email sent');
            return true;
        } catch (error) {
            logger.error('Payment received email failed', { error: error instanceof Error ? error.message : 'Unknown', to: data.to });
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
            <title>${subject}</title>
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
                    <p>Sent via <a href="https://hedwig.money">Hedwig</a> &mdash; The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
                to: [to],
                subject: subject,
                html: html,
            });
            logger.info('Smart reminder sent');
            return true;
        } catch (error) {
            logger.error('Smart reminder failed', { error: error instanceof Error ? error.message : 'Unknown', to: to });
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
            <title>Contract from ${data.senderName}</title>
            <style>
                ${SHARED_STYLES}
                .milestone-pill { display: inline-block; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 50px; padding: 5px 14px; font-size: 13px; color: #2563eb; font-weight: 600; margin-top: 14px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <p class="eyebrow">Contract</p>
                    <h1 class="heading">You have a contract to review</h1>
                    <p class="description"><strong style="color:#181d27;">${data.senderName}</strong> has sent you a contract for review and approval.</p>

                    <div class="card">
                        <p class="amount-label">Contract</p>
                        <p style="font-size: 20px; color: #181d27; font-weight: 700; margin: 0; letter-spacing: -0.02em;">${data.contractTitle}</p>
                        ${data.totalAmount ? `<p style="margin-top: 10px; font-size: 28px; color: #181d27; font-weight: 700; letter-spacing: -0.03em;">$${data.totalAmount}</p>` : ''}
                        ${data.milestoneCount ? `<span class="milestone-pill">${data.milestoneCount} milestone${data.milestoneCount > 1 ? 's' : ''}</span>` : ''}
                    </div>

                    <p class="description">Review the full contract and approve it when you're ready to proceed.</p>

                    <div class="btn-container">
                        <a href="${contractUrl}" class="btn">Review &amp; Approve Contract</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Sent via <a href="https://hedwig.money">Hedwig</a> &mdash; The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
                to: [data.to],
                subject: `Contract for Review: ${data.contractTitle} from ${data.senderName}`,
                html: html,
            });
            logger.info('Contract email sent');
            return true;
        } catch (error) {
            logger.error('Contract email failed', { error: error instanceof Error ? error.message : 'Unknown', to: data.to });
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
            <title>Contract approved</title>
            <style>
                ${SHARED_STYLES}
                .success-badge { display: inline-block; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 50px; padding: 6px 16px; font-size: 13px; font-weight: 700; color: #16a34a; letter-spacing: 0.02em; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <p class="eyebrow">Contract Update</p>
                    <h1 class="heading">Contract approved</h1>
                    <p class="description"><strong style="color:#181d27;">${data.clientName}</strong> has approved your contract.</p>

                    <div class="card">
                        <p class="amount-label">Contract</p>
                        <p style="font-size: 18px; color: #181d27; font-weight: 700; margin: 0 0 12px; letter-spacing: -0.02em;">${data.contractTitle}</p>
                        <span class="success-badge">Approved</span>
                    </div>

                    ${data.invoiceCount ? `
                    <p class="description"><strong style="color:#181d27;">${data.invoiceCount} milestone invoice${data.invoiceCount > 1 ? 's' : ''}</strong> ${data.invoiceCount > 1 ? 'have' : 'has'} been automatically generated and sent to your client.</p>
                    ` : ''}

                    <div class="btn-container">
                        <a href="${contractUrl}" class="btn">View Contract</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Sent via <a href="https://hedwig.money">Hedwig</a> &mdash; The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
                to: [data.to],
                subject: `Contract Approved: ${data.contractTitle}`,
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
            <title>Proposal from ${data.freelancerName}</title>
            <style>${SHARED_STYLES}</style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <p class="eyebrow">Proposal</p>
                    <h1 class="heading">You have a new proposal</h1>
                    <p class="description">Hi <strong style="color:#181d27;">${data.clientName}</strong>, <strong style="color:#181d27;">${data.freelancerName}</strong> has sent you a project proposal.</p>

                    <div class="card">
                        <p class="amount-label">Project Proposal</p>
                        <p style="font-size: 20px; color: #181d27; font-weight: 700; margin: 0; letter-spacing: -0.02em;">${data.proposalTitle}</p>
                        ${data.totalCost ? `<p style="margin-top: 10px; font-size: 28px; color: #181d27; font-weight: 700; letter-spacing: -0.03em;">${data.totalCost}</p>` : ''}
                    </div>

                    <p class="description">Review the full proposal to see the scope, timeline, and deliverables.</p>

                    <div class="btn-container">
                        <a href="${proposalUrl}" class="btn">View Proposal</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Sent via <a href="https://hedwig.money">Hedwig</a> &mdash; The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
                to: [data.to],
                subject: `New Proposal: ${data.proposalTitle}`,
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
            <title>Proposal accepted</title>
            <style>
                ${SHARED_STYLES}
                .success-badge { display: inline-block; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 50px; padding: 6px 16px; font-size: 13px; font-weight: 700; color: #16a34a; letter-spacing: 0.02em; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <span class="logo">Hedwig</span>
                </div>
                <div class="content">
                    <p class="eyebrow">Proposal Update</p>
                    <h1 class="heading">Proposal accepted</h1>
                    <p class="description"><strong style="color:#181d27;">${data.clientName}</strong> has accepted your proposal. You can now proceed with the project.</p>

                    <div class="card">
                        <p class="amount-label">Accepted Proposal</p>
                        <p style="font-size: 18px; color: #181d27; font-weight: 700; margin: 0 0 12px; letter-spacing: -0.02em;">${data.proposalTitle}</p>
                        <span class="success-badge">Accepted</span>
                    </div>

                    <p class="description">Consider sending a contract to formalize the agreement and protect both parties.</p>

                    <div class="btn-container">
                        <a href="${proposalUrl}" class="btn">View Proposal</a>
                    </div>
                </div>
                <div class="footer">
                    <p>Sent via <a href="https://hedwig.money">Hedwig</a> &mdash; The AI Agent for Freelancers</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
                to: [data.to],
                subject: `Proposal Accepted: ${data.proposalTitle}`,
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
