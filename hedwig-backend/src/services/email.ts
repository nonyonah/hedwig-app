
import { Resend } from 'resend';

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
            console.warn('RESEND_API_KEY is not set. Skipping email sending.');
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
            console.log(`[EmailService] Invoice email sent to ${data.to}`);
            return true;
        } catch (error) {
            console.error('[EmailService] Simple invoice email failed:', error);
            return false;
        }
    },

    async sendPaymentLinkEmail(data: EmailData): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            console.warn('RESEND_API_KEY is not set. Skipping email sending.');
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
            console.log(`[EmailService] Payment link email sent to ${data.to}`);
            return true;
        } catch (error) {
            console.error('[EmailService] Payment link email failed:', error);
            return false;
        }
    }
};
