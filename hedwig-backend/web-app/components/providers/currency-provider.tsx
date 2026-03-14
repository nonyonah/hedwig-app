'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type Currency = 'USD' | 'NGN' | 'KES';

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  symbol: string;
  label: string;
  locale: string;
}

export const currencyMeta: Record<Currency, { symbol: string; label: string; flag: string; locale: string }> = {
  USD: { symbol: '$', label: 'US Dollar', flag: '🇺🇸', locale: 'en-US' },
  NGN: { symbol: '₦', label: 'Nigerian Naira', flag: '🇳🇬', locale: 'en-NG' },
  KES: { symbol: 'KSh', label: 'Kenyan Shilling', flag: '🇰🇪', locale: 'en-KE' }
};

const STORAGE_KEY = 'hedwig-currency';

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: 'USD',
  setCurrency: () => {},
  symbol: '$',
  label: 'US Dollar',
  locale: 'en-US'
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>('USD');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Currency | null;
    if (stored && stored in currencyMeta) {
      setCurrencyState(stored);
    }
  }, []);

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    localStorage.setItem(STORAGE_KEY, c);
  };

  const meta = currencyMeta[currency];

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, symbol: meta.symbol, label: meta.label, locale: meta.locale }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
