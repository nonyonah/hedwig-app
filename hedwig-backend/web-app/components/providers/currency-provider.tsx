'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

const STORAGE_KEY = 'hedwig-display-currency';
const RATES_STORAGE_KEY = 'hedwig-fx-rates';
const RATES_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface CurrencyMeta {
  code: string;
  label: string;
  symbol: string;
  flag: string;
}

interface CurrencySnapshot {
  base: 'USD';
  fetchedAt: string;
  rates: Record<string, number>; // units of currency per 1 USD
  currencies: CurrencyMeta[];
}

interface CurrencyContextValue {
  /** User's chosen display currency (3-letter ISO). */
  currency: string;
  setCurrency: (code: string) => void;
  symbol: string;
  label: string;
  locale: string;
  /** Available currency options (resolved from the backend snapshot). */
  options: CurrencyMeta[];
  /** Convert an amount stored in USD to the user's display currency. */
  convertFromUsd: (usdAmount: number) => number;
  /** Convert an amount in some currency to USD. */
  convertToUsd: (amount: number, fromCurrency: string) => number;
  /** Format a USD-stored amount in the display currency (after conversion). */
  formatAmount: (usdAmount: number, options?: { compact?: boolean; maximumFractionDigits?: number }) => string;
  /** Convert USD mentions inside assistant-generated text into the display currency. */
  formatUsdText: (text: string) => string;
  /** Format an amount that is *already* in the given currency (no conversion). */
  formatNative: (amount: number, currency: string, options?: { compact?: boolean; maximumFractionDigits?: number }) => string;
  /** True while the rate snapshot is being fetched. */
  loading: boolean;
}

const FALLBACK_META: CurrencyMeta = { code: 'USD', label: 'US Dollar', symbol: '$', flag: '🇺🇸' };

const FALLBACK_OPTIONS: CurrencyMeta[] = [
  { code: 'USD', label: 'US Dollar',         symbol: '$',   flag: '🇺🇸' },
  { code: 'EUR', label: 'Euro',              symbol: '€',   flag: '🇪🇺' },
  { code: 'GBP', label: 'British Pound',     symbol: '£',   flag: '🇬🇧' },
  { code: 'NGN', label: 'Nigerian Naira',    symbol: '₦',   flag: '🇳🇬' },
];

const DEFAULT_VALUE: CurrencyContextValue = {
  currency: 'USD',
  setCurrency: () => {},
  symbol: '$',
  label: 'US Dollar',
  locale: 'en-US',
  options: FALLBACK_OPTIONS,
  convertFromUsd: (v) => v,
  convertToUsd: (v) => v,
  formatAmount: (v) => formatWithIntl(v, 'USD'),
  formatUsdText: (text) => text,
  formatNative: (v, c) => formatWithIntl(v, c),
  loading: false,
};

const CurrencyContext = createContext<CurrencyContextValue>(DEFAULT_VALUE);

function formatWithIntl(value: number, currency: string, options?: { compact?: boolean; maximumFractionDigits?: number }): string {
  const code = (currency || 'USD').toUpperCase();
  const safeCode = /^[A-Z]{3}$/.test(code) ? code : 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCode,
      notation: options?.compact ? 'compact' : 'standard',
      maximumFractionDigits:
        options?.maximumFractionDigits ?? (safeCode === 'USD' || safeCode === 'EUR' || safeCode === 'GBP' ? 2 : 0),
    }).format(value);
  } catch {
    return `${safeCode} ${value.toFixed(2)}`;
  }
}

function parseMoneyText(rawAmount: string, suffix?: string): number {
  const amount = Number(rawAmount.replace(/,/g, ''));
  if (!Number.isFinite(amount)) return NaN;
  const multiplier = suffix?.toLowerCase() === 'm' ? 1_000_000 : suffix?.toLowerCase() === 'k' ? 1_000 : 1;
  return amount * multiplier;
}

function loadCachedSnapshot(): CurrencySnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RATES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { snapshot: CurrencySnapshot; expiresAt: number };
    if (parsed.expiresAt < Date.now()) return null;
    return parsed.snapshot;
  } catch {
    return null;
  }
}

function persistSnapshot(snapshot: CurrencySnapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      RATES_STORAGE_KEY,
      JSON.stringify({ snapshot, expiresAt: Date.now() + RATES_TTL_MS })
    );
  } catch { /* ignore quota */ }
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<string>('USD');
  const [snapshot, setSnapshot] = useState<CurrencySnapshot | null>(() => loadCachedSnapshot());
  const [loading, setLoading] = useState(false);

  // Load saved preference once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && /^[A-Z]{3}$/.test(stored.toUpperCase())) {
      setCurrencyState(stored.toUpperCase());
    }
  }, []);

  // Fetch rate snapshot if missing or stale.
  useEffect(() => {
    if (snapshot) return;
    let cancelled = false;
    setLoading(true);
    fetch('/api/currency/rates', { cache: 'no-store' })
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        if (payload?.success && payload.data?.rates) {
          const snap: CurrencySnapshot = {
            base: 'USD',
            fetchedAt: payload.data.fetchedAt,
            rates: payload.data.rates,
            currencies: payload.data.currencies || FALLBACK_OPTIONS,
          };
          setSnapshot(snap);
          persistSnapshot(snap);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [snapshot]);

  const setCurrency = useCallback((code: string) => {
    const upper = code.toUpperCase();
    if (!/^[A-Z]{3}$/.test(upper)) return;
    setCurrencyState(upper);
    try { window.localStorage.setItem(STORAGE_KEY, upper); } catch {}
  }, []);

  const options = useMemo(() => {
    if (snapshot?.currencies && snapshot.currencies.length > 0) return snapshot.currencies;
    return FALLBACK_OPTIONS;
  }, [snapshot]);

  const meta = useMemo(() => {
    return options.find((c) => c.code === currency) || FALLBACK_META;
  }, [options, currency]);

  const convertFromUsd = useCallback((usdAmount: number) => {
    if (!Number.isFinite(usdAmount)) return 0;
    if (currency === 'USD') return usdAmount;
    const rate = snapshot?.rates?.[currency];
    if (typeof rate !== 'number' || rate <= 0) return usdAmount;
    return usdAmount * rate;
  }, [currency, snapshot]);

  const convertToUsd = useCallback((amount: number, fromCurrency: string) => {
    if (!Number.isFinite(amount)) return 0;
    const from = fromCurrency.toUpperCase();
    if (from === 'USD') return amount;
    const rate = snapshot?.rates?.[from];
    if (typeof rate !== 'number' || rate <= 0) return amount;
    return amount / rate;
  }, [snapshot]);

  const formatAmount = useCallback((usdAmount: number, opts?: { compact?: boolean; maximumFractionDigits?: number }) => {
    return formatWithIntl(convertFromUsd(usdAmount), currency, opts);
  }, [convertFromUsd, currency]);

  const formatUsdText = useCallback((text: string) => {
    if (!text) return text;
    const render = (rawAmount: string, suffix?: string) => {
      const usdAmount = parseMoneyText(rawAmount, suffix);
      if (!Number.isFinite(usdAmount)) return rawAmount;
      return formatAmount(usdAmount, { compact: true });
    };

    return text
      .replace(/\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)([kKmM])?(?:\s+USD\b)?/g, (_match, amount, suffix) => render(amount, suffix))
      .replace(/\bUSD\s+([0-9][0-9,]*(?:\.[0-9]+)?)([kKmM])?\b/g, (_match, amount, suffix) => render(amount, suffix))
      .replace(/\b([0-9][0-9,]*(?:\.[0-9]+)?)([kKmM])?\s+USD\b/g, (_match, amount, suffix) => render(amount, suffix))
      .replace(/\b([0-9][0-9,]*(?:\.[0-9]+)?)([kKmM])?\s+(?:US\s+dollars|dollars)\b/gi, (_match, amount, suffix) => render(amount, suffix));
  }, [formatAmount]);

  const formatNative = useCallback((amount: number, code: string, opts?: { compact?: boolean; maximumFractionDigits?: number }) => {
    return formatWithIntl(amount, code, opts);
  }, []);

  const value = useMemo<CurrencyContextValue>(() => ({
    currency,
    setCurrency,
    symbol: meta.symbol,
    label: meta.label,
    locale: 'en-US',
    options,
    convertFromUsd,
    convertToUsd,
    formatAmount,
    formatUsdText,
    formatNative,
    loading,
  }), [currency, setCurrency, meta, options, convertFromUsd, convertToUsd, formatAmount, formatUsdText, formatNative, loading]);

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

// Backwards-compat exports for older imports.
export type Currency = string;
export const currencyMeta: Record<string, { symbol: string; label: string; flag: string; locale: string }> = {
  USD: { symbol: '$', label: 'US Dollar', flag: '🇺🇸', locale: 'en-US' },
};
