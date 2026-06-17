'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, ArrowRight, CheckCircle, Warning, IdentificationCard } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast-provider';
import { backendConfig } from '@/lib/auth/config';

const SUPPORTED_CURRENCIES: Record<string, { flag: string; label: string }> = {
  NGN: { flag: '\uD83C\uDDF3\uD83C\uDDEC', label: 'Nigeria (NGN)' },
  KES: { flag: '\uD83C\uDDF0\uD83C\uDDEA', label: 'Kenya (KES)' },
  UGX: { flag: '\uD83C\uDDFA\uD83C\uDDEC', label: 'Uganda (UGX)' },
  TZS: { flag: '\uD83C\uDDF9\uD83C\uDDFF', label: 'Tanzania (TZS)' },
  MWK: { flag: '\uD83C\uDDF2\uD83C\uDFFC', label: 'Malawi (MWK)' },
  BRL: { flag: '\uD83C\uDDE7\uD83C\uDDF7', label: 'Brazil (BRL)' },
};

type Step = 'kyc' | 'form' | 'payment' | 'success';

interface OnrampModalProps {
  open: boolean;
  onClose: () => void;
  accessToken: string | null;
}

export function OnrampModal({ open, onClose, accessToken }: OnrampModalProps) {
  const { toast: addToast } = useToast();
  const [step, setStep] = useState<Step>('kyc');
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [startingKyc, setStartingKyc] = useState(false);
  const [checkingKyc, setCheckingKyc] = useState(false);

  const [currency, setCurrency] = useState('NGN');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState<string | null>(null);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [institution, setInstitution] = useState('');
  const [accountIdentifier, setAccountIdentifier] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountResolved, setAccountResolved] = useState(false);
  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [order, setOrder] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const api = useCallback(async (url: string, method = 'GET', body?: any) => {
    const res = await fetch(`${backendConfig.apiBaseUrl}/${url.replace(/^\//, '')}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || 'Request failed');
    return j;
  }, [accessToken]);

  const resetForm = useCallback(() => {
    setStep('kyc');
    setCurrency('NGN');
    setAmount('');
    setRate(null);
    setInstitution('');
    setInstitutions([]);
    setAccountIdentifier('');
    setAccountName('');
    setAccountResolved(false);
    setVerifyingAccount(false);
    setOrder(null);
    setLoading(false);
    setError('');
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  useEffect(() => {
    if (!open) return;
    api('api/kyc/status').then((d: any) => {
      setKycStatus(d.data?.status || 'not_started');
      if (d.data?.status === 'approved') setStep('form');
    }).catch(() => {});
  }, [open, api]);

  useEffect(() => {
    if (!currency || !open) return;
    api(`api/onramp/institutions/${currency}`).then((d: any) => setInstitutions(d.data || [])).catch(() => {});
  }, [currency, open, api]);

  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0) return setRate(null);
    const t = setTimeout(async () => {
      try {
        const d: any = await api(`api/onramp/rate/base/USDC/${amount}/${currency}`);
        setRate(d.data?.rate || null);
      } catch { setRate(null); }
    }, 600);
    return () => clearTimeout(t);
  }, [amount, currency, api]);

  const handleStartKyc = useCallback(async () => {
    setStartingKyc(true); setError('');
    try {
      const d: any = await api('api/kyc/start', 'POST');
      if (d.data?.url) {
        setKycStatus('pending');
        window.open(d.data.url, '_blank');
      } else if (d.data?.status === 'approved') {
        setKycStatus('approved');
        setStep('form');
      } else {
        setError('Could not start verification. Try again.');
      }
    } catch (e: any) { setError(e.message); }
    finally { setStartingKyc(false); }
  }, [api]);

  const handleCheckKyc = useCallback(async () => {
    setCheckingKyc(true);
    try {
      const d: any = await api('api/kyc/check', 'POST');
      setKycStatus(d.data?.status || 'not_started');
      if (d.data?.status === 'approved') setStep('form');
    } catch {}
    finally { setCheckingKyc(false); }
  }, [api]);

  const handleVerifyAccount = useCallback(async () => {
    if (!accountIdentifier || !institution) return;
    setVerifyingAccount(true); setError('');
    try {
      const d: any = await api('api/onramp/verify-account', 'POST', {
        institution, accountIdentifier, currency,
      });
      if (d.data?.accountName) {
        setAccountName(d.data.accountName);
        setAccountResolved(true);
      }
    } catch {
      setAccountResolved(false);
    } finally {
      setVerifyingAccount(false);
    }
  }, [accountIdentifier, institution, currency, api]);

  const handleCreateOrder = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d: any = await api('api/onramp/orders', 'POST', {
        amount: parseFloat(amount),
        currency,
        refundAccount: {
          institution,
          accountIdentifier,
          accountName,
        },
      });
      if (d.data?.providerAccount) {
        setOrder(d.data);
        setStep('payment');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  }, [amount, currency, institution, accountIdentifier, accountName, api]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={handleClose}>
      <div className="relative w-full max-w-[440px] max-h-[90vh] flex flex-col rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)]" onClick={e => e.stopPropagation()}>
        <button onClick={handleClose} className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-secondary)]"><X className="h-4 w-4" weight="bold" /></button>
        <div className="border-b border-[var(--color-border)] px-6 py-5 pr-12 shrink-0">
          <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
            {step === 'kyc' ? 'Identity Verification' : step === 'payment' ? 'Payment details' : step === 'success' ? 'Funding started' : 'Fund via Bank Transfer'}
          </h2>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {step === 'kyc' && (
            <>
              <div className="flex flex-col items-center text-center pt-2 pb-4">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary-soft)]">
                  <IdentificationCard className="h-8 w-8 text-[var(--color-primary)]" weight="bold" />
                </div>
                <h3 className="text-[16px] font-semibold text-[var(--color-foreground)]">Identity Verification</h3>
                <p className="mt-2 text-[13px] text-[var(--color-text-muted)] max-w-[320px]">
                  To fund via bank transfer, we need to verify your identity first.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                  <span className="text-[13px] text-[var(--color-foreground)]">Takes about 2-3 minutes</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                  <span className="text-[13px] text-[var(--color-foreground)]">Have your ID ready</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                  <span className="text-[13px] text-[var(--color-foreground)]">Results usually instant</span>
                </div>
              </div>

              {kycStatus === 'pending' && (
                <div className="rounded-2xl border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] p-4 text-center">
                  <p className="text-[13px] font-medium text-[var(--color-warning)]">Verification in progress</p>
                  <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">Complete the verification in the opened tab, then check your status below.</p>
                </div>
              )}

              {(kycStatus === 'rejected' || kycStatus === 'retry_required') && (
                <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 text-center">
                  <Warning className="mx-auto h-8 w-8 text-red-500 mb-2" weight="bold" />
                  <p className="text-[13px] font-medium text-red-700 dark:text-red-400">Verification failed</p>
                  <p className="mt-1 text-[12px] text-red-600/70 dark:text-red-400/70">Please try again with clear photos of your documents.</p>
                </div>
              )}

              {kycStatus === 'approved' && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-4 text-center">
                  <CheckCircle className="mx-auto h-8 w-8 text-emerald-500 mb-2" weight="bold" />
                  <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">Verification approved</p>
                  <p className="mt-1 text-[12px] text-emerald-600/70 dark:text-emerald-400/70">You can now fund via bank transfer.</p>
                </div>
              )}

              {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2.5"><p className="text-[12px] font-medium text-red-700 dark:text-red-400">{error}</p></div>}
            </>
          )}

          {step === 'form' && (
            <>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Currency</span>
                <select value={currency} onChange={e => { setCurrency(e.target.value); setInstitution(''); setAccountResolved(false); }} className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)]">
                  {Object.entries(SUPPORTED_CURRENCIES).map(([k, v]) => (<option key={k} value={k}>{v.flag} {v.label}</option>))}
                </select>
              </div>

              <div>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Amount ({currency})</span>
                <input type="text" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[14px] tabular-nums text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]" />
                {rate && <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">≈ {rate} USDC</p>}
              </div>

              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)] mb-3">Where to refund if payment fails</p>
                {currency !== 'BRL' ? (
                  <select
                    value={institution}
                    onChange={e => { setInstitution(e.target.value); setAccountResolved(false); }}
                    className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)]"
                  >
                    <option value="">Select institution</option>
                    {institutions.map((i: any) => (
                      <option key={i.code || i.id || i} value={i.code || i.id || i}>{i.name || i.label || i}</option>
                    ))}
                  </select>
                ) : (
                  <p className="mb-2 text-[12px] text-[var(--color-text-muted)]">PIX key (CPF, email, phone, or random key)</p>
                )}
                <input
                  type="text"
                  placeholder={currency === 'BRL' ? 'PIX key' : 'Account number'}
                  value={accountIdentifier}
                  onChange={e => { setAccountIdentifier(e.target.value); setAccountResolved(false); }}
                  onBlur={handleVerifyAccount}
                  className="mb-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]"
                />
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Account name"
                    value={verifyingAccount ? 'Verifying...' : accountName}
                    readOnly={accountResolved}
                    onChange={e => setAccountName(e.target.value)}
                    className={`w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] ${accountResolved ? 'opacity-70' : ''}`}
                  />
                  {verifyingAccount && (
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  )}
                </div>
              </div>
              {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2.5"><p className="text-[12px] font-medium text-red-700 dark:text-red-400">{error}</p></div>}
            </>
          )}

          {step === 'payment' && order && (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Bank</p>
              <p className="mt-1 text-[14px] font-semibold text-[var(--color-foreground)]">{order.providerAccount?.accountName || '—'}</p>
              <div className="mt-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-3">
                <p className="text-[24px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">{order.providerAccount?.accountIdentifier || '—'}</p>
                <button onClick={() => navigator.clipboard.writeText(order.providerAccount?.accountIdentifier || '')} className="mt-1 text-[11px] text-[var(--color-primary)] hover:underline">Copy</button>
              </div>
              <p className="mt-3 text-[11px] font-bold text-[var(--color-warning)]">Transfer EXACTLY {order.providerAccount?.amountToTransfer} {order.providerAccount?.currency}</p>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Status: Waiting for deposit</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4 shrink-0">
          {step === 'kyc' && (
            <>
              <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
              {kycStatus === 'approved' ? (
                <Button variant="default" size="sm" onClick={() => setStep('form')}>
                  Continue <ArrowRight className="ml-1 h-4 w-4" weight="bold" />
                </Button>
              ) : kycStatus === 'pending' ? (
                <Button variant="default" size="sm" disabled={checkingKyc} onClick={handleCheckKyc}>Check status</Button>
              ) : (
                <Button variant="default" size="sm" disabled={startingKyc} onClick={handleStartKyc}>Start verification</Button>
              )}
            </>
          )}
          {step === 'form' && (
            <>
              <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
              <Button variant="default" size="sm" disabled={!amount || !institution || !accountIdentifier || loading} onClick={handleCreateOrder}>{loading ? 'Creating...' : 'Get payment details'}</Button>
            </>
          )}
          {step === 'payment' && (
            <Button variant="default" size="sm" onClick={handleClose}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}
