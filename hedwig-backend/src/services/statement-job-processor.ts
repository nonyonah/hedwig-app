import { supabase } from '../lib/supabase';
import { llmService } from './llm';
import { createLogger } from '../utils/logger';
import { convertToUsd, getRate } from './currency';
import { jsonrepair } from 'jsonrepair';
import { emitFinancialEvent, FINANCIAL_EVENT_TYPES } from './financial-events';

const logger = createLogger('StatementJobProcessor');

interface ChunkResult {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  status: 'success' | 'error';
  transactions?: MergedTransaction[];
  bankName?: string | null;
  accountNumber?: string | null;
  currency?: string;
  error?: string;
}

interface MergedTransaction {
  transactionDate: string;
  description: string;
  originalDescription: string;
  amount: number;
  type: 'debit' | 'credit';
  runningBalance: number | null;
}

const CHUNK_MAX_CHARS = 8000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000];

const FIRST_CHUNK_PROMPT = `Extract ALL bank transactions from the statement text below.
Return ONLY valid JSON with no markdown fences, no commentary.

{
  "bankName": "Full legal bank name (e.g. Guaranty Trust Bank, OPay, Access Bank, Chase, Barclays, or null)",
  "accountNumber": "Account number or null",
  "currency": "3-letter ISO code inferred from the statement (e.g. NGN for Nigerian naira, USD for US dollar, KES for Kenyan shilling, GHS for Ghana cedi, ZAR for South African rand, EUR for euro, GBP for British pound). Read the currency symbol or country context from the statement text.",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Full transaction description",
      "originalDescription": "Original line from statement",
      "amount": 123.45,
      "type": "debit",
      "runningBalance": 1000.00
    }
  ]
}

Rules:
- Include EVERY visible transaction, do not skip any
- Debit = money out, Credit = money in
- Amount must be positive; use "type" for direction
- Date format: YYYY-MM-DD
- bankName must be the recognizable bank name, NOT "Unknown", "N/A", or empty. Use null only if truly unknown.
- Currency MUST be detected from the statement text (symbols: \u20A6=NGN, \u20AC=EUR, \u00A3=GBP, \u20B5=GHS, KSh/KES, R=ZAR, $=check country context). Do NOT default to USD unless the statement clearly uses US dollars.`;

const FOLLOW_CHUNK_PROMPT = `Extract ALL bank transactions from the statement text below (continuation of a multi-page statement).
Return ONLY valid JSON with no markdown fences, no commentary.

{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Full transaction description",
      "originalDescription": "Original line from statement",
      "amount": 123.45,
      "type": "debit",
      "runningBalance": 1000.00
    }
  ]
}

Rules:
- Include EVERY visible transaction, do not skip any
- Debit = money out, Credit = money in
- Amount must be positive; use "type" for direction
- Date format: YYYY-MM-DD`;

function tryExtractJson(text: string): Record<string, unknown> | null {
  let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/\s*```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  try { return JSON.parse(jsonrepair(cleaned)); } catch { /* fall through */ }
  let depth = 0;
  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = cleaned.slice(start, i + 1);
        try { return JSON.parse(jsonrepair(candidate)); } catch { /* continue */ }
      }
    }
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(jsonrepair(match[0])); } catch { /* give up */ }
  }
  return null;
}

function normalizeCurrency(curr: string): string | null {
  const known = new Set(['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'KES', 'ZAR', 'CAD', 'AUD', 'JPY', 'CNY', 'INR', 'BRL', 'MXN']);
  const upper = curr.toUpperCase().trim();
  if (known.has(upper)) return upper;
  if (upper.startsWith('USD')) return 'USD';
  if (upper.startsWith('EUR')) return 'EUR';
  if (upper.startsWith('NGN')) return 'NGN';
  if (upper.startsWith('GBP')) return 'GBP';
  return upper.length === 3 ? upper : null;
}

function summarizeError(error: any): string {
  if (!error) return 'unknown error';
  if (typeof error === 'string') return error;
  const parts = [error.message, error.details, error.hint, error.code ? `code=${error.code}` : null]
    .filter((p): p is string => Boolean(p && String(p).trim()));
  return parts.length > 0 ? parts.join(' | ') : JSON.stringify(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkPageTexts(pageTexts: Array<{ num: number; text: string }>): Array<{ pageStart: number; pageEnd: number; text: string }> {
  const chunks: Array<{ pageStart: number; pageEnd: number; text: string }> = [];
  let currentPages: Array<{ num: number; text: string }> = [];
  let currentLength = 0;

  for (const page of pageTexts) {
    if (currentLength > 0 && currentLength + page.text.length > CHUNK_MAX_CHARS) {
      chunks.push({
        pageStart: currentPages[0].num,
        pageEnd: currentPages[currentPages.length - 1].num,
        text: currentPages.map((p) => `--- Page ${p.num} ---\n${p.text}`).join('\n\n'),
      });
      currentPages = [];
      currentLength = 0;
    }
    currentPages.push(page);
    currentLength += page.text.length;
  }

  if (currentPages.length > 0) {
    chunks.push({
      pageStart: currentPages[0].num,
      pageEnd: currentPages[currentPages.length - 1].num,
      text: currentPages.map((p) => `--- Page ${p.num} ---\n${p.text}`).join('\n\n'),
    });
  }

  return chunks;
}

async function processChunk(
  chunkIndex: number,
  chunk: { pageStart: number; pageEnd: number; text: string },
): Promise<ChunkResult> {
  const isFirstChunk = chunkIndex === 0;
  let lastRawText = '';

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const prompt = `${isFirstChunk ? FIRST_CHUNK_PROMPT : FOLLOW_CHUNK_PROMPT}\n\nStatement text:\n\n${chunk.text}`;
      const raw = await llmService.generateText(prompt, {
        maxOutputTokens: 4096,
        temperature: 0.1,
        provider: 'openrouter',
      });
      const text = raw.trim();
      lastRawText = text;

      const parsed = tryExtractJson(text);
      if (!parsed) {
        throw new Error(`Unparseable JSON (attempt ${attempt + 1}): ${text.slice(0, 300)}`);
      }

      const rawTxns = Array.isArray(parsed.transactions) ? (parsed.transactions as any[]) : [];
      if (rawTxns.length === 0) {
        throw new Error(`Zero transactions returned (attempt ${attempt + 1})`);
      }

      const transactions = rawTxns.map((t: any) => ({
        transactionDate: String(t.date || t.transactionDate || '').slice(0, 10),
        description: String(t.description || '').trim(),
        originalDescription: String(t.originalDescription || t.description || '').trim().slice(0, 500) as string,
        amount: typeof t.amount === 'number' && t.amount > 0 ? t.amount : 0,
        type: t.type === 'credit' || t.type === 'deposit' ? 'credit' as const : 'debit' as const,
        runningBalance: typeof t.runningBalance === 'number' ? t.runningBalance : null,
      }));

      logger.info(`Chunk ${chunkIndex + 1} succeeded (${transactions.length} txns)`, {
        attempt: attempt + 1,
        pageRange: `p${chunk.pageStart}-p${chunk.pageEnd}`,
      });

      return {
        chunkIndex,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        status: 'success',
        transactions,
        bankName: isFirstChunk ? (parsed.bankName as string | undefined) : undefined,
        accountNumber: isFirstChunk ? (parsed.accountNumber as string | undefined) : undefined,
        currency: isFirstChunk ? normalizeCurrency(String(parsed.currency || 'USD')) || 'USD' : undefined,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Chunk ${chunkIndex + 1} attempt ${attempt + 1} failed`, {
        error: errMsg,
        rawSnippet: lastRawText ? lastRawText.slice(0, 500) : undefined,
      });

      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BACKOFF_MS[attempt] || 4000);
      }
    }
  }

  return {
    chunkIndex,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    status: 'error',
    error: `Failed after ${MAX_RETRIES} attempts. Last response: ${lastRawText.slice(0, 500)}`,
  };
}

export async function processStatementJob(jobId: string): Promise<void> {
  logger.info(`Starting statement job: ${jobId}`);

  try {
    const { data: job, error: fetchErr } = await supabase
      .from('statement_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchErr || !job) {
      logger.error(`Job not found: ${jobId}`, { error: fetchErr });
      return;
    }

    const fileBuffer = Buffer.from(job.file_data as string, 'base64');
    const pageTexts: Array<{ num: number; text: string }> = [];

    if (job.file_format === 'pdf') {
      try {
        const { PDFParse } = require('pdf-parse');
        const pdfDoc = new PDFParse({ data: fileBuffer });
        try {
          const pdfResult = await pdfDoc.getText();
          if (pdfResult?.pages && Array.isArray(pdfResult.pages)) {
            for (const page of pdfResult.pages) {
              const pageText = (page.text || '').trim();
              if (pageText) {
                pageTexts.push({ num: page.num, text: pageText });
              }
            }
          }
        } finally {
          await pdfDoc.destroy();
        }
      } catch (e) {
        logger.error('pdf-parse failed for job', { jobId, error: (e as Error).message });
        await markJobFailed(jobId, `PDF text extraction failed: ${(e as Error).message}`);
        return;
      }
    }

    if (pageTexts.length === 0) {
      logger.error('No text extracted from PDF', { jobId });
      await markJobFailed(jobId, 'No text could be extracted from this PDF.');
      return;
    }

    const chunks = chunkPageTexts(pageTexts);
    if (chunks.length === 0) {
      await markJobFailed(jobId, 'No content extracted from document.');
      return;
    }

    logger.info(`Job ${jobId}: split into ${chunks.length} chunks`, {
      pages: pageTexts.length,
      chunks: chunks.map((c) => `p${c.pageStart}-p${c.pageEnd}`),
    });

    await supabase
      .from('statement_jobs')
      .update({
        chunk_count: chunks.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    const results = await Promise.allSettled(
      chunks.map((chunk, index) => processChunk(index, chunk)),
    );

    const chunkResults: ChunkResult[] = results.map((r, i) =>
      r.status === 'fulfilled' ? r.value : {
        chunkIndex: i,
        pageStart: chunks[i]?.pageStart || 0,
        pageEnd: chunks[i]?.pageEnd || 0,
        status: 'error' as const,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      },
    );

    const successResults = chunkResults.filter((r) => r.status === 'success');
    const failResults = chunkResults.filter((r) => r.status === 'error');

    if (successResults.length === 0) {
      const firstError = chunkResults[0]?.error || 'Unknown error';
      await markJobFailed(jobId, `All chunks failed. First error: ${firstError}`);
      return;
    }

    const allTransactions: MergedTransaction[] = [];
    for (const result of successResults) {
      if (result.transactions) {
        allTransactions.push(...result.transactions);
      }
    }

    allTransactions.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

    const deduplicated = deduplicateTransactions(allTransactions);

    const firstResult = successResults[0];
    let bankName = firstResult?.bankName || null;
    const accountNumber = firstResult?.accountNumber || null;
    const currency = firstResult?.currency || 'USD';

    // Fallback: try to detect bank name from first page text
    if (!bankName && pageTexts.length > 0) {
      const firstPageText = pageTexts.slice(0, 3).map((p) => p.text).join(' ');
      bankName = detectBankName(firstPageText);
    }

    const minDate = deduplicated.length > 0
      ? deduplicated.reduce((min, t) => t.transactionDate < min ? t.transactionDate : min, deduplicated[0].transactionDate)
      : null;
    const maxDate = deduplicated.length > 0
      ? deduplicated.reduce((max, t) => t.transactionDate > max ? t.transactionDate : max, deduplicated[0].transactionDate)
      : null;

    if (deduplicated.length === 0) {
      await markJobFailed(jobId, 'No transactions found in the extracted data.');
      return;
    }

    // ── Insert statement_imports record ──
    let totalDebits = 0;
    let totalCredits = 0;
    for (const txn of deduplicated) {
      if (txn.type === 'debit') totalDebits += txn.amount;
      else totalCredits += txn.amount;
    }

    const { data: stmtRecord, error: stmtErr } = await supabase
      .from('statement_imports')
      .insert({
        user_id: job.user_id,
        workspace_id: job.workspace_id,
        original_filename: job.original_filename,
        file_format: 'csv',
        bank_name: bankName,
        account_number: accountNumber,
        start_date: minDate,
        end_date: maxDate,
        currency,
        transaction_count: deduplicated.length,
        total_debits: totalDebits || null,
        total_credits: totalCredits || null,
        status: 'reviewing',
      })
      .select('id')
      .single();

    if (stmtErr || !stmtRecord) {
      throw new Error(`Failed to create statement record: ${summarizeError(stmtErr)}`);
    }

    const statementId = stmtRecord.id;

    // ── Compute USD conversions and insert transactions ──
    const enrichedTxns = await Promise.all(deduplicated.map(async (txn) => {
      let convertedAmountUsd: number | null = null;
      let fxRate: number | null = null;
      let fxSource: string | null = null;

      if (currency !== 'USD' && txn.amount > 0) {
        try {
          convertedAmountUsd = await convertToUsd(txn.amount, currency);
          const rate = await getRate('USD', currency).catch(() => null);
          if (rate && rate > 0) {
            fxRate = rate;
            fxSource = 'frankfurter';
          }
        } catch {
          // keep null
        }
      } else {
        convertedAmountUsd = txn.amount;
        fxRate = 1;
        fxSource = 'identity';
      }

      return {
        user_id: job.user_id,
        workspace_id: job.workspace_id,
        statement_id: statementId,
        transaction_date: txn.transactionDate || new Date().toISOString().slice(0, 10),
        description: txn.description,
        original_description: txn.originalDescription,
        amount: txn.amount,
        currency,
        type: txn.type,
        bank_name: bankName,
        account_number: accountNumber,
        running_balance: txn.runningBalance,
        reference: null,
        converted_amount_usd: convertedAmountUsd,
        fx_rate: fxRate,
        fx_source: fxSource,
        status: 'pending',
      };
    }));

    const { data: insertedTxns, error: insertErr } = await supabase
      .from('imported_transactions')
      .insert(enrichedTxns)
      .select('id, transaction_date, description, original_description, amount, currency, type, running_balance, reference, bank_name, converted_amount_usd, fx_rate, fx_source');

    if (insertErr || !insertedTxns) {
      await supabase.from('statement_imports').delete().eq('id', statementId);
      throw new Error(`Failed to insert transactions: ${summarizeError(insertErr)}`);
    }

    // ── Emit financial events (idempotent per imported transaction id) ──
    await Promise.all(insertedTxns.map(async (txn) => {
      await emitFinancialEvent({
        userId: job.user_id,
        workspaceId: job.workspace_id,
        eventType: FINANCIAL_EVENT_TYPES.IMPORTED_TRANSACTION_CREATED,
        entityType: 'imported_transaction',
        entityId: txn.id,
        version: 1,
        occurredAt: txn.transaction_date || new Date(),
        amount: txn.amount,
        currency: txn.currency || 'USD',
        amountUsd: txn.converted_amount_usd ?? null,
        fxRateUsd: txn.fx_rate ?? null,
        fxSource: txn.fx_source ?? null,
        direction: txn.type === 'debit' ? 'out' : 'in',
        source: 'statement_job',
        correlationId: statementId,
        payload: {
          statement_id: statementId,
          bank_name: txn.bank_name ?? null,
          description: txn.description ?? null,
          original_description: txn.original_description ?? null,
          type: txn.type,
        },
      });
    }));

    // ── Save result ──
    const chunkInfo = chunkResults.map((r) => ({
      chunkIndex: r.chunkIndex,
      pageRange: `p${r.pageStart}-p${r.pageEnd}`,
      status: r.status,
      transactionCount: r.status === 'success' ? (r.transactions?.length || 0) : 0,
      error: r.error || null,
    }));

    const finalStatus = failResults.length === 0 ? 'complete' : 'partial';

    await supabase
      .from('statement_jobs')
      .update({
        status: finalStatus,
        chunk_success_count: successResults.length,
        chunk_fail_count: failResults.length,
        chunk_info: JSON.stringify(chunkInfo),
        result: JSON.stringify({
          statementId,
          bankName,
          accountNumber,
          startDate: minDate,
          endDate: maxDate,
          currency,
          transactionCount: insertedTxns.length,
          transactions: insertedTxns,
          chunkReport: failResults.length > 0 ? {
            failedPages: failResults.map((r) => `p${r.pageStart}-p${r.pageEnd}`),
            message: `${failResults.length} of ${chunks.length} chunks failed. Some pages may need manual review.`,
          } : null,
        }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    logger.info(`Statement job ${jobId} complete (${finalStatus})`, {
      chunks: chunks.length,
      succeeded: successResults.length,
      failed: failResults.length,
      transactions: deduplicated.length,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Statement job ${jobId} crashed`, { error: errMsg });
    await markJobFailed(jobId, `Processing error: ${errMsg}`);
  }
}

async function markJobFailed(jobId: string, message: string): Promise<void> {
  await supabase
    .from('statement_jobs')
    .update({
      status: 'failed',
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  logger.error(`Job ${jobId} marked as failed`, { error: message });
}

function deduplicateTransactions(transactions: MergedTransaction[]): MergedTransaction[] {
  if (transactions.length === 0) return [];

  const seen = new Set<string>();
  const result: MergedTransaction[] = [];

  for (const txn of transactions) {
    const key = `${txn.transactionDate}|${txn.description}|${txn.amount}|${txn.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(txn);
    }
  }

  return result;
}

const KNOWN_BANK_PATTERNS = [
  /\b(opay|palmpay|moniepoint|kuda|flutterwave|paystack|interswitch)\b/i,
  /\b(gtbank|gtco|guaranty.?trust)\b/i,
  /\b(access.?bank|diamond.?bank)\b/i,
  /\b(first.?bank|fbn|firstbank)\b/i,
  /\b(uba|united.?bank.?for.?africa)\b/i,
  /\b(zenith.?bank)\b/i,
  /\b(fcmb|first.?city)\b/i,
  /\b(stanbic|stanbic.?ibtc)\b/i,
  /\b(ecobank)\b/i,
  /\b(polaris.?bank)\b/i,
  /\b(sterling.?bank)\b/i,
  /\b(wema.?bank|altbank)\b/i,
  /\b(union.?bank)\b/i,
  /\b(keystone.?bank)\b/i,
  /\b(chase|jpmorgan|bank.?of.?america|bofa|wells.?fargo|citibank|citi|capital.?one)\b/i,
  /\b(barclays|hsbc|lloyds|natwest|halifax|santander)\b/i,
  /\b(ing|deutsche.?bank|commerzbank|societe.?generale|bnp.?paribas)\b/i,
  /\b(nedbank|absa|standard.?bank|first.?national.?bank|fnb|capitec)\b/i,
  /\b(mpesa|equity.?bank|kcb|cooperative.?bank)\b/i,
];

export function detectBankName(text: string): string | null {
  for (const pattern of KNOWN_BANK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1] || match[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return null;
}
