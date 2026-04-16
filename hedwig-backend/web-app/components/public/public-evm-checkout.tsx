'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowSquareOut, CheckCircle } from '@/components/ui/lucide-icons';
import { encodeFunctionData, parseUnits } from 'viem';
import { backendConfig } from '@/lib/auth/config';
import { EVM_TOKENS, getChainId, getExplorerUrl, resolvePaymentChain, type EvmPaymentChain, type PublicSettlementChain } from '@/lib/payments/public-constants';

const EVM_CHAIN_META: Record<string, { icon: string; label: string }> = {
  base:     { icon: '/icons/networks/base.png',     label: 'Base' },
  arbitrum: { icon: '/icons/networks/arbitrum.png', label: 'Arbitrum' },
  polygon:  { icon: '/icons/networks/polygon.png',  label: 'Polygon' },
  celo:     { icon: '/icons/networks/celo.png',     label: 'Celo' },
};

const MINIPAY_ADD_CASH_URL = 'https://link.minipay.xyz/add_cash?tokens=USDC';
const CELO_CHAIN_IDS = new Set([42220, 44787]);

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

type MaybeMiniPayProvider = Eip1193Provider & {
  isMiniPay?: boolean;
  providers?: MaybeMiniPayProvider[];
};

function resolveInjectedProviders(): MaybeMiniPayProvider[] {
  if (typeof window === 'undefined') return [];
  const injected = (window as any).ethereum as MaybeMiniPayProvider | undefined;
  if (!injected) return [];

  if (Array.isArray(injected.providers) && injected.providers.length > 0) {
    return injected.providers;
  }
  return [injected];
}

function resolvePreferredProvider(): MaybeMiniPayProvider | null {
  const providers = resolveInjectedProviders();
  if (providers.length === 0) return null;
  return providers.find((provider) => Boolean(provider?.isMiniPay)) ?? providers[0] ?? null;
}

function getErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err ?? '');
}

function getErrorCode(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'number' ? code : undefined;
  }
  return undefined;
}

function resolveTargetEvmChain(selectedChain: string, _walletChainId: number): EvmPaymentChain {
  return resolvePaymentChain(selectedChain as PublicSettlementChain) as EvmPaymentChain;
}

async function ensureWalletOnTargetChain(provider: Eip1193Provider, targetChainId: number): Promise<void> {
  const targetHex = `0x${targetChainId.toString(16)}`;
  const current = await provider.request({ method: 'eth_chainId' });
  const activeChainId = typeof current === 'string' ? parseInt(current, 16) : Number(current);
  if (activeChainId === targetChainId) return;

  const CHAIN_ADD_PARAMS: Record<number, object> = {
    84532: { chainId: '0x14a34', chainName: 'Base Sepolia', nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://sepolia.base.org'], blockExplorerUrls: ['https://sepolia.basescan.org'] },
    421614: { chainId: '0x66eee', chainName: 'Arbitrum Sepolia', nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'], blockExplorerUrls: ['https://sepolia.arbiscan.io'] },
    80002: { chainId: '0x13882', chainName: 'Polygon Amoy', nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 }, rpcUrls: ['https://rpc-amoy.polygon.technology'], blockExplorerUrls: ['https://amoy.polygonscan.com'] },
    44787: { chainId: '0xaef3', chainName: 'Celo Alfajores', nativeCurrency: { name: 'Celo', symbol: 'CELO', decimals: 18 }, rpcUrls: ['https://alfajores-forno.celo-testnet.org'], blockExplorerUrls: ['https://alfajores.celoscan.io'] },
    42161: { chainId: '0xa4b1', chainName: 'Arbitrum One', nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://arb1.arbitrum.io/rpc'], blockExplorerUrls: ['https://arbiscan.io'] },
    137: { chainId: '0x89', chainName: 'Polygon', nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 }, rpcUrls: ['https://polygon-rpc.com'], blockExplorerUrls: ['https://polygonscan.com'] },
    42220: { chainId: '0xa4ec', chainName: 'Celo', nativeCurrency: { name: 'Celo', symbol: 'CELO', decimals: 18 }, rpcUrls: ['https://forno.celo.org'], blockExplorerUrls: ['https://celoscan.io'] },
  };

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetHex }]
    });
  } catch (error: unknown) {
    const code = getErrorCode(error);
    if (code === 4902 && CHAIN_ADD_PARAMS[targetChainId]) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [CHAIN_ADD_PARAMS[targetChainId]]
      });
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetHex }]
      });
      return;
    }
    throw error;
  }
}

async function waitForReceipt(provider: Eip1193Provider, txHash: string) {
  for (let attempts = 0; attempts < 60; attempts += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const receipt = await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [txHash]
    });

    if (typeof receipt === 'object' && receipt !== null && 'status' in receipt) {
      const status = (receipt as { status?: unknown }).status;
      if (status === '0x1') return;
      if (status === '0x0') throw new Error('Transaction reverted.');
    }
  }

  throw new Error('Transaction confirmation timed out.');
}

export function PublicEvmCheckout({
  documentId,
  amount,
  title,
  token = 'USDC',
  merchantAddress,
  selectedChain = 'base'
}: {
  documentId: string;
  amount: number;
  title: string;
  token?: 'USDC';
  merchantAddress?: string | null;
  selectedChain?: string;
}) {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [resolvedEvmChain, setResolvedEvmChain] = useState<EvmPaymentChain | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [provider, setProvider] = useState<MaybeMiniPayProvider | null>(null);
  const [isMiniPay, setIsMiniPay] = useState(false);
  const miniPayConnectAttemptedRef = useRef(false);

  const hasEthereum = Boolean(provider);
  const supportsDirectCheckout = Boolean(merchantAddress);

  const chainMeta = EVM_CHAIN_META[selectedChain ?? 'base'] ?? EVM_CHAIN_META['base'];
  const chainIcon = chainMeta.icon;
  // Use the resolved chain label after payment, or derive from prop before
  const chainLabel = resolvedEvmChain
    ? (resolvedEvmChain === 'baseSepolia' ? 'Base Sepolia' : (EVM_CHAIN_META[resolvedEvmChain]?.label ?? chainMeta.label))
    : chainMeta.label;

  const tokenIcon = '/icons/tokens/usdc.png';

  const buttonLabel = useMemo(() => {
    if (!supportsDirectCheckout) return 'Merchant wallet unavailable';
    if (!walletAddress) return isMiniPay ? 'Connecting to MiniPay…' : 'Connect wallet';
    return isPaying ? 'Processing…' : `Pay ${amount} ${token}`;
  }, [amount, isMiniPay, isPaying, supportsDirectCheckout, token, walletAddress]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mounted = true;
    let intervalId: number | null = null;

    const syncProvider = () => {
      if (!mounted) return;
      const nextProvider = resolvePreferredProvider();
      setProvider((prev) => (prev === nextProvider ? prev : nextProvider));
      setIsMiniPay(Boolean(nextProvider?.isMiniPay));
      if (nextProvider?.isMiniPay && intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    syncProvider();
    intervalId = window.setInterval(syncProvider, 700);
    const handleFocus = () => syncProvider();
    const handleEthereumInitialized = () => syncProvider();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('ethereum#initialized', handleEthereumInitialized as EventListener);

    return () => {
      mounted = false;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('ethereum#initialized', handleEthereumInitialized as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!provider?.on) return;
    const onAccountsChanged = (accounts: unknown) => {
      const firstAddress = Array.isArray(accounts) ? String(accounts[0] || '') : '';
      setWalletAddress(firstAddress || null);
    };
    provider.on('accountsChanged', onAccountsChanged);
    return () => {
      provider.removeListener?.('accountsChanged', onAccountsChanged);
    };
  }, [provider]);

  const connectWallet = async ({
    enforceCeloForMiniPay = true,
    suppressErrors = false
  }: {
    enforceCeloForMiniPay?: boolean;
    suppressErrors?: boolean;
  } = {}) => {
    setError(null);
    if (!provider) {
      if (!suppressErrors) {
        setError(
          selectedChain === 'celo'
            ? 'No injected wallet found. Open this page in MiniPay or install an EVM wallet.'
            : 'No injected EVM wallet found. Install MetaMask, Coinbase Wallet, or another compatible wallet.'
        );
      }
      return null;
    }

    try {
      const currentProvider = provider as Eip1193Provider;
      const accounts = await currentProvider.request({ method: 'eth_requestAccounts' });
      const chainIdValue = await currentProvider.request({ method: 'eth_chainId' });
      const account = Array.isArray(accounts) ? String(accounts[0] || '') : '';
      const chainId = typeof chainIdValue === 'string' ? parseInt(chainIdValue, 16) : Number(chainIdValue);

      if (isMiniPay && enforceCeloForMiniPay && selectedChain !== 'celo') {
        if (!suppressErrors) {
          setError('MiniPay checkout is available on Celo only. Select Celo to continue.');
        }
        return null;
      }

      if (!account) {
        if (!suppressErrors) {
          setError('Wallet connection failed. Please unlock your wallet and try again.');
        }
        return null;
      }

      setWalletAddress(account);
      return { provider: currentProvider, account, chainId };
    } catch (err: unknown) {
      if (!suppressErrors) {
        const code = getErrorCode(err);
        const name = typeof err === 'object' && err !== null && 'name' in err ? String((err as { name?: unknown }).name || '') : '';
        if (code === 4001 || code === -32604 || name === 'UserRejectedRequestError') {
          setError('Connection was cancelled. Please try again.');
        } else if (isMiniPay) {
          setError('MiniPay connection failed. Unlock MiniPay and try again.');
        } else {
          setError(getErrorMessage(err) || 'Wallet connection failed.');
        }
      }
      return null;
    }
  };

  useEffect(() => {
    if (!isMiniPay || !hasEthereum || walletAddress || miniPayConnectAttemptedRef.current) return;
    miniPayConnectAttemptedRef.current = true;
    void connectWallet({ enforceCeloForMiniPay: false, suppressErrors: true });
  }, [hasEthereum, isMiniPay, walletAddress]);

  const openMiniPayAddCash = () => {
    if (typeof window === 'undefined') return;
    window.location.assign(MINIPAY_ADD_CASH_URL);
  };

  const openInMiniPay = () => {
    if (typeof window === 'undefined') return;
    const url = `https://link.minipay.xyz/browse?url=${encodeURIComponent(window.location.href)}`;
    window.location.assign(url);
  };

  const handlePay = async () => {
    if (!supportsDirectCheckout || !merchantAddress) return;
    setError(null);

    try {
      setIsPaying(true);
      const connection = await connectWallet();
      if (!connection?.provider || !connection.account) {
        return;
      }

      const evmChain = resolveTargetEvmChain(selectedChain ?? 'base', connection.chainId);
      const targetChainId = getChainId(evmChain);

      if (isMiniPay && !CELO_CHAIN_IDS.has(targetChainId)) {
        throw new Error('MiniPay currently supports Celo payments in this checkout. Please select Celo.');
      }

      await ensureWalletOnTargetChain(connection.provider, targetChainId);
      setResolvedEvmChain(evmChain);

      let hash = '';

      const tokenAddress = EVM_TOKENS[evmChain].USDC;
      const transferData = encodeFunctionData({
        abi: [
          {
            type: 'function',
            name: 'transfer',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            outputs: [{ name: '', type: 'bool' }]
          }
        ],
        functionName: 'transfer',
        args: [merchantAddress as `0x${string}`, parseUnits(amount.toString(), 6)]
      });

      const response = await connection.provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: connection.account,
          to: tokenAddress,
          data: transferData
        }]
      });
      hash = String(response);

      setTxHash(hash);
      await waitForReceipt(connection.provider, hash);

      const backendResponse = await fetch(`${backendConfig.apiBaseUrl}/api/documents/${documentId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: hash,
          payer: connection.account,
          chain: evmChain,
          token,
          amount
        })
      });

      const payload = await backendResponse.json().catch(() => null);
      if (!backendResponse.ok || !payload?.success) {
        const message = typeof payload?.error === 'string' ? payload.error : payload?.error?.message;
        throw new Error(message || 'Your transaction was confirmed, but Hedwig could not update the payment status yet.');
      }

      router.push(`/success?txHash=${encodeURIComponent(hash)}&amount=${encodeURIComponent(String(amount))}&symbol=${encodeURIComponent(token)}`);
      router.refresh();
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message || 'Payment failed.');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#e9eaeb] bg-white p-6 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[#f8f9fc]">
          <Image src={chainIcon} alt={chainLabel} width={28} height={28} className="rounded-full" />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-white shadow-xs">
            <Image src={tokenIcon} alt={token} width={14} height={14} className="rounded-full" />
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-[#717680]">Crypto checkout</p>
          <p className="text-sm font-semibold text-[#181d27]">{token} on {chainLabel}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-[#717680]">
        Pay <span className="font-semibold text-[#181d27]">{title}</span> directly from an injected EVM wallet on {chainLabel}.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#e9eaeb] bg-[#fcfcfd] px-3 py-1.5 text-xs font-medium text-[#414651]">
          <Image src={chainIcon} alt={chainLabel} width={16} height={16} className="rounded-full" />
          {chainLabel}
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#e9eaeb] bg-[#fcfcfd] px-3 py-1.5 text-xs font-medium text-[#414651]">
          <Image src={tokenIcon} alt={token} width={16} height={16} className="rounded-full" />
          {token}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] p-4 text-sm text-[#414651]">
        <div className="flex items-center justify-between">
          <span>Amount</span>
          <span className="font-semibold text-[#181d27]">{amount} {token}</span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span>Merchant wallet</span>
          <span className="font-mono text-[12px] text-[#181d27]">
            {merchantAddress ? `${merchantAddress.slice(0, 6)}...${merchantAddress.slice(-4)}` : 'Unavailable'}
          </span>
        </div>
        {walletAddress ? (
          <div className="mt-3 flex items-center justify-between">
            <span>Your wallet</span>
            <span className="font-mono text-[12px] text-[#181d27]">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </span>
          </div>
        ) : null}
      </div>

      {txHash && resolvedEvmChain ? (
        <a
          href={getExplorerUrl(resolvedEvmChain, txHash)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary"
        >
          View transaction
          <ArrowSquareOut className="h-4 w-4" weight="bold" />
        </a>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-full border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm text-[#717680]">
          {error}
        </div>
      ) : null}

      {selectedChain === 'celo' ? (
        <div className="mt-4 rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] p-4">
          <p className="text-sm font-semibold text-[#181d27]">MiniPay on Celo</p>
          <p className="mt-1 text-xs text-[#717680]">
            {isMiniPay
              ? 'MiniPay detected. You can continue checkout directly.'
              : 'For mobile Celo checkout, you can use MiniPay by Opera.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!isMiniPay ? (
              <button
                type="button"
                onClick={openInMiniPay}
                className="inline-flex items-center justify-center rounded-full border border-[#d5d7da] bg-white px-3 py-1.5 text-xs font-semibold text-[#181d27] transition hover:bg-[#f8f9fc]"
              >
                Open in MiniPay
              </button>
            ) : null}
            <button
              type="button"
              onClick={openMiniPayAddCash}
              className="inline-flex items-center justify-center rounded-full border border-[#d5d7da] bg-white px-3 py-1.5 text-xs font-semibold text-[#181d27] transition hover:bg-[#f8f9fc]"
            >
              Add Cash In MiniPay
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={handlePay}
        disabled={isPaying || !supportsDirectCheckout}
        className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-[#2563eb] px-5 py-2.5 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {buttonLabel}
      </button>

      <div className="mt-3 flex items-center gap-2 text-xs text-[#717680]">
        <CheckCircle className="h-4 w-4 text-[#717680]" weight="fill" />
        This checkout now runs directly inside Hedwig.
      </div>
    </div>
  );
}
