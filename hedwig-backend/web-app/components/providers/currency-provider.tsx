'use client';

import { createContext, useContext } from 'react';

export type Currency = 'USD';

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  symbol: string;
  label: string;
  locale: string;
}

export const currencyMeta: Record<Currency, { symbol: string; label: string; flag: string; locale: string }> = {
  USD: { symbol: '$', label: 'US Dollar', flag: '🇺🇸', locale: 'en-US' }
};

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: 'USD',
  setCurrency: () => {},
  symbol: '$',
  label: 'US Dollar',
  locale: 'en-US'
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const meta = currencyMeta.USD;

  return (
    <CurrencyContext.Provider
      value={{
        currency: 'USD',
        setCurrency: () => {},
        symbol: meta.symbol,
        label: meta.label,
        locale: meta.locale
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
