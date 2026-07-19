'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { X, ArrowRight, CheckCircle, Warning, IdentificationCard, SpinnerGap } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast-provider';
import { backendConfig } from '@/lib/auth/config';
import { hedwigApi } from '@/lib/api/client';
import { useWallets, useSendTransaction } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import { encodeFunctionData, parseUnits } from 'viem';

const IS_DEVNET = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet';
const IS_TESTNET = IS_DEVNET;

const CHAIN_CONFIG: Record<string, { name: string; icon: string; chainId: number; usdcAddress: string; isEvm: boolean }> = {
  base: {
    name: 'Base',
    icon: '/icons/networks/base.png',
    chainId: IS_TESTNET ? 84532 : 8453,
    usdcAddress: IS_TESTNET
      ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    isEvm: true,
  },
  arbitrum: {
    name: 'Arbitrum',
    icon: '/icons/networks/arbitrum.png',
    chainId: IS_TESTNET ? 421614 : 42161,
    usdcAddress: IS_TESTNET
      ? '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'
      : '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    isEvm: true,
  },
  polygon: {
    name: 'Polygon',
    icon: '/icons/networks/polygon.png',
    chainId: IS_TESTNET ? 80002 : 137,
    usdcAddress: IS_TESTNET
      ? '0x41e94Eb019Cee2aF7478fC2cB028afE886dA082a'
      : '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    isEvm: true,
  },
  optimism: {
    name: 'Optimism',
    icon: '/icons/networks/optimism.png',
    chainId: IS_TESTNET ? 11155420 : 10,
    usdcAddress: IS_TESTNET
      ? '0x5fd84259d66Cd46123540766Be93DFE6D43130D7'
      : '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    isEvm: true,
  },
  solana: {
    name: 'Solana',
    icon: '/icons/networks/solana.png',
    chainId: 0,
    usdcAddress: '',
    isEvm: false,
  },
  // stellar: {
  //   name: 'Stellar',
  //   icon: '/icons/networks/stellar.png',
  //   chainId: 0,
  //   usdcAddress: '',
  //   isEvm: false,
  // },
};

const SUPPORTED_CURRENCIES: Record<string, { flag: string; label: string }> = {
  NGN: { flag: '\uD83C\uDDF3\uD83C\uDDEC', label: 'Nigeria (NGN)' },
  KES: { flag: '\uD83C\uDDF0\uD83C\uDDEA', label: 'Kenya (KES)' },
  UGX: { flag: '\uD83C\uDDFA\uD83C\uDDEC', label: 'Uganda (UGX)' },
  TZS: { flag: '\uD83C\uDDF9\uD83C\uDFFF', label: 'Tanzania (TZS)' },
  MWK: { flag: '\uD83C\uDDF2\uD83C\uDFFC', label: 'Malawi (MWK)' },
  BRL: { flag: '\uD83C\uDDE7\uD83C\uDDF7', label: 'Brazil (BRL)' },
};

const EVM_CHAINS = ['base', 'arbitrum', 'polygon', 'optimism'];
const ALL_CHAINS = ['base', 'arbitrum', 'polygon', 'optimism'];

type Step = 'kyc' | 'form' | 'signing' | 'success';

interface OfframpModalProps {
  open: boolean;
  onClose: () => void;
  source: 'personal' | 'workspace';
  workspaceId?: string;
  returnAddress: string;
  maxAmount?: number;
  chainBalances?: Record<string, number>;
  accessToken?: string | null;
  solanaAddress?: string | null;
  // stellarAddress prop kept for future use
}

export function OfframpModal({ open, onClose, source, workspaceId, returnAddress, maxAmount, chainBalances, accessToken, solanaAddress }: OfframpModalProps) {
  const { toast: addToast } = useToast();
  const { wallets: evmWallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();
  const { sendTransaction } = useSendTransaction();
  const privyWallet = evmWallets.find(w => w.walletClientType === 'privy') ?? evmWallets[0];
  const [step, setStep] = useState<Step>('kyc');
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [startingKyc, setStartingKyc] = useState(false);
  const [checkingKyc, setCheckingKyc] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);

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

  const shownChains = source === 'workspace' ? ['base'] : ALL_CHAINS;
  const [chain, setChain] = useState(shownChains[0]);
  const [currency, setCurrency] = useState('NGN');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState<string | null>(null);
  const [institution, setInstitution] = useState('');
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [accountIdentifier, setAccountIdentifier] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountResolved, setAccountResolved] = useState(false);
  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [memo, setMemo] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bridgeQuote, setBridgeQuote] = useState<any>(null);
  const [burnTxHash, setBurnTxHash] = useState('');

  const config = CHAIN_CONFIG[chain];
  const availableBalance = chainBalances?.[chain] ?? 0;
  const solanaBalance = chainBalances?.['solana'] ?? 0;
  const isSolana = chain === 'solana';
  const isStellar = false;

  const resetForm = useCallback(() => {
    setStep('kyc')
    setChain('base')
    setCurrency('NGN')
    setAmount('')
    setRate(null)
    setInstitution('')
    setInstitutions([])
    setAccountIdentifier('')
    setAccountName('')
    setAccountResolved(false)
    setVerifyingAccount(false)
    setMemo('')
    setLoading(false)
    setError('')
    setBridgeQuote(null)
    setBurnTxHash('')
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [resetForm, onClose])

  useEffect(() => {
    if (!open) return;
    api('api/kyc/status').then((d: any) => {
      setKycStatus(d.data?.status || 'not_started');
      if (d.data?.status === 'approved') setStep('form');
    }).catch(() => {});
  }, [open, api]);

  useEffect(() => {
    if (!currency || !open) return;
    hedwigApi.offrampV2Institutions(currency, { accessToken }).then((res: any) => {
      setInstitutions(res || []);
    }).catch(() => {});
  }, [currency, open]);

  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0 || isSolana || isStellar) return setRate(null);
    const timer = setTimeout(async () => {
      try {
        const res: any = await hedwigApi.offrampV2Rates('USDC', parseFloat(amount), currency, chain, { accessToken });
        const rateVal = res?.rate;
        if (rateVal && typeof rateVal === 'string') {
          const fiat = parseFloat(amount) * parseFloat(rateVal);
          setRate(fiat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        } else {
          setRate(null);
        }
      } catch { setRate(null); }
    }, 500);
    return () => clearTimeout(timer);
  }, [amount, currency, chain, isSolana, isStellar]);

  const handleVerifyAccount = useCallback(async () => {
    if (!institution || !accountIdentifier) return;
    setVerifyingAccount(true);
    setError('');
    try {
      const res: any = await hedwigApi.verifyOfframpV2Account({
        institution,
        accountIdentifier,
        currency,
      }, { accessToken });
      if (res?.accountName) {
        setAccountName(res.accountName);
        setAccountResolved(true);
      }
    } catch (err: any) {
      setError('Could not verify account');
    } finally {
      setVerifyingAccount(false);
    }
  }, [institution, accountIdentifier, currency]);

  const handleStartKyc = useCallback(async () => {
    setStartingKyc(true);
    setError('');
    try {
      const d: any = await api('api/kyc/start', 'POST');
      if (d.data?.url) {
        window.open(d.data.url, '_blank');
        setKycStatus('pending');
      } else if (d.data?.status === 'approved') {
        setKycStatus('approved');
        setStep('form');
      } else {
        setError('Could not start verification. Try again.');
      }
    } catch {
      setError('Failed to start verification');
    } finally {
      setStartingKyc(false);
    }
  }, [api]);

  const handleCheckKyc = useCallback(async () => {
    setCheckingKyc(true);
    setError('');
    try {
      const d: any = await api('api/kyc/check', 'POST');
      setKycStatus(d.data?.status || 'not_started');
      if (d.data?.status === 'approved') setStep('form');
    } catch {
      setError('Failed to check status');
    } finally {
      setCheckingKyc(false);
    }
  }, [api]);

  const handleChainSwitch = useCallback((c: string) => {
    setChain(c);
    setAmount('');
    setRate(null);
    setError('');
    setBridgeQuote(null);
  }, []);

  const handleCreateOrder = useCallback(async () => {
    if (!amount || !institution || !accountIdentifier) return;

    if (isSolana) {
      if (!solanaAddress) {
        setError('Solana wallet not connected');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const bridgeRes: any = await api('/api/bridge/bridge-and-offramp', 'POST', {
          solanaAddress,
          baseAddress: returnAddress,
          token: 'USDC',
          amount: parseFloat(amount),
          bankDetails: {
            bankName: institution,
            accountNumber: accountIdentifier,
            accountName,
            currency,
          },
        });
        setBridgeQuote(bridgeRes.data);
        setStep('signing');
        setLoading(false);

        // User signs the Solana bridge transaction via Privy
        const solanaWallet = solanaWallets[0];
        if (!solanaWallet) throw new Error('Solana wallet not found');

        const txBytes = bridgeRes.data.bridgeTransaction.transaction;
        const signedTx = await solanaWallet.signTransaction(txBytes);

        addToast({ title: 'Bridge initiated', message: 'Solana USDC bridging to Base. This may take a moment.', type: 'success' });
        setStep('success');
      } catch (err: any) {
        setStep('form');
        setError(err?.message || 'Failed to initiate bridge');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Stellar integration disabled until funding received
    // if (isStellar) {
    //   if (!stellarAddress) {
    //     setError('Stellar wallet address not found');
    //     return;
    //   }
    //   setLoading(true);
    //   setError('');
    //   try {
    //     const bridgeRes: any = await api('/api/bridge/stellar-bridge-and-offramp', 'POST', {
    //       stellarAddress,
    //       amount: parseFloat(amount),
    //       source,
    //       workspaceId: source === 'workspace' ? workspaceId : undefined,
    //       bankDetails: {
    //         bankName: institution,
    //         accountNumber: accountIdentifier,
    //         accountName,
    //         currency,
    //       },
    //     });
    //     setBridgeQuote({ ...bridgeRes.data, stellarAddress });
    //     setStep('signing');
    //     setLoading(false);
    //   } catch (err: any) {
    //     setStep('form');
    //     setError(err?.message || 'Failed to initiate bridge');
    //   } finally {
    //     setLoading(false);
    //   }
    //   return;
    // }

    setLoading(true);
    setError('');
    setSigningError(null);
    try {
      const order = await hedwigApi.createOfframpV2Order({
        source,
        workspaceId: source === 'workspace' ? workspaceId : undefined,
        usdcAmount: amount,
        fiatCurrency: currency,
        chain,
        recipient: {
          institution,
          accountIdentifier,
          accountName,
          memo: memo || undefined,
        },
      }, { accessToken });

      if (!order?.orderId) throw new Error('Failed to create order');

      if (!privyWallet) {
        throw new Error(
          solanaWallets.length > 0
            ? `${config.name} USDC wallet not found. Your Solana wallet cannot be used for EVM withdrawals.`
            : 'No wallet found. Please connect a wallet to continue.'
        );
      }

      const totalAmount = order.totalAmount;
      const data = encodeFunctionData({
        abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
        functionName: 'transfer',
        args: [order.receiveAddress as `0x${string}`, parseUnits(String(totalAmount), 6)],
      });

      setStep('signing');
      setLoading(false);

      const result = await sendTransaction({
        to: order.usdcAddress as `0x${string}`,
        data,
        chainId: order.chainId,
      }, {
        address: privyWallet?.address,
        uiOptions: {
          description: `Send ${totalAmount.toFixed(2)} USDC on ${config.name} to offramp to ${currency}`,
        },
      });

      await hedwigApi.confirmOfframpV2Order(order.orderId, { txHash: result.hash }, { accessToken });

      addToast({ title: 'Withdrawal started', message: 'Your funds are being sent to your bank.', type: 'success' });
      setStep('success');
    } catch (err: any) {
      setStep('form');
      setError(err?.message || 'Failed to create withdrawal');
    } finally {
      setLoading(false);
    }
  }, [chain, isSolana, amount, institution, accountIdentifier, accountName, memo, currency, source, workspaceId, addToast, accessToken, sendTransaction, privyWallet, solanaWallets, api, config, returnAddress, solanaAddress]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={handleClose}>
      <div className="relative w-full max-w-[440px] max-h-[90vh] flex flex-col rounded-2xl bg-[var(--color-surface)] shadow-2xl ring-1 ring-[var(--color-border)]" onClick={e => e.stopPropagation()}>
        <button onClick={handleClose} className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-secondary)]"><X className="h-4 w-4" weight="bold" /></button>
        <div className="border-b border-[var(--color-border)] px-6 py-5 pr-12 shrink-0">
          <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
            {step === 'kyc' ? 'Identity Verification' : step === 'signing' ? (isSolana ? 'Bridge to Base' : 'Confirm transaction') : step === 'success' ? 'Withdrawal started' : 'Withdraw to Bank'}
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
                  To withdraw to a bank account, we need to verify your identity first.
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
                  <p className="mt-1 text-[12px] text-emerald-600/70 dark:text-emerald-400/70">You can now withdraw to your bank.</p>
                </div>
              )}

              {error && <div className="rounded-full border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2.5"><p className="text-[12px] font-medium text-red-700 dark:text-red-400">{error}</p></div>}
            </>
          )}

          {step === 'form' && (
            <>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Network</span>
                <div className="relative mt-2">
                  <select
                    value={chain}
                    onChange={e => handleChainSwitch(e.target.value)}
                    className="w-full appearance-none rounded-full border border-[var(--color-border)] bg-[var(--color-background)] py-2 pl-9 pr-8 text-[13px] text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
                  >
                    {shownChains.map((c) => (
                      <option key={c} value={c}>{CHAIN_CONFIG[c].name}</option>
                    ))}
                  </select>
                  <Image
                    src={CHAIN_CONFIG[chain].icon}
                    alt={CHAIN_CONFIG[chain].name}
                    width={16}
                    height={16}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full"
                  />
                  <svg className="pointer-events-none absolute right-8 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-text-muted)]" viewBox="0 0 12 12" fill="none">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Currency</span>
                <select value={currency} onChange={e => { setCurrency(e.target.value); setInstitution(''); setAccountResolved(false); }} className="mt-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)]">
                  {Object.entries(SUPPORTED_CURRENCIES).map(([k, v]) => (<option key={k} value={k}>{v.flag} {v.label}</option>))}
                </select>
              </div>

              <div>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Amount (USDC)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="mt-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[14px] tabular-nums text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]"
                />
                {rate && <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">≈ {rate} {currency}</p>}
                {availableBalance > 0 && (
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Available: {availableBalance.toFixed(2)} USDC on {config.name}</p>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)] mb-3">Bank details</p>
                {currency !== 'BRL' ? (
                  <select
                    value={institution}
                    onChange={e => { setInstitution(e.target.value); setAccountResolved(false); }}
                    className="mb-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)]"
                  >
                    <option value="">Select institution</option>
                    {institutions.map((i: any) => (
                      <option key={i.code || i.id || i} value={i.code || i.id || i}>
                        {i.name || i.label || i}
                      </option>
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
                  className="mb-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]"
                />
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Account name"
                    value={verifyingAccount ? 'Verifying...' : accountName}
                    readOnly={accountResolved}
                    onChange={e => setAccountName(e.target.value)}
                    className={`w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] ${accountResolved ? 'opacity-70' : ''}`}
                  />
                  {verifyingAccount && (
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Memo (optional)</span>
                <input
                  type="text"
                  placeholder="e.g. Salary June"
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  className="mt-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)]"
                />
              </div>

              {solanaBalance > 0 && (
                <div className="rounded-2xl border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] p-3">
                  <p className="text-[12px] font-medium text-[var(--color-warning)]">
                    Solana offramp is temporarily unavailable. Circle Gateway (beta) aggregates USDC from all supported chains — use Base, Arbitrum, Polygon, or Optimism instead.
                  </p>
                </div>
              )}

              {error && <div className="rounded-full border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2.5"><p className="text-[12px] font-medium text-red-700 dark:text-red-400">{error}</p></div>}
            </>
          )}

          {step === 'signing' && (
            <div className="flex flex-col items-center text-center pt-6 pb-2">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
                <SpinnerGap className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" weight="bold" />
              </div>
              <h3 className="text-[16px] font-semibold text-[var(--color-foreground)]">
                {isSolana ? 'Confirm bridge in your wallet' : 'Confirm in your wallet'}
              </h3>
              <p className="mt-2 text-[13px] text-[var(--color-text-muted)] max-w-[320px]">
                {isSolana
                  ? 'A signing prompt has appeared in your Solana wallet. Please confirm the bridge transaction to continue.'
                  : `A signing prompt has appeared in your Privy wallet. Please confirm the transaction on ${config.name}.`}
              </p>
              {signingError && (
                <div className="mt-4 w-full rounded-full border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2.5">
                  <p className="text-[12px] font-medium text-red-700 dark:text-red-400">{signingError}</p>
                </div>
              )}
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center text-center py-6">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success-soft)]">
                <CheckCircle className="h-8 w-8 text-[var(--color-success)]" weight="bold" />
              </div>
              <h3 className="text-[16px] font-semibold text-[var(--color-foreground)]">Withdrawal initiated</h3>
              <p className="mt-2 text-[13px] text-[var(--color-text-muted)] max-w-[320px]">
                {isSolana
                  ? 'Your Solana USDC is being bridged to Base and will be withdrawn to your bank. This may take a few minutes.'
                  : `Your withdrawal of ${amount} USDC on ${config.name} to ${accountName || institution} has been started. Funds typically arrive in 1-2 business days.`}
              </p>
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
              <Button variant="default" size="sm" disabled={!amount || !institution || !accountIdentifier || loading || verifyingAccount} onClick={handleCreateOrder}>
                {loading ? (isSolana ? 'Bridging...' : 'Creating...') : (isSolana ? 'Bridge & Withdraw' : 'Withdraw')}
              </Button>
            </>
          )}
          {step === 'success' && (
            <Button variant="default" size="sm" onClick={handleClose}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}
