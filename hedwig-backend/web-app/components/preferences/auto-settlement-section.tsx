'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle, Warning } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast-provider';
import { hedwigApi } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const SUPPORTED_CURRENCIES: Record<string, string> = {
  NGN: '\uD83C\uDDF3\uD83C\uDDEC NGN',
  KES: '\uD83C\uDDF0\uD83C\uDDEA KES',
  UGX: '\uD83C\uDDFA\uD83C\uDDEC UGX',
  TZS: '\uD83C\uDDF9\uD83C\uDDFF TZS',
  MWK: '\uD83C\uDDF2\uD83C\uDFFC MWK',
  BRL: '\uD83C\uDDE7\uD83C\uDDF7 BRL',
};

interface BankAccount {
  institution: string;
  accountIdentifier: string;
  accountName: string;
  currency: string;
  metadata?: Record<string, any>;
}

export function AutoSettlementSection(_props: { accessToken: string | null }) {
  return null;
  const { addToast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [currency, setCurrency] = useState('NGN');
  const [institution, setInstitution] = useState('');
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [accountIdentifier, setAccountIdentifier] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountResolved, setAccountResolved] = useState(false);
  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [error, setError] = useState('');

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await hedwigApi.getSettlementPreferences({ accessToken, disableMockFallback: true });
      setEnabled(res?.data?.autoSettle || false);
      setBankAccount(res?.data?.bankAccount || null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { fetchPrefs(); }, [fetchPrefs]);

  useEffect(() => {
    if (!currency) return;
    hedwigApi.offrampV2Institutions(currency).then((res: any) => {
      setInstitutions(res?.data || res?.institutions || []);
    }).catch(() => {});
  }, [currency]);

  const handleVerifyAccount = useCallback(async () => {
    if (!institution || !accountIdentifier) return;
    setVerifyingAccount(true);
    setError('');
    try {
      const res: any = await hedwigApi.verifyOfframpV2Account({
        institution,
        accountIdentifier,
        currency,
      }, { accessToken, disableMockFallback: true });
      if (res?.data?.accountName) {
        setAccountName(res.data.accountName);
        setAccountResolved(true);
      }
    } catch {
      setError('Could not verify account');
    } finally {
      setVerifyingAccount(false);
    }
  }, [institution, accountIdentifier, currency, accessToken]);

  const handleSave = useCallback(async () => {
    if (enabled && !bankAccount && !showForm) return setShowForm(true);
    setSaving(true);
    setError('');
    try {
      const payload = enabled && bankAccount ? { autoSettle: true, bankAccount } : { autoSettle: false, bankAccount: null };
      await hedwigApi.setSettlementPreferences(payload as any, { accessToken, disableMockFallback: true });
      addToast({ title: 'Saved', description: 'Auto-settlement preferences updated.', variant: 'success' });
      setShowForm(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [enabled, bankAccount, showForm, accessToken, addToast]);

  const handleSaveNewBank = useCallback(async () => {
    if (!institution || !accountIdentifier || !accountName) return;
    setSaving(true);
    setError('');
    try {
      const newBank: BankAccount = { institution, accountIdentifier, accountName, currency };
      await hedwigApi.setSettlementPreferences(
        { autoSettle: true, bankAccount: newBank },
        { accessToken, disableMockFallback: true },
      );
      setBankAccount(newBank);
      setShowForm(false);
      addToast({ title: 'Saved', description: 'Auto-settlement bank account set.', variant: 'success' });
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [institution, accountIdentifier, accountName, currency, accessToken, addToast]);

  const handleToggle = useCallback(async (newVal: boolean) => {
    if (newVal && !bankAccount) {
      setShowForm(true);
      setEnabled(true);
      return;
    }
    setEnabled(newVal);
    setSaving(true);
    try {
      await hedwigApi.setSettlementPreferences(
        { autoSettle: newVal, bankAccount: newVal ? bankAccount : null } as any,
        { accessToken, disableMockFallback: true },
      );
    } catch {
      setEnabled(!newVal);
    } finally {
      setSaving(false);
    }
  }, [bankAccount, accessToken]);

  if (loading) return <div className="h-24 animate-pulse rounded-2xl bg-[var(--color-surface-secondary)]" />;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <p className="text-[15px] font-semibold text-[var(--color-foreground)]">Auto-settlement</p>
          <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
            Automatically withdraw payroll payments to your bank account
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={() => handleToggle(!enabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${enabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-input)]'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--color-surface)] shadow-xs transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {enabled && bankAccount && !showForm && (
        <div className="border-t border-[var(--color-border)] px-5 py-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{bankAccount.accountName}</p>
                <p className="text-[12px] text-[var(--color-text-muted)]">{bankAccount.accountIdentifier} &middot; {SUPPORTED_CURRENCIES[bankAccount.currency] || bankAccount.currency}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(true)}>Change</Button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="border-t border-[var(--color-border)] px-5 py-4 space-y-4">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Currency</span>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)]">
              {Object.entries(SUPPORTED_CURRENCIES).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </select>
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Institution</span>
            <select
              value={institution}
              onChange={e => setInstitution(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)]"
            >
              <option value="">Select institution</option>
              {institutions.map((i: any) => (
                <option key={i.code || i.id} value={i.code || i.id}>{i.name || i.label}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Account number</span>
            <input
              type="text"
              placeholder="Account number"
              value={accountIdentifier}
              onChange={e => { setAccountIdentifier(e.target.value); setAccountResolved(false); }}
              onBlur={handleVerifyAccount}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]"
            />
          </div>

          <div className="relative">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Account name</span>
            <input
              type="text"
              placeholder="Account name"
              value={verifyingAccount ? 'Verifying...' : accountName}
              readOnly={accountResolved}
              onChange={e => setAccountName(e.target.value)}
              className={`mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] ${accountResolved ? 'opacity-70' : ''}`}
            />
            {verifyingAccount && (
              <svg className="absolute right-3 top-[38px] h-4 w-4 animate-spin text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2.5"><p className="text-[12px] font-medium text-red-700 dark:text-red-400">{error}</p></div>}

          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); if (!bankAccount) setEnabled(false); }}>Cancel</Button>
            <Button variant="default" size="sm" disabled={!institution || !accountIdentifier || saving || verifyingAccount} onClick={handleSaveNewBank} loading={saving}>
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
