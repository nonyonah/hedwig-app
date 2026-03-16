'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowSquareOut, CheckCircle } from '@phosphor-icons/react/dist/ssr';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress
} from '@solana/spl-token';
import { backendConfig } from '@/lib/auth/config';
import { SOLANA_TOKENS, getSolanaExplorerUrl, type SolanaCluster } from '@/lib/payments/public-constants';

type SolanaWalletProvider = {
  publicKey?: { toString(): string };
  connect: () => Promise<{ publicKey?: { toString(): string } } | void>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  network?: string;
  networkVersion?: string;
};

function getErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err ?? '');
}

function getInjectedSolanaWallet(): SolanaWalletProvider | null {
  if (typeof window === 'undefined') return null;
  const browserWindow = window as typeof window & {
    solana?: SolanaWalletProvider;
    phantom?: { solana?: SolanaWalletProvider };
    solflare?: SolanaWalletProvider;
  };

  return browserWindow.phantom?.solana || browserWindow.solflare || browserWindow.solana || null;
}

function resolveSolanaCluster(wallet: SolanaWalletProvider | null): SolanaCluster {
  const network = String(wallet?.network || wallet?.networkVersion || '').toLowerCase();
  return network.includes('devnet') || network.includes('testnet') ? 'devnet' : 'mainnet';
}

function getRpcEndpoints(cluster: SolanaCluster): string[] {
  const proxyEndpoint = `${backendConfig.apiBaseUrl}/api/solana/rpc?cluster=${cluster}`;
  const defaultEndpoint = cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';
  return [proxyEndpoint, defaultEndpoint];
}

async function createConnection(cluster: SolanaCluster) {
  let lastError: unknown = null;
  for (const endpoint of getRpcEndpoints(cluster)) {
    try {
      const connection = new Connection(endpoint, 'confirmed');
      await connection.getLatestBlockhash('confirmed');
      return connection;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`No available Solana RPC endpoint. ${getErrorMessage(lastError)}`);
}

function isBlockhashRetryable(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('blockhash not found') ||
    message.includes('block height exceeded') ||
    message.includes('expired')
  );
}

async function waitForSignatureConfirmation(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
  timeoutMs: number = 90_000
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const [statusResponse, blockHeight] = await Promise.all([
      connection.getSignatureStatuses([signature]),
      connection.getBlockHeight('confirmed')
    ]);

    const status = statusResponse?.value?.[0];
    if (status?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return;
    }
    if (blockHeight > lastValidBlockHeight) {
      throw new Error('Signature has expired: block height exceeded.');
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  throw new Error('Timed out waiting for transaction confirmation.');
}

export function PublicSolanaCheckout({
  documentId,
  amount,
  title,
  merchantAddress
}: {
  documentId: string;
  amount: number;
  title: string;
  merchantAddress?: string | null;
}) {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [cluster, setCluster] = useState<SolanaCluster>('mainnet');
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const supportsDirectCheckout = Boolean(merchantAddress);
  const chainIcon = '/icons/networks/solana.png';
  const tokenIcon = '/icons/tokens/usdc.png';

  const buttonLabel = useMemo(() => {
    if (!supportsDirectCheckout) return 'Merchant wallet unavailable';
    if (!walletAddress) return 'Connect wallet';
    return isPaying ? 'Processing…' : `Pay ${amount} USDC`;
  }, [amount, isPaying, supportsDirectCheckout, walletAddress]);

  const connectWallet = async () => {
    setError(null);
    const wallet = getInjectedSolanaWallet();
    if (!wallet) {
      throw new Error('No injected Solana wallet found. Install Phantom, Solflare, or another compatible wallet.');
    }

    const result = await wallet.connect();
    const publicKey = result?.publicKey?.toString() || wallet.publicKey?.toString();
    if (!publicKey) {
      throw new Error('Failed to connect Solana wallet.');
    }

    setWalletAddress(publicKey);
    const nextCluster = resolveSolanaCluster(wallet);
    setCluster(nextCluster);
    return { wallet, publicKey, cluster: nextCluster };
  };

  const handlePay = async () => {
    if (!supportsDirectCheckout || !merchantAddress) return;
    setError(null);

    try {
      setIsPaying(true);
      const { wallet, publicKey, cluster: activeCluster } = await connectWallet();
      if (typeof wallet.signTransaction !== 'function') {
        throw new Error('Wallet does not support transaction signing. Please use a compatible Solana wallet.');
      }

      const connection = await createConnection(activeCluster);
      const fromPubkey = new PublicKey(publicKey);
      const toPubkey = new PublicKey(merchantAddress);
      const mintPubkey = new PublicKey(SOLANA_TOKENS[activeCluster].USDC);

      const fromTokenAccount = await getAssociatedTokenAddress(mintPubkey, fromPubkey);
      const toTokenAccount = await getAssociatedTokenAddress(mintPubkey, toPubkey);
      const toTokenAccountInfo = await connection.getAccountInfo(toTokenAccount);

      let signature = '';
      let confirmationBlockHeight = 0;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const transaction = new Transaction();
          if (!toTokenAccountInfo) {
            transaction.add(
              createAssociatedTokenAccountInstruction(
                fromPubkey,
                toTokenAccount,
                toPubkey,
                mintPubkey
              )
            );
          }

          transaction.add(
            createTransferInstruction(
              fromTokenAccount,
              toTokenAccount,
              fromPubkey,
              Math.floor(amount * 1_000_000),
              [],
              TOKEN_PROGRAM_ID
            )
          );

          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
          confirmationBlockHeight = lastValidBlockHeight;
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = fromPubkey;

          const signedTx = await wallet.signTransaction(transaction);
          signature = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            maxRetries: 5,
            preflightCommitment: 'confirmed'
          });

          await waitForSignatureConfirmation(connection, signature, confirmationBlockHeight);
          break;
        } catch (error) {
          lastError = error;
          if (!isBlockhashRetryable(error) || attempt === 2) {
            throw error;
          }
        }
      }

      if (!signature) {
        throw new Error(getErrorMessage(lastError) || 'Failed to submit Solana transaction.');
      }

      setTxHash(signature);

      const backendResponse = await fetch(`${backendConfig.apiBaseUrl}/api/documents/${documentId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: signature,
          payer: publicKey,
          chain: 'solana',
          token: 'USDC',
          amount
        })
      });

      const payload = await backendResponse.json().catch(() => null);
      if (!backendResponse.ok || !payload?.success) {
        const message = typeof payload?.error === 'string' ? payload.error : payload?.error?.message;
        throw new Error(message || 'Your transaction was confirmed, but Hedwig could not update the payment status yet.');
      }

      router.push(`/success?txHash=${encodeURIComponent(signature)}&amount=${encodeURIComponent(String(amount))}&symbol=USDC`);
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Payment failed.');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#e9eaeb] bg-white p-6 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[#f8f9fc]">
          <Image src={chainIcon} alt="Solana" width={28} height={28} className="rounded-full" />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-white shadow-xs">
            <Image src={tokenIcon} alt="USDC" width={14} height={14} className="rounded-full" />
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-[#717680]">Crypto checkout</p>
          <p className="text-sm font-semibold text-[#181d27]">USDC on {cluster === 'devnet' ? 'Solana Devnet' : 'Solana'}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-[#717680]">
        Pay <span className="font-semibold text-[#181d27]">{title}</span> directly from an injected Solana wallet.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#e9eaeb] bg-[#fcfcfd] px-3 py-1.5 text-xs font-medium text-[#414651]">
          <Image src={chainIcon} alt="Solana" width={16} height={16} className="rounded-full" />
          {cluster === 'devnet' ? 'Solana Devnet' : 'Solana'}
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#e9eaeb] bg-[#fcfcfd] px-3 py-1.5 text-xs font-medium text-[#414651]">
          <Image src={tokenIcon} alt="USDC" width={16} height={16} className="rounded-full" />
          USDC
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd] p-4 text-sm text-[#414651]">
        <div className="flex items-center justify-between">
          <span>Amount</span>
          <span className="font-semibold text-[#181d27]">{amount} USDC</span>
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

      {txHash ? (
        <a
          href={getSolanaExplorerUrl(cluster, txHash)}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary"
        >
          <CheckCircle className="h-4 w-4" weight="fill" />
          View confirmed transaction
          <ArrowSquareOut className="h-4 w-4" weight="bold" />
        </a>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm text-[#b42318]">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handlePay}
        disabled={!supportsDirectCheckout || isPaying}
        className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[#2563eb] px-5 py-2.5 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {buttonLabel}
      </button>

      <div className="mt-3 flex items-center gap-2 text-xs text-[#717680]">
        <CheckCircle className="h-4 w-4 text-[#079455]" weight="fill" />
        This checkout now runs directly inside Hedwig.
      </div>
    </div>
  );
}
