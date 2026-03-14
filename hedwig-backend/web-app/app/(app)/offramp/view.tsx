'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowsDownUp, CheckCircle, ClockCountdown, Coin, SpinnerGap, Warning } from '@phosphor-icons/react/dist/ssr';
import { useWallets } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import type { OfframpTransaction } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
import { EntityTable } from '@/components/data/entity-table';
import { MetricCard } from '@/components/data/metric-card';
import { PageHeader } from '@/components/data/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/providers/toast-provider';
import { cn, formatCurrency, formatShortDate } from '@/lib/utils';

const TOKENS = ['USDC', 'USDT'] as const;
const NETWORKS = [
  { id: 'base', label: 'Base', desc: 'EVM / Base network' },
  { id: 'solana', label: 'Solana', desc: 'SPL → Bridge to Base' }
] as const;
const CURRENCIES = [
  { code: 'NGN', label: 'Nigerian Naira', flag: '🇳🇬' },
  { code: 'GHS', label: 'Ghanaian Cedi', flag: '🇬🇭' }
] as const;

type Token = typeof TOKENS[number];
type Network = typeof NETWORKS[number]['id'];
type FiatCurrency = typeof CURRENCIES[number]['code'];
type Step = 1 | 2 | 3;

interface OfframpForm {
  amount: string;
  token: Token;
  network: Network;
  currency: FiatCurrency;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  memo: string;
}

const initialForm: OfframpForm = {
  amount: '',
  token: 'USDC',
  network: 'base',
  currency: 'NGN',
  bankName: '',
  bankCode: '',
  accountNumber: '',
  accountName: '',
  memo: ''
};

/* ── Pill selector ─────────────────────────────────────────────── */
function SelectPill<T extends string>({
  options,
  value,
  onChange
}: {
  options: readonly { id: T; label: string; sub?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            'flex flex-col rounded-lg border px-3 py-2 text-left transition duration-100',
            value === o.id
              ? 'border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]'
              : 'border-[#e9eaeb] bg-white text-[#414651] hover:border-[#d5d7da] hover:bg-[#fafafa]'
          )}
        >
          <span className="text-[13px] font-semibold">{o.label}</span>
          {o.sub && <span className="text-[11px] text-[#a4a7ae]">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

/* ── Summary row ──────────────────────────────────────────────── */
function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-[13px] text-[#717680]">{label}</span>
      <span className={cn('text-[14px] font-semibold', highlight ? 'text-[#181d27]' : 'text-[#414651]')}>{value}</span>
    </div>
  );
}

/* ── Inline rate chip ─────────────────────────────────────────── */
function RateChip({
  loading,
  rateInfo,
  currency,
  token
}: {
  loading: boolean;
  rateInfo: { rate: string; fiatEstimate: number | null; fee: number } | null;
  currency: string;
  token: string;
}) {
  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[#717680]">
        <SpinnerGap className="h-3.5 w-3.5 animate-spin" weight="bold" />
        Fetching live rate…
      </div>
    );
  }
  if (!rateInfo) return null;
  const rate = parseFloat(rateInfo.rate);
  return (
    <div className="mt-2 rounded-lg border border-[#e9eaeb] bg-[#fafafa] px-3 py-2 text-[12px] text-[#414651]">
      <span className="font-semibold">1 {token} ≈ {Number.isFinite(rate) ? rate.toLocaleString() : '—'} {currency}</span>
      {rateInfo.fiatEstimate ? (
        <span className="ml-2 text-[#717680]">
          → ~{rateInfo.fiatEstimate.toLocaleString(undefined, { maximumFractionDigits: 0 })} {currency} after 1% fee
        </span>
      ) : null}
    </div>
  );
}

export function OfframpClient({
  initialTransactions,
  accessToken
}: {
  initialTransactions: OfframpTransaction[];
  accessToken: string | null;
}) {
  const { toast } = useToast();
  const { wallets: evmWallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();

  /* Wallet addresses — prefer the embedded (privy) wallet */
  const evmAddress = (evmWallets.find((w) => w.walletClientType === 'privy') ?? evmWallets[0])?.address ?? '';
  const solanaAddress = solanaWallets[0]?.address ?? '';

  const [transactions, setTransactions] = useState(initialTransactions);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<OfframpForm>(initialForm);

  const [institutions, setInstitutions] = useState<Array<{ code: string; name: string }>>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);

  const [rateInfo, setRateInfo] = useState<{ rate: string; fiatEstimate: number | null; fee: number } | null>(null);
  const [loadingRate, setLoadingRate] = useState(false);

  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [accountVerified, setAccountVerified] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const rateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingCount = transactions.filter((tx) => tx.status !== 'completed' && tx.status !== 'failed').length;
  const completedCount = transactions.filter((tx) => tx.status === 'completed').length;
  const totalFiat = transactions.reduce((s, tx) => s + tx.fiatAmount, 0);

  const update = <K extends keyof OfframpForm>(key: K, val: OfframpForm[K]) =>
    setForm((cur) => ({ ...cur, [key]: val }));

  /* Fetch institutions when currency or dialog opens */
  useEffect(() => {
    if (!open || !accessToken) return;
    setLoadingInstitutions(true);
    setInstitutions([]);
    hedwigApi
      .offrampInstitutions(form.currency, { accessToken })
      .then(setInstitutions)
      .catch(() => setInstitutions([]))
      .finally(() => setLoadingInstitutions(false));
  }, [open, form.currency, accessToken]);

  /* Debounced live rate fetch — runs whenever amount/token/network/currency changes */
  const fetchRate = useCallback(() => {
    if (!accessToken) return;
    const amountNum = parseFloat(form.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setRateInfo(null);
      return;
    }
    setLoadingRate(true);
    setRateInfo(null);
    hedwigApi
      .offrampRates(form.token, amountNum, form.currency, form.network, { accessToken })
      .then((r) => setRateInfo({ rate: r.rate, fiatEstimate: r.fiatEstimate, fee: r.platformFee }))
      .catch(() => setRateInfo(null))
      .finally(() => setLoadingRate(false));
  }, [form.amount, form.token, form.network, form.currency, accessToken]);

  useEffect(() => {
    if (!open) return;
    if (rateDebounceRef.current) clearTimeout(rateDebounceRef.current);
    const amountNum = parseFloat(form.amount);
    if (!form.amount || isNaN(amountNum) || amountNum <= 0) {
      setRateInfo(null);
      setLoadingRate(false);
      return;
    }
    rateDebounceRef.current = setTimeout(fetchRate, 600);
    return () => { if (rateDebounceRef.current) clearTimeout(rateDebounceRef.current); };
  }, [open, form.amount, form.token, form.network, form.currency]);

  /* Auto-verify account name when bank + account number are ready */
  useEffect(() => {
    if (!open || !accessToken || !form.bankCode || form.accountNumber.length < 10) return;

    if (verifyDebounceRef.current) clearTimeout(verifyDebounceRef.current);
    setAccountVerified(false);
    update('accountName', '');

    verifyDebounceRef.current = setTimeout(async () => {
      setVerifyingAccount(true);
      try {
        const result = await hedwigApi.verifyOfframpAccount(
          { bankName: form.bankCode, accountNumber: form.accountNumber.trim(), currency: form.currency },
          { accessToken }
        );
        update('accountName', result.accountName || '');
        setAccountVerified(true);
      } catch {
        /* Let user type manually */
      } finally {
        setVerifyingAccount(false);
      }
    }, 800);

    return () => { if (verifyDebounceRef.current) clearTimeout(verifyDebounceRef.current); };
  }, [open, form.bankCode, form.accountNumber, form.currency, accessToken]);

  const resetDialog = () => {
    setForm(initialForm);
    setStep(1);
    setRateInfo(null);
    setAccountVerified(false);
    setOpen(false);
  };

  const goToStep2 = () => {
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      toast({ type: 'error', title: 'Amount required', message: 'Enter a valid amount.' });
      return;
    }
    if (form.network === 'solana' && !solanaAddress) {
      toast({ type: 'error', title: 'Solana wallet not connected', message: 'No Solana wallet found in your Privy session.' });
      return;
    }
    setStep(2);
  };

  const goToStep3 = () => {
    if (!form.bankCode && !form.bankName) {
      toast({ type: 'error', title: 'Bank required', message: 'Select a bank from the list.' });
      return;
    }
    if (!form.accountNumber.trim()) {
      toast({ type: 'error', title: 'Account number required' });
      return;
    }
    if (!form.accountName.trim()) {
      toast({ type: 'error', title: 'Account name required', message: 'Account name lookup is still in progress or failed. Please wait or enter it manually.' });
      return;
    }
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!accessToken) {
      toast({ type: 'error', title: 'Session expired', message: 'Please sign in again.' });
      return;
    }

    const returnAddress = evmAddress;
    if (!returnAddress) {
      toast({ type: 'error', title: 'No wallet address', message: 'Your EVM wallet address could not be resolved.' });
      return;
    }

    setIsSubmitting(true);
    try {
      if (form.network === 'solana') {
        /* Solana: bridge USDC from Solana → Base, then Paycrest offramp */
        await hedwigApi.bridgeAndOfframp(
          {
            solanaAddress,
            baseAddress: returnAddress,
            token: form.token,
            amount: parseFloat(form.amount),
            bankDetails: {
              bankName: form.bankCode || form.bankName,
              accountNumber: form.accountNumber.trim(),
              accountName: form.accountName.trim(),
              currency: form.currency
            }
          },
          { accessToken, disableMockFallback: true }
        );
        toast({
          type: 'success',
          title: 'Bridge + offramp initiated',
          message: `${form.amount} ${form.token} is being bridged from Solana to Base, then converted to ${form.currency}.`
        });
      } else {
        /* Base: direct Paycrest offramp */
        await hedwigApi.createOfframp(
          {
            amount: parseFloat(form.amount),
            token: form.token,
            network: form.network,
            currency: form.currency,
            bankName: form.bankCode || form.bankName,
            accountNumber: form.accountNumber.trim(),
            accountName: form.accountName.trim(),
            returnAddress,
            memo: form.memo.trim() || undefined
          },
          { accessToken, disableMockFallback: true }
        );
        toast({
          type: 'success',
          title: 'Offramp initiated',
          message: `${form.amount} ${form.token} → ${form.currency}. Processing may take a few minutes.`
        });
      }

      resetDialog();
      hedwigApi.offramp({ accessToken }).then(setTransactions).catch(() => {});
    } catch (error: any) {
      toast({ type: 'error', title: 'Offramp failed', message: error?.message || 'Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedBankName = institutions.find((b) => b.code === form.bankCode)?.name || form.bankName;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Offramp"
        title="Move earnings out without losing transaction context"
        description="Convert crypto to fiat and track destination, status, and amounts as part of your cash workflow."
        actions={
          <Button size="sm" onClick={() => { setOpen(true); setStep(1); }}>
            <ArrowsDownUp className="h-4 w-4" weight="bold" />
            New offramp
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard
          icon={<ArrowsDownUp className="h-5 w-5 text-[#717680]" weight="regular" />}
          label="Total offramp volume"
          value={formatCurrency(totalFiat)}
        />
        <MetricCard
          icon={<ClockCountdown className="h-5 w-5 text-[#717680]" weight="regular" />}
          label="Pending transfers"
          value={`${pendingCount}`}
        />
        <MetricCard
          icon={<CheckCircle className="h-5 w-5 text-[#717680]" weight="regular" />}
          label="Completed"
          value={`${completedCount}`}
        />
      </div>

      <EntityTable
        title="Offramp transactions"
        columns={['Asset', 'Destination', 'Status', 'Fiat value', 'Created']}
        rows={transactions.map((tx) => [
          { value: `${tx.amount} ${tx.asset}` },
          { value: tx.destinationLabel },
          {
            value: tx.status,
            badge: true,
            tone: tx.status === 'completed' ? 'success' : tx.status === 'failed' ? 'warning' : 'neutral'
          },
          { value: formatCurrency(tx.fiatAmount, tx.fiatCurrency) },
          { value: formatShortDate(tx.createdAt) }
        ])}
      />

      {/* ══ Offramp dialog ══════════════════════════════════════ */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); }}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <DialogTitle>
                {step === 1 ? 'Amount & currency' : step === 2 ? 'Bank account' : 'Confirm offramp'}
              </DialogTitle>
              <span className="rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[11px] font-semibold text-[#717680]">
                {step} / 3
              </span>
            </div>
            <DialogDescription>
              {step === 1
                ? 'Enter the amount, select your chain and the fiat currency you want to receive.'
                : step === 2
                ? 'Select your bank and enter your account number to auto-resolve the account name.'
                : 'Review all details before confirming. This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-5">

            {/* ── Step 1: Amount, token, network, currency ─────── */}
            {step === 1 && (
              <>
                {/* Amount */}
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">
                    Amount <span className="text-[#f04438]">*</span>
                  </label>
                  <div className="relative">
                    <Coin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a4a7ae]" weight="regular" />
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={form.amount}
                      onChange={(e) => update('amount', e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <p className="mt-1 text-[12px] text-[#a4a7ae]">1% platform fee is deducted from the entered amount.</p>
                  <RateChip loading={loadingRate} rateInfo={rateInfo} currency={form.currency} token={form.token} />
                </div>

                {/* Token */}
                <div>
                  <label className="mb-2 block text-[13px] font-semibold text-[#414651]">Token</label>
                  <SelectPill
                    options={TOKENS.map((t) => ({ id: t, label: t }))}
                    value={form.token}
                    onChange={(v) => update('token', v)}
                  />
                </div>

                {/* Network */}
                <div>
                  <label className="mb-2 block text-[13px] font-semibold text-[#414651]">Chain</label>
                  <SelectPill
                    options={NETWORKS.map((n) => ({ id: n.id, label: n.label, sub: n.desc }))}
                    value={form.network}
                    onChange={(v) => update('network', v as Network)}
                  />
                  {form.network === 'solana' && (
                    <p className="mt-2 text-[12px] text-[#717680]">
                      Solana USDC will be bridged to Base via Across Protocol before offramping via Paycrest.
                    </p>
                  )}
                </div>

                {/* Fiat currency */}
                <div>
                  <label className="mb-2 block text-[13px] font-semibold text-[#414651]">Receiving currency</label>
                  <div className="flex gap-2">
                    {CURRENCIES.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => {
                          update('currency', c.code);
                          update('bankCode', '');
                          update('bankName', '');
                          update('accountName', '');
                          setAccountVerified(false);
                        }}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition duration-100',
                          form.currency === c.code
                            ? 'border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]'
                            : 'border-[#e9eaeb] bg-white text-[#414651] hover:bg-[#fafafa]'
                        )}
                      >
                        <span>{c.flag}</span>
                        <span>{c.code}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Return address (auto-filled, read-only) */}
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Return address</label>
                  <Input
                    value={evmAddress || 'Wallet not connected'}
                    readOnly
                    className="cursor-default bg-[#fafafa] text-[#717680] select-all"
                  />
                  <p className="mt-1 text-[12px] text-[#a4a7ae]">
                    Funds are returned to your Hedwig EVM wallet if the order cannot be completed.
                  </p>
                </div>
              </>
            )}

            {/* ── Step 2: Bank account ──────────────────────────── */}
            {step === 2 && (
              <>
                {/* Rate reminder */}
                {rateInfo && (
                  <div className="rounded-lg border border-[#e9eaeb] bg-[#fafafa] px-3 py-2 text-[12px] text-[#414651]">
                    <span className="font-semibold">1 {form.token} ≈ {parseFloat(rateInfo.rate).toLocaleString()} {form.currency}</span>
                    {rateInfo.fiatEstimate ? (
                      <span className="ml-2 text-[#717680]">
                        → ~{rateInfo.fiatEstimate.toLocaleString(undefined, { maximumFractionDigits: 0 })} {form.currency}
                      </span>
                    ) : null}
                  </div>
                )}

                {/* Bank dropdown */}
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">
                    Bank / institution <span className="text-[#f04438]">*</span>
                  </label>
                  {loadingInstitutions ? (
                    <div className="flex h-10 items-center gap-2 rounded-lg border border-[#d5d7da] px-3.5 text-[14px] text-[#a4a7ae]">
                      <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" />
                      Loading banks…
                    </div>
                  ) : institutions.length > 0 ? (
                    <div className="flex h-10 w-full items-center rounded-lg border border-[#d5d7da] bg-white px-3.5 shadow-xs">
                      <select
                        className="w-full bg-transparent text-[14px] text-[#181d27] outline-none"
                        value={form.bankCode}
                        onChange={(e) => {
                          const found = institutions.find((b) => b.code === e.target.value);
                          update('bankCode', e.target.value);
                          update('bankName', found?.name || e.target.value);
                          update('accountName', '');
                          setAccountVerified(false);
                        }}
                      >
                        <option value="">Select bank</option>
                        {institutions.map((b) => (
                          <option key={b.code} value={b.code}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <Input
                      placeholder="Bank name or institution code"
                      value={form.bankName}
                      onChange={(e) => { update('bankName', e.target.value); update('bankCode', e.target.value); }}
                    />
                  )}
                </div>

                {/* Account number */}
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">
                    Account number <span className="text-[#f04438]">*</span>
                  </label>
                  <Input
                    placeholder="e.g. 0123456789"
                    value={form.accountNumber}
                    onChange={(e) => {
                      update('accountNumber', e.target.value);
                      update('accountName', '');
                      setAccountVerified(false);
                    }}
                  />
                </div>

                {/* Account name — auto-resolved */}
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">
                    Account name <span className="text-[#f04438]">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      placeholder={
                        verifyingAccount
                          ? 'Looking up account…'
                          : form.bankCode && form.accountNumber.length >= 10
                          ? 'Account name will appear here'
                          : 'Enter account number above to auto-resolve'
                      }
                      value={form.accountName}
                      onChange={(e) => {
                        update('accountName', e.target.value);
                        setAccountVerified(false);
                      }}
                      readOnly={verifyingAccount}
                      className={cn(verifyingAccount && 'text-[#a4a7ae]', accountVerified && 'pr-9')}
                    />
                    {verifyingAccount && (
                      <SpinnerGap className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#717680]" weight="bold" />
                    )}
                    {accountVerified && !verifyingAccount && (
                      <CheckCircle className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#17b26a]" weight="fill" />
                    )}
                  </div>
                  {!accountVerified && !verifyingAccount && form.accountName && (
                    <p className="mt-1 flex items-center gap-1 text-[12px] text-[#f04438]">
                      <Warning className="h-3.5 w-3.5" weight="fill" />
                      Unverified — double-check the name before continuing.
                    </p>
                  )}
                </div>

                {/* Memo */}
                <div>
                  <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Memo (optional)</label>
                  <Input
                    placeholder="Payment reference or note"
                    value={form.memo}
                    onChange={(e) => update('memo', e.target.value)}
                  />
                </div>
              </>
            )}

            {/* ── Step 3: Review ────────────────────────────────── */}
            {step === 3 && (
              <>
                {/* Transfer details */}
                <div className="rounded-xl border border-[#e9eaeb] bg-[#fafafa] px-4 divide-y divide-[#f5f5f5]">
                  <SummaryRow label="Amount" value={`${form.amount} ${form.token}`} highlight />
                  <SummaryRow label="Chain" value={form.network === 'base' ? 'Base (EVM)' : 'Solana → Base bridge'} />
                  <SummaryRow label="Receiving currency" value={form.currency} />
                  <SummaryRow label="Bank" value={selectedBankName || '—'} />
                  <SummaryRow label="Account number" value={form.accountNumber} />
                  <SummaryRow label="Account name" value={form.accountName} />
                  {form.memo ? <SummaryRow label="Memo" value={form.memo} /> : null}
                  <SummaryRow label="Return address" value={evmAddress ? `${evmAddress.slice(0, 6)}…${evmAddress.slice(-4)}` : '—'} />
                </div>

                {/* Rate estimate */}
                <div className="rounded-xl border border-[#e9eaeb] bg-white px-4 divide-y divide-[#f5f5f5]">
                  {loadingRate ? (
                    <div className="flex items-center justify-center gap-2 py-3 text-[13px] text-[#a4a7ae]">
                      <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" />
                      Fetching live rate…
                    </div>
                  ) : rateInfo ? (
                    <>
                      <SummaryRow
                        label="Exchange rate"
                        value={`1 ${form.token} ≈ ${parseFloat(rateInfo.rate).toLocaleString()} ${form.currency}`}
                      />
                      <SummaryRow label="Platform fee (1%)" value={`${rateInfo.fee.toFixed(4)} ${form.token}`} />
                      {rateInfo.fiatEstimate ? (
                        <SummaryRow
                          label="Estimated payout"
                          value={`${rateInfo.fiatEstimate.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${form.currency}`}
                          highlight
                        />
                      ) : null}
                    </>
                  ) : (
                    <div className="py-3 text-center text-[13px] text-[#a4a7ae]">
                      Rate unavailable — will be fetched at submission
                    </div>
                  )}
                </div>

                {form.network === 'solana' && (
                  <div className="rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3">
                    <p className="text-[13px] text-[#1d4ed8]">
                      <span className="font-semibold">Solana bridge:</span> Your USDC will first be bridged from Solana to Base via Across Protocol, then converted to {form.currency} via Paycrest. The bridge step may take 1–5 minutes.
                    </p>
                  </div>
                )}

                <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3">
                  <p className="text-[13px] text-[#92400e]">
                    By confirming, you authorise Hedwig to initiate this transfer. Crypto will leave your wallet.
                    If the order fails, funds are returned to your Hedwig wallet. This cannot be undone once submitted.
                  </p>
                </div>
              </>
            )}
          </DialogBody>

          <DialogFooter>
            {step === 1 ? (
              <>
                <DialogClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </DialogClose>
                <Button onClick={goToStep2}>
                  Next
                  <ArrowRight className="h-4 w-4" weight="bold" />
                </Button>
              </>
            ) : step === 2 ? (
              <>
                <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={goToStep3} disabled={verifyingAccount}>
                  {verifyingAccount ? (
                    <>
                      <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" />
                      Verifying…
                    </>
                  ) : (
                    <>
                      Review
                      <ArrowRight className="h-4 w-4" weight="bold" />
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setStep(2)} disabled={isSubmitting}>Back</Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <SpinnerGap className="h-4 w-4 animate-spin" weight="bold" />
                      {form.network === 'solana' ? 'Initiating bridge…' : 'Submitting…'}
                    </>
                  ) : (
                    form.network === 'solana' ? 'Bridge & offramp' : 'Confirm offramp'
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
