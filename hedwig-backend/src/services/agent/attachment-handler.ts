import crypto from 'crypto';
import { supabase } from '../../lib/supabase';
import { uploadToR2, r2IsConfigured, r2PublicUrl } from '../../lib/r2';
import { ClientService } from '../clientService';
import { PaycrestService } from '../paycrest';
import { llmService } from '../llm';
import { createLogger } from '../../utils/logger';

const logger = createLogger('AttachmentHandler');

export type AttachmentClassification =
  | 'invoice'
  | 'contract'
  | 'receipt'
  | 'bank_statement'
  | 'project_brief'
  | 'other';

export interface ExtractedInvoice {
  invoiceNumber?: string;
  issuer?: string;
  issuerEmail?: string;
  amount?: number;
  currency?: string;
  issueDate?: string;
  dueDate?: string;
  lineItems?: Array<{ description: string; amount?: number; quantity?: number; unitPrice?: number; total?: number }>;
  notes?: string;
  paymentStatus?: 'paid' | 'unpaid' | 'unknown';
  category?: string;
}

export interface ExtractedProjectBrief {
  title?: string;
  description?: string;
  clientName?: string;
  clientEmail?: string;
  deadline?: string;
  budgetUsd?: number;
  milestones?: Array<{ title: string; description?: string; dueDate?: string; amountUsd?: number }>;
  /** Plain-text body suitable for piping into a Google Doc. */
  bodyText?: string;
}

export interface ExtractedBankStatement {
  accountHolder?: string;
  bankName?: string;
  currency?: string;
  periodStart?: string;
  periodEnd?: string;
  totalDebit?: number;
  totalCredit?: number;
  openingBalance?: number;
  closingBalance?: number;
  transactionCount?: number;
  notes?: string;
}

export interface AttachmentAnalysis {
  classification: AttachmentClassification;
  confidence: number;
  summary: string;
  invoice?: ExtractedInvoice;
  projectBrief?: ExtractedProjectBrief;
  bankStatement?: ExtractedBankStatement;
  suggestedTitle?: string;
}

export interface ProcessAttachmentParams {
  userId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  instruction?: string;
}

export interface ProcessAttachmentResult {
  reply: string;
  classification: AttachmentClassification;
  stagedSuggestionIds: string[];
  createdEntities: Array<{ entityType: string; id: string; label: string }>;
}

const SUPPORTED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

function resolveAttachmentMimeType(fileName: string, mimeType: string): string {
  const normalized = String(mimeType || '').trim().toLowerCase();
  if (SUPPORTED_MIME.has(normalized)) return normalized;

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.webp')) return 'image/webp';

  return normalized || 'application/octet-stream';
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function normalizeCurrency(value: unknown): string {
  const rawText = String(value || '').trim();
  const raw = rawText.toUpperCase();
  if (!raw) return 'USD';
  if (raw === '₦' || raw === 'NAIRA' || raw === 'NIGERIAN NAIRA') return 'NGN';
  if (raw === '€' || raw === 'EURO' || raw === 'EUROS') return 'EUR';
  if (raw === '£' || raw === 'POUND' || raw === 'POUNDS' || raw === 'POUND STERLING' || raw === 'BRITISH POUND') return 'GBP';
  if (raw === '₵' || raw === 'CEDI' || raw === 'CEDIS' || raw === 'GHANAIAN CEDI') return 'GHS';
  if (raw === 'KSH' || raw === 'KES' || raw === 'KENYAN SHILLING' || raw === 'KENYA SHILLING') return 'KES';
  if (raw === 'R' || raw === 'RAND' || raw === 'SOUTH AFRICAN RAND') return 'ZAR';
  if (raw === 'C$' || raw === 'CA$' || raw === 'CAD' || raw === 'CANADIAN DOLLAR') return 'CAD';
  if (raw === 'A$' || raw === 'AU$' || raw === 'AUD' || raw === 'AUSTRALIAN DOLLAR') return 'AUD';
  if (raw === '$' || raw === 'US$' || raw === 'USDOLLAR' || raw === 'US DOLLAR' || raw === 'DOLLAR' || raw === 'DOLLARS') return 'USD';
  if (raw === 'USDC' || raw === 'USDT') return 'USD';
  const cleaned = raw.replace(/[^A-Z]/g, '');
  if (cleaned.length === 3) return cleaned;
  return 'USD';
}

function envRateForCurrency(currency: string): number | null {
  const keys = [
    `FX_${currency}_PER_USD`,
    `${currency}_PER_USD`,
    `USD_TO_${currency}_RATE`,
    currency === 'NGN' ? 'PAYCREST_FALLBACK_NGN_PER_USD' : '',
  ].filter(Boolean);

  for (const key of keys) {
    const raw = process.env[key];
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

async function convertAmountToUsd(amount: number, currencyInput: unknown): Promise<{
  currency: string;
  convertedAmountUsd: number;
  fxRateLocalPerUsd: number | null;
  fxSource: 'identity' | 'env' | 'frankfurter' | 'paycrest' | 'fallback';
}> {
  const currency = normalizeCurrency(currencyInput);
  if (currency === 'USD') {
    return { currency, convertedAmountUsd: Number(amount.toFixed(6)), fxRateLocalPerUsd: 1, fxSource: 'identity' };
  }

  const envRate = envRateForCurrency(currency);
  if (envRate) {
    return {
      currency,
      convertedAmountUsd: Number((amount / envRate).toFixed(6)),
      fxRateLocalPerUsd: envRate,
      fxSource: 'env',
    };
  }

  // Frankfurter (with open.er-api fallback for NGN etc.) — the canonical FX source.
  try {
    const { convertToUsd, getRate } = await import('../currency');
    const usd = await convertToUsd(amount, currency);
    if (Number.isFinite(usd) && usd > 0) {
      // NGN per 1 USD = inverse of (USD per 1 NGN)
      const ratePerUsd = await getRate('USD', currency);
      return {
        currency,
        convertedAmountUsd: Number(usd.toFixed(6)),
        fxRateLocalPerUsd: Number(ratePerUsd.toFixed(6)),
        fxSource: 'frankfurter',
      };
    }
  } catch (error) {
    logger.warn('Frankfurter FX lookup failed for attachment import', {
      currency,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const rateRaw = await PaycrestService.getExchangeRate('USDC', 1, currency, 'base');
    const rate = Number(String(rateRaw).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(rate) && rate > 0) {
      return {
        currency,
        convertedAmountUsd: Number((amount / rate).toFixed(6)),
        fxRateLocalPerUsd: rate,
        fxSource: 'paycrest',
      };
    }
  } catch (error) {
    logger.warn('Could not fetch FX rate for attachment import', {
      currency,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Last resort — keeps imports from being interpreted as huge USD amounts.
  const fallbackRate = currency === 'NGN' ? 1500 : 1;
  return {
    currency,
    convertedAmountUsd: Number((amount / fallbackRate).toFixed(6)),
    fxRateLocalPerUsd: fallbackRate,
    fxSource: 'fallback',
  };
}

function formatMoney(amount: number, currency: string): string {
  const code = normalizeCurrency(currency);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: ['NGN', 'KES', 'GHS', 'ZAR'].includes(code) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

function normalizeDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function bankStatementIntent(instruction?: string): 'debit' | 'credit' | 'unknown' {
  const text = String(instruction || '').toLowerCase();
  if (/\b(credit|credits|inflow|inflows|deposit|deposits|revenue|income|received|receipts|sales)\b/.test(text)) return 'credit';
  if (/\b(debit|debits|outflow|outflows|withdrawal|withdrawals|expense|expenses|spent|spend|charges|payments)\b/.test(text)) return 'debit';
  return 'unknown';
}

const ATTACHMENT_TAGS: Record<AttachmentClassification, string> = {
  invoice: 'Invoice',
  contract: 'Contract',
  receipt: 'Receipt',
  bank_statement: 'Bank statement',
  project_brief: 'Project brief',
  other: 'Document',
};

function cleanAttachmentTitle(value: unknown, fallback: string): string {
  const raw = String(value || fallback || 'Document')
    .replace(/\.[a-z0-9]{2,8}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const title = raw || fallback || 'Document';
  return title.length > 72 ? `${title.slice(0, 69).trim()}...` : title;
}

function taggedAttachmentTitle(classification: AttachmentClassification, title: unknown, fallback?: string): string {
  const tag = ATTACHMENT_TAGS[classification] || ATTACHMENT_TAGS.other;
  return `${cleanAttachmentTitle(title, fallback || tag)} [${tag}]`;
}

function fallbackDueDate(): string {
  const due = new Date();
  due.setDate(due.getDate() + 7);
  return due.toISOString().slice(0, 10);
}

function buildLineItems(items?: ExtractedInvoice['lineItems']): Array<{ description: string; amount: number }> {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const description = String(item.description || '').trim();
      const total = asPositiveNumber(item.total ?? item.amount);
      const computed = asPositiveNumber(item.quantity) && asPositiveNumber(item.unitPrice)
        ? Number(item.quantity) * Number(item.unitPrice)
        : null;
      const amount = total ?? computed;
      if (!description || !amount) return null;
      return { description, amount };
    })
    .filter((item): item is { description: string; amount: number } => Boolean(item));
}

export async function classifyAttachment(params: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  userInstruction?: string;
}): Promise<AttachmentAnalysis | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('GEMINI_API_KEY missing — cannot classify attachment');
    return null;
  }
  const mimeType = resolveAttachmentMimeType(params.fileName, params.mimeType);
  if (!SUPPORTED_MIME.has(mimeType)) {
    return {
      classification: 'other',
      confidence: 0.4,
      summary: `Received ${params.fileName} but the file type (${params.mimeType || 'unknown'}) is not supported for automatic analysis.`,
    };
  }

  const base64Data = params.buffer.toString('base64');
  const prompt = `You are Hedwig, an assistant for freelancers. Classify the attached document and extract any useful bookkeeping fields.

Return ONLY valid JSON, no markdown. Schema:
{
  "classification": "invoice" | "contract" | "receipt" | "bank_statement" | "project_brief" | "other",
  "confidence": 0.0 to 1.0,
  "summary": "One sentence describing what this document is.",
  "suggestedTitle": "A short filing title only, not a long summary and not the filename.",
  "invoice": {
    "invoiceNumber": string | null,
    "issuer": string | null,
    "issuerEmail": string | null,
    "amount": number | null,
    "currency": "ISO 4217 currency code such as USD, EUR, GBP, NGN, GHS, KES, ZAR, CAD, AUD, or null",
    "issueDate": "YYYY-MM-DD" | null,
    "dueDate": "YYYY-MM-DD" | null,
    "lineItems": [{"description": string, "quantity": number, "unitPrice": number, "total": number}],
    "notes": string | null,
    "paymentStatus": "paid" | "unpaid" | "unknown",
    "category": "software" | "contractors" | "marketing" | "travel" | "meals" | "office" | "operations" | "taxes" | "other"
  },
  "projectBrief": {
    "title": string | null,
    "description": string | null,
    "clientName": string | null,
    "clientEmail": string | null,
    "deadline": "YYYY-MM-DD" | null,
    "budgetUsd": number | null,
    "milestones": [{ "title": string, "description": string | null, "dueDate": "YYYY-MM-DD" | null, "amountUsd": number | null }],
    "bodyText": "Plain-text representation of the brief (preserve paragraphs and bullet structure)."
  },
  "bankStatement": {
    "accountHolder": string | null,
    "bankName": string | null,
    "currency": "ISO 4217 currency code such as USD, EUR, GBP, NGN, GHS, KES, ZAR, CAD, AUD, or null",
    "periodStart": "YYYY-MM-DD" | null,
    "periodEnd": "YYYY-MM-DD" | null,
    "totalDebit": number | null,
    "totalCredit": number | null,
    "openingBalance": number | null,
    "closingBalance": number | null,
    "transactionCount": number | null,
    "notes": string | null
  }
}

If classification is not "invoice", "receipt", or "bank_statement", set "invoice" to null.
Only populate "projectBrief" when classification is "project_brief"; otherwise null.
Only populate "bankStatement" when classification is "bank_statement"; otherwise null.
Use "invoice" for money owed to or paid to the user. Use "receipt" for money the user already spent.
Use "bank_statement" for bank statements, card statements, account statements, transaction statements, or bank exports.
For bank_statement imports, do not choose a random transaction. Extract printed/summary totals:
- "totalDebit" means total debits, withdrawals, outflows, DR, charges, payments, or spend.
- "totalCredit" means total credits, deposits, inflows, CR, receipts, income, or revenue.
- If the user context asks for expenses/debits/spend, set invoice.amount to totalDebit.
- If the user context asks for revenue/credits/income/deposits, set invoice.amount to totalCredit.
- If both totalDebit and totalCredit exist but user context does not specify which side to record, set invoice to null and populate bankStatement totals only.
- If no printed total exists, set the relevant total to null. Never use a single transaction amount as the statement total unless the document explicitly has only one transaction.
Use paymentStatus "paid" for bank statement totals.
Preserve the document currency exactly as a 3-letter ISO code: ₦/NGN/Naira/Nigerian bank statements → "NGN"; €/Euro → "EUR"; £/Pound → "GBP"; ₵/Cedi → "GHS"; KSh/KES → "KES"; Rand/ZAR → "ZAR". Do not assume USD unless the document uses dollars or USD.
For bank statements and receipts used for expense import, extract the debit/spend amount in the statement currency, not a USD equivalent.
Set paymentStatus to "paid" when the document says paid, receipt, zero balance due, payment received, or contains a paid stamp/watermark. Set it to "unpaid" for outstanding invoices.
${params.userInstruction ? `\nThe user added context: "${params.userInstruction}"` : ''}`;

  try {
    const text = (await llmService.generateText(prompt, {
      forceProvider: 'gemini',
      useFallbacks: false,
      maxOutputTokens: 1800,
      temperature: 0.1,
      files: [{ mimeType, data: base64Data }],
    })).trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('Gemini attachment analysis returned non-JSON text', {
        fileName: params.fileName,
        mimeType,
        preview: text.slice(0, 200),
      });
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const classification = (['invoice', 'contract', 'receipt', 'bank_statement', 'project_brief', 'other']
      .includes(parsed.classification) ? parsed.classification : 'other') as AttachmentClassification;

    return {
      classification,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      summary: String(parsed.summary || `Imported ${params.fileName}.`),
      suggestedTitle: parsed.suggestedTitle ? String(parsed.suggestedTitle) : undefined,
      projectBrief: parsed.projectBrief && typeof parsed.projectBrief === 'object' ? {
        title: parsed.projectBrief.title ?? undefined,
        description: parsed.projectBrief.description ?? undefined,
        clientName: parsed.projectBrief.clientName ?? undefined,
        clientEmail: parsed.projectBrief.clientEmail ?? undefined,
        deadline: normalizeDate(parsed.projectBrief.deadline) ?? undefined,
        budgetUsd: asPositiveNumber(parsed.projectBrief.budgetUsd) ?? undefined,
        milestones: Array.isArray(parsed.projectBrief.milestones)
          ? parsed.projectBrief.milestones
            .filter((m: any) => m && typeof m.title === 'string' && m.title.trim().length > 0)
            .map((m: any) => ({
              title: String(m.title),
              description: m.description ?? undefined,
              dueDate: normalizeDate(m.dueDate) ?? undefined,
              amountUsd: asPositiveNumber(m.amountUsd) ?? undefined,
            }))
          : undefined,
        bodyText: parsed.projectBrief.bodyText ?? undefined,
      } : undefined,
      bankStatement: parsed.bankStatement && typeof parsed.bankStatement === 'object' ? {
        accountHolder: parsed.bankStatement.accountHolder ?? undefined,
        bankName: parsed.bankStatement.bankName ?? undefined,
        currency: normalizeCurrency(parsed.bankStatement.currency) ?? undefined,
        periodStart: normalizeDate(parsed.bankStatement.periodStart) ?? undefined,
        periodEnd: normalizeDate(parsed.bankStatement.periodEnd) ?? undefined,
        totalDebit: asPositiveNumber(parsed.bankStatement.totalDebit) ?? undefined,
        totalCredit: asPositiveNumber(parsed.bankStatement.totalCredit) ?? undefined,
        openingBalance: asPositiveNumber(parsed.bankStatement.openingBalance) ?? undefined,
        closingBalance: asPositiveNumber(parsed.bankStatement.closingBalance) ?? undefined,
        transactionCount: asPositiveNumber(parsed.bankStatement.transactionCount) ?? undefined,
        notes: parsed.bankStatement.notes ?? undefined,
      } : undefined,
      invoice: parsed.invoice && typeof parsed.invoice === 'object' ? {
        invoiceNumber: parsed.invoice.invoiceNumber ?? undefined,
        issuer: parsed.invoice.issuer ?? undefined,
        issuerEmail: parsed.invoice.issuerEmail ?? undefined,
        amount: asPositiveNumber(parsed.invoice.amount) ?? undefined,
        currency: normalizeCurrency(parsed.invoice.currency) ?? undefined,
        issueDate: normalizeDate(parsed.invoice.issueDate) ?? undefined,
        dueDate: normalizeDate(parsed.invoice.dueDate) ?? undefined,
        lineItems: Array.isArray(parsed.invoice.lineItems) ? parsed.invoice.lineItems : undefined,
        notes: parsed.invoice.notes ?? undefined,
        paymentStatus: ['paid', 'unpaid', 'unknown'].includes(String(parsed.invoice.paymentStatus))
          ? parsed.invoice.paymentStatus
          : undefined,
        category: parsed.invoice.category ? String(parsed.invoice.category) : undefined,
      } : undefined,
    };
  } catch (error) {
    logger.warn('Gemini classify exception', {
      fileName: params.fileName,
      mimeType,
      sizeBytes: params.buffer.length,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function importInvoiceFromExtraction(
  hedwigUserId: string,
  fileName: string,
  invoice: ExtractedInvoice,
  options: { alreadyPaid?: boolean } = {}
): Promise<{ id: string; label: string } | null> {
  const items = buildLineItems(invoice.lineItems);
  const directAmount = asPositiveNumber(invoice.amount);
  const itemsTotal = items.reduce((sum, item) => sum + item.amount, 0);
  const amount = directAmount ?? (items.length ? itemsTotal : null);
  if (!amount) {
    logger.warn('Invoice import skipped — no amount detected', { fileName });
    return null;
  }
  const currency = normalizeCurrency(invoice.currency);

  const dueDate = invoice.dueDate || invoice.issueDate || fallbackDueDate();
  const title = invoice.invoiceNumber
    ? taggedAttachmentTitle('invoice', `Invoice ${invoice.invoiceNumber}`)
    : invoice.issuer
      ? taggedAttachmentTitle('invoice', `Invoice from ${invoice.issuer}`)
      : taggedAttachmentTitle('invoice', fileName, 'Imported invoice');

  const description = invoice.notes
    || items.slice(0, 3).map((item) => item.description).join(', ')
    || `Imported invoice${invoice.invoiceNumber ? ` ${invoice.invoiceNumber}` : ''}`;

  // Optionally create a client from the issuer info.
  let clientId: string | null = null;
  if (invoice.issuer || invoice.issuerEmail) {
    try {
      const { id } = await ClientService.getOrCreateClient(
        hedwigUserId,
        invoice.issuer || null,
        invoice.issuerEmail || null,
        { createdFrom: 'attachment_import' }
      );
      clientId = id;
    } catch (error) {
      logger.warn('Could not resolve client for imported invoice', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const alreadyPaid = options.alreadyPaid || invoice.paymentStatus === 'paid';
    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        user_id: hedwigUserId,
        client_id: clientId,
        type: 'INVOICE',
        title,
        amount,
        currency,
        description,
        status: alreadyPaid ? 'PAID' : 'DRAFT',
        chain: 'BASE',
        content: {
          client_name: invoice.issuer || null,
          recipient_email: invoice.issuerEmail || null,
          due_date: dueDate,
          items,
          reminders_enabled: !alreadyPaid,
          created_from: 'attachment_import',
          source_filename: fileName,
          original_amount: amount,
          original_currency: currency,
          payment_status: alreadyPaid ? 'paid' : (invoice.paymentStatus || 'unpaid'),
          bookkeeping_only: alreadyPaid,
        },
      })
      .select('id')
      .single();

    if (error || !doc?.id) {
      throw new Error(error?.message || 'Insert failed');
    }
    return { id: doc.id, label: title };
  } catch (error) {
    logger.error('Failed to insert imported invoice', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function importExpenseFromExtraction(
  hedwigUserId: string,
  fileName: string,
  invoice: ExtractedInvoice
): Promise<{ id: string; label: string; amount: number; currency: string; convertedAmountUsd: number; fxSource: string } | null> {
  const items = buildLineItems(invoice.lineItems);
  const directAmount = asPositiveNumber(invoice.amount);
  const itemsTotal = items.reduce((sum, item) => sum + item.amount, 0);
  const amount = directAmount ?? (items.length ? itemsTotal : null);
  if (!amount) {
    logger.warn('Receipt import skipped — no amount detected', { fileName });
    return null;
  }

  const vendor = invoice.issuer || 'Imported vendor';
  const currency = normalizeCurrency(invoice.currency);
  const conversion = await convertAmountToUsd(amount, currency);
  const note = cleanAttachmentTitle(invoice.notes
    || items.slice(0, 3).map((item) => item.description).join(', ')
    || `Imported receipt from ${vendor}`, `${vendor} expense`);

  try {
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: hedwigUserId,
        amount,
        currency: conversion.currency,
        converted_amount_usd: conversion.convertedAmountUsd,
        category: invoice.category || 'other',
        note,
        source_type: 'attachment_import',
        date: normalizeDate(invoice.issueDate) || new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      throw new Error(error?.message || 'Insert failed');
    }

    logger.info('Imported attachment expense with FX conversion', {
      userId: hedwigUserId,
      expenseId: data.id,
      currency: conversion.currency,
      amount,
      convertedAmountUsd: conversion.convertedAmountUsd,
      fxSource: conversion.fxSource,
      fxRateLocalPerUsd: conversion.fxRateLocalPerUsd,
    });

    return {
      id: data.id,
      label: `${vendor} expense`,
      amount,
      currency: conversion.currency,
      convertedAmountUsd: conversion.convertedAmountUsd,
      fxSource: conversion.fxSource,
    };
  } catch (error) {
    logger.error('Failed to insert imported receipt expense', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function importPaidRevenueFromBankStatement(
  hedwigUserId: string,
  fileName: string,
  statement: ExtractedBankStatement
): Promise<{ id: string; label: string; amount: number; currency: string; convertedAmountUsd: number; fxSource: string } | null> {
  const amount = asPositiveNumber(statement.totalCredit);
  if (!amount) {
    logger.warn('Bank statement revenue import skipped — no total credit detected', { fileName });
    return null;
  }

  const currency = normalizeCurrency(statement.currency);
  const conversion = await convertAmountToUsd(amount, currency);
  const bankName = statement.bankName || 'bank statement';
  const period = statement.periodStart || statement.periodEnd
    ? `${statement.periodStart || 'start'} to ${statement.periodEnd || 'end'}`
    : 'statement period';
  const title = taggedAttachmentTitle('bank_statement', 'Statement credits');

  try {
    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        user_id: hedwigUserId,
        type: 'INVOICE',
        title,
        amount: conversion.convertedAmountUsd,
        currency: 'USD',
        description: `Imported total credits from ${bankName} for ${period}`,
        status: 'PAID',
        chain: 'BASE',
        content: {
          client_name: statement.accountHolder || null,
          due_date: statement.periodEnd || statement.periodStart || new Date().toISOString().slice(0, 10),
          items: [{ description: `Statement total credits (${currency})`, amount: conversion.convertedAmountUsd }],
          reminders_enabled: false,
          created_from: 'attachment_import',
          source_filename: fileName,
          original_amount: amount,
          original_currency: currency,
          statement_total_credit: amount,
          statement_total_debit: statement.totalDebit ?? null,
          payment_status: 'paid',
          bookkeeping_only: true,
        },
      })
      .select('id')
      .single();

    if (error || !doc?.id) {
      throw new Error(error?.message || 'Insert failed');
    }

    return {
      id: doc.id,
      label: title,
      amount,
      currency: conversion.currency,
      convertedAmountUsd: conversion.convertedAmountUsd,
      fxSource: conversion.fxSource,
    };
  } catch (error) {
    logger.error('Failed to insert imported bank statement revenue', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 80);
}

async function isDriveConnected(hedwigUserId: string): Promise<boolean> {
  return isProviderConnected(hedwigUserId, 'google_drive');
}

async function isProviderConnected(hedwigUserId: string, provider: 'google_drive' | 'google_docs'): Promise<boolean> {
  const { data } = await supabase
    .from('composio_connections')
    .select('status')
    .eq('user_id', hedwigUserId)
    .eq('provider', provider)
    .eq('status', 'active')
    .maybeSingle();
  return Boolean(data);
}

async function stageDriveUploadSuggestion(params: {
  hedwigUserId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  classification: AttachmentClassification;
  summary: string;
  suggestedTitle?: string;
}): Promise<string | null> {
  const r2Key = `agent-attachments/${params.hedwigUserId}/${crypto.randomUUID()}-${safeFilename(params.fileName)}`;

  try {
    await uploadToR2(r2Key, params.buffer, params.mimeType);
  } catch (error) {
    logger.warn('R2 upload failed; falling back to plain review suggestion', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const r2Url = r2PublicUrl(r2Key);
  const driveTitle = taggedAttachmentTitle(params.classification, params.suggestedTitle || params.fileName);
  const draftKey = 'composio_googledrive_upload_file';

  const editedData = {
    default_action: draftKey,
    drafts: {
      [draftKey]: {
        composio_action: 'GOOGLEDRIVE_UPLOAD_FILE',
        composio_input: {
          // The executor replaces this placeholder with Composio's FileUploadData.
          file_to_upload: '__COMPOSIO_FILE_PLACEHOLDER__',
          file_name: driveTitle,
        },
        composio_file: {
          r2_key: r2Key,
          r2_url: r2Url,
          file_name: driveTitle,
          mime_type: params.mimeType,
          file_param: 'file_to_upload',
          tool_slug: 'GOOGLEDRIVE_UPLOAD_FILE',
          toolkit_slug: 'googledrive',
        },
      },
    },
  };

  const suggestionType =
    params.classification === 'project_brief' ? 'project_action'
    : params.classification === 'contract' ? 'import_match'
    : 'import_match';

  const { data, error } = await supabase
    .from('assistant_suggestions')
    .insert({
      user_id: params.hedwigUserId,
      type: suggestionType,
      title: driveTitle,
      description: `Approving will upload this ${ATTACHMENT_TAGS[params.classification].toLowerCase()} to your Google Drive.`,
      priority: 'medium',
      confidence_score: 0.82,
      status: 'active',
      reason: 'Hedwig classified an uploaded document and is offering to file it in your connected Drive.',
      surface: 'assistant_panel',
      actions: [{ label: 'Upload to Drive', type: draftKey, requires_approval: true }],
      related_entities: {
        source: 'agent_attachment',
        filename: params.fileName,
        classification: params.classification,
        r2_key: r2Key,
      },
      edited_data: editedData,
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.warn('Failed to stage Drive upload suggestion', {
      message: error?.message,
    });
    return null;
  }
  return data.id;
}

async function stageDocsCreateSuggestion(params: {
  hedwigUserId: string;
  fileName: string;
  classification: AttachmentClassification;
  summary: string;
  title: string;
  bodyText: string;
}): Promise<string | null> {
  const draftKey = 'composio_googledocs_create_document';
  const docTitle = taggedAttachmentTitle(params.classification, params.title);
  const editedData = {
    default_action: draftKey,
    drafts: {
      [draftKey]: {
        composio_action: 'GOOGLEDOCS_CREATE_DOCUMENT',
        composio_input: {
          title: docTitle,
          text: params.bodyText,
        },
      },
    },
  };

  const { data, error } = await supabase
    .from('assistant_suggestions')
    .insert({
      user_id: params.hedwigUserId,
      type: 'project_action',
      title: docTitle,
      description: `Approving will create an editable Google Doc from this ${ATTACHMENT_TAGS[params.classification].toLowerCase()}.`,
      priority: 'medium',
      confidence_score: 0.83,
      status: 'active',
      reason: 'Hedwig extracted a project brief and is offering to create an editable doc.',
      surface: 'assistant_panel',
      actions: [{ label: 'Create Google Doc', type: draftKey, requires_approval: true }],
      related_entities: { source: 'agent_attachment', filename: params.fileName, classification: 'project_brief' },
      edited_data: editedData,
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.warn('Failed to stage Docs creation suggestion', { message: error?.message });
    return null;
  }
  return data.id;
}

async function stageCreateProjectFromBriefSuggestion(params: {
  hedwigUserId: string;
  fileName: string;
  brief: ExtractedProjectBrief;
  summary: string;
}): Promise<string | null> {
  const draftKey = 'create_project_from_brief';
  const projectTitle = cleanAttachmentTitle(params.brief.title, 'Imported project');
  const milestoneDrafts = (params.brief.milestones || []).map((m) => ({
    title: m.title,
    description: m.description ?? null,
    due_date: m.dueDate ?? null,
    amount_usd: m.amountUsd ?? null,
  }));

  const editedData = {
    default_action: draftKey,
    drafts: {
      [draftKey]: {
        title: projectTitle,
        description: params.brief.description ?? params.brief.bodyText?.slice(0, 500) ?? null,
        client_name: params.brief.clientName ?? null,
        client_email: params.brief.clientEmail ?? null,
        deadline: params.brief.deadline ?? null,
        budget_usd: params.brief.budgetUsd ?? null,
        milestones: milestoneDrafts,
      },
    },
  };

  const { data, error } = await supabase
    .from('assistant_suggestions')
    .insert({
      user_id: params.hedwigUserId,
      type: 'project_action',
      title: taggedAttachmentTitle('project_brief', projectTitle),
      description: `Approving will create a Hedwig project${milestoneDrafts.length > 0 ? ` with ${milestoneDrafts.length} milestone${milestoneDrafts.length === 1 ? '' : 's'}` : ''}.`,
      priority: 'medium',
      confidence_score: 0.85,
      status: 'active',
      reason: 'Hedwig extracted project structure from the brief and is offering to create the project.',
      surface: 'assistant_panel',
      actions: [{ label: 'Create project', type: draftKey, requires_approval: true }],
      related_entities: { source: 'agent_attachment', filename: params.fileName, classification: 'project_brief' },
      edited_data: editedData,
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.warn('Failed to stage project creation suggestion', { message: error?.message });
    return null;
  }
  return data.id;
}

async function stageReviewSuggestion(
  hedwigUserId: string,
  fileName: string,
  classification: AttachmentClassification,
  summary: string,
  suggestedTitle?: string
): Promise<string | null> {
  const title = taggedAttachmentTitle(classification, suggestedTitle || fileName);
  const { data, error } = await supabase
    .from('assistant_suggestions')
    .insert({
      user_id: hedwigUserId,
      type: classification === 'project_brief' ? 'project_action' : 'import_match',
      title,
      description: `Review this ${ATTACHMENT_TAGS[classification].toLowerCase()} before filing it.`,
      priority: 'medium',
      confidence_score: 0.7,
      status: 'active',
      reason: 'Hedwig classified an uploaded document and is awaiting your decision on how to file it.',
      surface: 'assistant_panel',
      actions: [{ label: 'Review', type: 'review_imports', requires_approval: true }],
      related_entities: { source: 'agent_attachment', filename: fileName, classification },
      edited_data: {
        default_action: 'review_imports',
        drafts: { review_imports: { source: 'agent_attachment', filename: fileName, summary } },
      },
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.warn('Failed to stage attachment review suggestion', {
      message: error?.message,
    });
    return null;
  }
  return data.id;
}

export async function processAttachment(params: ProcessAttachmentParams): Promise<ProcessAttachmentResult> {
  const analysis = await classifyAttachment({
    fileName: params.fileName,
    mimeType: params.mimeType,
    buffer: params.buffer,
    userInstruction: params.instruction,
  });

  if (!analysis) {
    return {
      reply: `I could not analyze ${params.fileName} — Gemini is not configured or the file format is unsupported. Try uploading a PDF, PNG, JPEG, or WebP.`,
      classification: 'other',
      stagedSuggestionIds: [],
      createdEntities: [],
    };
  }

  const stagedSuggestionIds: string[] = [];
  const createdEntities: Array<{ entityType: string; id: string; label: string }> = [];

  // ─── Invoice / receipt → import directly ──────────────────────────────────
  if (analysis.classification === 'bank_statement') {
    const statement = analysis.bankStatement;
    const intent = bankStatementIntent(params.instruction);
    const currency = normalizeCurrency(statement?.currency || analysis.invoice?.currency);
    const totalDebit = asPositiveNumber(statement?.totalDebit) ?? (intent === 'debit' ? asPositiveNumber(analysis.invoice?.amount) : null);
    const totalCredit = asPositiveNumber(statement?.totalCredit) ?? (intent === 'credit' ? asPositiveNumber(analysis.invoice?.amount) : null);
    const hasBothSides = Boolean(totalDebit && totalCredit);

    if (intent === 'debit' && totalDebit) {
      const created = await importExpenseFromExtraction(params.userId, params.fileName, {
        issuer: statement?.bankName || analysis.invoice?.issuer || 'Bank statement',
        amount: totalDebit,
        currency,
        issueDate: statement?.periodEnd || statement?.periodStart || analysis.invoice?.issueDate,
        notes: statement?.notes || `Bank statement total debit${statement?.periodEnd ? ` through ${statement.periodEnd}` : ''}`,
        paymentStatus: 'paid',
        category: analysis.invoice?.category || 'other',
      });
      if (created) {
        createdEntities.push({ entityType: 'expense', id: created.id, label: created.label });
        const convertedSuffix = created.currency === 'USD'
          ? ''
          : ` (${formatMoney(created.convertedAmountUsd, 'USD')} for reports)`;
        return {
          reply: `Recorded bank statement total debits — ${formatMoney(created.amount, created.currency)}${convertedSuffix} as expenses for bookkeeping.`,
          classification: analysis.classification,
          stagedSuggestionIds,
          createdEntities,
        };
      }
    }

    if (intent === 'credit' && totalCredit) {
      const created = await importPaidRevenueFromBankStatement(params.userId, params.fileName, {
        ...(statement || {}),
        currency,
        totalCredit,
        totalDebit: totalDebit ?? statement?.totalDebit,
      });
      if (created) {
        createdEntities.push({ entityType: 'invoice', id: created.id, label: created.label });
        const convertedSuffix = created.currency === 'USD'
          ? ''
          : ` (${formatMoney(created.convertedAmountUsd, 'USD')} for reports)`;
        return {
          reply: `Imported bank statement total credits — ${formatMoney(created.amount, created.currency)}${convertedSuffix} as paid revenue for bookkeeping.`,
          classification: analysis.classification,
          stagedSuggestionIds,
          createdEntities,
        };
      }
    }

    if (intent === 'unknown' && !hasBothSides && totalDebit && !totalCredit) {
      const created = await importExpenseFromExtraction(params.userId, params.fileName, {
        issuer: statement?.bankName || analysis.invoice?.issuer || 'Bank statement',
        amount: totalDebit,
        currency,
        issueDate: statement?.periodEnd || statement?.periodStart || analysis.invoice?.issueDate,
        notes: statement?.notes || 'Bank statement total debit',
        paymentStatus: 'paid',
        category: analysis.invoice?.category || 'other',
      });
      if (created) {
        createdEntities.push({ entityType: 'expense', id: created.id, label: created.label });
        const convertedSuffix = created.currency === 'USD'
          ? ''
          : ` (${formatMoney(created.convertedAmountUsd, 'USD')} for reports)`;
        return {
          reply: `Recorded the only detected bank statement total debit — ${formatMoney(created.amount, created.currency)}${convertedSuffix} as an expense for bookkeeping.`,
          classification: analysis.classification,
          stagedSuggestionIds,
          createdEntities,
        };
      }
    }

    if (intent === 'unknown' && !hasBothSides && totalCredit && !totalDebit) {
      const created = await importPaidRevenueFromBankStatement(params.userId, params.fileName, {
        ...(statement || {}),
        currency,
        totalCredit,
        totalDebit: statement?.totalDebit,
      });
      if (created) {
        createdEntities.push({ entityType: 'invoice', id: created.id, label: created.label });
        const convertedSuffix = created.currency === 'USD'
          ? ''
          : ` (${formatMoney(created.convertedAmountUsd, 'USD')} for reports)`;
        return {
          reply: `Recorded the only detected bank statement total credit — ${formatMoney(created.amount, created.currency)}${convertedSuffix} as paid revenue for bookkeeping.`,
          classification: analysis.classification,
          stagedSuggestionIds,
          createdEntities,
        };
      }
    }

    if (intent === 'unknown' && hasBothSides && totalDebit && totalCredit) {
      const debitCreated = await importExpenseFromExtraction(params.userId, params.fileName, {
        issuer: statement?.bankName || analysis.invoice?.issuer || 'Bank statement',
        amount: totalDebit,
        currency,
        issueDate: statement?.periodEnd || statement?.periodStart || analysis.invoice?.issueDate,
        notes: statement?.notes || `Bank statement total debit${statement?.periodEnd ? ` through ${statement.periodEnd}` : ''}`,
        paymentStatus: 'paid',
        category: analysis.invoice?.category || 'other',
      });
      if (debitCreated) {
        createdEntities.push({ entityType: 'expense', id: debitCreated.id, label: debitCreated.label });
      }

      const creditCreated = await importPaidRevenueFromBankStatement(params.userId, params.fileName, {
        ...(statement || {}),
        currency,
        totalCredit,
        totalDebit,
      });
      if (creditCreated) {
        createdEntities.push({ entityType: 'invoice', id: creditCreated.id, label: creditCreated.label });
      }

      if (debitCreated || creditCreated) {
        const debitMsg = debitCreated
          ? `${formatMoney(debitCreated.amount, debitCreated.currency)} in debits as expenses`
          : null;
        const creditMsg = creditCreated
          ? `${formatMoney(creditCreated.amount, creditCreated.currency)} in credits as paid revenue`
          : null;
        const summary = [debitMsg, creditMsg].filter(Boolean).join(' and ');
        return {
          reply: `Recorded ${summary} from this bank statement for bookkeeping.`,
          classification: analysis.classification,
          stagedSuggestionIds,
          createdEntities,
        };
      }
    }

    const debitText = totalDebit ? formatMoney(totalDebit, currency) : 'not found';
    const creditText = totalCredit ? formatMoney(totalCredit, currency) : 'not found';
    return {
      reply: `I found this bank statement, but I could not record it automatically: total debits are ${debitText} and total credits are ${creditText}. Tell me whether to record debits as expenses, credits as paid revenue, or both.`,
      classification: analysis.classification,
      stagedSuggestionIds,
      createdEntities,
    };
  }

  if (analysis.classification === 'receipt' && analysis.invoice) {
    const created = await importExpenseFromExtraction(params.userId, params.fileName, analysis.invoice);
    if (created) {
      createdEntities.push({ entityType: 'expense', id: created.id, label: created.label });
      const convertedSuffix = created.currency === 'USD'
        ? ''
        : ` (${formatMoney(created.convertedAmountUsd, 'USD')} for reports)`;
      return {
        reply: `Recorded ${created.label} — ${formatMoney(created.amount, created.currency)}${convertedSuffix} as an expense for bookkeeping.`,
        classification: analysis.classification,
        stagedSuggestionIds,
        createdEntities,
      };
    }
    // Fall through to staged review if insert failed.
  }

  if (analysis.classification === 'invoice' && analysis.invoice) {
    const alreadyPaid = analysis.invoice.paymentStatus === 'paid';
    const created = await importInvoiceFromExtraction(params.userId, params.fileName, analysis.invoice, { alreadyPaid });
    if (created) {
      createdEntities.push({ entityType: 'invoice', id: created.id, label: created.label });
      const issuer = analysis.invoice.issuer ? ` from ${analysis.invoice.issuer}` : '';
      const amount = analysis.invoice.amount;
      const currency = analysis.invoice.currency || 'USD';
      return {
        reply: alreadyPaid
          ? `Imported ${created.label}${issuer}${amount ? ` — ${currency} ${amount.toFixed(2)}` : ''} as paid revenue for bookkeeping.`
          : `Imported ${created.label}${issuer}${amount ? ` — ${currency} ${amount.toFixed(2)}` : ''}. Open Payments to review and send.`,
        classification: analysis.classification,
        stagedSuggestionIds,
        createdEntities,
      };
    }
    // Fall through to staged review if insert failed.
  }

  // Project brief → stage project creation with extracted milestones/client/etc.
  if (analysis.classification === 'project_brief' && analysis.projectBrief) {
    const projectSuggestionId = await stageCreateProjectFromBriefSuggestion({
      hedwigUserId: params.userId,
      fileName: params.fileName,
      brief: analysis.projectBrief,
      summary: analysis.summary,
    });
    if (projectSuggestionId) stagedSuggestionIds.push(projectSuggestionId);
  }

  // Drive / Docs uploads — applies to any non-invoice document.
  const driveConnected = r2IsConfigured() && (await isDriveConnected(params.userId));
  const docsConnected = await isProviderConnected(params.userId, 'google_docs');

  if (driveConnected) {
    const driveSuggestionId = await stageDriveUploadSuggestion({
      hedwigUserId: params.userId,
      fileName: params.fileName,
      mimeType: params.mimeType,
      buffer: params.buffer,
      classification: analysis.classification,
      summary: analysis.summary,
      suggestedTitle: analysis.suggestedTitle,
    });
    if (driveSuggestionId) {
      stagedSuggestionIds.push(driveSuggestionId);
    }
  }

  if (docsConnected && ['contract', 'project_brief', 'other'].includes(analysis.classification)) {
    const bodyText =
      analysis.projectBrief?.bodyText
      || `${analysis.summary}\n\nImported from ${params.fileName}.`;
    const title = cleanAttachmentTitle(analysis.projectBrief?.title || analysis.suggestedTitle || params.fileName, ATTACHMENT_TAGS[analysis.classification]);
    const docsSuggestionId = await stageDocsCreateSuggestion({
      hedwigUserId: params.userId,
      fileName: params.fileName,
      classification: analysis.classification,
      summary: analysis.summary,
      title,
      bodyText,
    });
    if (docsSuggestionId) stagedSuggestionIds.push(docsSuggestionId);
  }

  if (stagedSuggestionIds.length > 0) {
    return {
      reply: `${taggedAttachmentTitle(analysis.classification, analysis.suggestedTitle || params.fileName)}. I drafted ${stagedSuggestionIds.length} approval action${stagedSuggestionIds.length === 1 ? '' : 's'} for this attachment.`,
      classification: analysis.classification,
      stagedSuggestionIds,
      createdEntities,
    };
  }

  // Fallback: plain review suggestion (Drive not connected, R2 not configured,
  // or upload failed).
  const reviewSuggestionId = await stageReviewSuggestion(
    params.userId,
    params.fileName,
    analysis.classification,
    analysis.summary,
    analysis.suggestedTitle
  );
  if (reviewSuggestionId) stagedSuggestionIds.push(reviewSuggestionId);

  const followup = driveConnected
    ? 'I drafted a review suggestion (the Drive upload could not be staged).'
    : 'Connect Google Drive in Settings if you want me to upload these files automatically.';

  return {
    reply: `${taggedAttachmentTitle(analysis.classification, analysis.suggestedTitle || params.fileName)}. ${followup}`,
    classification: analysis.classification,
    stagedSuggestionIds,
    createdEntities,
  };
}
