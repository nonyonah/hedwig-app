import { createLogger } from '../utils/logger';

const logger = createLogger('CurrencyService');

const FRANKFURTER_BASE = 'https://api.frankfurter.app';
const FALLBACK_BASE = 'https://open.er-api.com/v6/latest/USD';
const RATE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const STALE_RATE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_FETCH_TIMEOUT_MS = Number(process.env.FX_RATE_FETCH_TIMEOUT_MS || 2500);

// Frankfurter follows ECB and does not include NGN. We supplement with
// open.er-api.com so users in Nigeria get sensible conversions.
const FRANKFURTER_CURRENCIES = [
  'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP',
  'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR',
  'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD',
  'ZAR',
];

// Currencies we expose in addition to what Frankfurter returns.
// Rates for these are sourced from the fallback API (or env overrides).
const EXTENDED_CURRENCIES = ['NGN', 'GHS', 'KES', 'UGX', 'TZS', 'XAF', 'XOF', 'EGP', 'AED', 'SAR'];

export interface CurrencyMeta {
  code: string;
  label: string;
  symbol: string;
  flag: string;
}

const CURRENCY_META: Record<string, CurrencyMeta> = {
  USD: { code: 'USD', label: 'US Dollar',         symbol: '$',   flag: '🇺🇸' },
  EUR: { code: 'EUR', label: 'Euro',              symbol: '€',   flag: '🇪🇺' },
  GBP: { code: 'GBP', label: 'British Pound',     symbol: '£',   flag: '🇬🇧' },
  NGN: { code: 'NGN', label: 'Nigerian Naira',    symbol: '₦',   flag: '🇳🇬' },
  GHS: { code: 'GHS', label: 'Ghanaian Cedi',     symbol: '₵',   flag: '🇬🇭' },
  KES: { code: 'KES', label: 'Kenyan Shilling',   symbol: 'KSh', flag: '🇰🇪' },
  UGX: { code: 'UGX', label: 'Ugandan Shilling',  symbol: 'USh', flag: '🇺🇬' },
  TZS: { code: 'TZS', label: 'Tanzanian Shilling',symbol: 'TSh', flag: '🇹🇿' },
  XAF: { code: 'XAF', label: 'CFA Franc (BEAC)',  symbol: 'FCFA',flag: '🌍' },
  XOF: { code: 'XOF', label: 'CFA Franc (BCEAO)', symbol: 'CFA', flag: '🌍' },
  EGP: { code: 'EGP', label: 'Egyptian Pound',    symbol: 'E£',  flag: '🇪🇬' },
  AED: { code: 'AED', label: 'UAE Dirham',        symbol: 'د.إ', flag: '🇦🇪' },
  SAR: { code: 'SAR', label: 'Saudi Riyal',       symbol: '﷼',   flag: '🇸🇦' },
  AUD: { code: 'AUD', label: 'Australian Dollar', symbol: 'A$',  flag: '🇦🇺' },
  CAD: { code: 'CAD', label: 'Canadian Dollar',   symbol: 'C$',  flag: '🇨🇦' },
  JPY: { code: 'JPY', label: 'Japanese Yen',      symbol: '¥',   flag: '🇯🇵' },
  CNY: { code: 'CNY', label: 'Chinese Yuan',      symbol: '¥',   flag: '🇨🇳' },
  INR: { code: 'INR', label: 'Indian Rupee',      symbol: '₹',   flag: '🇮🇳' },
  BRL: { code: 'BRL', label: 'Brazilian Real',    symbol: 'R$',  flag: '🇧🇷' },
  MXN: { code: 'MXN', label: 'Mexican Peso',      symbol: '$',   flag: '🇲🇽' },
  ZAR: { code: 'ZAR', label: 'South African Rand',symbol: 'R',   flag: '🇿🇦' },
  CHF: { code: 'CHF', label: 'Swiss Franc',       symbol: 'CHF', flag: '🇨🇭' },
  HKD: { code: 'HKD', label: 'Hong Kong Dollar',  symbol: 'HK$', flag: '🇭🇰' },
  SGD: { code: 'SGD', label: 'Singapore Dollar',  symbol: 'S$',  flag: '🇸🇬' },
  NZD: { code: 'NZD', label: 'New Zealand Dollar',symbol: 'NZ$', flag: '🇳🇿' },
  KRW: { code: 'KRW', label: 'South Korean Won',  symbol: '₩',   flag: '🇰🇷' },
  TRY: { code: 'TRY', label: 'Turkish Lira',      symbol: '₺',   flag: '🇹🇷' },
  PLN: { code: 'PLN', label: 'Polish Złoty',      symbol: 'zł',  flag: '🇵🇱' },
  SEK: { code: 'SEK', label: 'Swedish Krona',     symbol: 'kr',  flag: '🇸🇪' },
  NOK: { code: 'NOK', label: 'Norwegian Krone',   symbol: 'kr',  flag: '🇳🇴' },
  DKK: { code: 'DKK', label: 'Danish Krone',      symbol: 'kr',  flag: '🇩🇰' },
  THB: { code: 'THB', label: 'Thai Baht',         symbol: '฿',   flag: '🇹🇭' },
  IDR: { code: 'IDR', label: 'Indonesian Rupiah', symbol: 'Rp',  flag: '🇮🇩' },
  PHP: { code: 'PHP', label: 'Philippine Peso',   symbol: '₱',   flag: '🇵🇭' },
  MYR: { code: 'MYR', label: 'Malaysian Ringgit', symbol: 'RM',  flag: '🇲🇾' },
  CZK: { code: 'CZK', label: 'Czech Koruna',      symbol: 'Kč',  flag: '🇨🇿' },
  HUF: { code: 'HUF', label: 'Hungarian Forint',  symbol: 'Ft',  flag: '🇭🇺' },
  RON: { code: 'RON', label: 'Romanian Leu',      symbol: 'lei', flag: '🇷🇴' },
  BGN: { code: 'BGN', label: 'Bulgarian Lev',     symbol: 'лв',  flag: '🇧🇬' },
  ILS: { code: 'ILS', label: 'Israeli Shekel',    symbol: '₪',   flag: '🇮🇱' },
  ISK: { code: 'ISK', label: 'Icelandic Króna',   symbol: 'kr',  flag: '🇮🇸' },
};

export const SUPPORTED_CURRENCIES: string[] = Array.from(
  new Set([...FRANKFURTER_CURRENCIES, ...EXTENDED_CURRENCIES])
).sort();

export interface RateSnapshot {
  base: 'USD';
  fetchedAt: string;
  rates: Record<string, number>; // code → units of that currency per 1 USD
  source: 'cache' | 'stale-cache' | 'frankfurter+fallback' | 'fallback' | 'frankfurter' | 'env';
}

let cache: { data: RateSnapshot; expiresAt: number } | null = null;
let staleCache: { data: RateSnapshot; expiresAt: number } | null = null;
let inFlightSnapshot: Promise<RateSnapshot> | null = null;

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`${resp.status}`);
    return await resp.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFrankfurter(): Promise<Record<string, number>> {
  const url = `${FRANKFURTER_BASE}/latest?from=USD&to=${FRANKFURTER_CURRENCIES.filter(c => c !== 'USD').join(',')}`;
  const json = await fetchJson<{ rates?: Record<string, number> }>(url, RATE_FETCH_TIMEOUT_MS);
  return { USD: 1, ...(json.rates || {}) };
}

async function fetchFallback(): Promise<Record<string, number>> {
  const json = await fetchJson<{ rates?: Record<string, number> }>(FALLBACK_BASE, RATE_FETCH_TIMEOUT_MS);
  return json.rates || {};
}

function envRateOverride(code: string): number | null {
  const value = process.env[`FX_RATE_${code}_PER_USD`];
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function getRateSnapshot(): Promise<RateSnapshot> {
  if (cache && cache.expiresAt > Date.now()) {
    return { ...cache.data, source: 'cache' };
  }

  if (staleCache && staleCache.expiresAt > Date.now()) {
    if (!inFlightSnapshot) {
      inFlightSnapshot = refreshRateSnapshot().finally(() => {
        inFlightSnapshot = null;
      });
    }
    return { ...staleCache.data, source: 'stale-cache' };
  }

  if (inFlightSnapshot) {
    return inFlightSnapshot;
  }

  inFlightSnapshot = refreshRateSnapshot().finally(() => {
    inFlightSnapshot = null;
  });
  return inFlightSnapshot;
}

async function refreshRateSnapshot(): Promise<RateSnapshot> {
  let rates: Record<string, number> = { USD: 1 };
  let source: RateSnapshot['source'] = 'env';

  const [frankfurterResult, fallbackResult] = await Promise.allSettled([
    fetchFrankfurter(),
    fetchFallback(),
  ]);

  if (frankfurterResult.status === 'fulfilled') {
    const frankfurterRates = frankfurterResult.value;
    rates = { ...rates, ...frankfurterRates };
    source = 'frankfurter';
  } else {
    logger.warn('Frankfurter fetch failed', {
      message: frankfurterResult.reason instanceof Error ? frankfurterResult.reason.message : String(frankfurterResult.reason),
    });
  }

  // Supplement with fallback for currencies Frankfurter doesn't cover (NGN, etc.).
  const missing = SUPPORTED_CURRENCIES.filter((code) => rates[code] === undefined);
  if (fallbackResult.status === 'fulfilled') {
    const fallbackRates = fallbackResult.value;
    for (const code of missing) {
      if (typeof fallbackRates[code] === 'number') rates[code] = fallbackRates[code];
    }
    source = source === 'frankfurter' ? 'frankfurter+fallback' : 'fallback';
  } else if (missing.length > 0) {
    logger.warn('Fallback fetch failed', {
      message: fallbackResult.reason instanceof Error ? fallbackResult.reason.message : String(fallbackResult.reason),
    });
  }

  // Apply env overrides last so admins can pin a rate (e.g., FX_RATE_NGN_PER_USD=1550).
  for (const code of SUPPORTED_CURRENCIES) {
    const override = envRateOverride(code);
    if (override !== null) rates[code] = override;
  }

  const snapshot: RateSnapshot = {
    base: 'USD',
    fetchedAt: new Date().toISOString(),
    rates,
    source,
  };

  if (Object.keys(rates).length <= 1 && staleCache && staleCache.expiresAt > Date.now()) {
    logger.warn('Returning stale FX rates because live providers were unavailable');
    return { ...staleCache.data, source: 'stale-cache' };
  }

  cache = { data: snapshot, expiresAt: Date.now() + RATE_CACHE_TTL_MS };
  staleCache = { data: snapshot, expiresAt: Date.now() + STALE_RATE_CACHE_TTL_MS };
  return snapshot;
}

export function warmRateSnapshot(): void {
  void getRateSnapshot().catch((error) => {
    logger.warn('FX rate warmup failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function getRate(from: string, to: string): Promise<number> {
  const f = String(from).toUpperCase();
  const t = String(to).toUpperCase();
  if (f === t) return 1;

  const snapshot = await getRateSnapshot();
  const fromRate = snapshot.rates[f]; // units of `from` per 1 USD
  const toRate = snapshot.rates[t];   // units of `to` per 1 USD

  if (!fromRate || !toRate) {
    throw new Error(`No FX rate available for ${f}→${t}`);
  }
  // amount_in_to = amount_in_from / fromRate * toRate
  return toRate / fromRate;
}

export async function convertToUsd(amount: number, from: string): Promise<number> {
  const fromUpper = String(from).toUpperCase();
  if (fromUpper === 'USD') return amount;
  const rate = await getRate(fromUpper, 'USD'); // USD per 1 unit of `from`
  return amount * rate;
}

export async function convertFromUsd(usdAmount: number, to: string): Promise<number> {
  const toUpper = String(to).toUpperCase();
  if (toUpper === 'USD') return usdAmount;
  const rate = await getRate('USD', toUpper); // units of `to` per 1 USD
  return usdAmount * rate;
}

export function listCurrencyMeta(): CurrencyMeta[] {
  return SUPPORTED_CURRENCIES.map((code) =>
    CURRENCY_META[code] || { code, label: code, symbol: code, flag: '🌐' }
  );
}

export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_CURRENCIES.includes(String(code).toUpperCase());
}
