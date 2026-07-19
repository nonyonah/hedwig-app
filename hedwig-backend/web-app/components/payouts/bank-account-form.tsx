'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bank, ShieldCheck } from '@/components/ui/lucide-icons';
import { hedwigApi } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type {
  BankAccountInput,
  BankAccountRecord,
  BankCountry,
  BankInfo,
} from '@/lib/models/entities';

const COUNTRY_OPTIONS: ReadonlyArray<{ code: BankCountry; flag: string; label: string; currency: string }> = [
  { code: 'NG', flag: '🇳🇬', label: 'Nigeria',         currency: 'NGN' },
  { code: 'US', flag: '🇺🇸', label: 'United States',   currency: 'USD' },
  { code: 'UK', flag: '🇬🇧', label: 'United Kingdom',  currency: 'GBP' },
  { code: 'GH', flag: '🇬🇭', label: 'Ghana',           currency: 'GHS' },
];

type FormState = {
  country: BankCountry;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  sortCode: string;
  iban: string;
  swiftBic: string;
  accountHolderName: string;
  accountType: 'checking' | 'savings' | '';
  showOnInvoice: boolean;
  isDefault: boolean;
};

const EMPTY_STATE: FormState = {
  country: 'NG',
  bankCode: '',
  bankName: '',
  accountNumber: '',
  routingNumber: '',
  sortCode: '',
  iban: '',
  swiftBic: '',
  accountHolderName: '',
  accountType: '',
  showOnInvoice: true,
  isDefault: false,
};

function fromRecord(record: BankAccountRecord): FormState {
  return {
    country: record.country,
    bankCode: record.bankCode || '',
    bankName: record.bankName,
    accountNumber: record.accountNumber || '',
    routingNumber: record.routingNumber || '',
    sortCode: record.sortCode || '',
    iban: record.iban || '',
    swiftBic: record.swiftBic || '',
    accountHolderName: record.accountHolderName,
    accountType: record.accountType || '',
    showOnInvoice: record.showOnInvoice,
    isDefault: record.isDefault,
  };
}

function toPayload(state: FormState): BankAccountInput {
  const country = state.country;
  return {
    country,
    accountHolderName: state.accountHolderName.trim(),
    bankName: state.bankName.trim(),
    bankCode: state.bankCode || null,
    accountNumber: state.accountNumber ? state.accountNumber.replace(/\s+/g, '') : null,
    routingNumber: country === 'US' ? state.routingNumber : null,
    sortCode: country === 'UK' ? state.sortCode : null,
    iban: country === 'UK' ? state.iban || null : null,
    swiftBic: state.swiftBic || null,
    accountType: country === 'US' && (state.accountType === 'checking' || state.accountType === 'savings') ? state.accountType : null,
    showOnInvoice: state.showOnInvoice,
    isDefault: state.isDefault,
  };
}

function clientValidate(state: FormState): string | null {
  const acc = state.accountNumber.replace(/\D/g, '');
  if (!state.accountHolderName.trim()) return 'Account holder name is required';
  if (!state.bankName.trim()) return 'Bank name is required';

  switch (state.country) {
    case 'NG':
    case 'GH':
      if (!/^\d{10}$/.test(acc)) return 'Account number must be exactly 10 digits';
      return null;
    case 'US':
      if (!/^\d{9}$/.test(state.routingNumber.replace(/\D/g, ''))) return 'Routing number must be 9 digits';
      if (!/^\d{4,17}$/.test(acc)) return 'Account number must be 4–17 digits';
      return null;
    case 'UK':
      if (!/^\d{6}$/.test(state.sortCode.replace(/\D/g, ''))) return 'Sort code must be 6 digits';
      if (!/^\d{8}$/.test(acc)) return 'UK account number must be 8 digits';
      return null;
    default:
      return null;
  }
}

export function BankAccountForm({
  initial,
  accessToken,
  onSaved,
  onDeleted,
  onCancel,
  submitLabel,
  showHeader = true,
  isFirstAccount = false,
}: {
  initial: BankAccountRecord | null;
  accessToken: string | null;
  onSaved?: (record: BankAccountRecord) => void;
  onDeleted?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  showHeader?: boolean;
  isFirstAccount?: boolean;
}) {
  const [state, setState] = useState<FormState>(() =>
    initial ? fromRecord(initial) : { ...EMPTY_STATE, isDefault: isFirstAccount }
  );
  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const verifyAbortRef = useRef<AbortController | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((cur) => ({ ...cur, [key]: value }));

  // Load bank list per country (NG/GH only); reset country-specific fields when country changes.
  useEffect(() => {
    let cancelled = false;
    setVerifyError(null);
    setResolvedName(null);

    if (state.country === 'NG' || state.country === 'GH') {
      if (!accessToken) {
        setBanks([]);
        return;
      }
      setBanksLoading(true);
      hedwigApi.listBanksForCountry(state.country, { accessToken, disableMockFallback: true })
        .then((list) => { if (!cancelled) setBanks(list); })
        .catch(() => { if (!cancelled) setBanks([]); })
        .finally(() => { if (!cancelled) setBanksLoading(false); });
    } else {
      setBanks([]);
    }

    return () => { cancelled = true; };
  }, [state.country, accessToken]);

  // Auto-verify NG/GH after debounce when bank + 10-digit account entered.
  useEffect(() => {
    setVerifyError(null);
    setResolvedName(null);
    if (state.country !== 'NG' && state.country !== 'GH') return;
    if (!state.bankCode || !/^\d{10}$/.test(state.accountNumber.replace(/\D/g, ''))) return;
    if (!accessToken) return;

    const controller = new AbortController();
    verifyAbortRef.current?.abort();
    verifyAbortRef.current = controller;
    setVerifying(true);

    const timer = setTimeout(async () => {
      try {
        const result = await hedwigApi.verifyBankAccount(
          {
            country: state.country,
            bankCode: state.bankCode,
            accountNumber: state.accountNumber.replace(/\D/g, ''),
          },
          { accessToken, disableMockFallback: true }
        );
        if (controller.signal.aborted) return;
        if (result.verified && result.accountName) {
          setResolvedName(result.accountName);
          setState((cur) => ({ ...cur, accountHolderName: result.accountName! }));
        } else {
          setVerifyError(result.reason || 'Could not resolve account');
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        setVerifyError(err?.message || 'Verification failed');
      } finally {
        if (!controller.signal.aborted) setVerifying(false);
      }
    }, 600);

    return () => {
      clearTimeout(timer);
      controller.abort();
      setVerifying(false);
    };
  }, [state.country, state.bankCode, state.accountNumber, accessToken]);

  const submit = async () => {
    setServerError(null);
    const validationError = clientValidate(state);
    if (validationError) {
      setServerError(validationError);
      return;
    }
    if (!accessToken) {
      setServerError('Session expired. Sign in again.');
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(state);
      const record = initial
        ? await hedwigApi.updateBankAccount(initial.id, payload, { accessToken, disableMockFallback: true })
        : await hedwigApi.createBankAccount(payload, { accessToken, disableMockFallback: true });
      onSaved?.(record);
    } catch (err: any) {
      setServerError(err?.message || 'Failed to save bank account');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!accessToken || !initial) return;
    setDeleting(true);
    try {
      await hedwigApi.deleteBankAccount(initial.id, { accessToken, disableMockFallback: true });
      setDeleteOpen(false);
      onDeleted?.();
    } catch (err: any) {
      setServerError(err?.message || 'Failed to delete bank account');
    } finally {
      setDeleting(false);
    }
  };

  const showResolved = state.country === 'NG' || state.country === 'GH';

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center gap-2">
          <Bank className="h-4 w-4 text-[var(--color-text-secondary)]" weight="bold" />
          <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">Payout bank account</h3>
          {initial?.isVerified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success)]">
              <ShieldCheck className="h-2.5 w-2.5" weight="bold" />
              Verified
            </span>
          )}
        </div>
      )}

      <p className="text-[12px] text-[var(--color-text-tertiary)]">
        Shown on every invoice and payment link so clients can pay you by bank transfer in addition to crypto.
      </p>

      {/* Country selector */}
      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Country</label>
        <div className="relative">
          <select
            className="h-10 w-full appearance-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 pr-8 text-[13px] text-[var(--color-foreground)] focus:border-[var(--color-accent)] focus:outline-none"
            value={state.country}
            onChange={(e) => {
              const code = e.target.value as BankCountry;
              setState((cur) => ({
                ...EMPTY_STATE,
                country: code,
                accountHolderName: cur.accountHolderName,
                showOnInvoice: cur.showOnInvoice,
              }));
            }}
          >
            {COUNTRY_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.flag}  {opt.label} ({opt.currency})
              </option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-text-muted)]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4.5L6 7.5L9 4.5" />
          </svg>
        </div>
      </div>

      {/* Bank picker / free-form bank name */}
      {state.country === 'NG' || state.country === 'GH' ? (
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Bank</label>
          <div className="relative">
            <select
              className="h-10 w-full appearance-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 pr-8 text-[13px] text-[var(--color-foreground)] focus:border-[var(--color-accent)] focus:outline-none"
              value={state.bankCode}
              onChange={(e) => {
                const code = e.target.value;
                const bank = banks.find((b) => b.code === code);
                setState((cur) => ({ ...cur, bankCode: code, bankName: bank?.name || '' }));
              }}
              disabled={banksLoading}
            >
              <option value="">{banksLoading ? 'Loading banks…' : 'Select your bank'}</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-text-muted)]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4.5L6 7.5L9 4.5" />
            </svg>
          </div>
        </div>
      ) : (
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Bank name</label>
          <Input
            placeholder="e.g. Chase Bank"
            value={state.bankName}
            onChange={(e) => update('bankName', e.target.value)}
          />
        </div>
      )}

      {/* Country-specific fields */}
      {(state.country === 'NG' || state.country === 'GH') && (
        <>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Account number</label>
            <Input
              inputMode="numeric"
              placeholder="0123456789"
              maxLength={10}
              value={state.accountNumber}
              onChange={(e) => update('accountNumber', e.target.value.replace(/\D/g, '').slice(0, 10))}
            />
            {showResolved && (
              <p className={cn('mt-1.5 text-[11px]',
                resolvedName ? 'text-[var(--color-success)]' :
                verifyError ? 'text-[var(--color-danger)]' :
                verifying ? 'text-[var(--color-text-tertiary)]' : 'text-transparent')}>
                {verifying ? 'Verifying…' : resolvedName ? `✓ ${resolvedName}` : verifyError ? `Could not verify (${verifyError})` : 'placeholder'}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Account holder name</label>
            <Input
              placeholder="Resolved automatically once account number is entered"
              value={state.accountHolderName}
              onChange={(e) => update('accountHolderName', e.target.value)}
            />
          </div>
        </>
      )}

      {state.country === 'US' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Routing number</label>
              <Input
                inputMode="numeric"
                placeholder="9 digits"
                maxLength={9}
                value={state.routingNumber}
                onChange={(e) => update('routingNumber', e.target.value.replace(/\D/g, '').slice(0, 9))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Account number</label>
              <Input
                inputMode="numeric"
                placeholder="4–17 digits"
                maxLength={17}
                value={state.accountNumber}
                onChange={(e) => update('accountNumber', e.target.value.replace(/\D/g, '').slice(0, 17))}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Account holder name</label>
              <Input
                placeholder="Jane Smith"
                value={state.accountHolderName}
                onChange={(e) => update('accountHolderName', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Account type</label>
              <div className="relative">
                <select
                  className="h-10 w-full appearance-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 pr-8 text-[13px] text-[var(--color-foreground)]"
                  value={state.accountType}
                  onChange={(e) => update('accountType', (e.target.value || '') as FormState['accountType'])}
                >
                  <option value="">Select</option>
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-text-muted)]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 4.5L6 7.5L9 4.5" />
                </svg>
              </div>
            </div>
          </div>
        </>
      )}

      {state.country === 'UK' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Sort code</label>
              <Input
                inputMode="numeric"
                placeholder="6 digits"
                maxLength={6}
                value={state.sortCode}
                onChange={(e) => update('sortCode', e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Account number</label>
              <Input
                inputMode="numeric"
                placeholder="8 digits"
                maxLength={8}
                value={state.accountNumber}
                onChange={(e) => update('accountNumber', e.target.value.replace(/\D/g, '').slice(0, 8))}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">Account holder name</label>
              <Input
                placeholder="Jane Smith"
                value={state.accountHolderName}
                onChange={(e) => update('accountHolderName', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">IBAN (optional)</label>
              <Input
                placeholder="GB29 NWBK 6016 1331 9268 19"
                value={state.iban}
                onChange={(e) => update('iban', e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-[var(--color-text-tertiary)]">SWIFT/BIC (optional)</label>
            <Input
              placeholder="NWBKGB2L"
              value={state.swiftBic}
              onChange={(e) => update('swiftBic', e.target.value.toUpperCase())}
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-xl border border-[var(--color-surface-tertiary)] bg-[var(--color-background)] px-3 py-2">
          <div>
            <p className="text-[12px] font-semibold text-[var(--color-text-secondary)]">Show on invoices &amp; payment links</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Toggle off to hide this account from public pages.</p>
          </div>
          <input
            type="checkbox"
            checked={state.showOnInvoice}
            onChange={(e) => update('showOnInvoice', e.target.checked)}
            className="h-4 w-4"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-[var(--color-surface-tertiary)] bg-[var(--color-background)] px-3 py-2">
          <div>
            <p className="text-[12px] font-semibold text-[var(--color-text-secondary)]">Default account</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Preselected for clients on every invoice and payment link.</p>
          </div>
          <input
            type="checkbox"
            checked={state.isDefault}
            disabled={isFirstAccount && !initial}
            onChange={(e) => update('isDefault', e.target.checked)}
            className="h-4 w-4"
          />
        </div>
      </div>

      {serverError && <p className="text-[12px] text-[var(--color-danger)]">{serverError}</p>}

      <div className="flex items-center justify-end gap-2">
        {initial && (
          <Button
            variant="ghost"
            disabled={deleting || saving}
            onClick={() => setDeleteOpen(true)}
            className="text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
          >
            Remove
          </Button>
        )}
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={saving || deleting}>
            Cancel
          </Button>
        )}
        <Button onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : submitLabel ?? (initial ? 'Update bank account' : 'Save bank account')}
        </Button>
      </div>

      {deleteOpen && (
        <div className="rounded-xl border border-[var(--color-danger-soft)] bg-[var(--color-warning-soft)] px-3 py-3">
          <p className="text-[12px] text-[var(--color-danger)]">Remove this bank account from all future invoices?</p>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button onClick={remove} disabled={deleting} className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]">
              {deleting ? 'Removing…' : 'Yes, remove'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export const BANK_ACCOUNT_COUNTRY_OPTIONS = COUNTRY_OPTIONS;
