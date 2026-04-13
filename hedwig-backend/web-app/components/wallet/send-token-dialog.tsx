'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, PaperPlaneRight, SpinnerGap, Warning, X } from '@/components/ui/lucide-icons';
import { ClientPortal } from '@/components/ui/client-portal';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import { encodeFunctionData, parseUnits, isAddress } from 'viem';
import { PublicKey, Transaction } from '@solana/web3.js';
import { createTransferCheckedInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  getChainId,
  getNetworkModeFromEvmChainId,
  resolveEvmChainForPayment,
  EVM_TOKENS
} from '@/lib/payments/public-constants';
import type { WalletAsset } from '@/lib/models/entities';

// Base network definitions
const BASE_MAINNET = {
  chainId: 8453,
  chainIdHex: '0x2105',
  chainName: 'Base',
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org'],
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 }
};
const BASE_SEPOLIA = {
  chainId: 84532,
  chainIdHex: '0x14a34',
  chainName: 'Base Sepolia',
  rpcUrls: ['https://sepolia.base.org'],
  blockExplorerUrls: ['https://sepolia.basescan.org'],
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 }
};

// Solana USDC mint addresses
const USDC_SOL_MAINNET = new PublicKey('EPjFWdd5Au7B7WqSqqxS7ZkFvCPScoqB9Ko6z8bn8js');
const USDC_SOL_DEVNET  = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

type SendStep = 'form' | 'review' | 'signing' | 'done' | 'error';

// Chain meta derived from asset.chain value
const CHAIN_META: Record<string, { icon: string; label: string }> = {
  Base:     { icon: '/icons/networks/base.png',     label: 'Base' },
  Solana:   { icon: '/icons/networks/solana.png',   label: 'Solana' },
  Arbitrum: { icon: '/icons/networks/arbitrum.png', label: 'Arbitrum' },
  Polygon:  { icon: '/icons/networks/polygon.png',  label: 'Polygon' },
  Celo:     { icon: '/icons/networks/celo.png',     label: 'Celo' },
};

const TOKEN_META: Record<string, { icon: string }> = {
  USDC: { icon: '/icons/tokens/usdc.png' },
};

function fmt(n: number, sym: string) {
  const dec = sym === 'USDC' ? 2 : n >= 1 ? 6 : 8;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: dec })} ${sym}`;
}

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

export function SendTokenDialog({
  assets,
  onClose
}: {
  assets: WalletAsset[];
  onClose: () => void;
}) {
  const { ready } = usePrivy();
  const { wallets: evmWallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();

  // Derive unique chains + tokens from assets
  const chains = Array.from(new Map(assets.map((a) => [a.chain, a])).keys());
  const [selectedChain, setSelectedChain] = useState<string>(assets[0]?.chain ?? '');
  const tokensForChain = assets.filter((a) => a.chain === selectedChain);
  const [selectedAssetId, setSelectedAssetId] = useState<string>(assets[0]?.id ?? '');
  const selected = assets.find((a) => a.id === selectedAssetId) ?? tokensForChain[0] ?? assets[0];

  const [chainOpen,  setChainOpen]  = useState(false);
  const [tokenOpen,  setTokenOpen]  = useState(false);
  const chainRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (chainRef.current && !chainRef.current.contains(e.target as Node)) setChainOpen(false);
      if (tokenRef.current && !tokenRef.current.contains(e.target as Node)) setTokenOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const handleChainSelect = (chain: string) => {
    setSelectedChain(chain);
    setChainOpen(false);
    const first = assets.find((a) => a.chain === chain);
    if (first) setSelectedAssetId(first.id);
  };

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount]       = useState('');
  const [step, setStep]           = useState<SendStep>('form');
  const [txHash, setTxHash]       = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const isEvm    = selected.chain === 'Base' || !['Solana'].includes(selected.chain);
  const isSolana = selected.chain === 'Solana';

  const evmWallet    = evmWallets.find((w) => w.walletClientType === 'privy') ?? evmWallets[0];
  const solanaWallet = solanaWallets[0];

  const numericAmount = parseFloat(amount) || 0;
  const maxBalance    = selected.balance;
  const hasBalance    = numericAmount > 0 && numericAmount <= maxBalance;

  const recipientValid = isEvm
    ? isAddress(recipient)
    : isSolana && recipient.length >= 32;

  const canProceed = hasBalance && recipientValid;

  // ── Send EVM tx ────────────────────────────────────────────────────────────
  async function sendEvm() {
    if (!evmWallet) throw new Error('No EVM wallet connected.');
    const provider = await evmWallet.getEthereumProvider() as Eip1193;

    // 1. Detect current chain and determine correct Base network
    const rawChainId = await provider.request({ method: 'eth_chainId' });
    const currentChainId = typeof rawChainId === 'string'
      ? parseInt(rawChainId, 16)
      : Number(rawChainId);

    const mode        = getNetworkModeFromEvmChainId(currentChainId);
    const evmChain    = resolveEvmChainForPayment(mode);
    const targetChainId = getChainId(evmChain);
    const targetNet   = evmChain === 'baseSepolia' ? BASE_SEPOLIA : BASE_MAINNET;

    // 2. Switch wallet to the correct Base network if needed
    if (currentChainId !== targetChainId) {
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: targetNet.chainIdHex }]
        });
      } catch (switchErr: unknown) {
        // Chain not added yet — add it then switch
        const code = typeof switchErr === 'object' && switchErr !== null && 'code' in switchErr
          ? (switchErr as { code: unknown }).code : undefined;
        if (code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: targetNet.chainIdHex,
              chainName: targetNet.chainName,
              nativeCurrency: targetNet.nativeCurrency,
              rpcUrls: targetNet.rpcUrls,
              blockExplorerUrls: targetNet.blockExplorerUrls
            }]
          });
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: targetNet.chainIdHex }]
          });
        } else {
          throw switchErr;
        }
      }
    }

    // 3. Build and send the transaction on the correct chain
    // ERC-20 USDC — use the right contract for mainnet vs testnet
    const usdcAddress = EVM_TOKENS[evmChain].USDC;
    const data = encodeFunctionData({
      abi: [{
        type: 'function', name: 'transfer', stateMutability: 'nonpayable',
        inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
        outputs: [{ name: '', type: 'bool' }]
      }],
      functionName: 'transfer',
      args: [recipient as `0x${string}`, parseUnits(amount, 6)]
    });

    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: evmWallet.address, to: usdcAddress, data, chainId: targetNet.chainIdHex }]
    });
    return String(hash);
  }

  // ── Send Solana tx ─────────────────────────────────────────────────────────
  async function sendSolana() {
    if (!solanaWallet) throw new Error('No Solana wallet connected.');

    const { Connection, clusterApiUrl } = await import('@solana/web3.js');

    // Use mainnet-beta unless NEXT_PUBLIC_SOLANA_CLUSTER is explicitly 'devnet'
    const isDevnet = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet';
    const cluster  = isDevnet ? 'devnet' : 'mainnet-beta';
    const usdcMint = isDevnet ? USDC_SOL_DEVNET : USDC_SOL_MAINNET;
    const connection = new Connection(clusterApiUrl(cluster));

    const senderPk    = new PublicKey(solanaWallet.address);
    const recipientPk = new PublicKey(recipient);
    const tx = new Transaction();

    // SPL USDC transfer — transfer from sender ATA to recipient ATA
    const senderAta    = await getAssociatedTokenAddress(usdcMint, senderPk);
    const recipientAta = await getAssociatedTokenAddress(usdcMint, recipientPk);
    const microUnits   = Math.round(numericAmount * 1e6);
    tx.add(createTransferCheckedInstruction(
      senderAta, usdcMint, recipientAta, senderPk,
      microUnits, 6, [], TOKEN_PROGRAM_ID
    ));

    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = senderPk;

    // Privy Solana wallet expects a serialized Uint8Array; it shows its own approval UI
    const serialized = tx.serialize({ requireAllSignatures: false });
    const { signedTransaction } = await solanaWallet.signTransaction({ transaction: serialized });
    const hash = await connection.sendRawTransaction(signedTransaction);
    return hash;
  }

  // ── Main send handler ──────────────────────────────────────────────────────
  async function handleSend() {
    setStep('signing');
    setError(null);
    try {
      const hash = isEvm ? await sendEvm() : await sendSolana();
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
    ? (isEvm
        ? (process.env.NEXT_PUBLIC_SOLANA_CLUSTER !== 'devnet'
            ? `https://basescan.org/tx/${txHash}`
            : `https://sepolia.basescan.org/tx/${txHash}`)
        : `https://solscan.io/tx/${txHash}`)
    : null;

  const tokenIcon = TOKEN_META[selected.symbol]?.icon ?? null;
  const chainIcon = CHAIN_META[selected.chain]?.icon ?? null;

  return (
    <ClientPortal>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in-0 duration-200" onClick={step === 'signing' ? undefined : onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full max-w-[440px] flex-col bg-white shadow-2xl animate-in slide-in-from-right-full duration-300 ease-out">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e9eaeb] px-5 py-4">
          <div>
            <p className="text-[15px] font-bold text-[#181d27]">Send crypto</p>
            <p className="mt-0.5 text-[12px] text-[#a4a7ae]">
              {step === 'form'    ? 'Choose a token and enter the recipient'  :
               step === 'review'  ? 'Review your transaction before signing'  :
               step === 'signing' ? 'Waiting for wallet confirmation…'        :
               step === 'done'    ? 'Transaction submitted'                   :
               'Transaction failed'}
            </p>
          </div>
          {step !== 'signing' && (
            <button type="button" onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e9eaeb] text-[#717680] transition hover:bg-[#f5f5f5]">
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
                  onClick={() => { setChainOpen((o) => !o); setTokenOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-[#e9eaeb] bg-white px-4 py-3 shadow-xs transition hover:bg-[#fafafa]"
                >
                  {CHAIN_META[selectedChain]
                    ? <Image src={CHAIN_META[selectedChain].icon} alt={selectedChain} width={20} height={20} className="rounded-full" />
                    : <div className="h-5 w-5 rounded-full bg-[#f2f4f7]" />}
                  <span className="flex-1 text-left text-[13px] font-semibold text-[#181d27]">
                    {CHAIN_META[selectedChain]?.label ?? selectedChain}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae]">Network</span>
                  <svg className={`h-4 w-4 text-[#a4a7ae] transition-transform ${chainOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {chainOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white shadow-lg">
                    {chains.map((chain) => (
                      <button key={chain} type="button" onClick={() => handleChainSelect(chain)}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-[13px] font-medium transition ${
                          chain === selectedChain ? 'bg-[#f8f9fc] text-[#181d27]' : 'text-[#414651] hover:bg-[#fafafa]'
                        }`}>
                        {CHAIN_META[chain]
                          ? <Image src={CHAIN_META[chain].icon} alt={chain} width={20} height={20} className="rounded-full" />
                          : <div className="h-5 w-5 rounded-full bg-[#f2f4f7]" />}
                        <span className="flex-1 text-left">{CHAIN_META[chain]?.label ?? chain}</span>
                        {chain === selectedChain && (
                          <svg className="h-4 w-4 text-[#181d27]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Token dropdown */}
              <div ref={tokenRef} className="relative">
                <button
                  type="button"
                  onClick={() => { setTokenOpen((o) => !o); setChainOpen(false); }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-[#e9eaeb] bg-white px-4 py-3 shadow-xs transition hover:bg-[#fafafa]"
                >
                  {TOKEN_META[selected?.symbol]
                    ? <Image src={TOKEN_META[selected.symbol].icon} alt={selected.symbol} width={20} height={20} className="rounded-full" />
                    : <div className="h-5 w-5 rounded-full bg-[#f2f4f7]" />}
                  <span className="flex-1 text-left text-[13px] font-semibold text-[#181d27]">
                    {selected?.symbol}
                  </span>
                  <span className="text-[11px] font-semibold text-[#a4a7ae]">
                    {fmt(selected?.balance ?? 0, selected?.symbol ?? '')}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-[#a4a7ae] ml-2">Token</span>
                  <svg className={`h-4 w-4 text-[#a4a7ae] transition-transform ${tokenOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {tokenOpen && (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white shadow-lg">
                    {tokensForChain.map((a) => (
                      <button key={a.id} type="button" onClick={() => { setSelectedAssetId(a.id); setTokenOpen(false); }}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-[13px] font-medium transition ${
                          a.id === selected?.id ? 'bg-[#f8f9fc] text-[#181d27]' : 'text-[#414651] hover:bg-[#fafafa]'
                        }`}>
                        {TOKEN_META[a.symbol]
                          ? <Image src={TOKEN_META[a.symbol].icon} alt={a.symbol} width={20} height={20} className="rounded-full" />
                          : <div className="h-5 w-5 rounded-full bg-[#f2f4f7]" />}
                        <span className="flex-1 text-left">{a.symbol}</span>
                        <span className="text-[12px] text-[#a4a7ae]">{fmt(a.balance, a.symbol)}</span>
                        {a.id === selected?.id && (
                          <svg className="h-4 w-4 text-[#181d27]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Recipient */}
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-[#414651]">Recipient address</label>
                <input
                  type="text"
                  placeholder={isSolana ? 'Solana wallet address' : '0x…'}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value.trim())}
                  className="w-full rounded-full border border-[#d5d7da] bg-white px-4 py-2.5 font-mono text-[13px] text-[#181d27] placeholder-[#a4a7ae] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                />
                {recipient.length > 5 && !recipientValid && (
                  <p className="mt-1 text-[11px] text-[#a4a7ae]">
                    {isSolana ? 'Invalid Solana address' : 'Invalid EVM address'}
                  </p>
                )}
              </div>

              {/* Amount */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[13px] font-semibold text-[#414651]">Amount</label>
                  <button type="button" onClick={() => setAmount(String(maxBalance))}
                    className="text-[11px] text-[#2563eb] hover:underline">
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
                    className="w-full rounded-full border border-[#d5d7da] bg-white py-2.5 pl-4 pr-16 text-[15px] font-semibold text-[#181d27] placeholder-[#d0d5dd] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[#717680]">
                    {selected?.symbol}
                  </span>
                </div>
                {numericAmount > maxBalance && numericAmount > 0 && (
                  <p className="mt-1 text-[11px] text-[#a4a7ae]">Exceeds your balance</p>
                )}
              </div>

              <button
                type="button"
                disabled={!canProceed || !ready}
                onClick={() => setStep('review')}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#2563eb] px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Review <ArrowRight className="h-4 w-4" weight="bold" />
              </button>
            </>
          )}

          {/* ── Review step ── */}
          {step === 'review' && (
            <>
              {/* Token hero */}
              <div className="rounded-2xl border border-[#e9eaeb] bg-[#fafafa] p-5 text-center">
                <div className="relative mx-auto mb-3 w-fit">
                  {tokenIcon
                    ? <Image src={tokenIcon} alt={selected.symbol} width={48} height={48} className="rounded-full" />
                    : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f2f4f7] text-[14px] font-bold text-[#667085]">{selected.symbol.slice(0,3)}</div>
                  }
                  {chainIcon && (
                    <Image src={chainIcon} alt={selected.chain} width={18} height={18}
                      className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-[#fafafa]" />
                  )}
                </div>
                <p className="text-[28px] font-bold tracking-[-0.04em] text-[#181d27]">{numericAmount} {selected.symbol}</p>
                <p className="mt-1 text-[13px] text-[#717680]">on {selected.chain}</p>
              </div>

              {/* Details */}
              <div className="divide-y divide-[#f9fafb] rounded-2xl border border-[#e9eaeb] px-5">
                <div className="flex items-start justify-between py-3.5 text-[13px]">
                  <span className="text-[#717680]">To</span>
                  <span className="ml-4 max-w-[240px] break-all text-right font-mono text-[12px] font-semibold text-[#181d27]">{recipient}</span>
                </div>
                <div className="flex items-center justify-between py-3.5 text-[13px]">
                  <span className="text-[#717680]">Network</span>
                  <div className="flex items-center gap-1.5">
                    {chainIcon && <Image src={chainIcon} alt={selected.chain} width={14} height={14} className="rounded-full" />}
                    <span className="font-semibold text-[#181d27]">{selected.chain}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-3.5 text-[13px]">
                  <span className="text-[#717680]">Balance after</span>
                  <span className="font-semibold text-[#181d27]">{fmt(maxBalance - numericAmount, selected.symbol)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-[#fef0c7] bg-[#fffaeb] px-4 py-3.5">
                <p className="text-[12px] leading-[1.6] text-[#717680]">
                  Your Privy wallet will ask you to confirm this transaction. Double-check the recipient address — crypto transfers cannot be reversed.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="flex-1 rounded-full border border-[#d5d7da] bg-white px-5 py-3 text-[14px] font-semibold text-[#414651] transition hover:bg-[#fafafa]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#2563eb] px-5 py-3 text-[14px] font-semibold text-white shadow-xs transition hover:bg-[#1d4ed8]"
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
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#eff4ff]">
                <SpinnerGap className="h-8 w-8 animate-spin text-[#717680]" weight="bold" />
              </div>
              <div>
                <p className="text-[16px] font-bold text-[#181d27]">Waiting for your signature</p>
                <p className="mt-2 text-[13px] leading-[1.6] text-[#717680]">
                  A signing prompt has appeared in your Privy wallet. Please confirm the transaction to continue.
                </p>
              </div>
            </div>
          )}

          {/* ── Done step ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-5 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ecfdf3]">
                <Check className="h-8 w-8 text-[#717680]" weight="bold" />
              </div>
              <div>
                <p className="text-[16px] font-bold text-[#181d27]">Transaction submitted!</p>
                <p className="mt-2 text-[13px] leading-[1.6] text-[#717680]">
                  {numericAmount} {selected.symbol} sent to {recipient.slice(0, 8)}…{recipient.slice(-6)}
                </p>
              </div>
              {explorerUrl && (
                <a href={explorerUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-[#e9eaeb] px-4 py-2.5 text-[13px] font-semibold text-[#414651] transition hover:bg-[#fafafa]">
                  View on explorer
                </a>
              )}
              <button type="button" onClick={onClose}
                className="w-full rounded-full bg-[#2563eb] px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-[#1d4ed8]">
                Done
              </button>
            </div>
          )}

          {/* ── Error step ── */}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-5 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fff1f0]">
                <Warning className="h-8 w-8 text-[#717680]" weight="bold" />
              </div>
              <div>
                <p className="text-[16px] font-bold text-[#181d27]">Transaction failed</p>
                <p className="mt-2 text-[13px] leading-[1.6] text-[#717680]">{error}</p>
              </div>
              <div className="flex w-full gap-3">
                <button type="button" onClick={() => setStep('review')}
                  className="flex-1 rounded-full border border-[#d5d7da] px-5 py-3 text-[14px] font-semibold text-[#414651] transition hover:bg-[#fafafa]">
                  Try again
                </button>
                <button type="button" onClick={onClose}
                  className="flex-1 rounded-full bg-[#181d27] px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-[#101828]">
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
