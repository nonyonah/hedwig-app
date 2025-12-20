/**
 * Currency formatting utilities
 * Used across the app to display amounts in the user's preferred currency
 */

import { Currency } from '../context/SettingsContext';

// Currency symbols
const CURRENCY_SYMBOLS: Record<Currency, string> = {
    USD: '$',
    NGN: '₦',
    GHS: '₵',
    KES: 'KSh',
};

// Approximate exchange rates (for display purposes only)
// In production, these should be fetched from an API
const EXCHANGE_RATES: Record<Currency, number> = {
    USD: 1,
    NGN: 1650,  // 1 USD ≈ 1650 NGN
    GHS: 15.5,  // 1 USD ≈ 15.5 GHS
    KES: 153,   // 1 USD ≈ 153 KES
};

/**
 * Get the currency symbol for a given currency code
 */
export const getCurrencySymbol = (currency: Currency): string => {
    return CURRENCY_SYMBOLS[currency] || '$';
};

/**
 * Format an amount in the user's preferred currency
 * @param amountUSD - Amount in USD
 * @param currency - Target currency
 * @param decimals - Number of decimal places (default 2)
 */
export const formatCurrency = (
    amountUSD: number | string,
    currency: Currency,
    decimals: number = 2
): string => {
    const amount = typeof amountUSD === 'string' ? parseFloat(amountUSD) : amountUSD;

    if (isNaN(amount)) return `${getCurrencySymbol(currency)}0.00`;

    const convertedAmount = amount * EXCHANGE_RATES[currency];
    const symbol = getCurrencySymbol(currency);

    // Format with appropriate decimal places and thousand separators
    const formatted = convertedAmount.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });

    return `${symbol}${formatted}`;
};

/**
 * Format crypto amount with token symbol
 */
export const formatCryptoAmount = (
    amount: number | string,
    token: string,
    decimals: number = 4
): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(num)) return `0 ${token}`;

    return `${num.toFixed(decimals)} ${token}`;
};

/**
 * Get exchange rate for a currency
 */
export const getExchangeRate = (currency: Currency): number => {
    return EXCHANGE_RATES[currency];
};
