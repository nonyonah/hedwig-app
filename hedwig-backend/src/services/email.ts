
import { Resend } from 'resend';
import { createLogger } from '../utils/logger';
import { supabase } from '../lib/supabase';

const logger = createLogger('EmailService');

const DEFAULT_PUBLIC_APP_URL = 'https://hedwig.riftlabs.xyz';
const RAW_APP_URL = process.env.APP_URL || process.env.WEB_CLIENT_URL || DEFAULT_PUBLIC_APP_URL;

const canonicalizePublicUrl = (input?: string | null): string => {
    const raw = String(input || '').trim();
    if (!raw) return DEFAULT_PUBLIC_APP_URL;

    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
        const url = new URL(normalized);
        const hostname = url.hostname.toLowerCase();
        if (hostname === 'hedwig.riftlabs.xyz' || hostname === 'hedwig.riftlabs.xyz' || hostname === 'www.hedwig.riftlabs.xyz') {
            url.hostname = 'hedwig.riftlabs.xyz';
        }
        return url.toString().replace(/\/+$/, '');
    } catch {
        return DEFAULT_PUBLIC_APP_URL;
    }
};

const APP_URL = canonicalizePublicUrl(RAW_APP_URL);
const EMAIL_ASSET_BASE_URL = canonicalizePublicUrl(
    process.env.EMAIL_ASSET_BASE_URL ||
    process.env.API_PUBLIC_URL ||
    'https://pay.riftlabs.xyz'
);

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
    .btn { display: inline-block; background-color: #0d47a1; color: #ffffff !important; font-weight: 600; padding: 13px 32px; line-height: 1.4; border-radius: 50px; text-decoration: none; font-size: 15px; letter-spacing: -0.01em; mso-padding-alt: 0; }
    .footer { background-color: #f9fafb; padding: 20px 28px; text-align: center; font-size: 12px; color: #a4a7ae; border-top: 1px solid #f1f2f4; }
    .footer a { color: #717680; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
`;

const EMAIL_LOGO_URL = resolvePublicUrl(process.env.EMAIL_LOGO_URL, '/hedwig-logo.png');
const EMAIL_APPLE_LOGO_URL = `${EMAIL_ASSET_BASE_URL}/assets/email/apple-logo-white.png`;
const EMAIL_GOOGLE_PLAY_BADGE_URL = `${EMAIL_ASSET_BASE_URL}/assets/email/google-play-badge.png`;

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
    async sendClientMessageEmail(data: {
        to: string;
        clientName: string;
        senderName: string;
        senderEmail?: string | null;
        subject: string;
        message: string;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping client message email.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const subject = String(data.subject || '').trim().slice(0, 160) || `Message from ${data.senderName}`;
        const paragraphs = String(data.message || '')
            .trim()
            .split(/\n{2,}/)
            .map((part) => part.trim())
            .filter(Boolean)
            .slice(0, 12);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(subject)}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Client message</p>
                    <h1 class="heading" style="margin-bottom:12px;">${escapeHtml(subject)}</h1>
                    <p class="description"><strong style="color:#181d27;">${escapeHtml(data.senderName)}</strong> sent you a message through Hedwig.</p>
                    <div style="border:1px solid #e9eaeb;background:#ffffff;border-radius:14px;padding:18px 18px;margin:20px 0;">
                        ${paragraphs.map((paragraph) => `<p style="margin:0 0 14px;color:#414651;font-size:15px;line-height:1.65;white-space:pre-line;">${escapeHtml(paragraph)}</p>`).join('')}
                    </div>
                    ${data.senderEmail ? `<p style="font-size:13px;color:#717680;line-height:1.6;">Reply directly to this email to reach ${escapeHtml(data.senderName)}.</p>` : ''}
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject,
                html,
                replyTo: data.senderEmail || undefined,
            });
            logger.info('Client message email sent', { to: data.to });
            return true;
        } catch (error) {
            logger.error('Client message email failed', {
                error: error instanceof Error ? error.message : 'Unknown',
                to: data.to,
            });
            return false;
        }
    },

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
                from: 'Nonso from Hedwig <nonso@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject: segmentCopy.subject,
                html,
                replyTo: 'nonso@hedwig.riftlabs.xyz',
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
                        <div style="border-left:3px solid #0d47a1;background:#f9fafb;border-radius:0 10px 10px 0;padding:10px 12px;margin-bottom:8px;">
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
                        Tx: <a href="https://basescan.org/tx/${data.txHash}" style="color: #0d47a1; text-decoration: none; font-family: monospace;">${data.txHash.substring(0, 10)}...${data.txHash.substring(data.txHash.length - 6)}</a>
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
                .milestone-pill { display: inline-block; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 50px; padding: 5px 14px; font-size: 13px; color: #0d47a1; font-weight: 600; margin-top: 14px; }
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
                    <p class="description">If you did not request this or believe this was a mistake, please contact our support team immediately at <a href="mailto:support@hedwig.riftlabs.xyz" style="color:#0d47a1;text-decoration:none;">support@hedwig.riftlabs.xyz</a>.</p>
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
        const reminderLines = [
            'Use the mobile app when you need to access your available balance or send money to your bank account.',
            'The mobile app is the quickest way to manage funds after a client pays you.',
            'Keep the mobile app close for withdrawals, payment alerts, invoices, and client activity.',
        ];
        const reminderLine = reminderLines[Math.floor(Math.random() * reminderLines.length)] || reminderLines[0];

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
                .feature-list { margin:22px 0 0; padding:0; list-style:none; }
                .feature-list li { margin:10px 0; color:#535862; font-size:14px; line-height:1.55; }
                .store-row { text-align:center; margin-top:28px; }
                .store-btn { display:inline-block; width:172px; background-color:#000000; color:#ffffff !important; border-radius:13px; text-decoration:none; padding:9px 14px; margin:0 5px 10px; }
                .store-table { border-collapse:collapse; margin:0 auto; }
                .store-icon { width:28px; padding-right:10px; vertical-align:middle; }
                .store-text { text-align:left; vertical-align:middle; }
                .store-label { font-size:10px; font-weight:600; letter-spacing:0.02em; line-height:1.1; opacity:0.78; display:block; }
                .store-name { font-size:17px; font-weight:700; line-height:1.15; display:block; letter-spacing:-0.02em; }
                .store-logo { display:block; border:0; outline:none; text-decoration:none; }
                .play-store-badge { display:block; width:172px; height:auto; border:0; margin:0 auto; }
            </style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Mobile App</p>
                    <h1 class="heading">Hedwig is better on mobile</h1>
                    <p class="description">Hi ${name}, get the full Hedwig experience on your phone. The mobile app is where you can access your funds, send money to your bank account, and manage payments on the go.</p>
                    <p class="description">${reminderLine}</p>
                    <ul class="feature-list">
                        <li>• Access your available balance and withdraw to supported bank accounts.</li>
                        <li>• Send invoices and payment links from anywhere.</li>
                        <li>• Track clients, payments, reminders, and activity in one place.</li>
                    </ul>
                    <div class="store-row">
                        <a href="https://testflight.apple.com/join/aKXnyjP4" class="store-btn" style="text-decoration:none;">
                            <table role="presentation" class="store-table">
                                <tr>
                                    <td class="store-icon">
                                        <img src="${EMAIL_APPLE_LOGO_URL}" width="24" height="24" alt="" class="store-logo" />
                                    </td>
                                    <td class="store-text">
                                        <span class="store-label">Join beta on</span>
                                        <span class="store-name">TestFlight</span>
                                    </td>
                                </tr>
                            </table>
                        </a>
                        <a href="https://play.google.com/store/apps/details?id=com.hedwig.app" style="display:inline-block;margin:0 5px 10px;text-decoration:none;">
                            <img src="${EMAIL_GOOGLE_PLAY_BADGE_URL}" width="172" alt="Get it on Google Play" class="play-store-badge" />
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
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
        nudgeStage?: 'day0' | 'day3' | 'day7' | 'day14';
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping onboarding nudge email.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const nudgeStage = data.nudgeStage || (data.isSecondNudge ? 'day3' : 'day0');

        const stageConfig: Record<string, {
            subject: string;
            eyebrow: string;
            heading: string;
            body: string;
            cta: string;
            url: string;
        }> = {
            day0: {
                subject: 'Your business account is ready',
                eyebrow: 'Getting started',
                heading: 'Your business account is ready',
                body: `You built something worth paying for. Hedwig is your financial OS — receive payments, track time and expenses, manage clients, and run payroll without juggling tools. Create an invoice, import a bank statement, or set up your first project.`,
                cta: 'Open your treasury',
                url: `https://hedwig.riftlabs.xyz/dashboard`,
            },
            day3: {
                subject: 'More than just getting paid',
                eyebrow: 'The full picture',
                heading: 'More than just getting paid',
                body: `Hedwig auto-categorizes your income and expenses, tracks time against projects, and lets you run payroll for your team. Try importing a bank statement or setting up a project — both take less than two minutes.`,
                cta: 'Try something new',
                url: `https://hedwig.riftlabs.xyz/dashboard`,
            },
            day7: {
                subject: 'Your business, connected',
                eyebrow: 'What\'s possible',
                heading: 'Your business, connected',
                body: `Link your bank statements to auto-categorize transactions, assign projects to team members, sync deadlines from Google Calendar, or set up a recurring payroll run. Hedwig works the way you work.`,
                cta: 'Explore your workspace',
                url: `https://hedwig.riftlabs.xyz/dashboard`,
            },
            day14: {
                subject: 'One last thing',
                eyebrow: 'One last thing',
                heading: 'One last thing',
                body: `You signed up two weeks ago and haven't tried Hedwig yet. That's fine. But if you're still juggling different tools for payments, time tracking, expenses, and payroll — give it two minutes. Import a statement, log time against a project, or send your first invoice. See if it fits.`,
                cta: 'Give it two minutes',
                url: `https://hedwig.riftlabs.xyz/dashboard`,
            },
        };

        const config = stageConfig[nudgeStage] || stageConfig.day0;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${config.subject}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">${config.eyebrow}</p>
                    <h1 class="heading">${config.heading}</h1>
                    <p class="description">${config.body}</p>
                    <div class="btn-container">
                        <a href="${config.url}" class="btn">${config.cta}</a>
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
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject: config.subject,
                html,
            });
            logger.info('Onboarding nudge email sent', { to: data.to, nudgeStage });
            return true;
        } catch (error) {
            logger.error('Onboarding nudge email failed', { error: error instanceof Error ? error.message : 'Unknown' });
            return false;
        }
    },

    async sendPostSignupNudgeEmail(data: {
        to: string;
        firstName: string;
        day: 1 | 4 | 7 | 14;
        segment: 'a_never_opened' | 'b_incomplete' | 'c_no_transaction';
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping post-signup nudge email.');
            return false;
        }
        const resend = new Resend(process.env.RESEND_API_KEY);
        const name = data.firstName || 'there';

        const dayConfig: Record<number, {
            subject: string;
            subjectLine: string;
            body: string;
            cta: string;
            ctaUrl: string;
            from: string;
            fromName: string;
        }> = {
            1: {
                subject: `Your Hedwig account is ready`,
                subjectLine: `Hey ${name}, your Hedwig account is ready 👋`,
                body: `You're all set up. Takes about 2 minutes to get started.`,
                cta: 'Get started',
                ctaUrl: `${APP_URL}/dashboard`,
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                fromName: 'Hedwig',
            },
            4: {
                subject: 'Pick up where you left off',
                subjectLine: `Hey ${name}, pick up where you left off`,
                body: `You were getting started with Hedwig. Want to finish setting up?`,
                cta: 'Resume setup',
                ctaUrl: `${APP_URL}/dashboard`,
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                fromName: 'Hedwig',
            },
            7: {
                subject: 'Try it with a real one',
                subjectLine: `Hey ${name}, try it with a real one`,
                body: `Your account is ready to go. Send a real invoice or payment link and see how it works.`,
                cta: 'Send your first invoice',
                ctaUrl: `${APP_URL}/dashboard`,
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                fromName: 'Hedwig',
            },
            14: {
                subject: "What's missing?",
                subjectLine: `Hey ${name}, what's missing?`,
                body: `No pressure, but if something didn't work or you're not sure how to use Hedwig, just reply and tell me. I read these myself.`,
                cta: 'Reply to this email',
                ctaUrl: `mailto:nonso@hedwig.riftlabs.xyz`,
                from: 'Nonso from Hedwig <nonso@hedwig.riftlabs.xyz>',
                fromName: 'Nonso from Hedwig',
            },
        };

        const config = dayConfig[data.day] || dayConfig[1];

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${config.subject}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">${config.subject}</p>
                    <h1 class="heading">${config.subjectLine}</h1>
                    <p class="description">${config.body}</p>
                    <div class="btn-container">
                        <a href="${config.ctaUrl}" class="btn">${config.cta}</a>
                    </div>
                    <hr class="divider" />
                    <p style="font-size:13px;color:#a4a7ae;line-height:1.6;">You're receiving this because you created a Hedwig account. If you'd rather not hear from us, you can ignore this email.</p>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: config.from,
                to: [data.to],
                subject: config.subject,
                html,
            });
            logger.info('Post-signup nudge email sent', { to: data.to, day: data.day, segment: data.segment });
            return true;
        } catch (error) {
            logger.error('Post-signup nudge email failed', {
                error: error instanceof Error ? error.message : 'Unknown',
                to: data.to,
                day: data.day,
            });
            return false;
        }
    },

    /**
     * Notify the user via email about a Circle Gateway event (deposit
     * finalized, transfer in flight, transfer delivered). Acts as the push
     * fallback so users still get confirmation when push delivery fails.
     * CTA deep-links into the mobile app via `hedwig://` scheme.
     */
    async sendAggregatedUsdcEmail(data: {
        to: string;
        firstName?: string | null;
        kind: 'deposit_finalized' | 'mint_forwarded' | 'mint_finalized';
        amount?: string | null;
        chain?: string | null;
        txHash?: string | null;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping Aggregated USDC email.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const name = String(data.firstName || '').trim();
        const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi there,';
        const amountLabel = data.amount ? `${escapeHtml(data.amount)} USDC` : 'Your USDC';
        const chainLabel = data.chain ? ` on ${escapeHtml(data.chain)}` : '';

        const copy = (() => {
            switch (data.kind) {
                case 'deposit_finalized':
                    return {
                        subject: 'USDC added to your Aggregated USDC balance',
                        eyebrow: 'Aggregated USDC',
                        heading: 'Your deposit landed',
                        body: `${amountLabel} deposited${chainLabel} is now part of your Aggregated USDC balance and spendable across every supported chain.`,
                    };
                case 'mint_forwarded':
                    return {
                        subject: 'Aggregated USDC transfer in flight',
                        eyebrow: 'Aggregated USDC',
                        heading: 'Transfer in flight',
                        body: `${amountLabel} is being delivered${chainLabel}. We're tracking confirmation and will notify you the moment it lands.`,
                    };
                case 'mint_finalized':
                    return {
                        subject: 'Aggregated USDC delivered',
                        eyebrow: 'Aggregated USDC',
                        heading: 'Transfer delivered',
                        body: `${amountLabel} arrived${chainLabel}.${data.txHash ? ` Tx ${escapeHtml(data.txHash.slice(0, 12))}…` : ''}`,
                    };
            }
        })();

        // Expo Router resolves bare `hedwig://` to the app's initial route.
        // The mobile auth gate routes the user to the wallet tab once they
        // are signed in, so this is the most reliable deep link.
        const deepLink = 'hedwig://';
        const fallbackUrl = `${APP_URL}/wallet`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(copy.subject)}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">${escapeHtml(copy.eyebrow)}</p>
                    <h1 class="heading">${escapeHtml(copy.heading)}</h1>
                    <p class="description">${greeting}</p>
                    <p class="description">${copy.body}</p>
                    <div class="btn-container">
                        <a href="${deepLink}" class="btn">Open in Hedwig app</a>
                    </div>
                    <p style="margin-top:14px;font-size:12px;color:#717680;text-align:center;">
                        Don't have the app installed?
                        <a href="${fallbackUrl}" style="color:#0d47a1;">Open on web</a>
                    </p>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject: copy.subject,
                html,
            });
            logger.info('Aggregated USDC email sent', { to: data.to, kind: data.kind });
            return true;
        } catch (error) {
            logger.error('Aggregated USDC email failed', {
                error: error instanceof Error ? error.message : 'Unknown',
                to: data.to,
                kind: data.kind,
            });
            return false;
        }
    },

    async sendKycApprovedEmail(data: {
        to: string;
        firstName?: string | null;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping KYC approved email.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const name = String(data.firstName || '').trim();
        const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi there,';
        const deepLink = 'hedwig://';
        const fallbackUrl = `${APP_URL}/settings`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Your Hedwig verification is approved</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Verification approved</p>
                    <h1 class="heading">You are verified</h1>
                    <p class="description">${greeting}</p>
                    <p class="description">Your identity verification has been approved. You can now use supported withdrawals and payout features in Hedwig.</p>
                    <div class="btn-container">
                        <a href="${deepLink}" class="btn">Open Hedwig</a>
                    </div>
                    <p style="margin-top:14px;font-size:12px;color:#717680;text-align:center;">
                        Prefer web?
                        <a href="${fallbackUrl}" style="color:#0d47a1;">Open settings</a>
                    </p>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject: 'Your Hedwig verification is approved',
                html,
            });
            logger.info('KYC approved email sent', { to: data.to });
            return true;
        } catch (error) {
            logger.error('KYC approved email failed', {
                error: error instanceof Error ? error.message : 'Unknown',
                to: data.to,
            });
            return false;
        }
    },

    async sendUsdVirtualAccountReadyEmail(data: {
        to: string;
        firstName?: string | null;
        bankName?: string | null;
        accountNumberMasked?: string | null;
        routingNumberMasked?: string | null;
        currency?: string | null;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping USD virtual account ready email.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const name = String(data.firstName || '').trim();
        const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi there,';
        const currency = String(data.currency || 'USD').toUpperCase();
        const fallbackUrl = `${APP_URL}/wallet`;
        const detailsHtml = [
            data.bankName ? ['Bank', data.bankName] : null,
            data.accountNumberMasked ? ['Account', data.accountNumberMasked] : null,
            data.routingNumberMasked ? ['Routing', data.routingNumberMasked] : null,
        ].filter(Boolean).map((item) => {
            const [label, value] = item as string[];
            return `<tr><td style="padding:8px 0;color:#717680;font-size:13px;">${escapeHtml(label)}</td><td style="padding:8px 0;color:#181d27;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(value)}</td></tr>`;
        }).join('');

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Your ${escapeHtml(currency)} account is ready</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">${escapeHtml(currency)} account</p>
                    <h1 class="heading">Your account details are ready</h1>
                    <p class="description">${greeting}</p>
                    <p class="description">Your ${escapeHtml(currency)} receiving account has been generated. You can now share these details to receive bank transfers into Hedwig.</p>
                    ${detailsHtml ? `<div style="border:1px solid #e9eaeb;background:#f9fafb;border-radius:14px;padding:16px;margin:20px 0;"><table style="width:100%;border-collapse:collapse;">${detailsHtml}</table></div>` : ''}
                    <div class="btn-container">
                        <a href="hedwig://" class="btn">Open Hedwig app</a>
                    </div>
                    <p style="margin-top:14px;font-size:12px;color:#717680;text-align:center;">
                        Prefer web?
                        <a href="${fallbackUrl}" style="color:#0d47a1;">Open wallet</a>
                    </p>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject: `Your ${currency} account is ready`,
                html,
            });
            logger.info('USD virtual account ready email sent', { to: data.to, currency });
            return true;
        } catch (error) {
            logger.error('USD virtual account ready email failed', {
                error: error instanceof Error ? error.message : 'Unknown',
                to: data.to,
            });
            return false;
        }
    },

    async sendWorkspaceInvitationEmail(data: {
        to: string;
        workspaceName: string;
        inviterName: string;
        role: string;
        invitationToken: string;
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping workspace invitation email.');
            return false;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const inviteUrl = `${APP_URL}/join?token=${encodeURIComponent(data.invitationToken)}`;
        const roleLabel = data.role === 'admin' ? 'Admin' : 'Member';

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(data.inviterName)} invited you to ${escapeHtml(data.workspaceName)}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Workspace invitation</p>
                    <h1 class="heading">${escapeHtml(data.inviterName)} invited you to ${escapeHtml(data.workspaceName)}</h1>
                    <p class="description">
                        ${escapeHtml(data.inviterName)} has invited you to join <strong>${escapeHtml(data.workspaceName)}</strong> as a <strong>${escapeHtml(roleLabel)}</strong> on Hedwig.
                    </p>
                    <p class="description">
                        With Hedwig, you can run your business together — manage clients and projects, track time, run payroll, reconcile expenses, and get paid in stablecoins, all from one account.
                    </p>
                    <div style="text-align:center;margin:28px 0;">
                        <a href="${inviteUrl}" style="display:inline-block;background-color:#0d47a1;color:#ffffff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none;">
                            Join workspace
                        </a>
                    </div>
                    <p class="description" style="font-size:13px;color:#717680;">
                        This invitation expires in 7 days. If you were not expecting this, you can safely ignore it.
                    </p>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject: `${escapeHtml(data.inviterName)} invited you to ${escapeHtml(data.workspaceName)}`,
                html,
            });
            logger.info('Workspace invitation email sent', { to: data.to, workspace: data.workspaceName });
            return true;
        } catch (error) {
            logger.error('Workspace invitation email failed', {
                error: error instanceof Error ? error.message : 'Unknown',
                to: data.to,
            });
            return false;
        }
    },

    async sendProjectCompletedEmail(data: {
        to: string;
        memberName: string;
        projectName: string;
        payoutAmount: number;
    }): Promise<void> {
        if (!process.env.RESEND_API_KEY) return;
        const resend = new Resend(process.env.RESEND_API_KEY);
        const payoutStr = data.payoutAmount > 0 ? `Your payout: $${data.payoutAmount.toLocaleString()}` : '';
        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject: `"${escapeHtml(data.projectName)}" has been completed`,
                html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                    <h2 style="color:#181d27">Project completed</h2>
                    <p><strong>${escapeHtml(data.projectName)}</strong> has been completed. ${escapeHtml(payoutStr)}</p>
                </div>`,
            });
        } catch (error) {
            logger.error('Project completed email failed', { error: (error as Error).message });
        }
    },

    async sendPayoutEmail(data: {
        to: string;
        memberName: string;
        amount: number;
        workspaceName: string;
        reason?: string;
    }): Promise<void> {
        if (!process.env.RESEND_API_KEY) return;
        const resend = new Resend(process.env.RESEND_API_KEY);
        const reasonStr = data.reason ? `for ${escapeHtml(data.reason)}` : '';
        const walletUrl = `${APP_URL}/wallet`;
        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject: `You received $${data.amount.toLocaleString()} USDC from ${escapeHtml(data.workspaceName)}`,
                html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                    <h2 style="color:#181d27;margin-bottom:8px">Payout received</h2>
                    <p style="font-size:28px;font-weight:700;color:#0d47a1;margin:8px 0">$${data.amount.toLocaleString()} USDC</p>
                    <p style="color:#525866">From <strong>${escapeHtml(data.workspaceName)}</strong> ${reasonStr}</p>
                    <p style="color:#8d9096;font-size:13px">The funds will be sent to your wallet shortly.</p>
                    <a href="${walletUrl}" style="display:inline-block;background:#0d47a1;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">View wallet</a>
                </div>`,
            });
        } catch (error) {
            logger.error('Payout email failed', { error: (error as Error).message });
        }
    },

    async sendMilestoneCompletedEmail(data: {
        to: string;
        memberName: string;
        milestoneTitle: string;
        projectName: string;
        projectId: string;
    }): Promise<void> {
        if (!process.env.RESEND_API_KEY) return;
        const resend = new Resend(process.env.RESEND_API_KEY);
        const projectUrl = `${APP_URL}/projects/${data.projectId}`;
        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject: `${escapeHtml(data.memberName)} completed "${escapeHtml(data.milestoneTitle)}"`,
                html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                    <h2 style="color:#181d27">Milestone completed</h2>
                    <p><strong>${escapeHtml(data.memberName)}</strong> marked <strong>${escapeHtml(data.milestoneTitle)}</strong> as complete in <strong>${escapeHtml(data.projectName)}</strong>.</p>
                    <a href="${projectUrl}" style="display:inline-block;background:#0d47a1;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">View project</a>
                </div>`,
            });
        } catch (error) {
            logger.error('Milestone email failed', { error: (error as Error).message });
        }
    },

    async sendProjectReviewEmail(data: {
        to: string;
        adminName: string;
        memberName: string;
        projectName: string;
        projectId: string;
    }): Promise<void> {
        if (!process.env.RESEND_API_KEY) return;

        const resend = new Resend(process.env.RESEND_API_KEY);
        const projectUrl = `${APP_URL}/projects/${data.projectId}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(data.projectName)} ready for review</title>
        ${EMAIL_FONT_HEAD}<style>${SHARED_STYLES}</style></head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Project review</p>
                    <h1 class="heading">${escapeHtml(data.projectName)} is ready for review</h1>
                    <p class="description"><strong>${escapeHtml(data.memberName)}</strong> has marked this project as complete and it is awaiting your approval.</p>
                    <div style="text-align:center;margin:28px 0;">
                        <a href="${projectUrl}" style="display:inline-block;background-color:#0d47a1;color:#ffffff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none;">Review project</a>
                    </div>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body></html>`;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject: `${escapeHtml(data.memberName)} submitted ${escapeHtml(data.projectName)} for review`,
                html,
            });
        } catch (error) {
            logger.error('Project review email failed', { error: (error as Error).message, to: data.to });
        }
    },

    async sendProjectReviewNotification(data: {
        adminIds: string[];
        projectName: string;
        memberName: string;
        projectId: string;
        workspaceId: string;
    }): Promise<void> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping project review notification.');
            return;
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const projectUrl = `${APP_URL}/projects/${data.projectId}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(data.projectName)} ready for review</title>
        ${EMAIL_FONT_HEAD}<style>${SHARED_STYLES}</style></head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Project review</p>
                    <h1 class="heading">${escapeHtml(data.projectName)} is ready for review</h1>
                    <p class="description"><strong>${escapeHtml(data.memberName)}</strong> has marked this project as complete and it is awaiting your approval.</p>
                    <div style="text-align:center;margin:28px 0;">
                        <a href="${projectUrl}" style="display:inline-block;background-color:#0d47a1;color:#ffffff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none;">
                            Review project
                        </a>
                    </div>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>`;

        for (const adminId of data.adminIds) {
            const { data: admin } = await supabase
                .from('users')
                .select('email, first_name, last_name')
                .eq('id', adminId)
                .single();

            if (!admin?.email) continue;

            try {
                await resend.emails.send({
                    from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                    to: [admin.email],
                    subject: `${escapeHtml(data.memberName)} submitted ${escapeHtml(data.projectName)} for review`,
                    html,
                });
                logger.info('Project review notification sent', { to: admin.email });
            } catch (error) {
                logger.error('Project review notification failed', { error: (error as Error).message, to: admin.email });
            }
        }
    },

    async sendProjectApprovalNotification(data: {
        userId: string;
        projectName: string;
        approvedBy: string;
        projectId: string;
    }): Promise<void> {
        await sendProjectOutcomeEmail(data, 'approved', 'has been approved');
    },

    async sendProjectChangesRequestedNotification(data: {
        userId: string;
        projectName: string;
        adminName: string;
        projectId: string;
    }): Promise<void> {
        await sendProjectOutcomeEmail(
            { ...data, approvedBy: data.adminName },
            'changes_requested',
            'needs changes'
        );
    },

    async sendInvitationAcceptedEmail(data: {
        to: string;
        inviterName: string;
        memberName: string;
        workspaceName: string;
        role: string;
    }): Promise<void> {
        if (!process.env.RESEND_API_KEY) return;

        const resend = new Resend(process.env.RESEND_API_KEY);
        const settingsUrl = `${APP_URL}/workspace/settings`;
        const roleLabel = data.role === 'admin' ? 'Admin' : 'Member';

        const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(data.memberName)} accepted your invitation</title>
        ${EMAIL_FONT_HEAD}<style>${SHARED_STYLES}</style></head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Invitation accepted</p>
                    <h1 class="heading">${escapeHtml(data.memberName)} joined ${escapeHtml(data.workspaceName)}</h1>
                    <p class="description">
                        <strong>${escapeHtml(data.memberName)}</strong> has accepted your invitation and joined <strong>${escapeHtml(data.workspaceName)}</strong> as a <strong>${escapeHtml(roleLabel)}</strong>.
                    </p>
                    <div style="text-align:center;margin:28px 0;">
                        <a href="${settingsUrl}" style="display:inline-block;background-color:#0d47a1;color:#ffffff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none;">
                            View workspace members
                        </a>
                    </div>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body></html>`;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject: `${escapeHtml(data.memberName)} accepted your invitation`,
                html,
            });
        } catch (error) {
            logger.error('Invitation accepted email failed', { error: (error as Error).message });
        }
    },

    async sendProjectAssignmentEmail(data: {
        to: string;
        memberName: string;
        projectName: string;
        workspaceName: string;
        payoutAmount: number;
        projectId: string;
    }): Promise<void> {
        if (!process.env.RESEND_API_KEY) return;

        const resend = new Resend(process.env.RESEND_API_KEY);
        const projectUrl = `${APP_URL}/projects/${data.projectId}`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>You've been assigned to ${escapeHtml(data.projectName)}</title>
        ${EMAIL_FONT_HEAD}<style>${SHARED_STYLES}</style></head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Project assignment</p>
                    <h1 class="heading">You've been assigned to ${escapeHtml(data.projectName)}</h1>
                    <p class="description">
                        You've been assigned to <strong>${escapeHtml(data.projectName)}</strong> in <strong>${escapeHtml(data.workspaceName)}</strong>.
                        ${data.payoutAmount > 0 ? `<br/><strong style="color:#181d27;">Your payout: $${escapeHtml(data.payoutAmount.toLocaleString())}</strong>` : ''}
                    </p>
                    <p class="description" style="font-size:13px;color:#717680;">
                        Open the project to track milestones, log time, and mark work as complete when ready for review.
                    </p>
                    <div style="text-align:center;margin:28px 0;">
                        <a href="${projectUrl}" style="display:inline-block;background-color:#0d47a1;color:#ffffff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none;">
                            View project
                        </a>
                    </div>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body></html>`;

        try {
            await resend.emails.send({
                from: 'Hedwig <team@hedwig.riftlabs.xyz>',
                to: [data.to],
                subject: `You've been assigned to ${escapeHtml(data.projectName)}`,
                html,
            });
        } catch (error) {
            logger.error('Project assignment email failed', { error: (error as Error).message });
        }
    },

    async sendPayrollReceivedEmail(data: {
        to: string;
        memberName: string;
        amountUsd: string;
    }): Promise<void> {
        if (!process.env.RESEND_API_KEY) return;
        const resend = new Resend(process.env.RESEND_API_KEY);
        const walletUrl = `${APP_URL}/wallet`;
        const subject = `$${data.amountUsd} payment received`;
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(subject)}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Payment received</p>
                    <h1 class="heading">Payment arrived, ${escapeHtml(data.memberName)}</h1>
                    <p class="description">A payment has been sent to your workspace wallet.</p>
                    <div class="card">
                        <p class="amount-label">Amount</p>
                        <p class="amount-value">$${escapeHtml(data.amountUsd)}</p>
                    </div>
                    <p class="description" style="font-size:13px;color:#717680;margin-top:0;">
                        The funds are available in your Hedwig wallet now.
                    </p>
                    <div class="btn-container">
                        <a href="${walletUrl}" class="btn">View wallet</a>
                    </div>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body></html>`;
        try {
            await resend.emails.send({ from: 'Hedwig <team@hedwig.riftlabs.xyz>', to: [data.to], subject, html });
        } catch (error) {
            logger.error('Payroll received email failed', { error: (error as Error).message });
        }
    },

    async sendPayrollCompleteEmail(data: {
        to: string;
        adminName: string;
        totalRan: number;
        successCount: number;
        failedCount: number;
        payrollRunId: string;
    }): Promise<void> {
        if (!process.env.RESEND_API_KEY) return;
        const resend = new Resend(process.env.RESEND_API_KEY);
        const treasuryUrl = `${APP_URL}/workspace/payroll`;
        const allSucceeded = data.failedCount === 0;
        const subject = allSucceeded
            ? `Payroll complete — ${data.successCount}/${data.totalRan} sent`
            : `Payroll complete — ${data.successCount} sent, ${data.failedCount} failed`;
        const resultLine = allSucceeded
            ? `<p style="font-size:13px;color:#535862;margin:12px 0 0;">All <strong>${data.totalRan}</strong> payments were sent successfully.</p>`
            : `<p style="font-size:13px;color:#535862;margin:12px 0 0;"><strong>${data.successCount}</strong> succeeded &middot; <strong style="color:#e53e3e;">${data.failedCount}</strong> failed</p>`;
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${escapeHtml(subject)}</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Payroll complete</p>
                    <h1 class="heading">Payroll run finished</h1>
                    <p class="description">Your payroll run has been processed. Here's a summary of the results.</p>
                    <div class="card" style="text-align:center;">
                        <p class="amount-label">Payments sent</p>
                        <p class="amount-value">${data.successCount}<span style="font-size:20px;font-weight:600;color:#535862;"> / ${data.totalRan}</span></p>
                        ${resultLine}
                    </div>
                    <div class="btn-container">
                        <a href="${treasuryUrl}" class="btn">View payroll</a>
                    </div>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body></html>`;
        try {
            await resend.emails.send({ from: 'Hedwig <team@hedwig.riftlabs.xyz>', to: [data.to], subject, html });
        } catch (error) {
            logger.error('Payroll complete email failed', { error: (error as Error).message });
        }
    },

    async sendWelcomeEmail(data: {
        to: string;
        firstName: string;
        accountType: 'personal' | 'organization';
    }): Promise<boolean> {
        if (!process.env.RESEND_API_KEY) {
            logger.warn('RESEND_API_KEY is not set. Skipping welcome email.');
            return false;
        }
        const resend = new Resend(process.env.RESEND_API_KEY);
        const name = data.firstName || 'there';

        const firstAction = data.accountType === 'organization'
            ? 'Invite your team or set up payroll'
            : 'Send your first invoice or add a client';
        const ctaUrl = `${APP_URL}/dashboard`;

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to Hedwig 👋</title>
            ${EMAIL_FONT_HEAD}
            <style>${SHARED_STYLES}</style>
        </head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Welcome</p>
                    <h1 class="heading">Hey ${name}, you&rsquo;re in &#x1f44b;</h1>
                    <p class="description">Hedwig helps you run your business finances in one place &mdash; payments, invoicing, bookkeeping, and client/project tracking, all in USDC.</p>
                    <p class="description"><strong>Here&rsquo;s what to do first:</strong><br />${firstAction}</p>
                    <div class="btn-container">
                        <a href="${ctaUrl}" class="btn">Go to dashboard</a>
                    </div>
                    <hr class="divider" />
                    <p style="font-size:13px;color:#a4a7ae;line-height:1.6;">Questions? Just reply &mdash; I read these myself.<br />&mdash; Nonso, Hedwig</p>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body>
        </html>
        `;

        try {
            await resend.emails.send({
                from: 'Nonso from Hedwig <nonso.onah@riftlabs.xyz>',
                to: [data.to],
                subject: 'Welcome to Hedwig 👋',
                html,
            });
            return true;
        } catch (error) {
            logger.error('Welcome email failed', {
                error: error instanceof Error ? error.message : 'Unknown',
                to: data.to,
            });
            return false;
        }
    },

    async sendPayrollSkippedEmail(data: {
        to: string;
        adminName: string;
        deficit: string;
        nextRunAt: string;
    }): Promise<void> {
        if (!process.env.RESEND_API_KEY) return;
        const resend = new Resend(process.env.RESEND_API_KEY);
        const payrollUrl = `${APP_URL}/workspace/payroll`;
        const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Scheduled payroll skipped</title>
        ${EMAIL_FONT_HEAD}<style>${SHARED_STYLES}</style></head>
        <body style="font-family:${EMAIL_FONT_FAMILY};">
            <div class="container">
                <div class="header">${LOGO_HTML}</div>
                <div class="content">
                    <p class="eyebrow">Payroll skipped</p>
                    <h1 class="heading">Hey ${escapeHtml(data.adminName)}, scheduled payroll could not run</h1>
                    <p class="description">Your scheduled payroll couldn't be processed — there aren't enough funds in your treasury. You need <strong>$${escapeHtml(data.deficit)}</strong> more.</p>
                    <p class="description" style="font-size:13px;color:#717680;">The next attempt will be on <strong>${escapeHtml(new Date(data.nextRunAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}</strong> at 09:00 UTC. Add funds before then to avoid another skip.</p>
                    <div class="btn-container"><a href="${payrollUrl}" class="btn">View payroll</a></div>
                </div>
                <div class="footer"><p>${FOOTER_NOTE}</p></div>
            </div>
        </body></html>`;
        try { await resend.emails.send({ from: 'Hedwig <team@hedwig.riftlabs.xyz>', to: [data.to], subject: 'Scheduled payroll skipped — insufficient funds', html }); }
        catch (error) { logger.error('Payroll skipped email failed', { error: (error as Error).message }); }
    },

};
// Shared helper for project outcome emails
async function sendProjectOutcomeEmail(
    data: { userId: string; projectName: string; approvedBy: string; projectId: string },
    outcome: string,
    verb: string
): Promise<void> {
    if (!process.env.RESEND_API_KEY) return;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const projectUrl = `${APP_URL}/projects/${data.projectId}`;

    const outcomeLabel = outcome === 'approved' ? 'Approved' : 'Changes requested';
    const name = data.approvedBy || 'An admin';

    const html = `
    <!DOCTYPE html><html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(data.projectName)} ${verb}</title>
    ${EMAIL_FONT_HEAD}<style>${SHARED_STYLES}</style></head>
    <body style="font-family:${EMAIL_FONT_FAMILY};">
        <div class="container">
            <div class="header">${LOGO_HTML}</div>
            <div class="content">
                <p class="eyebrow">${outcomeLabel}</p>
                <h1 class="heading">${escapeHtml(data.projectName)} ${verb}</h1>
                <p class="description"><strong>${escapeHtml(name)}</strong> has ${outcome === 'approved' ? 'approved' : 'requested changes on'} your work on <strong>${escapeHtml(data.projectName)}</strong>.</p>
                <div style="text-align:center;margin:28px 0;">
                    <a href="${projectUrl}" style="display:inline-block;background-color:#0d47a1;color:#ffffff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none;">
                        View project
                    </a>
                </div>
            </div>
            <div class="footer"><p>${FOOTER_NOTE}</p></div>
        </div>
    </body></html>`;

    const { data: user } = await supabase
        .from('users')
        .select('email, first_name, last_name')
        .eq('id', data.userId)
        .single();

    if (!user?.email) return;

    try {
        await resend.emails.send({
            from: 'Hedwig <team@hedwig.riftlabs.xyz>',
            to: [user.email],
            subject: `${escapeHtml(data.projectName)} ${verb}`,
            html,
        });
        logger.info('Project outcome notification sent', { to: user.email, outcome });
    } catch (error) {
        logger.error('Project outcome notification failed', { error: (error as Error).message });
    }
}

