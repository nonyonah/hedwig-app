import type { TaxRegionOption } from '@/lib/types/tax';

export const taxRegions: TaxRegionOption[] = [
  {
    code: 'US',
    label: 'United States',
    roughTaxRate: 0.24,
    filingLabel: 'Federal estimate',
    disclaimer: 'This is not tax advice.'
  },
  {
    code: 'NG',
    label: 'Nigeria',
    roughTaxRate: 0.18,
    filingLabel: 'Personal income estimate',
    disclaimer: 'This is not tax advice.'
  },
  {
    code: 'GB',
    label: 'United Kingdom',
    roughTaxRate: 0.22,
    filingLabel: 'Self assessment estimate',
    disclaimer: 'This is not tax advice.'
  },
  {
    code: 'CA',
    label: 'Canada',
    roughTaxRate: 0.26,
    filingLabel: 'Combined estimate',
    disclaimer: 'This is not tax advice.'
  }
];
