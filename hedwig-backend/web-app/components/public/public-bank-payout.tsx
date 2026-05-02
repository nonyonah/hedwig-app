'use client';

import { useMemo, useState } from 'react';
import { Bank, ShieldCheck } from '@/components/ui/lucide-icons';

export type PublicBankAccountPayout = {
  id?: string;
  country: 'NG' | 'US' | 'UK' | 'GH';
  currency: string;
  account_holder_name: string;
  bank_name: string;
  account_number: string | null;
  routing_number: string | null;
  sort_code: string | null;
  iban: string | null;
  swift_bic: string | null;
  account_type: 'checking' | 'savings' | null;
  is_verified: boolean;
  is_default?: boolean;
};

const COUNTRY_FLAG: Record<PublicBankAccountPayout['country'], string> = {
  NG: '🇳🇬',
  US: '🇺🇸',
  UK: '🇬🇧',
  GH: '🇬🇭',
};

const COUNTRY_LABEL: Record<PublicBankAccountPayout['country'], string> = {
  NG: 'Nigeria',
  US: 'United States',
  UK: 'United Kingdom',
  GH: 'Ghana',
};

const CURRENCY_LABEL: Record<string, string> = {
  NGN: 'Nigerian Naira (NGN)',
  GHS: 'Ghanaian Cedi (GHS)',
  USD: 'US Dollar (USD)',
  GBP: 'British Pound (GBP)',
};

function CopyableRow({ label, value, mono, big }: { label: string; value: string | null; mono?: boolean; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={
            mono
              ? `font-mono tabular-nums text-[#181d27] ${big ? 'text-[16px] font-bold tracking-[0.04em]' : 'text-[13px]'}`
              : 'text-right text-[13px] font-semibold text-[#181d27]'
          }
        >
          {value}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-md border border-[#e9eaeb] px-2 py-1 text-[10px] font-semibold text-[#414651] transition-colors hover:bg-[#fafafa]"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function PayoutCard({ bank }: { bank: PublicBankAccountPayout }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[16px] leading-none">{COUNTRY_FLAG[bank.country]}</span>
        <span className="text-[12px] text-[#717680]">
          {COUNTRY_LABEL[bank.country]} · {bank.currency}
        </span>
      </div>

      <div className="divide-y divide-[#f2f4f7]">
        <CopyableRow label="Bank" value={bank.bank_name} />
        <CopyableRow label="Account name" value={bank.account_holder_name} />
        <CopyableRow label="Account no." value={bank.account_number} mono big />
        <CopyableRow label="Routing" value={bank.routing_number} mono />
        <CopyableRow label="Sort code" value={bank.sort_code} mono />
        <CopyableRow label="IBAN" value={bank.iban} mono />
        <CopyableRow label="SWIFT / BIC" value={bank.swift_bic} mono />
        <CopyableRow
          label="Account type"
          value={bank.account_type ? bank.account_type[0].toUpperCase() + bank.account_type.slice(1) : null}
        />
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-[#a4a7ae]">
        After paying, share the transfer reference with {bank.account_holder_name.split(' ')[0]} so they can mark this invoice as paid in Hedwig.
      </p>
    </div>
  );
}

export function PublicBankPayout({
  banks,
  // backwards compatible single-account prop
  bank: legacyBank,
}: {
  banks?: PublicBankAccountPayout[];
  bank?: PublicBankAccountPayout;
}) {
  const accounts = useMemo<PublicBankAccountPayout[]>(() => {
    if (banks && banks.length > 0) return banks;
    if (legacyBank) return [legacyBank];
    return [];
  }, [banks, legacyBank]);

  const [selectedId, setSelectedId] = useState<string>(() => {
    const def = accounts.find((b) => b.is_default) ?? accounts[0];
    return def?.id || `${def?.country || 'NG'}-0`;
  });

  const selected = useMemo(() => {
    if (accounts.length === 0) return null;
    const found = accounts.find((b, i) => (b.id || `${b.country}-${i}`) === selectedId);
    return found ?? accounts[0];
  }, [accounts, selectedId]);

  if (!selected) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#f2f4f7] px-4 py-3">
        <div className="flex items-center gap-2">
          <Bank className="h-3.5 w-3.5 text-[#414651]" weight="bold" />
          <p className="text-[12px] font-semibold uppercase tracking-widest text-[#414651]">Pay by bank transfer</p>
        </div>
        {selected.is_verified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[10px] font-semibold text-[#027a48]">
            <ShieldCheck className="h-2.5 w-2.5" weight="bold" />
            Verified
          </span>
        ) : null}
      </div>

      {accounts.length > 1 ? (
        <div className="border-b border-[#f2f4f7] bg-[#fafafa] px-4 py-3">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">
            Choose currency
          </label>
          <select
            className="h-9 w-full rounded-md border border-[#e9eaeb] bg-white px-2 text-[13px] text-[#181d27] focus:border-[#2563eb] focus:outline-none"
            value={selected.id || `${selected.country}-0`}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {accounts.map((b, i) => {
              const id = b.id || `${b.country}-${i}`;
              const label = CURRENCY_LABEL[b.currency] || `${b.currency}`;
              return (
                <option key={id} value={id}>
                  {COUNTRY_FLAG[b.country]}  {label}{b.is_default ? ' · Default' : ''}
                </option>
              );
            })}
          </select>
        </div>
      ) : null}

      <PayoutCard bank={selected} />
    </div>
  );
}
