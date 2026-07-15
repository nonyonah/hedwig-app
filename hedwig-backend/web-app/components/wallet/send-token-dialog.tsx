'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, PaperPlaneRight, SpinnerGap, Warning, X } from '@/components/ui/lucide-icons';
import { ClientPortal } from '@/components/ui/client-portal';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import { isAddress } from 'viem';
import { sendSolanaUsdc, sendEvmUsdc, sendUsdcViaGateway, getExplorerUrl as getSendExplorerUrl, type SendChain } from '@/lib/send/send-helpers';
import type { WalletAsset, GatewayDomainBalance } from '@/lib/models/entities';

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type SendStep = 'form' | 'review' | 'signing' | 'done' | 'error';

// Chain meta derived from asset.chain value
const CHAIN_META: Record<string, { icon: string; label: string }> = {
  Unified:  { icon: '/icons/tokens/usdc.png',       label: 'Aggregated' },
  Base:     { icon: '/icons/networks/base.png',     label: 'Base' },
  Solana:   { icon: '/icons/networks/solana.png',   label: 'Solana' },
  Arbitrum: { icon: '/icons/networks/arbitrum.png', label: 'Arbitrum' },
  Polygon:  { icon: '/icons/networks/polygon.png',  label: 'Polygon' },
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

export function SendTokenDialog({
  assets,
  gatewayAvailableUsdc = 0,
  gatewayPerDomain = [],
  accessToken = null,
  onClose,
}: {
  assets: WalletAsset[];
  gatewayAvailableUsdc?: number;
  gatewayPerDomain?: GatewayDomainBalance[];
  accessToken?: string | null;
  onClose: () => void;
}) {
  const { ready } = usePrivy();
  const { wallets: evmWallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();

  // Derive unique chains + tokens from assets, prepend Unified when gateway balance exists
  const baseChains = Array.from(new Map(assets.map((a) => [a.chain, a])).keys());
  const chains = gatewayAvailableUsdc > 0 ? ['Unified', ...baseChains] : baseChains;
  const [selectedChain, setSelectedChain] = useState<string>(gatewayAvailableUsdc > 0 ? 'Unified' : assets[0]?.chain ?? '');
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
  const [amount, setAmount]       = useState('');
  const [step, setStep]           = useState<SendStep>('form');
  const [txHash, setTxHash]       = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [destChain, setDestChain] = useState<SendChain>('base');
  const [destOpen, setDestOpen]   = useState(false);
  const destRef = useRef<HTMLDivElement>(null);

  const isUnified = selected.chain === 'Unified';
  const isEvm    = !isUnified && (selected.chain === 'Base' || !['Solana'].includes(selected.chain));
  const isSolana = !isUnified && selected.chain === 'Solana';

  const evmWallet    = evmWallets.find((w) => w.walletClientType === 'privy') ?? evmWallets[0];
  const solanaWallet = solanaWallets[0];

  const numericAmount = parseFloat(amount) || 0;
  const maxBalance    = selected.balance;
  const hasBalance    = numericAmount > 0 && numericAmount <= maxBalance;

  const recipientValid = isUnified
    ? isAddress(recipient) || recipient.length >= 32
    : (isEvm ? isAddress(recipient) : isSolana && recipient.length >= 32);

  const canProceed = hasBalance && recipientValid;

  // ── Send EVM tx ──
  async function sendEvm() {
    const chainKey = CHAIN_TO_KEY[selected.chain] ?? 'base';
    return sendEvmUsdc({
      evmWallet,
      recipient,
      amountUsdc: numericAmount,
      chain: chainKey,
    });
  }

  // ── Send Solana tx ──
  async function sendSolana() {
    return sendSolanaUsdc({
      solanaWallet,
      recipient,
      amountUsdc: numericAmount,
    });
  }

  // ── Send via Gateway (unified balance) ──
  async function sendGateway() {
    return sendUsdcViaGateway({
      evmWallets,
      solanaWallets,
      amountUsdc: numericAmount,
      recipientAddress: recipient,
      destChain,
      perDomainBalances: gatewayPerDomain,
      accessToken,
    });
  }

  // ── Main send handler ──────────────────────────────────────────────────────
  async function handleSend() {
    setStep('signing');
    setError(null);
    try {
      const hash = isUnified ? await sendGateway() : (isEvm ? await sendEvm() : await sendSolana());
      setTxHash(hash);
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

  return (
    <ClientPortal>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={step === 'signing' ? undefined : onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full max-w-[440px] flex-col bg-[var(--color-surface)] shadow-2xl animate-in slide-in-from-right-full duration-300 ease-out">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <p className="text-[15px] font-bold text-[var(--color-foreground)]">Send crypto</p>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">
              {step === 'form'    ? 'Choose a token and enter the recipient'  :
               step === 'review'  ? 'Review your transaction before signing'  :
               step === 'signing' ? 'Waiting for wallet confirmation…'        :
               step === 'done'    ? 'Transaction submitted'                   :
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
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Network</span>
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
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)] ml-2">Token</span>
              </div>

              {/* Recipient */}
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Recipient address</label>
                <input
                  type="text"
                  placeholder={isUnified ? '0x… or Solana address' : isSolana ? 'Solana wallet address' : '0x…'}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value.trim())}
                  className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-4 py-2.5 font-mono text-[13px] text-[var(--color-foreground)] placeholder-[var(--color-text-muted)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
                {recipient.length > 5 && !recipientValid && (
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                    {isUnified ? 'Enter a valid EVM or Solana address' : isSolana ? 'Invalid Solana address' : 'Invalid EVM address'}
                  </p>
                )}
              </div>

              {/* Destination chain (only when sending from unified balance) */}
              {isUnified && (
                <div ref={destRef} className="relative">
                  <label className="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]">Destination chain</label>
                  <button
                    type="button"
                    onClick={() => setDestOpen((o) => !o)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-xs transition hover:bg-[var(--color-background)]"
                  >
                    {(() => {
                      const opt = DEST_CHAIN_OPTIONS.find((o) => o.key === destChain);
                      return opt ? <Image src={opt.icon} alt={opt.label} width={20} height={20} className="rounded-full" /> : null;
                    })()}
                    <span className="flex-1 text-left text-[13px] font-semibold text-[var(--color-foreground)]">
                      {DEST_CHAIN_OPTIONS.find((o) => o.key === destChain)?.label ?? destChain}
                    </span>
                    <svg className={`h-4 w-4 text-[var(--color-text-muted)] transition-transform ${destOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {destOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
                      {DEST_CHAIN_OPTIONS.map((opt) => (
                        <button key={opt.key} type="button" onClick={() => { setDestChain(opt.key); setDestOpen(false); }}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-[13px] font-medium transition ${
                            opt.key === destChain ? 'bg-[var(--color-surface-secondary)] text-[var(--color-foreground)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-background)]'
                          }`}>
                          <Image src={opt.icon} alt={opt.label} width={20} height={20} className="rounded-full" />
                          <span className="flex-1 text-left">{opt.label}</span>
                          {opt.key === destChain && (
                            <svg className="h-4 w-4 text-[var(--color-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Amount */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Amount</label>
                  <button type="button" onClick={() => setAmount(String(maxBalance))}
                    className="text-[11px] text-[var(--color-primary)] hover:underline">
                    Max: {fmt(maxBalance, selected?.symbol ?? '')}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    min={0}
                    max={maxBalance}
                    step="any"
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface)] py-2.5 pl-4 pr-16 text-[15px] font-semibold text-[var(--color-foreground)] placeholder-[var(--color-border-input)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[var(--color-text-tertiary)]">
                    {selected?.symbol}
                  </span>
                </div>
                {numericAmount > maxBalance && numericAmount > 0 && (
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
                  <span className="ml-4 max-w-[240px] break-all text-right font-mono text-[12px] font-semibold text-[var(--color-foreground)]">{recipient}</span>
                </div>
                <div className="flex items-center justify-between py-3.5 text-[13px]">
                  <span className="text-[var(--color-text-tertiary)]">Network</span>
                  <div className="flex items-center gap-1.5">
                    {isUnified ? (
                      <>
                        <Image src="/icons/tokens/usdc.png" alt="Aggregated" width={14} height={14} className="rounded-full" />
                        <span className="font-semibold text-[var(--color-foreground)]">Aggregated → {DEST_CHAIN_OPTIONS.find((o) => o.key === destChain)?.label ?? destChain}</span>
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

              <div className="rounded-2xl border border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] px-4 py-3.5">
                <p className="text-[12px] leading-[1.6] text-[var(--color-text-tertiary)]">
                  {isUnified
                    ? 'Your Privy wallet will ask you to sign a burn intent. USDC will be minted on the destination chain. Crypto transfers cannot be reversed.'
                    : 'Your Privy wallet will ask you to confirm this transaction. Double-check the recipient address — crypto transfers cannot be reversed.'}
                </p>
              </div>

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
                  Sign & send
                </button>
              </div>
            </>
          )}

          {/* ── Signing step ── */}
          {step === 'signing' && (
            <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
                <SpinnerGap className="h-8 w-8 animate-spin text-[var(--color-text-tertiary)]" weight="bold" />
              </div>
              <div>
                <p className="text-[16px] font-bold text-[var(--color-foreground)]">Waiting for your signature</p>
                <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-text-tertiary)]">
                  A signing prompt has appeared in your Privy wallet. Please confirm the transaction to continue.
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
                  {numericAmount} {selected.symbol} sent to {recipient.slice(0, 8)}…{recipient.slice(-6)}
                </p>
              </div>
              {explorerUrl && (
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
