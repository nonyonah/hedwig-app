'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, PaperPlaneRight, Warning, X } from '@/components/ui/lucide-icons';
import { Alert } from '@heroui/react';
import { Loader } from '@/components/ui/loader';
import { ClientPortal } from '@/components/ui/client-portal';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import { isAddress } from 'viem';
import { sendSolanaUsdc, sendEvmUsdc, sendUsdcViaGateway, getExplorerUrl as getSendExplorerUrl, type SendChain } from '@/lib/send/send-helpers';
import type { WalletAsset, GatewayDomainBalance } from '@/lib/models/entities';
import { hedwigApi } from '@/lib/api/client';

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type SendStep = 'form' | 'review' | 'signing' | 'done' | 'error';

export type SendSourceAccount = {
  id: string;
  currency: string;
  account_type: string;
  label?: string | null;
  balance: number;
  balance_usd: number;
  status: string;
};

export type SavedRecipient = {
  id: string;
  address?: string | null;
  chain?: string | null;
  label?: string | null;
  recipientType?: string | null;
  bankCode?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  currency?: string | null;
};

// Chain meta derived from asset.chain value
const CHAIN_META: Record<string, { icon: string; label: string }> = {
 Unified: { icon: '/icons/tokens/usdc.png', label: 'Aggregated' },
 Base: { icon: '/icons/networks/base.png', label: 'Base' },
 Solana: { icon: '/icons/networks/solana.png', label: 'Solana' },
 Arbitrum: { icon: '/icons/networks/arbitrum.png', label: 'Arbitrum' },
 Polygon: { icon: '/icons/networks/polygon.png', label: 'Polygon' },
 Optimism: { icon: '/icons/networks/optimism.png', label: 'Optimism' },
};

const TOKEN_META: Record<string, { icon: string }> = {
 USDC: { icon: '/icons/tokens/usdc.png' },
};

const CHAIN_TO_KEY: Record<string, SendChain> = {
 Base: 'base',
 Solana: 'solana',
 Arbitrum: 'arbitrum',
 Polygon: 'polygon',
 Optimism: 'optimism',
};

function fmt(n: number, sym: string) {
 const dec = sym === 'USDC' ? 2 : n >= 1 ? 6 : 8;
 return `${n.toLocaleString(undefined, { maximumFractionDigits: dec })} ${sym}`;
}

const DEST_CHAIN_OPTIONS: Array<{ key: SendChain; label: string; icon: string }> = [
 { key: 'base', label: 'Base', icon: '/icons/networks/base.png' },
 { key: 'solana', label: 'Solana', icon: '/icons/networks/solana.png' },
 { key: 'arbitrum', label: 'Arbitrum', icon: '/icons/networks/arbitrum.png' },
 { key: 'polygon', label: 'Polygon', icon: '/icons/networks/polygon.png' },
 { key: 'optimism', label: 'Optimism', icon: '/icons/networks/optimism.png' },
];

const selectClass =
 'w-full appearance-none rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 pr-10 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] [&>option]:bg-[var(--color-surface)]';

function Chevron() {
 return (
 <svg className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
 </svg>
 );
}

export function SendTokenDialog({
 assets,
 gatewayAvailableUsdc = 0,
 gatewayPerDomain = [],
 accessToken = null,
 onClose,
 baseOnly = false,
 accounts = [],
}: {
 assets: WalletAsset[];
 gatewayAvailableUsdc?: number;
 gatewayPerDomain?: GatewayDomainBalance[];
 accessToken?: string | null;
 onClose: () => void;
 baseOnly?: boolean;
 accounts?: SendSourceAccount[];
}) {
 const destOptions = baseOnly ? DEST_CHAIN_OPTIONS.filter((o) => o.key === 'base') : DEST_CHAIN_OPTIONS;
 const { ready } = usePrivy();
 const { wallets: evmWallets } = useWallets();
 const { wallets: solanaWallets } = useSolanaWallets();

 // ── Source account ──
 const fundedAccounts = useMemo(
 () => accounts.filter((a) => a.status === 'active' && (a.currency === 'USDC' || Number(a.balance ?? 0) > 0)),
 [accounts]
 );
 const [sourceId, setSourceId] = useState<string>('');
 const source = fundedAccounts.find((a) => a.id === sourceId)
 ?? fundedAccounts.find((a) => a.currency === 'USDC')
 ?? fundedAccounts[0]
 ?? null;
 const isNgnSource = source?.currency === 'NGN';
 const isStablecoinSource = !source || source.currency === 'USDC';
 const unsupportedSource = !!source && !isStablecoinSource && !isNgnSource;

 // ── Saved recipients ──
 const [savedRecipients, setSavedRecipients] = useState<SavedRecipient[]>([]);
 const [recipientId, setRecipientId] = useState<string>('new');
 const [recipientName, setRecipientName] = useState('');
 const [recipientKind, setRecipientKind] = useState<'person' | 'business'>('person');
 const [saveRecipient, setSaveRecipient] = useState(true);
 const [renaming, setRenaming] = useState(false);
 const [renameValue, setRenameValue] = useState('');
 const [renameSaving, setRenameSaving] = useState(false);
 useEffect(() => {
 if (!accessToken) return;
 hedwigApi.listWalletRecipients({ accessToken, disableMockFallback: true }).then(setSavedRecipients).catch(() => {});
 }, [accessToken]);
 const visibleRecipients = useMemo(
 () => savedRecipients.filter((r) => (isNgnSource ? r.chain === 'bank' : r.chain !== 'bank')),
 [savedRecipients, isNgnSource]
 );
 const chosenRecipient: SavedRecipient | null =
 recipientId === 'new' ? null : (visibleRecipients.find((r) => r.id === recipientId) ?? null);

 // ── Crypto state (stablecoin source) ──
 const baseChains = Array.from(new Map(assets.map((a) => [a.chain, a])).keys());
 // Aggregated (Unified) USDC option hidden — per-chain sends only until Gateway UX ships.
 const chains = baseChains;
 const [selectedChain, setSelectedChain] = useState<string>(assets[0]?.chain ?? '');
 const tokensForChain = assets.filter((a) => a.chain === selectedChain);
 const [selectedAssetId, setSelectedAssetId] = useState<string>(assets[0]?.id ?? '');
 const selected = selectedChain === 'Unified'
 ? { id: 'gateway-usdc', chain: 'Unified' as const, symbol: 'USDC', name: 'Aggregated USDC', balance: gatewayAvailableUsdc, valueUsd: gatewayAvailableUsdc, changePct24h: 0 }
 : assets.find((a) => a.id === selectedAssetId) ?? tokensForChain[0] ?? assets[0];

 const [chainOpen, setChainOpen] = useState(false);
 const chainRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
 function onOutside(e: MouseEvent) {
 if (chainRef.current && !chainRef.current.contains(e.target as Node)) setChainOpen(false);
 if (destRef.current && !destRef.current.contains(e.target as Node)) setDestOpen(false);
 }
 document.addEventListener('mousedown', onOutside);
 return () => document.removeEventListener('mousedown', onOutside);
 }, []);

 const handleChainSelect = (chain: string) => {
 setSelectedChain(chain);
 setChainOpen(false);
 if (chain !== 'Unified') {
 const first = assets.find((a) => a.chain === chain);
 if (first) setSelectedAssetId(first.id);
 }
 };

 const [recipient, setRecipient] = useState('');

 // Auto-detect chain from pasted recipient address
 useEffect(() => {
 const trimmed = recipient.trim();
 if (trimmed.length < 10) return;

 const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
 const isSolanaAddress = SOLANA_ADDRESS_RE.test(trimmed);

 if (isSolanaAddress && selectedChain !== 'Solana' && selectedChain !== 'Unified' && chains.includes('Solana')) {
 setSelectedChain('Solana');
 setChainOpen(false);
 const solAsset = assets.find((a) => a.chain === 'Solana');
 if (solAsset) setSelectedAssetId(solAsset.id);
 } else if (isEvmAddress && selectedChain === 'Solana') {
 const evmChain = chains.find((c) => c !== 'Unified' && c !== 'Solana');
 if (evmChain) {
 setSelectedChain(evmChain);
 setChainOpen(false);
 const evmAsset = assets.find((a) => a.chain === evmChain);
 if (evmAsset) setSelectedAssetId(evmAsset.id);
 }
 }
 }, [recipient, selectedChain, chains, assets]);

 // ── Bank state (NGN source) ──
 const [banks, setBanks] = useState<Array<{ code: string; name: string }>>([]);
 const [banksLoading, setBanksLoading] = useState(false);
 const [bankCode, setBankCode] = useState('');
 const [bankAccount, setBankAccount] = useState('');
 const [bankNarration, setBankNarration] = useState('');
 const [bankRef, setBankRef] = useState<string | null>(null);
 useEffect(() => {
 if (!isNgnSource || banks.length > 0 || banksLoading) return;
 setBanksLoading(true);
 hedwigApi.flutterwaveBanks({ accessToken, disableMockFallback: true }).then(
 (list) => setBanks(list),
 () => {}
 ).finally(() => setBanksLoading(false));
 }, [isNgnSource, banks.length, banksLoading, accessToken]);

 const [amount, setAmount] = useState('');
 const [step, setStep] = useState<SendStep>('form');
 const [txHash, setTxHash] = useState<string | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [destChain, setDestChain] = useState<SendChain>('base');
 const [destOpen, setDestOpen] = useState(false);
 const destRef = useRef<HTMLDivElement>(null);

 // Reset recipient selection when the source account changes rail
 useEffect(() => {
 setRecipientId('new');
 setRecipient('');
 setBankCode('');
 setBankAccount('');
 }, [source?.id]);

 const isUnified = selected.chain === 'Unified';
 const isEvm = !isUnified && (selected.chain === 'Base' || !['Solana'].includes(selected.chain));
 const isSolana = !isUnified && selected.chain === 'Solana';

 const evmWallet = evmWallets.find((w) => w.walletClientType === 'privy') ?? evmWallets[0];
 const solanaWallet = solanaWallets[0];

 const numericAmount = parseFloat(amount) || 0;

 // Effective crypto destination: saved recipient wins, else typed address
 const cryptoDestination = chosenRecipient?.address ?? recipient.trim();
 const maxBalance = selected.balance;
 const hasBalance = numericAmount > 0 && numericAmount <= maxBalance;

 const recipientValid = isUnified
 ? isAddress(cryptoDestination) || cryptoDestination.length >= 32
 : (isEvm ? isAddress(cryptoDestination) : isSolana && cryptoDestination.length >= 32);

 // Effective bank destination: saved recipient wins, else typed fields
 const bankDestCode = chosenRecipient?.bankCode ?? bankCode;
 const bankDestAccount = (chosenRecipient?.accountNumber ?? bankAccount).trim();
 const bankAccountValid = /^[0-9]{10}$/.test(bankDestAccount);
 const bankCanProceed = !!bankDestCode && bankAccountValid && numericAmount > 0;
 const reviewBankName = chosenRecipient?.bankName
 ?? banks.find((b) => b.code === bankDestCode)?.name
 ?? 'bank';
 const reviewBankAccount = bankDestAccount;

 const canProceedCrypto = hasBalance && !!recipientValid;
 const needsRecipientName = recipientId === 'new' && saveRecipient;

 const canProceed = unsupportedSource
 ? false
 : isNgnSource
 ? bankCanProceed && (!saveRecipient || recipientName.trim().length > 0 || !!chosenRecipient)
 : canProceedCrypto && (!saveRecipient || recipientName.trim().length > 0 || !!chosenRecipient);

 // ── Persist a new recipient (best-effort, never blocks the transfer) ──
 async function maybeSaveRecipient() {
 if (!saveRecipient || recipientId !== 'new' || !accessToken) return;
 const name = recipientName.trim();
 if (!name) return;
 try {
 if (isNgnSource) {
 if (!bankDestCode || !bankAccountValid) return;
 await hedwigApi.createWalletRecipient(
 {
 chain: 'bank',
 label: name,
 recipientType: recipientKind,
 bankCode: bankDestCode,
 bankName: banks.find((b) => b.code === bankDestCode)?.name,
 accountNumber: bankDestAccount,
 currency: 'NGN',
 country: 'NG',
 },
 { accessToken }
 );
 } else {
 if (!recipientValid) return;
 await hedwigApi.createWalletRecipient(
 {
 address: cryptoDestination,
 chain: isSolana ? 'solana' : 'base',
 label: name,
 recipientType: recipientKind,
 },
 { accessToken, disableMockFallback: true }
 );
 }
 const list = await hedwigApi.listWalletRecipients({ accessToken, disableMockFallback: true }).catch(() => []);
 setSavedRecipients(list);
 } catch {
 // Silent — saving is a convenience, not the transfer.
 }
 }

 // ── Send EVM tx ──
 async function sendEvm() {
 const chainKey = CHAIN_TO_KEY[selected.chain] ?? 'base';
 return sendEvmUsdc({
 evmWallet,
 recipient: cryptoDestination,
 amountUsdc: numericAmount,
 chain: chainKey,
 });
 }

 // ── Send Solana tx ──
 async function sendSolana() {
 return sendSolanaUsdc({
 solanaWallet,
 recipient: cryptoDestination,
 amountUsdc: numericAmount,
 });
 }

 // ── Send via Gateway (unified balance) ──
 async function sendGateway() {
 return sendUsdcViaGateway({
 evmWallets,
 solanaWallets,
 amountUsdc: numericAmount,
 recipientAddress: cryptoDestination,
 destChain,
 perDomainBalances: gatewayPerDomain,
 accessToken,
 });
 }

 // ── Bank transfer via Flutterwave (NGN) ──
 async function sendBank() {
 const res = await hedwigApi.flutterwaveOfframp(
 {
 accountBank: bankDestCode,
 accountNumber: bankDestAccount,
 amount: numericAmount,
 narration: bankNarration.trim() || undefined,
 beneficiaryName: (chosenRecipient?.label ?? recipientName.trim()) || undefined,
 },
 { accessToken, disableMockFallback: true }
 );
 setBankRef(res.reference);
 setStep('done');
 }

 // ── Main send handler ──────────────────────────────────────────────────────
 async function handleSend() {
 setStep('signing');
 setError(null);
 try {
 if (isNgnSource) {
 await sendBank();
 await maybeSaveRecipient();
 return;
 }
 const hash = isUnified ? await sendGateway() : (isEvm ? await sendEvm() : await sendSolana());
 setTxHash(hash);
 await maybeSaveRecipient();
 setStep('done');
 } catch (err: unknown) {
 const msg = typeof err === 'object' && err !== null && 'message' in err
 ? String((err as { message: unknown }).message)
 : String(err ?? 'Transaction failed');
 setError(msg);
 setStep('error');
 }
 }

 const explorerUrl = txHash
 ? (isUnified
 ? `https://basescan.org/tx/${txHash}`
 : getSendExplorerUrl(isEvm ? 'evm' : 'solana', txHash, isEvm ? (CHAIN_TO_KEY[selected.chain] ?? 'base') : undefined))
 : null;

 const tokenIcon = TOKEN_META[selected.symbol]?.icon ?? null;
 const chainIcon = CHAIN_META[selected.chain]?.icon ?? null;
 const displayName = (r: SavedRecipient) =>
 r.label || (r.chain === 'bank' ? `${r.bankName ?? 'Bank'} ••••${(r.accountNumber ?? '').slice(-4)}` : `${(r.address ?? '').slice(0, 8)}…`);

 return (
 <ClientPortal>
 {/* Backdrop */}
 <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={step === 'signing' ? undefined : onClose} />

 {/* Panel */}
 <div className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full max-w-[440px] flex-col bg-[var(--color-surface)] shadow-2xl rounded-l-xl animate-in slide-in-from-right-full duration-300 ease-out">

 {/* Header */}
 <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
 <div>
 <p className="text-[15px] font-bold text-[var(--color-foreground)]">Send money</p>
 <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
 {step === 'form' ? 'Choose an account, recipient, and amount' :
 step === 'review' ? 'Review before sending' :
 step === 'signing' ? (isNgnSource ? 'Sending money…' : 'Waiting for wallet confirmation…') :
 step === 'done' ? 'Transaction submitted' :
 'Transaction failed'}
 </p>
 </div>
 {step !== 'signing' && (
 <button type="button" onClick={onClose}
 className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-secondary)]">
 <X className="h-4 w-4" weight="bold" />
 </button>
 )}
 </div>

 <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

 {/* ── Form step ── */}
 {step === 'form' && (
 <>
 {/* Source account */}
 <div>
 <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">From account</label>
 <div className="relative">
 <select
 aria-label="Source account"
 value={source?.id ?? ''}
 onChange={(e) => setSourceId(e.target.value)}
 className="w-full appearance-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 pr-10 text-[13px] font-semibold text-[var(--color-foreground)] outline-none transition hover:bg-[var(--color-background)] [&>option]:bg-[var(--color-surface)]"
 >
 {fundedAccounts.map((a) => (
 <option key={a.id} value={a.id}>
 {(a.label ?? `${a.currency} ${a.account_type}`)} · {a.currency} {Number(a.balance ?? 0).toLocaleString()} {a.balance > 0 ? '' : '(empty)'}
 </option>
 ))}
 </select>
 <svg className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
 </svg>
 </div>
 {unsupportedSource && (
 <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-warning)]">
 Sending from {source?.currency} accounts isn&apos;t enabled yet — choose stablecoin or NGN.
 </p>
 )}
 </div>

 {isStablecoinSource && (
 <>
 {/* Chain dropdown */}
 <div ref={chainRef} className="relative">
 <button
 type="button"
 onClick={() => setChainOpen((o) => !o)}
 className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-xs transition hover:bg-[var(--color-background)]"
 >
 {CHAIN_META[selectedChain]
 ? <Image src={CHAIN_META[selectedChain].icon} alt={selectedChain} width={20} height={20} className="rounded-full" />
 : <div className="h-5 w-5 rounded-full bg-[var(--color-surface-tertiary)]" />}
 <span className="flex-1 text-left text-[13px] font-semibold text-[var(--color-foreground)]">
 {CHAIN_META[selectedChain]?.label ?? selectedChain}
 </span>
 <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Network</span>
 <svg className={`h-4 w-4 text-[var(--color-text-muted)] transition-transform ${chainOpen ? 'rotate-180' : ''}`}
 fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
 </svg>
 </button>
 {chainOpen && (
 <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
 {chains.map((chain) => (
 <button key={chain} type="button" onClick={() => handleChainSelect(chain)}
 className={`flex w-full items-center gap-3 px-4 py-3 text-[13px] font-medium transition ${
 chain === selectedChain ? 'bg-[var(--color-surface-secondary)] text-[var(--color-foreground)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-background)]'
 }`}>
 {CHAIN_META[chain]
 ? <Image src={CHAIN_META[chain].icon} alt={chain} width={20} height={20} className="rounded-full" />
 : <div className="h-5 w-5 rounded-full bg-[var(--color-surface-tertiary)]" />}
 <span className="flex-1 text-left">{CHAIN_META[chain]?.label ?? chain}</span>
 {chain === selectedChain && (
 <svg className="h-4 w-4 text-[var(--color-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
 </svg>
 )}
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Token (static — only USDC for now) */}
 <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
 {TOKEN_META[selected?.symbol]
 ? <Image src={TOKEN_META[selected.symbol].icon} alt={selected.symbol} width={20} height={20} className="rounded-full" />
 : <div className="h-5 w-5 rounded-full bg-[var(--color-surface-tertiary)]" />}
 <span className="flex-1 text-left text-[13px] font-semibold text-[var(--color-foreground)]">
 {selected?.symbol}
 </span>
 <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">
 {fmt(selected?.balance ?? 0, selected?.symbol ?? '')}
 </span>
 <span className="text-[11px] font-semibold text-[var(--color-text-muted)] ml-2">Token</span>
 </div>
 </>
 )}

 {/* Recipient */}
 <div>
 <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Recipient</label>
 <div className="relative mb-2">
 <select
 aria-label="Saved recipients"
 value={recipientId}
 onChange={(e) => setRecipientId(e.target.value)}
 className="w-full appearance-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 pr-10 text-[13px] font-semibold text-[var(--color-foreground)] outline-none transition hover:bg-[var(--color-background)] [&>option]:bg-[var(--color-surface)]"
 >
 <option value="new">New recipient…</option>
 {visibleRecipients.map((r) => (
 <option key={r.id} value={r.id}>{displayName(r)}</option>
 ))}
 </select>
 <svg className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
 </svg>
 </div>

 {recipientId === 'new' ? (
 <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
 <div>
 <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Name</label>
 <input
 type="text"
 placeholder={recipientKind === 'business' ? 'e.g. Acme Ltd' : 'e.g. Jane Doe'}
 value={recipientName}
 onChange={(e) => setRecipientName(e.target.value)}
 className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 text-[13px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)]"
 />
 </div>
 <div>
 <span className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Recipient is a…</span>
 <div className="grid grid-cols-2 gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
 <button type="button" onClick={() => setRecipientKind('person')}
 className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${recipientKind === 'person' ? 'bg-[var(--color-surface-secondary)] text-[var(--color-foreground)] shadow-xs' : 'text-[var(--color-text-tertiary)]'}`}>
 Person
 </button>
 <button type="button" onClick={() => setRecipientKind('business')}
 className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${recipientKind === 'business' ? 'bg-[var(--color-surface-secondary)] text-[var(--color-foreground)] shadow-xs' : 'text-[var(--color-text-tertiary)]'}`}>
 Business
 </button>
 </div>
 </div>
 {isNgnSource ? (
 <>
 <div>
 <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Bank</label>
 <div className="relative">
 <select
 aria-label="Recipient bank"
 value={bankCode}
 onChange={(e) => setBankCode(e.target.value)}
 className="w-full appearance-none rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 pr-10 text-[13px] text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] [&>option]:bg-[var(--color-surface)]"
 >
 <option value="" disabled>{banksLoading ? 'Loading banks…' : 'Select bank'}</option>
 {banks.map((b) => (
 <option key={b.code} value={b.code}>{b.name}</option>
 ))}
 </select>
 <svg className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
 </svg>
 </div>
 </div>
 <div>
 <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Account number</label>
 <input
 type="text"
 inputMode="numeric"
 placeholder="0123456789"
 value={bankAccount}
 onChange={(e) => setBankAccount(e.target.value.replace(/\D/g, '').slice(0, 10))}
 className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 font-mono text-[13px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)]"
 />
 {bankAccount.length > 0 && bankAccount.length !== 10 && (
 <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Enter the 10-digit account number</p>
 )}
 </div>
 <div>
 <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Narration (optional)</label>
 <input
 type="text"
 placeholder="What is this for?"
 value={bankNarration}
 onChange={(e) => setBankNarration(e.target.value)}
 className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 text-[13px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)]"
 />
 </div>
 </>
 ) : (
 <div>
 <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Wallet address</label>
 <input
 type="text"
 placeholder="0x…"
 value={recipient}
 onChange={(e) => setRecipient(e.target.value.trim())}
 className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 font-mono text-[13px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)]"
 />
 {recipient.length > 5 && !recipientValid && (
 <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
 {isUnified ? 'Enter a valid EVM or Solana address' : isSolana ? 'Invalid Solana address' : 'Invalid EVM address'}
 </p>
 )}
 </div>
 )}
 <label className="flex cursor-pointer items-center gap-2.5">
 <input
 type="checkbox"
 checked={saveRecipient}
 onChange={(e) => setSaveRecipient(e.target.checked)}
 className="h-4 w-4 accent-[var(--color-accent)]"
 />
 <span className="text-[13px] text-[var(--color-text-tertiary)]">Save this recipient for next time</span>
 </label>
 </div>
  ) : chosenRecipient ? (
  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3">
  <div className="flex items-center justify-between gap-2">
  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">
  {chosenRecipient.label ?? displayName(chosenRecipient)}
  </p>
  <button
  type="button"
  aria-label="Rename recipient"
  onClick={() => { setRenameValue(chosenRecipient.label ?? ''); setRenaming(true); }}
  className="rounded-full p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
  >
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
  </svg>
  </button>
  </div>
  {renaming && (
  <div className="mt-2 flex items-center gap-2">
  <input
  type="text"
  value={renameValue}
  onChange={(e) => setRenameValue(e.target.value)}
  placeholder="Recipient name"
  className="h-9 flex-1 rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-3 text-[13px] text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)]"
  />
  <button
  type="button"
  disabled={renameSaving || renameValue.trim().length === 0}
  onClick={() => {
  if (!accessToken) return;
  setRenameSaving(true);
  hedwigApi.renameWalletRecipient(chosenRecipient.id, { label: renameValue.trim() }, { accessToken, disableMockFallback: true })
  .then((updated) => {
  if (updated) {
  setSavedRecipients((prev) => prev.map((r) => (r.id === updated.id ? { ...r, label: updated.label } : r)));
  }
  setRenaming(false);
  })
  .catch(() => {})
  .finally(() => setRenameSaving(false));
  }}
  className="h-9 shrink-0 rounded-full bg-[var(--color-primary)] px-4 text-[12px] font-semibold text-white disabled:opacity-40"
  >
  {renameSaving ? 'Saving…' : 'Save'}
  </button>
  </div>
  )}
  <p className="mt-0.5 font-mono text-[12px] text-[var(--color-text-tertiary)]">
  {chosenRecipient.chain === 'bank'
  ? `${chosenRecipient.bankName ?? 'Bank'} ····${(chosenRecipient.accountNumber ?? '').slice(-4)}`
  : chosenRecipient.address}
  </p>
  </div>
  ) : null}
 </div>

 {/* Amount */}
 <div>
 <div className="mb-1.5 flex items-center justify-between">
 <label className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Amount</label>
 {isStablecoinSource && (
 <button type="button" onClick={() => setAmount(String(maxBalance))}
 className="text-[11px] text-[var(--color-primary)] hover:underline">
 Max: {fmt(maxBalance, selected?.symbol ?? '')}
 </button>
 )}
 {isNgnSource && source && (
 <span className="text-[11px] text-[var(--color-text-tertiary)]">
 Available: ₦{Number(source.balance ?? 0).toLocaleString()}
 </span>
 )}
 </div>
 <div className="relative">
 <input
 type="number"
 placeholder="0.00"
 value={amount}
 min={0}
 step="any"
 onChange={(e) => setAmount(e.target.value)}
 className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] py-2.5 pl-4 pr-16 text-[15px] font-semibold text-[var(--color-foreground)] placeholder-[var(--color-border-input)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
 />
 <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[var(--color-text-tertiary)]">
 {isNgnSource ? 'NGN' : selected?.symbol}
 </span>
 </div>
 {isStablecoinSource && numericAmount > maxBalance && numericAmount > 0 && (
 <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Exceeds your balance</p>
 )}
 </div>

 <button
 type="button"
 disabled={!canProceed || !ready}
 onClick={() => setStep('review')}
 className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-40"
 >
 Review <ArrowRight className="h-4 w-4" weight="bold" />
 </button>
 </>
 )}

 {/* ── Review step ── */}
 {step === 'review' && (
 <>
 {isNgnSource ? (
 <>
 <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 text-center">
 <div className="relative mx-auto mb-3 w-fit">
 <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success-soft)] text-[14px] font-bold text-[var(--color-success)]">₦</div>
 </div>
 <p className="text-[28px] font-bold tracking-[-0.04em] text-[var(--color-foreground)]">₦{numericAmount.toLocaleString()}</p>
 <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">from {source?.label ?? 'NGN account'} · to {reviewBankName}</p>
 </div>
 <div className="divide-y divide-[var(--color-background)] rounded-2xl border border-[var(--color-border)] px-5">
 <div className="flex items-start justify-between py-3.5 text-[13px]">
 <span className="text-[var(--color-text-tertiary)]">To</span>
 <span className="ml-4 max-w-[240px] break-all text-right font-mono text-[12px] font-semibold text-[var(--color-foreground)]">{reviewBankAccount}</span>
 </div>
 <div className="flex items-center justify-between py-3.5 text-[13px]">
 <span className="text-[var(--color-text-tertiary)]">Rail</span>
 <span className="font-semibold text-[var(--color-foreground)]">Flutterwave · NGN bank transfer</span>
 </div>
 {bankNarration.trim() !== '' && (
 <div className="flex items-start justify-between py-3.5 text-[13px]">
 <span className="text-[var(--color-text-tertiary)]">Narration</span>
 <span className="ml-4 max-w-[240px] break-all text-right text-[12px] font-semibold text-[var(--color-foreground)]">{bankNarration.trim()}</span>
 </div>
 )}
 </div>
 </>
 ) : (
 <>
 {/* Token hero */}
 <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 text-center">
 <div className="relative mx-auto mb-3 w-fit">
 {tokenIcon
 ? <Image src={tokenIcon} alt={selected.symbol} width={48} height={48} className="rounded-full" />
 : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-[14px] font-bold text-[var(--color-text-muted)]">{selected.symbol.slice(0,3)}</div>
 }
 {chainIcon && (
 <Image src={chainIcon} alt={selected.chain} width={18} height={18}
 className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-[var(--color-background)]" />
 )}
 </div>
 <p className="text-[28px] font-bold tracking-[-0.04em] text-[var(--color-foreground)]">{numericAmount} {selected.symbol}</p>
 <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">on {selected.chain}</p>
 </div>

 {/* Details */}
 <div className="divide-y divide-[var(--color-background)] rounded-2xl border border-[var(--color-border)] px-5">
 <div className="flex items-start justify-between py-3.5 text-[13px]">
 <span className="text-[var(--color-text-tertiary)]">To</span>
 <span className="ml-4 max-w-[240px] break-all text-right font-mono text-[12px] font-semibold text-[var(--color-foreground)]">{cryptoDestination}</span>
 </div>
 <div className="flex items-center justify-between py-3.5 text-[13px]">
 <span className="text-[var(--color-text-tertiary)]">Network</span>
 <div className="flex items-center gap-1.5">
 {isUnified ? (
 <>
 <Image src="/icons/tokens/usdc.png" alt="Aggregated" width={14} height={14} className="rounded-full" />
 <span className="font-semibold text-[var(--color-foreground)]">Aggregated → {destOptions.find((o) => o.key === destChain)?.label ?? destChain}</span>
 </>
 ) : (
 <>
 {chainIcon && <Image src={chainIcon} alt={selected.chain} width={14} height={14} className="rounded-full" />}
 <span className="font-semibold text-[var(--color-foreground)]">{selected.chain}</span>
 </>
 )}
 </div>
 </div>
 <div className="flex items-center justify-between py-3.5 text-[13px]">
 <span className="text-[var(--color-text-tertiary)]">Balance after</span>
 <span className="font-semibold text-[var(--color-foreground)]">{fmt(maxBalance - numericAmount, selected.symbol)}</span>
 </div>
 </div>
 </>
 )}

  <Alert status="warning">
    <Alert.Indicator />
    <Alert.Content>
      <Alert.Description>
        {isNgnSource
        ? 'Double-check the bank details — NGN bank transfers cannot be reversed once sent.'
        : isUnified
        ? 'Your Privy wallet will ask you to sign a burn intent. USDC will be minted on the destination chain. Crypto transfers cannot be reversed.'
        : 'Your Privy wallet will ask you to confirm this transaction. Double-check the recipient address — crypto transfers cannot be reversed.'}
      </Alert.Description>
    </Alert.Content>
  </Alert>

 <div className="flex gap-3">
 <button
 type="button"
 onClick={() => setStep('form')}
 className="flex-1 rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-5 py-3 text-[14px] font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background)]"
 >
 Back
 </button>
 <button
 type="button"
 onClick={handleSend}
 className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-3 text-[14px] font-semibold text-white shadow-xs transition hover:bg-[var(--color-primary-dark)]"
 >
 <PaperPlaneRight className="h-4 w-4" weight="bold" />
 {isNgnSource ? 'Send money' : 'Sign & send'}
 </button>
 </div>
 </>
 )}

 {/* ── Signing step ── */}
 {step === 'signing' && (
 <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
 <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
  <Loader size={32} />
 </div>
 <div>
 <p className="text-[16px] font-bold text-[var(--color-foreground)]">{isNgnSource ? 'Sending money' : 'Waiting for your signature'}</p>
 <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-text-tertiary)]">
 {isNgnSource
 ? 'Sending your NGN transfer via Flutterwave…'
 : 'A signing prompt has appeared in your Privy wallet. Please confirm the transaction to continue.'}
 </p>
 </div>
 </div>
 )}

 {/* ── Done step ── */}
 {step === 'done' && (
 <div className="flex flex-col items-center gap-5 py-12 text-center">
 <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success-soft)]">
 <Check className="h-8 w-8 text-[var(--color-text-tertiary)]" weight="bold" />
 </div>
 <div>
 <p className="text-[16px] font-bold text-[var(--color-foreground)]">Transaction submitted!</p>
 <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-text-tertiary)]">
 {isNgnSource
 ? `₦${numericAmount.toLocaleString()} sent to ${reviewBankAccount} (${bankRef ?? 'processing'})`
 : `${numericAmount} ${selected.symbol} sent to ${cryptoDestination.slice(0, 8)}…${cryptoDestination.slice(-6)}`}
 </p>
 </div>
 {explorerUrl && !isNgnSource && (
 <a href={explorerUrl} target="_blank" rel="noreferrer"
 className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2.5 text-[13px] font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-background)]">
 View on explorer
 </a>
 )}
 <button type="button" onClick={onClose}
 className="w-full rounded-full bg-[var(--color-primary)] px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-[var(--color-primary-dark)]">
 Done
 </button>
 </div>
 )}

 {/* ── Error step ── */}
 {step === 'error' && (
 <div className="flex flex-col items-center gap-5 py-12 text-center">
 <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-danger-soft)]">
 <Warning className="h-8 w-8 text-[var(--color-text-tertiary)]" weight="bold" />
 </div>
 <div>
 <p className="text-[16px] font-bold text-[var(--color-foreground)]">Transaction failed</p>
 <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-text-tertiary)]">{error}</p>
 </div>
 <div className="flex w-full gap-3">
 <button type="button" onClick={() => setStep('review')}
 className="flex-1 rounded-full border border-[var(--color-primary)] px-5 py-3 text-[14px] font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/10">
 Try again
 </button>
 <button type="button" onClick={onClose}
 className="flex-1 rounded-full bg-[var(--color-primary)] px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-[var(--color-primary-dark)]">
 Close
 </button>
 </div>
 </div>
 )}
 </div>
 </div>
 </ClientPortal>
 );
}
