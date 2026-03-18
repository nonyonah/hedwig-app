'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowsDownUp, Bank, CaretRight, Check, CheckCircle, ClockCountdown, Copy, SpinnerGap, Warning, X } from '@phosphor-icons/react/dist/ssr';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import type { OfframpTransaction } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';
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

const TOKENS = ['USDC'] as const;
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

const TOKEN_ICON_BY_KEY: Record<string, string> = {
  'base:USDC': '/icons/tokens/usdc.png',
  'base:ETH': '/icons/tokens/eth.png',
  'solana:USDC': '/icons/tokens/usdc.png',
  'solana:SOL': '/icons/networks/solana.png'
};

const CHAIN_ICON_BY_KEY: Record<Network, string> = {
  base: '/icons/networks/base.png',
  solana: '/icons/networks/solana.png'
};

/* ── Pill selector ─────────────────────────────────────────────── */
function SelectPill<T extends string>({
  options,
  value,
  onChange
}: {
  options: readonly { id: T; label: string; sub?: string; iconSrc?: string }[];
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
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            {o.iconSrc ? <Image src={o.iconSrc} alt={`${o.label} icon`} width={18} height={18} className="rounded-full" /> : null}
            {o.label}
          </span>
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
  accessToken: serverAccessToken
}: {
  initialTransactions: OfframpTransaction[];
  accessToken: string | null;
}) {
  const { toast } = useToast();
  const { getAccessToken } = usePrivy();
  const { wallets: evmWallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();

  /* Always get a fresh Privy access token — falls back to the server-rendered one */
  const getFreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const t = await getAccessToken();
      return t ?? serverAccessToken;
    } catch {
      return serverAccessToken;
    }
  }, [getAccessToken, serverAccessToken]);

  /* Wallet addresses — prefer the embedded (privy) wallet */
  const evmAddress = (evmWallets.find((w) => w.walletClientType === 'privy') ?? evmWallets[0])?.address ?? '';
  const solanaAddress = solanaWallets[0]?.address ?? '';

  const [transactions, setTransactions] = useState(initialTransactions);
  const [selectedTx, setSelectedTx] = useState<OfframpTransaction | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<OfframpForm>(initialForm);

  const [institutions, setInstitutions] = useState<Array<{ code: string; name: string }>>([]);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const [institutionsError, setInstitutionsError] = useState<string | null>(null);

  const [rateInfo, setRateInfo] = useState<{ rate: string; fiatEstimate: number | null; fee: number } | null>(null);
  const [loadingRate, setLoadingRate] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [accountVerified, setAccountVerified] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const rateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verifyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingCount = transactions.filter((tx) => tx.status !== 'completed' && tx.status !== 'failed').length;
  const completedCount = transactions.filter((tx) => tx.status === 'completed').length;
  const totalVolumeUsd = transactions.reduce((sum, tx) => {
    const asset = String(tx.asset || '').toUpperCase();
    if (asset === 'USDC' || asset === 'USDT') {
      return sum + tx.amount;
    }
    if (String(tx.fiatCurrency || '').toUpperCase() === 'USD') {
      return sum + tx.fiatAmount;
    }
    return sum;
  }, 0);

  const update = <K extends keyof OfframpForm>(key: K, val: OfframpForm[K]) =>
    setForm((cur) => ({ ...cur, [key]: val }));

  /* Fetch institutions when currency or dialog opens */
  useEffect(() => {
    if (!open) return;
    setLoadingInstitutions(true);
    setInstitutions([]);
    setInstitutionsError(null);
    getFreshToken().then((token) => {
      if (!token) { setLoadingInstitutions(false); return; }
      hedwigApi
        .offrampInstitutions(form.currency, { accessToken: token, disableMockFallback: true })
        .then(setInstitutions)
        .catch((error: any) => {
          setInstitutions([]);
          setInstitutionsError(error?.message || 'Unable to load bank institutions right now.');
        })
        .finally(() => setLoadingInstitutions(false));
    });
  }, [open, form.currency]);

  /* Debounced live rate fetch — runs whenever amount/token/network/currency changes */
  const fetchRate = useCallback(() => {
    const amountNum = parseFloat(form.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setRateInfo(null);
      setRateError(null);
      return;
    }
    setLoadingRate(true);
    setRateInfo(null);
    setRateError(null);
    getFreshToken().then((token) => {
      if (!token) { setLoadingRate(false); return; }
      hedwigApi
        .offrampRates(form.token, amountNum, form.currency, form.network, { accessToken: token, disableMockFallback: true })
        .then((r) => setRateInfo({ rate: r.rate, fiatEstimate: r.fiatEstimate, fee: r.platformFee }))
        .catch((error: any) => {
          setRateInfo(null);
          setRateError(error?.message || 'Unable to fetch a live rate right now.');
        })
        .finally(() => setLoadingRate(false));
    });
  }, [form.amount, form.token, form.network, form.currency, getFreshToken]);

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
    if (!open || !form.bankCode || form.accountNumber.length < 10) return;

    if (verifyDebounceRef.current) clearTimeout(verifyDebounceRef.current);
    setAccountVerified(false);
    update('accountName', '');

    verifyDebounceRef.current = setTimeout(async () => {
      setVerifyingAccount(true);
      try {
        const token = await getFreshToken();
        if (!token) return;
        const result = await hedwigApi.verifyOfframpAccount(
          { bankName: form.bankCode || form.bankName, accountNumber: form.accountNumber.trim(), currency: form.currency },
          { accessToken: token, disableMockFallback: true }
        );
        update('accountName', result.accountName || '');
        setAccountVerified(Boolean(result.accountName));
      } catch {
        /* Let user type manually */
      } finally {
        setVerifyingAccount(false);
      }
    }, 800);

    return () => { if (verifyDebounceRef.current) clearTimeout(verifyDebounceRef.current); };
  }, [open, form.bankCode, form.accountNumber, form.currency]);

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
    const token = await getFreshToken();
    if (!token) {
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
          { accessToken: token, disableMockFallback: true }
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
          { accessToken: token, disableMockFallback: true }
        );
        toast({
          type: 'success',
          title: 'Offramp initiated',
          message: `${form.amount} ${form.token} → ${form.currency}. Processing may take a few minutes.`
        });
      }

      resetDialog();
      getFreshToken().then((t) => {
        if (t) hedwigApi.offramp({ accessToken: t }).then(setTransactions).catch(() => {});
      });
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

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-[#e9eaeb] ring-1 ring-[#e9eaeb]">
        <div className="bg-white px-5 py-4">
          <div className="flex items-center gap-2 mb-2"><ArrowsDownUp className="h-4 w-4 text-[#2563eb]" weight="bold" /><span className="text-[12px] font-medium text-[#717680]">Total volume</span></div>
          <p className="text-[22px] font-bold tracking-[-0.03em] text-[#181d27]">{formatCurrency(totalVolumeUsd, 'USD')}</p>
          <p className="mt-1 text-[11px] text-[#a4a7ae]">USD-equivalent across all offramp orders</p>
        </div>
        <div className="bg-white px-5 py-4">
          <div className="flex items-center gap-2 mb-2"><ClockCountdown className="h-4 w-4 text-[#f59e0b]" weight="bold" /><span className="text-[12px] font-medium text-[#717680]">Pending</span></div>
          <p className={`text-[22px] font-bold tracking-[-0.03em] ${pendingCount > 0 ? 'text-[#f59e0b]' : 'text-[#181d27]'}`}>{pendingCount}</p>
          <p className="mt-1 text-[11px] text-[#a4a7ae]">transfers in progress</p>
        </div>
        <div className="bg-white px-5 py-4">
          <div className="flex items-center gap-2 mb-2"><CheckCircle className="h-4 w-4 text-[#12b76a]" weight="bold" /><span className="text-[12px] font-medium text-[#717680]">Completed</span></div>
          <p className="text-[22px] font-bold tracking-[-0.03em] text-[#12b76a]">{completedCount}</p>
          <p className="mt-1 text-[11px] text-[#a4a7ae]">successfully settled</p>
        </div>
      </div>

      {/* Transactions table */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e9eaeb] shadow-xs">
        <div className="border-b border-[#e9eaeb] px-5 py-4">
          <p className="text-[15px] font-semibold text-[#181d27]">Offramp transactions</p>
          <p className="text-[12px] text-[#a4a7ae] mt-0.5">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="grid grid-cols-[90px_1fr_110px_120px_90px_20px] gap-3 border-b border-[#f2f4f7] px-5 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Asset</span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Destination</span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Status</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Fiat value</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Date</span>
          <span />
        </div>
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <ArrowsDownUp className="h-8 w-8 text-[#d0d5dd]" weight="duotone" />
            <p className="text-[13px] text-[#a4a7ae]">No offramp transactions yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f9fafb]">
            {transactions.map((tx) => {
              const statusMap = {
                pending:    { dot: 'bg-[#2563eb]', label: 'Pending',    bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]' },
                processing: { dot: 'bg-[#f59e0b]', label: 'Processing', bg: 'bg-[#fffaeb]', text: 'text-[#92400e]' },
                completed:  { dot: 'bg-[#12b76a]', label: 'Completed',  bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]' },
                failed:     { dot: 'bg-[#f04438]', label: 'Failed',     bg: 'bg-[#fff1f0]', text: 'text-[#b42318]' },
              } as const;
              const s = statusMap[tx.status as keyof typeof statusMap] ?? statusMap.pending;
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => setSelectedTx(tx)}
                  className="group grid w-full grid-cols-[90px_1fr_110px_120px_90px_20px] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[#fafafa]"
                >
                  <p className="text-[13px] font-semibold tabular-nums text-[#181d27]">{tx.amount} <span className="text-[#717680]">{tx.asset}</span></p>
                  <p className="truncate text-[13px] text-[#717680]">{tx.destinationLabel}</p>
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.bg} ${s.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                  <p className="text-right text-[13px] font-semibold tabular-nums text-[#181d27]">{formatCurrency(tx.fiatAmount, tx.fiatCurrency)}</p>
                  <p className="text-right text-[12px] text-[#a4a7ae]">{formatShortDate(tx.createdAt)}</p>
                  <CaretRight className="h-4 w-4 shrink-0 text-[#d0d5dd] transition group-hover:text-[#a4a7ae]" weight="bold" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ Offramp detail panel ════════════════════════════════ */}
      {selectedTx && <OfframpDetailPanel tx={selectedTx} onClose={() => setSelectedTx(null)} />}

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
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-medium text-[#717680] select-none pointer-events-none">$</span>
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
                  {rateError ? <p className="mt-1 text-[12px] text-[#f04438]">{rateError}</p> : null}
                </div>

                {/* Token */}
                <div>
                  <label className="mb-2 block text-[13px] font-semibold text-[#414651]">Token</label>
                  <SelectPill
                    options={TOKENS.map((t) => ({ id: t, label: t, iconSrc: TOKEN_ICON_BY_KEY[`${form.network}:${t}`] }))}
                    value={form.token}
                    onChange={(v) => update('token', v)}
                  />
                </div>

                {/* Network */}
                <div>
                  <label className="mb-2 block text-[13px] font-semibold text-[#414651]">Chain</label>
                  <SelectPill
                    options={NETWORKS.map((n) => ({ id: n.id, label: n.label, sub: n.desc, iconSrc: CHAIN_ICON_BY_KEY[n.id] }))}
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
                  {institutionsError ? <p className="mt-1 text-[12px] text-[#f04438]">{institutionsError}</p> : null}
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

/* ══ Offramp detail panel ══════════════════════════════════════════════════ */

const OFFRAMP_STATUS = {
  pending:    { label: 'Pending',    bg: 'bg-[#eff4ff]', text: 'text-[#2563eb]', dot: 'bg-[#2563eb]',  Icon: ClockCountdown  },
  processing: { label: 'Processing', bg: 'bg-[#fffaeb]', text: 'text-[#92400e]', dot: 'bg-[#f59e0b]',  Icon: SpinnerGap      },
  completed:  { label: 'Completed',  bg: 'bg-[#ecfdf3]', text: 'text-[#027a48]', dot: 'bg-[#12b76a]',  Icon: CheckCircle     },
  failed:     { label: 'Failed',     bg: 'bg-[#fff1f0]', text: 'text-[#b42318]', dot: 'bg-[#f04438]',  Icon: Warning         },
} as const;

function CopyInline({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}
      className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#e9eaeb] text-[#a4a7ae] transition hover:text-[#717680]"
    >
      {copied ? <Check className="h-2.5 w-2.5 text-[#12b76a]" weight="bold" /> : <Copy className="h-2.5 w-2.5" weight="bold" />}
    </button>
  );
}

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 text-[13px]">
      <span className="text-[#717680]">{label}</span>
      <span className="flex items-center font-semibold text-[#181d27]">{children}</span>
    </div>
  );
}

function OfframpDetailPanel({ tx, onClose }: { tx: OfframpTransaction; onClose: () => void }) {
  const s = OFFRAMP_STATUS[tx.status] ?? OFFRAMP_STATUS.pending;
  const { Icon } = s;
  const rate = tx.amount > 0 ? (tx.fiatAmount / tx.amount).toFixed(2) : null;
  const orderId = tx.paycrestOrderId || tx.id;
  const shortOrderId = orderId.length > 14 ? `${orderId.slice(0, 8)}…${orderId.slice(-6)}` : orderId;

  const date = new Date(tx.createdAt);
  const fullDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const fullTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e9eaeb] px-5 py-4">
          <div>
            <p className="text-[15px] font-bold text-[#181d27]">Offramp details</p>
            <p className="mt-0.5 text-[12px] text-[#a4a7ae]">Transaction breakdown</p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e9eaeb] text-[#717680] transition hover:bg-[#f5f5f5]">
            <X className="h-4 w-4" weight="bold" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Hero: amount + status */}
          <div className="border-b border-[#f2f4f7] bg-[#fafafa] px-5 py-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white ring-1 ring-[#e9eaeb]">
              <Image src="/icons/tokens/usdc.png" alt={tx.asset} width={32} height={32} className="rounded-full" />
            </div>
            <p className="text-[30px] font-bold tracking-[-0.04em] text-[#181d27]">
              {tx.amount} <span className="text-[#717680]">{tx.asset}</span>
            </p>
            <p className="mt-1 text-[15px] font-semibold text-[#414651]">
              ≈ {formatCurrency(tx.fiatAmount, tx.fiatCurrency)}
            </p>
            <div className="mt-3 flex justify-center">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${s.bg} ${s.text}`}>
                <span className={`h-2 w-2 rounded-full ${s.dot} ${tx.status === 'processing' ? 'animate-pulse' : ''}`} />
                {s.label}
              </span>
            </div>
          </div>

          {/* Details rows */}
          <div className="divide-y divide-[#f9fafb] px-5">
            <PanelRow label="Destination">
              <Bank className="mr-1.5 h-3.5 w-3.5 text-[#a4a7ae]" weight="bold" />
              {tx.destinationLabel}
            </PanelRow>
            <PanelRow label="Fiat currency">{tx.fiatCurrency}</PanelRow>
            {rate && <PanelRow label="Exchange rate">1 {tx.asset} ≈ {parseFloat(rate).toLocaleString()} {tx.fiatCurrency}</PanelRow>}
            <PanelRow label="Date">{fullDate}</PanelRow>
            <PanelRow label="Time">{fullTime}</PanelRow>
            <div className="flex items-center justify-between py-3 text-[13px]">
              <span className="text-[#717680]">Order ID</span>
              <span className="flex items-center font-mono text-[12px] font-semibold text-[#181d27]">
                {shortOrderId}
                <CopyInline text={orderId} />
              </span>
            </div>
          </div>

          {/* Status explanation */}
          <div className={`mx-5 mt-4 rounded-2xl border px-4 py-4 ${
            tx.status === 'completed' ? 'border-[#a9efc5] bg-[#ecfdf3]' :
            tx.status === 'failed'    ? 'border-[#fda29b] bg-[#fff1f0]' :
            'border-[#e9eaeb] bg-[#fafafa]'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`h-4 w-4 ${s.text} ${tx.status === 'processing' ? 'animate-spin' : ''}`} weight={tx.status === 'completed' ? 'fill' : 'bold'} />
              <p className={`text-[13px] font-semibold ${s.text}`}>{s.label}</p>
            </div>
            <p className="text-[12px] leading-[1.6] text-[#717680]">
              {tx.status === 'pending'    && 'Your offramp request has been received and is queued for processing.'}
              {tx.status === 'processing' && 'Your funds are being converted and sent to your bank. This typically takes 1–5 minutes.'}
              {tx.status === 'completed'  && 'The funds have been successfully sent to your bank account.'}
              {tx.status === 'failed'     && 'This offramp transaction failed. Please try again or contact support if the issue persists.'}
            </p>
          </div>

          <div className="h-8" />
        </div>
      </div>
    </>
  );
}
