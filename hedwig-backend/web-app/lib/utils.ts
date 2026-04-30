import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function normalizeDisplayCurrency(currency = 'USD'): string {
  const normalized = String(currency || 'USD').trim().toUpperCase();
  if (normalized === 'USDC' || normalized === 'USDT') return 'USD';
  if (normalized === '₦' || normalized === 'NAIRA') return 'NGN';
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'USD';
}

export function formatCurrency(value: number, currency = 'USD') {
  const displayCurrency = normalizeDisplayCurrency(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: displayCurrency,
    maximumFractionDigits: displayCurrency === 'USD' ? 2 : 0
  }).format(value);
}

export function formatCompactCurrency(value: number, currency = 'USD') {
  const displayCurrency = normalizeDisplayCurrency(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: displayCurrency,
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
}

export function formatShortDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(new Date(date));
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
