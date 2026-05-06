
import { Resend } from 'resend';
import { createLogger } from '../utils/logger';

const logger = createLogger('EmailService');

const DEFAULT_PUBLIC_APP_URL = 'https://hedwigbot.xyz';
const RAW_APP_URL = process.env.APP_URL || process.env.WEB_CLIENT_URL || DEFAULT_PUBLIC_APP_URL;

const canonicalizePublicUrl = (input?: string | null): string => {
    const raw = String(input || '').trim();
    if (!raw) return DEFAULT_PUBLIC_APP_URL;

    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
        const url = new URL(normalized);
        const hostname = url.hostname.toLowerCase();
        if (hostname === 'hedwigbot.xyz' || hostname === 'hedwigbot.xyz' || hostname === 'www.hedwigbot.xyz') {
            url.hostname = 'hedwigbot.xyz';
        }
        return url.toString().replace(/\/+$/, '');
    } catch {
        return DEFAULT_PUBLIC_APP_URL;
    }
};

const APP_URL = canonicalizePublicUrl(RAW_APP_URL);

const resolvePublicUrl = (candidate: string | undefined, fallbackPath: string): string => {
    const value = String(candidate || '').trim();
    if (!value) return `${APP_URL}${fallbackPath}`;

    if (value.startsWith('/')) {
        return `${APP_URL}${value}`;
    }

    return canonicalizePublicUrl(value);
};

const escapeHtml = (value: unknown): string =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const EMAIL_FONT_FAMILY = `'Google Sans Flex', 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const EMAIL_FONT_HEAD = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@8..144,300..700&display=swap" rel="stylesheet">
`;

const SHARED_STYLES = `
    body, table, tbody, tr, td, div, p, a, span, h1, h2, h3 { font-family: ${EMAIL_FONT_FAMILY} !important; }
    body { font-family: ${EMAIL_FONT_FAMILY}; background-color: #f8fafc; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; margin-top: 40px; margin-bottom: 40px; border: 1px solid #e9eaeb; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.06); }
    .header { background-color: #ffffff; padding: 20px 28px; border-bottom: 1px solid #f1f2f4; }
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

const EMAIL_LOGO_URL = resolvePublicUrl(process.env.EMAIL_LOGO_URL, '/hedwig-logo.png');

const LOGO_HTML = `
<a href="${APP_URL}" style="display:inline-block;text-decoration:none;">
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td style="vertical-align:middle;padding-right:10px;">
        <img
          src="${EMAIL_LOGO_URL}"
          alt="Hedwig"
          width="34"
          height="34"
          style="display:block;width:34px;height:34px;border-radius:8px;border:0;outline:none;text-decoration:none;"
        />
      </td>
      <td style="vertical-align:middle;">
        <span style="font-family:${EMAIL_FONT_FAMILY};font-size:18px;font-weight:700;color:#181d27;letter-spacing:-0.02em;">Hedwig</span>
      </td>
    </tr>
  </table>
</a>
`;

const FOOTER_NOTE = `Sent via <a href="https://hedwig.money">Hedwig</a> &mdash; Payments built for freelancers`;

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

const FREQ_LABELS: Record<string, string> = {
    weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly',
    quarterly: 'quarterly', annual: 'annual',
};

const FREQ_DESCRIPTIONS: Record<string, string> = {
    weekly:    'every week',
    biweekly:  'every two weeks',
    monthly:   'every month',
    quarterly: 'every three months',
    annual:    'once a year',
};

export const EmailService = {
    async sendConversionResearchEmail(data: {
        to: string;
        firstName?: string | null;
        segment: 'inactive' | 'no_invoice' | 'new_never_used';
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping conversion research email.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const name = String(data.firstName || '').trim();
        const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi there,';
        const dashboardUrl = `${APP_URL}/dashboard`;

        const segmentCopy = {
            inactive: {
                subject: 'Quick question about Hedwig',
                eyebrow: 'A quick check-in',
                heading: 'Can I ask what got in the way?',
                body: 'I noticed you have not been back in a while. Was Hedwig missing something you needed, confusing to use, or just not useful right now?',
            },
            no_invoice: {
                subject: 'What stopped you from sending an invoice?',
                eyebrow: 'A quick check-in',
                heading: 'What blocked your first invoice?',
                body: 'I noticed you signed up but have not created an invoice or payment link yet. Was anything unclear, missing, or not worth the effort?',
            },
            new_never_used: {
                subject: 'Did Hedwig miss the mark for you?',
                eyebrow: 'A quick check-in',
                heading: 'Did Hedwig miss the mark?',
                body: 'I noticed you created an account but did not really get started. I would love to know what you expected and what got in the way.',
            },
        }[data.segment];

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(segmentCopy.subject)}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">${escapeHtml(segmentCopy.eyebrow)}</p>
                    <h1 class="heading">${escapeHtml(segmentCopy.heading)}</h1>
                    <p class="description">${greeting}</p>
                    <p class="description">${escapeHtml(segmentCopy.body)}</p>
                    <div style="border:1px solid #e9eaeb;background:#f9fafb;border-radius:14px;padding:16px;margin:22px 0;">
                        <p style="margin:0;color:#414651;font-size:14px;line-height:1.6;">You can just reply to this email with one sentence. I read these personally and use them to decide what we fix next.</p>
                    </div>
                    <div class="btn-container">
                        <a href="${dashboardUrl}" class="btn">Open Hedwig</a>
                    </div>
                    <hr class="divider" />
                    <p style="font-size:13px;color:#717680;line-height:1.6;">Nonso<br />Founder, Hedwig</p>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Nonso from Hedwig <nonso@hedwigbot.xyz>',
                to: [data.to],
                subject: segmentCopy.subject,
                html,
                replyTo: 'nonso@hedwigbot.xyz',
            });
            logger.info('Conversion research email sent', { to: data.to, segment: data.segment });
            return true;
        } catch (error) {
            logger.error('Conversion research email failed', {
                error: error instanceof Error ? error.message : 'Unknown',
                to: data.to,
                segment: data.segment,
            });
            return false;
        }
    },

    async sendAssistantBriefEmail(data: {
        to: string;
        subject: string;
        heading: string;
        eyebrow: string;
        summary: string;
        highlights?: string[];
        stats?: Array<{ label: string; value: string }>;
        ctaPath?: string;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping assistant brief email.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const dashboardUrl = resolvePublicUrl(data.ctaPath || '/dashboard', '/dashboard');
        const stats = (data.stats || []).slice(0, 4);
        const highlights = (data.highlights || []).filter(Boolean).slice(0, 3);
        const statRows = [];
        for (let i = 0; i < stats.length; i += 2) {
            statRows.push(stats.slice(i, i + 2));
        }

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(data.subject)}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">${escapeHtml(data.eyebrow)}</p>
                    <h1 class="heading" style="margin-bottom:12px;">${escapeHtml(data.heading)}</h1>
                    <p class="description" style="margin-bottom:18px;">${escapeHtml(data.summary)}</p>
                    ${stats.length > 0 ? `
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 10px;margin:18px 0 8px;">
                        ${statRows.map((row) => `
                        <tr>
                            ${row.map((stat) => `
                            <td width="50%" style="background:#f9fafb;border:1px solid #e9eaeb;border-radius:12px;padding:14px;vertical-align:top;">
                                <p style="margin:0 0 5px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a4a7ae;">${escapeHtml(stat.label)}</p>
                                <p style="margin:0;font-size:19px;line-height:1.2;font-weight:700;color:#181d27;">${escapeHtml(stat.value)}</p>
                            </td>`).join('<td width="10" style="font-size:0;line-height:0;">&nbsp;</td>')}
                            ${row.length === 1 ? '<td width="10" style="font-size:0;line-height:0;">&nbsp;</td><td width="50%" style="font-size:0;line-height:0;">&nbsp;</td>' : ''}
                        </tr>`).join('')}
                    </table>` : ''}
                    ${highlights.length > 0 ? `
                    <div style="margin:22px 0 8px;">
                        <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a4a7ae;">What matters</p>
                        ${highlights.map((highlight) => `
                        <div style="border-left:3px solid #2563eb;background:#f9fafb;border-radius:0 10px 10px 0;padding:10px 12px;margin-bottom:8px;">
                            <p style="margin:0;color:#414651;font-size:14px;line-height:1.5;">${escapeHtml(highlight)}</p>
                        </div>`).join('')}
                    </div>` : ''}
                    <div class="btn-container">
                        <a href="${dashboardUrl}" class="btn">Open Hedwig</a>
                    </div>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
                to: [data.to],
                subject: data.subject,
                html,
            });
            logger.info('Assistant brief email sent', { to: data.to, subject: data.subject });
            return true;
        } catch (error) {
            logger.error('Assistant brief email failed', { error: error instanceof Error ? error.message : 'Unknown', to: data.to });
            return false;
        }
    },

    async sendRecurringSetupEmail(data: {
        to: string;
        senderName: string;
        amount: string;
        currency: string;
        frequency: string;
        title?: string;
        startDate?: string;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const freqLabel = FREQ_LABELS[data.frequency] || data.frequency;
        const freqDesc = FREQ_DESCRIPTIONS[data.frequency] || data.frequency;
        const capFreq = freqLabel.charAt(0).toUpperCase() + freqLabel.slice(1);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Recurring invoice from ${data.senderName}</title>
            ${EMAIL_FONT_HEAD}
            <style>
                ${SHARED_STYLES}
                .recurring-badge { display: inline-block; background-color: #fdf4ff; border: 1px solid #e9d5ff; border-radius: 50px; padding: 5px 14px; font-size: 12px; font-weight: 700; color: #9333ea; letter-spacing: 0.04em; text-transform: uppercase; }
                .info-row { padding: 10px 0; border-bottom: 1px solid #f1f2f4; }
                .info-row:last-child { border-bottom: none; }
                .info-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #a4a7ae; margin-bottom: 3px; }
                .info-value { font-size: 14px; color: #181d27; font-weight: 600; }
            </style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">
                    ${LOGO_HTML}
                </div>
                <div class="content">
                    <p class="eyebrow">Recurring Invoice</p>
                    <h1 class="heading">You're on a recurring invoice</h1>
                    <p class="description">
                        <strong style="color:#181d27;">${data.senderName}</strong> has set up a recurring invoice with you.
                        You'll be invoiced <strong style="color:#181d27;">${freqDesc}</strong> — here's what to expect.
                    </p>

                    <div class="card" style="text-align:left;">
                        <div style="text-align:center; margin-bottom: 20px;">
                            <span class="recurring-badge">&#x21bb;&nbsp; ${capFreq} recurring</span>
                        </div>
                        <div class="info-row">
                            <p class="info-label">Amount per invoice</p>
                            <p class="info-value">${data.amount} <span style="color:#717680;font-weight:500;">${data.currency}</span></p>
                        </div>
                        <div class="info-row">
                            <p class="info-label">Frequency</p>
                            <p class="info-value">${capFreq}</p>
                        </div>
                        ${data.title ? `
                        <div class="info-row">
                            <p class="info-label">For</p>
                            <p class="info-value">${data.title}</p>
                        </div>` : ''}
                        ${data.startDate ? `
                        <div class="info-row">
                            <p class="info-label">First invoice</p>
                            <p class="info-value">${data.startDate}</p>
                        </div>` : ''}
                    </div>

                    <p class="description">Each invoice will arrive on schedule with a payment link. You don't need to do anything right now — just watch for your first invoice.</p>
                    <p class="description" style="font-size:13px; color:#a4a7ae;">To opt out or discuss this arrangement, reply to this email or contact ${data.senderName} directly.</p>
                </div>
                <div class="footer">
                    <p>${FOOTER_NOTE}</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
                to: [data.to],
                subject: `${capFreq} invoicing set up by ${data.senderName}`,
                html,
            });
            logger.info('Recurring setup email sent', { frequency: data.frequency });
            return true;
        } catch (error) {
            logger.error('Recurring setup email failed', { error: error instanceof Error ? error.message : 'Unknown', to: data.to });
            return false;
        }
    },

    async sendInvoiceEmail(data: EmailData): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const invoiceUrl = resolvePublicUrl(data.paymentUrl, `/invoice/${data.linkId}`);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invoice from ${data.senderName}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">
                    ${LOGO_HTML}
                </div>
                <div class="content">
                    <p class="eyebrow">Invoice</p>
                    <h1 class="heading">You have a new invoice</h1>
                    <p class="description"><strong style="color:#181d27;">${data.senderName}</strong> has sent you an invoice. Please review it and pay by the due date.</p>

                    <div class="card">
                        <p class="amount-label">Amount Due</p>
                        <p class="amount-value">${data.amount} <span class="amount-currency">${data.currency}</span></p>
                    </div>

                    ${data.description ? `<p class="description" style="text-align:center;">${data.description}</p>` : ''}

                    <div class="btn-container">
                        <a href="${invoiceUrl}" class="btn">View &amp; Pay Invoice</a>
                    </div>
                </div>
                <div class="footer">
                    <p>${FOOTER_NOTE}</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
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
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const paymentUrl = resolvePublicUrl(data.paymentUrl, `/pay/${data.linkId}`);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment request from ${data.senderName}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">
                    ${LOGO_HTML}
                </div>
                <div class="content">
                    <p class="eyebrow">Payment Request</p>
                    <h1 class="heading">You have a payment request</h1>
                    <p class="description"><strong style="color:#181d27;">${data.senderName}</strong> has sent you a payment request.</p>

                    <div class="card">
                        <p class="amount-label">Amount Requested</p>
                        <p class="amount-value">${data.amount} <span class="amount-currency">${data.currency}</span></p>
                    </div>

                    ${data.description ? `<p class="description" style="text-align:center;">${data.description}</p>` : ''}

                    <div class="btn-container">
                        <a href="${paymentUrl}" class="btn">Pay Now</a>
                    </div>
                </div>
                <div class="footer">
                    <p>${FOOTER_NOTE}</p>
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
        const receiptUrl = resolvePublicUrl(undefined, `/receipt/${data.linkId}`);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment received</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">
                    ${LOGO_HTML}
                </div>
                <div class="content">
                    <p class="eyebrow">Payment Received</p>
                    <h1 class="heading">You got paid!</h1>
                    <p class="description">Hi <strong style="color:#181d27;">${data.recipientName}</strong>, you've successfully received a payment${data.senderName ? ` from <strong style="color:#181d27;">${data.senderName}</strong>` : ''}.</p>

                    <div class="card">
                        <p class="amount-label">Amount Received</p>
                        <p class="amount-value">${data.amount} <span class="amount-currency">${data.currency}</span></p>
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
                    <p>${FOOTER_NOTE}</p>
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
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">
                    ${LOGO_HTML}
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
                    <p>${FOOTER_NOTE}</p>
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
        const contractUrl = resolvePublicUrl(undefined, `/contract/${data.contractId}?token=${data.approvalToken}`);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Contract from ${data.senderName}</title>
            ${EMAIL_FONT_HEAD}
            <style>
                ${SHARED_STYLES}
                .milestone-pill { display: inline-block; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 50px; padding: 5px 14px; font-size: 13px; color: #2563eb; font-weight: 600; margin-top: 14px; }
            </style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">
                    ${LOGO_HTML}
                </div>
                <div class="content">
                    <p class="eyebrow">Contract</p>
                    <h1 class="heading">You have a contract to review</h1>
                    <p class="description"><strong style="color:#181d27;">${data.senderName}</strong> has sent you a contract for review and approval.</p>

                    <div class="card">
                        <p class="amount-label">Contract</p>
                        <p style="font-size: 20px; color: #181d27; font-weight: 700; margin: 0; letter-spacing: -0.02em;">${data.contractTitle}</p>
                        ${data.totalAmount ? `<p style="margin-top: 10px; font-size: 28px; color: #181d27; font-weight: 700; letter-spacing: -0.03em;">${data.totalAmount}</p>` : ''}
                        ${data.milestoneCount ? `<span class="milestone-pill">${data.milestoneCount} milestone${data.milestoneCount > 1 ? 's' : ''}</span>` : ''}
                    </div>

                    <p class="description">Review the full contract and approve it when you're ready to proceed.</p>

                    <div class="btn-container">
                        <a href="${contractUrl}" class="btn">Review &amp; Approve Contract</a>
                    </div>
                </div>
                <div class="footer">
                    <p>${FOOTER_NOTE}</p>
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
        const contractUrl = resolvePublicUrl(undefined, `/contract/${data.contractId}`);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Contract approved</title>
            ${EMAIL_FONT_HEAD}
            <style>
                ${SHARED_STYLES}
                .success-badge { display: inline-block; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 50px; padding: 6px 16px; font-size: 13px; font-weight: 700; color: #16a34a; letter-spacing: 0.02em; }
            </style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">
                    ${LOGO_HTML}
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
                    <p>${FOOTER_NOTE}</p>
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
        const proposalUrl = resolvePublicUrl(undefined, `/proposal/${data.proposalId}`);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Proposal from ${data.freelancerName}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">
                    ${LOGO_HTML}
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
                    <p>${FOOTER_NOTE}</p>
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

    async sendRecurringInvoiceEmail(data: EmailData & {
        frequency: string;
        generationNumber: number;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping email sending.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const invoiceUrl = resolvePublicUrl(data.paymentUrl, `/invoice/${data.linkId}`);
        const freqLabel = FREQ_LABELS[data.frequency] || data.frequency;
        const ordinal = (n: number) => {
            const s = ['th','st','nd','rd'], v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invoice from ${data.senderName}</title>
            ${EMAIL_FONT_HEAD}
            <style>
                ${SHARED_STYLES}
                .recurring-badge { display: inline-block; background-color: #fdf4ff; border: 1px solid #e9d5ff; border-radius: 50px; padding: 5px 14px; font-size: 12px; font-weight: 700; color: #9333ea; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 16px; }
            </style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">
                    ${LOGO_HTML}
                </div>
                <div class="content">
                    <p class="eyebrow">Recurring Invoice</p>
                    <h1 class="heading">Your ${ordinal(data.generationNumber)} ${freqLabel} invoice</h1>
                    <p class="description"><strong style="color:#181d27;">${data.senderName}</strong> has sent you a recurring invoice. This is the ${ordinal(data.generationNumber)} invoice in your ${freqLabel} arrangement.</p>

                    <div class="card">
                        <span class="recurring-badge">&#x21bb;&nbsp; ${freqLabel.charAt(0).toUpperCase() + freqLabel.slice(1)}</span>
                        <p class="amount-label" style="margin-top:12px;">Amount Due</p>
                        <p class="amount-value">${data.amount} <span class="amount-currency">${data.currency}</span></p>
                    </div>

                    ${data.description ? `<p class="description" style="text-align:center;">${data.description}</p>` : ''}

                    <div class="btn-container">
                        <a href="${invoiceUrl}" class="btn">View &amp; Pay Invoice</a>
                    </div>
                </div>
                <div class="footer">
                    <p>${FOOTER_NOTE}</p>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
                to: [data.to],
                subject: `${ordinal(data.generationNumber)} ${freqLabel.charAt(0).toUpperCase() + freqLabel.slice(1)} Invoice from ${data.senderName}`,
                html: html,
            });
            logger.info('Recurring invoice email sent', { generationNumber: data.generationNumber, frequency: data.frequency });
            return true;
        } catch (error) {
            logger.error('Recurring invoice email failed', { error: error instanceof Error ? error.message : 'Unknown', to: data.to });
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
        const proposalUrl = resolvePublicUrl(undefined, `/proposal/${data.proposalId}`);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Proposal accepted</title>
            ${EMAIL_FONT_HEAD}
            <style>
                ${SHARED_STYLES}
                .success-badge { display: inline-block; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 50px; padding: 6px 16px; font-size: 13px; font-weight: 700; color: #16a34a; letter-spacing: 0.02em; }
            </style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">
                    ${LOGO_HTML}
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
                    <p>${FOOTER_NOTE}</p>
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
    },

    async sendAccountDeletionEmail(data: {
        to: string;
        firstName: string;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping account deletion email.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const name = data.firstName || 'there';

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Your Hedwig account has been deleted</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Account</p>
                    <h1 class="heading">Your account has been deleted</h1>
                    <p class="description">Hi ${name}, this email confirms that your Hedwig account and all associated data have been permanently deleted as requested.</p>
                    <p class="description">If you did not request this or believe this was a mistake, please contact our support team immediately at <a href="mailto:support@hedwigbot.xyz" style="color:#2563eb;text-decoration:none;">support@hedwigbot.xyz</a>.</p>
                    <hr class="divider" />
                    <p style="font-size:13px;color:#a4a7ae;line-height:1.6;">Thank you for using Hedwig. We hope to see you again in the future.</p>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
                to: [data.to],
                subject: 'Your Hedwig account has been deleted',
                html,
            });
            logger.info('Account deletion email sent', { to: data.to });
            return true;
        } catch (error) {
            logger.error('Account deletion email failed', { error: error instanceof Error ? error.message : 'Unknown' });
            return false;
        }
    },

    async sendAppDownloadEmail(data: {
        to: string;
        firstName: string;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping app download email.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const name = data.firstName || 'there';

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Get the Hedwig app</title>
            ${EMAIL_FONT_HEAD}
            <style>
                ${SHARED_STYLES}
                .store-btn { display:inline-block; background-color:#000000; color:#ffffff !important; font-weight:600; padding:11px 24px; border-radius:12px; text-decoration:none; font-size:14px; letter-spacing:-0.01em; }
                .store-row { text-align:center; margin-top:28px; display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
                .store-label { font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; opacity:0.7; display:block; margin-bottom:2px; }
                .store-name { font-size:17px; font-weight:700; display:block; letter-spacing:-0.01em; }
            </style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Mobile App</p>
                    <h1 class="heading">Hedwig is better on mobile</h1>
                    <p class="description">Hi ${name}, get the full Hedwig experience on your phone — send invoices, track payments, and manage clients from anywhere.</p>
                    <div class="store-row">
                        <a href="https://testflight.apple.com/join/aKXnyjP4n" class="store-btn" style="text-decoration:none;">
                            <span class="store-label">Download on</span>
                            <span class="store-name">TestFlight</span>
                        </a>
                        <a href="https://play.google.com/store/apps/details?id=com.hedwig.app" class="store-btn" style="text-decoration:none;">
                            <span class="store-label">Get it on</span>
                            <span class="store-name">Google Play</span>
                        </a>
                    </div>
                    <hr class="divider" />
                    <p style="font-size:13px;color:#a4a7ae;line-height:1.6;">You're receiving this because you recently created a Hedwig account.</p>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
                to: [data.to],
                subject: 'Get the Hedwig mobile app',
                html,
            });
            logger.info('App download email sent', { to: data.to });
            return true;
        } catch (error) {
            logger.error('App download email failed', { error: error instanceof Error ? error.message : 'Unknown' });
            return false;
        }
    },

    async sendOnboardingIncompleteEmail(data: {
        to: string;
        firstName: string;
        isSecondNudge?: boolean;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping onboarding nudge email.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const name = data.firstName || 'there';
        const dashboardUrl = `${APP_URL}/dashboard`;

        const subject = data.isSecondNudge
            ? 'Your Hedwig workspace is waiting'
            : 'Get started with Hedwig';

        const heading = data.isSecondNudge
            ? 'Your workspace is waiting'
            : 'Get started with Hedwig';

        const body = data.isSecondNudge
            ? `Hi ${name}, you set up your Hedwig account but haven't added any clients or sent an invoice yet. Your workspace is ready — it only takes a minute to send your first payment request.`
            : `Hi ${name}, welcome to Hedwig! Your account is set up and ready to go. Add your first client and send an invoice to start getting paid faster.`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${subject}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Getting started</p>
                    <h1 class="heading">${heading}</h1>
                    <p class="description">${body}</p>
                    <div class="btn-container">
                        <a href="${dashboardUrl}" class="btn">Open Hedwig</a>
                    </div>
                    <hr class="divider" />
                    <p style="font-size:13px;color:#a4a7ae;line-height:1.6;">You're receiving this because you recently created a Hedwig account. If you'd rather not hear from us, you can ignore this email.</p>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwigbot.xyz>',
                to: [data.to],
                subject,
                html,
            });
            logger.info('Onboarding nudge email sent', { to: data.to, isSecondNudge: data.isSecondNudge });
            return true;
        } catch (error) {
            logger.error('Onboarding nudge email failed', { error: error instanceof Error ? error.message : 'Unknown' });
            return false;
        }
    },
};
