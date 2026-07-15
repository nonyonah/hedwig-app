import { parse as csvParse } from 'csv-parse/sync';

export interface ParsedTransaction {
  transactionDate: string;
  description: string;
  originalDescription: string;
  amount: number;
  currency: string;
  type: 'debit' | 'credit';
  runningBalance: number | null;
  reference: string | null;
  bankName: string | null;
}

interface ParseResult {
  source: 'csv' | 'ofx' | 'qfx';
  bankName: string | null;
  accountNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  currency: string;
  transactions: ParsedTransaction[];
  rawTransactionCount: number;
}

function normalizeOfxDate(dateStr: string): string {
  const d = dateStr.replace(/\D/g, '');
  if (d.length >= 8) {
    const y = d.slice(0, 4);
    const m = d.slice(4, 6);
    const day = d.slice(6, 8);
    return `${y}-${m}-${day}`;
  }
  return dateStr;
}

function parseOfxStatement(content: string): ParseResult {
  const result: ParseResult = {
    source: content.startsWith('OFXHEADER') ? 'ofx' : 'qfx',
    bankName: null,
    accountNumber: null,
    startDate: null,
    endDate: null,
    currency: 'USD',
    transactions: [],
    rawTransactionCount: 0,
  };

  const bankIdMatch = content.match(/<BANKID>([^<]*)/i);
  if (bankIdMatch) result.bankName = bankIdMatch[1].trim();

  const acctIdMatch = content.match(/<ACCTID>([^<]*)/i);
  if (acctIdMatch) result.accountNumber = acctIdMatch[1].trim();

  const curDefMatch = content.match(/<CURDEF>([^<]*)/i);
  if (curDefMatch) result.currency = curDefMatch[1].trim().toUpperCase();

  const dtStartMatch = content.match(/<DTSTART>([^<]*)/i);
  if (dtStartMatch) result.startDate = normalizeOfxDate(dtStartMatch[1].trim());

  const dtEndMatch = content.match(/<DTEND>([^<]*)/i);
  if (dtEndMatch) result.endDate = normalizeOfxDate(dtEndMatch[1].trim());

  const transactionRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;

  while ((match = transactionRegex.exec(content)) !== null) {
    result.rawTransactionCount++;
    const block = match[1];

    const trnTypeMatch = block.match(/<TRNTYPE>([^<]*)/i);
    const dtPostedMatch = block.match(/<DTPOSTED>([^<]*)/i);
    const trnAmtMatch = block.match(/<TRNAMT>([^<]*)/i);
    const fitIdMatch = block.match(/<FITID>([^<]*)/i);
    const nameMatch = block.match(/<NAME>([^<]*)/i);
    const memoMatch = block.match(/<MEMO>([^<]*)/i);

    const rawAmount = trnAmtMatch ? parseFloat(trnAmtMatch[1].trim()) : 0;
    const trnType = (trnTypeMatch?.[1] || '').trim().toUpperCase();
    const isDebit = rawAmount < 0 || trnType === 'DEBIT' || trnType === 'CHECK' || trnType === 'WITHDRAWAL' || trnType === 'SERVICE_CHARGE' || trnType === 'ATM' || trnType === 'FEE';

    const memo = memoMatch?.[1]?.trim() || '';
    const name = nameMatch?.[1]?.trim() || '';
    const description = name || memo || 'Unknown transaction';

    result.transactions.push({
      transactionDate: dtPostedMatch ? normalizeOfxDate(dtPostedMatch[1].trim()) : '',
      description,
      originalDescription: [name, memo].filter(Boolean).join(' - '),
      amount: Math.abs(rawAmount),
      currency: result.currency,
      type: isDebit ? 'debit' : 'credit',
      runningBalance: null,
      reference: fitIdMatch?.[1]?.trim() || null,
      bankName: result.bankName,
    });
  }

  return result;
}

interface ColumnMap {
  date: number;
  description: number;
  amount: number;
  type?: number;
  reference?: number;
  runningBalance?: number;
}

function detectCsvColumns(headers: string[]): ColumnMap | null {
  const map: Partial<ColumnMap> = {};
  const lower = headers.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));

  for (let i = 0; i < lower.length; i++) {
    const h = lower[i];
    if (/^(date|posted|posting|transactiondate|transdate|trndate)/.test(h)) map.date = i;
    else if (/^(description|memo|narrative|details|particulars|note|name|payee|merchant)/.test(h)) map.description = i;
    else if (/^(amount|value|sum|credit|debit|txnamount|transactionamount)/.test(h)) map.amount = i;
    else if (/^(type|trntype|transactiontype|txntype)/.test(h)) map.type = i;
    else if (/^(reference|ref|fitid|transactionid|txnid|id)/.test(h)) map.reference = i;
    else if (/^(balance|runningbalance|running_balance|available)/.test(h)) map.runningBalance = i;
  }

  if (map.date === undefined || map.description === undefined || map.amount === undefined) return null;
  return {
    date: map.date,
    description: map.description,
    amount: map.amount,
    type: map.type,
    reference: map.reference,
    runningBalance: map.runningBalance,
  };
}

function parseCsvAmount(val: string): number {
  const cleaned = val.replace(/[^0-9.\-]/g, '');
  return parseFloat(cleaned) || 0;
}

function parseCsvDate(val: string, format?: string): string {
  const cleaned = val.trim().replace(/['"]/g, '');
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10);

  const parts = cleaned.split(/[/\-.]/);
  if (parts.length === 3) {
    if (format === 'DD/MM/YYYY' || format === 'DD-MM-YYYY') {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    const c = parseInt(parts[2], 10);
    const year = c > 1000 ? c : (a > 1000 ? a : 2000 + c);
    if (a > 1000) return `${a}-${b.toString().padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    if (b > 12) return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }

  if (/^[A-Z][a-z]{2}\s+\d{1,2}/.test(cleaned)) {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  return cleaned;
}

function parseCsvStatement(content: string): ParseResult {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV file is empty or has no data rows');

  const result: ParseResult = {
    source: 'csv',
    bankName: null,
    accountNumber: null,
    startDate: null,
    endDate: null,
    currency: 'USD',
    transactions: [],
    rawTransactionCount: 0,
  };

  const parsed = csvParse(content, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as string[][];

  if (parsed.length < 2) throw new Error('CSV file has no data rows after parsing');

  const headerRow = parsed[0];
  const columnMap = detectCsvColumns(headerRow);
  if (!columnMap) throw new Error('Could not detect CSV columns. Required: date, description, amount.');

  const dataRows = parsed.slice(1);
  result.rawTransactionCount = dataRows.length;

  let hasTypeColumn = columnMap.type !== undefined;

  for (const row of dataRows) {
    if (row.length <= Math.max(columnMap.date, columnMap.description, columnMap.amount)) continue;
    if (row[columnMap.date]?.trim() === '' || row[columnMap.amount]?.trim() === '') continue;

    const rawAmount = parseCsvAmount(row[columnMap.amount]);
    if (rawAmount === 0) continue;

    let type: 'debit' | 'credit';
    if (hasTypeColumn && columnMap.type !== undefined) {
      const typeVal = row[columnMap.type]?.toLowerCase().trim() || '';
      type = (typeVal === 'credit' || typeVal === 'deposit') ? 'credit' : 'debit';
    } else {
      type = rawAmount >= 0 ? 'credit' : 'debit';
    }

    const description = row[columnMap.description]?.trim() || 'Unknown transaction';
    const balance = columnMap.runningBalance !== undefined ? parseCsvAmount(row[columnMap.runningBalance]) : null;

    result.transactions.push({
      transactionDate: parseCsvDate(row[columnMap.date]),
      description,
      originalDescription: description,
      amount: Math.abs(rawAmount),
      currency: result.currency,
      type,
      runningBalance: balance,
      reference: columnMap.reference !== undefined ? row[columnMap.reference]?.trim() || null : null,
      bankName: result.bankName,
    });
  }

  result.transactions.reverse();

  if (result.transactions.length > 0) {
    result.startDate = result.transactions[0].transactionDate;
    result.endDate = result.transactions[result.transactions.length - 1].transactionDate;
  }

  return result;
}

export function parseStatement(content: string, filename: string): ParseResult {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.ofx') || lower.endsWith('.qfx')) {
    return parseOfxStatement(content);
  }
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    return parseCsvStatement(content);
  }
  throw new Error(`Unsupported file format: ${filename}. Use CSV, OFX, or QFX.`);
}
