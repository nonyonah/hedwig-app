'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowSquareOut, CheckCircle } from '@/components/ui/lucide-icons';
import { encodeFunctionData, parseUnits } from 'viem';
import { backendConfig } from '@/lib/auth/config';
import { EVM_TOKENS, getChainId, getExplorerUrl, getNetworkModeFromEvmChainId, resolveEvmChainForPayment, resolvePaymentChain, type EvmPaymentChain, type PublicSettlementChain } from '@/lib/payments/public-constants';

const EVM_CHAIN_META: Record<string, { icon: string; label: string }> = {
  base:     { icon: '/icons/networks/base.png',     label: 'Base' },
  arbitrum: { icon: '/icons/networks/arbitrum.png', label: 'Arbitrum' },
  polygon:  { icon: '/icons/networks/polygon.png',  label: 'Polygon' },
  celo:     { icon: '/icons/networks/celo.png',     label: 'Celo' },
  lisk:     { icon: '/icons/networks/lisk.png',     label: 'Lisk' },
};

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

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
    4202: { chainId: '0x106a', chainName: 'Lisk Sepolia', nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.sepolia-api.lisk.com'], blockExplorerUrls: ['https://sepolia-blockscout.lisk.com'] },
    42161: { chainId: '0xa4b1', chainName: 'Arbitrum One', nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://arb1.arbitrum.io/rpc'], blockExplorerUrls: ['https://arbiscan.io'] },
    137: { chainId: '0x89', chainName: 'Polygon', nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 }, rpcUrls: ['https://polygon-rpc.com'], blockExplorerUrls: ['https://polygonscan.com'] },
    42220: { chainId: '0xa4ec', chainName: 'Celo', nativeCurrency: { name: 'Celo', symbol: 'CELO', decimals: 18 }, rpcUrls: ['https://forno.celo.org'], blockExplorerUrls: ['https://celoscan.io'] },
    1135: { chainId: '0x46f', chainName: 'Lisk', nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.api.lisk.com'], blockExplorerUrls: ['https://blockscout.lisk.com'] },
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
  token?: 'USDC' | 'USDT' | 'ETH';
  merchantAddress?: string | null;
  selectedChain?: string;
}) {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [resolvedEvmChain, setResolvedEvmChain] = useState<EvmPaymentChain | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const hasEthereum = typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';
  const supportsDirectCheckout = Boolean(merchantAddress);

  const chainMeta = EVM_CHAIN_META[selectedChain ?? 'base'] ?? EVM_CHAIN_META['base'];
  const chainIcon = chainMeta.icon;
  // Use the resolved chain label after payment, or derive from prop before
  const chainLabel = resolvedEvmChain
    ? (resolvedEvmChain === 'baseSepolia' ? 'Base Sepolia' : (EVM_CHAIN_META[resolvedEvmChain]?.label ?? chainMeta.label))
    : chainMeta.label;

  const tokenIcon = token === 'ETH' ? '/icons/tokens/eth.png' : token === 'USDT' ? '/icons/tokens/usdt.png' : '/icons/tokens/usdc.png';

  const buttonLabel = useMemo(() => {
    if (!supportsDirectCheckout) return 'Merchant wallet unavailable';
    if (!walletAddress) return 'Connect wallet';
    return isPaying ? 'Processing…' : `Pay ${amount} ${token}`;
  }, [amount, isPaying, supportsDirectCheckout, token, walletAddress]);

  const connectWallet = async () => {
    setError(null);
    if (!hasEthereum) {
      setError('No injected EVM wallet found. Install MetaMask, Coinbase Wallet, or another compatible wallet.');
      return null;
    }

    const provider = (window as any).ethereum as Eip1193Provider;
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    const chainIdValue = await provider.request({ method: 'eth_chainId' });
    const account = Array.isArray(accounts) ? String(accounts[0] || '') : '';
    const chainId = typeof chainIdValue === 'string' ? parseInt(chainIdValue, 16) : Number(chainIdValue);
    setWalletAddress(account || null);
    return { provider, account, chainId };
  };

  const handlePay = async () => {
    if (!supportsDirectCheckout || !merchantAddress) return;
    setError(null);

    try {
      setIsPaying(true);
      const connection = await connectWallet();
      if (!connection?.provider || !connection.account) {
        throw new Error('Please connect your wallet first.');
      }

      const evmChain = resolveTargetEvmChain(selectedChain ?? 'base', connection.chainId);
      const targetChainId = getChainId(evmChain);
      await ensureWalletOnTargetChain(connection.provider, targetChainId);
      setResolvedEvmChain(evmChain);

      let hash = '';

      if (token === 'ETH') {
        const amountWei = parseUnits(amount.toString(), 18);
        const response = await connection.provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: connection.account,
            to: merchantAddress,
            value: `0x${amountWei.toString(16)}`
          }]
        });
        hash = String(response);
      } else {
        const tokenAddress = token === 'USDT' ? EVM_TOKENS[evmChain].USDT : EVM_TOKENS[evmChain].USDC;
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
      }

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
