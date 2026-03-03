import { parseUnits } from 'ethers';
import { PublicKey, Connection, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { TOKENS, SOLANA_TOKENS_BY_CLUSTER } from './constants';
import type { RuntimeNetworkMode } from './networkMode';
import { resolveSolanaCluster } from './networkMode';

interface EVMPaymentParams {
  chain: 'base' | 'baseSepolia' | 'celo';
  token: 'USDC' | 'USDT' | 'ETH';
  amount: number;
  recipientAddress: string;
  provider: any; // Ethereum provider from wallet
  senderAddress: string;
}

interface SolanaPaymentParams {
  chain: 'solana';
  token: 'USDC';
  amount: number;
  recipientAddress: string;
  wallet: any; // Solana wallet
  networkMode?: RuntimeNetworkMode;
}

type PaymentParams = EVMPaymentParams | SolanaPaymentParams;

interface PaymentResult {
  txHash: string;
}

const DEFAULT_SOLANA_RPC_ENDPOINTS = [
  '/api/solana/rpc?cluster=mainnet-beta',
  'https://api.mainnet-beta.solana.com',
];

function getSolanaRpcEndpoints(cluster: 'mainnet-beta' | 'devnet'): string[] {
  const configuredProxy = (import.meta.env.VITE_SOLANA_RPC_PROXY_URL || '').trim();
  const apiBaseUrl = (import.meta.env.VITE_API_URL || '').trim();
  const configuredFallbacks = (import.meta.env.VITE_SOLANA_RPC_FALLBACKS || '')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean);

  const primaryProxyEndpoint = configuredProxy || (apiBaseUrl ? `${apiBaseUrl}/api/solana/rpc?cluster=${cluster}` : `/api/solana/rpc?cluster=${cluster}`);
  const clusterDefaults = cluster === 'devnet'
    ? ['https://api.devnet.solana.com']
    : ['https://api.mainnet-beta.solana.com'];

  const endpoints = [
    primaryProxyEndpoint,
    ...configuredFallbacks,
    ...clusterDefaults,
    ...DEFAULT_SOLANA_RPC_ENDPOINTS,
  ].filter(Boolean);

  return [...new Set(endpoints)];
}

function redactRpcUrl(url: string): string {
  return url.replace(/\/v2\/[^/?#]+/g, '/v2/***');
}

function isBlockhashNotFoundError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return message.includes('blockhash not found');
}

async function extractSolanaErrorLogs(error: unknown): Promise<string> {
  const maybeError = error as any;
  if (maybeError && typeof maybeError.getLogs === 'function') {
    try {
      const logs = await maybeError.getLogs();
      if (Array.isArray(logs) && logs.length > 0) {
        return logs.join('\n');
      }
    } catch {
      // Ignore log extraction failures and fall back to message-only errors.
    }
  }
  return '';
}

export async function executePayment(params: PaymentParams): Promise<PaymentResult> {
  if (params.chain === 'solana') {
    return executeSolanaPayment(params);
  } else {
    return executeEVMPayment(params);
  }
}

async function executeEVMPayment(params: EVMPaymentParams): Promise<PaymentResult> {
  const { chain, token, amount, recipientAddress, provider, senderAddress } = params;

  if (token === 'ETH') {
    // Native ETH transfer
    const amountWei = parseUnits(amount.toString(), 18);
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: senderAddress,
        to: recipientAddress,
        value: '0x' + amountWei.toString(16),
      }],
    });
    return { txHash: txHash as string };
  } else {
    // ERC20 transfer
    const tokenAddress = TOKENS[chain]?.[token as keyof typeof TOKENS[typeof chain]];
    if (!tokenAddress) {
      throw new Error(`${token} is not configured on ${chain}.`);
    }
    const decimals = 6;
    const amountInUnits = parseUnits(amount.toString(), decimals);
    
    // Encode transfer function call
    const data = `0xa9059cbb${
      recipientAddress.slice(2).padStart(64, '0')
    }${amountInUnits.toString(16).padStart(64, '0')}`;
    
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: senderAddress,
        to: tokenAddress,
        data,
      }],
    });
    return { txHash: txHash as string };
  }
}

async function executeSolanaPayment(params: SolanaPaymentParams): Promise<PaymentResult> {
  const { amount, recipientAddress, wallet, networkMode = 'mainnet' } = params;
  const cluster = resolveSolanaCluster(networkMode);

  const rpcEndpoints = getSolanaRpcEndpoints(cluster);
  let connection: Connection | null = null;
  let selectedRpcEndpoint = '';
  let lastRpcError: unknown = null;

  for (const endpoint of rpcEndpoints) {
    try {
      const candidate = new Connection(endpoint, 'confirmed');
      await candidate.getLatestBlockhash('confirmed');
      connection = candidate;
      selectedRpcEndpoint = endpoint;
      break;
    } catch (error) {
      lastRpcError = error;
      console.log(`[Solana] RPC endpoint unavailable: ${redactRpcUrl(endpoint)}`, error);
    }
  }

  if (!connection) {
    throw new Error(
      `No available Solana RPC endpoint. Last error: ${lastRpcError instanceof Error ? lastRpcError.message : String(lastRpcError)}`
    );
  }
  console.log(`[Solana] Using RPC endpoint: ${redactRpcUrl(selectedRpcEndpoint)}`);

  const fromPubkey = new PublicKey(wallet.publicKey.toString());
  const toPubkey = new PublicKey(recipientAddress);
  const mintAddress = SOLANA_TOKENS_BY_CLUSTER[cluster].USDC;
  const mintPubkey = new PublicKey(mintAddress);

  // Get associated token accounts
  const fromTokenAccount = await getAssociatedTokenAddress(
    mintPubkey,
    fromPubkey
  );
  
  const toTokenAccount = await getAssociatedTokenAddress(
    mintPubkey,
    toPubkey
  );

  const toTokenAccountInfo = await connection.getAccountInfo(toTokenAccount);

  // Convert amount to lamports (USDC has 6 decimals)
  const amountLamports = Math.floor(amount * 1_000_000);

  const transaction = new Transaction();

  // Ensure receiver can accept USDC before transfer.
  if (!toTokenAccountInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        fromPubkey,
        toTokenAccount,
        toPubkey,
        mintPubkey
      )
    )
  }

  transaction.add(
    createTransferInstruction(
      fromTokenAccount,
      toTokenAccount,
      fromPubkey,
      amountLamports,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  if (typeof wallet.signTransaction !== 'function') {
    throw new Error('Wallet does not support transaction signing. Please use a compatible Solana wallet.');
  }

  const waitForSignatureConfirmation = async (
    signature: string,
    lastValidBlockHeight: number,
    timeoutMs: number = 90_000
  ) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const [statusResponse, blockHeight] = await Promise.all([
        connection.getSignatureStatuses([signature]),
        connection.getBlockHeight('confirmed'),
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
  };

  const signAndBroadcast = async () => {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    const signedTx = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      maxRetries: 5,
      preflightCommitment: 'confirmed',
    });

    return { signature, blockhash, lastValidBlockHeight };
  };

  const maxAttempts = 3;
  let attempt = 0;
  let lastError: unknown = null;
  let broadcastResult: { signature: string; blockhash: string; lastValidBlockHeight: number } | null = null;

  while (attempt < maxAttempts && !broadcastResult) {
    attempt += 1;
    try {
      const nextBroadcast = await signAndBroadcast();
      await waitForSignatureConfirmation(nextBroadcast.signature, nextBroadcast.lastValidBlockHeight);
      broadcastResult = nextBroadcast;
      break;
    } catch (error) {
      lastError = error;
      const message = String((error as any)?.message || error || '').toLowerCase();
      const shouldRetry =
        isBlockhashNotFoundError(error) ||
        message.includes('block height exceeded') ||
        message.includes('expired');

      if (!shouldRetry || attempt >= maxAttempts) {
        const logs = await extractSolanaErrorLogs(error);
        throw new Error(logs ? `${(error as any)?.message || error}\n${logs}` : String((error as any)?.message || error));
      }

      console.warn(`[Solana] Retrying transaction with fresh blockhash (attempt ${attempt + 1}/${maxAttempts})...`);
    }
  }

  if (!broadcastResult) {
    throw new Error(String((lastError as any)?.message || lastError || 'Failed to submit Solana transaction'));
  }

  return {
    txHash: broadcastResult.signature,
  };
}
