import { parseUnits } from 'ethers';
import { PublicKey, Connection, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { TOKENS, SOLANA_TOKENS } from './constants';

interface EVMPaymentParams {
  chain: 'base';
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
}

type PaymentParams = EVMPaymentParams | SolanaPaymentParams;

interface PaymentResult {
  txHash: string;
}

const DEFAULT_SOLANA_RPC_ENDPOINTS = [
  'https://solana-mainnet.g.alchemy.com/v2/eSa5NrMQkXT-bXFuSdka4',
  'https://rpc.ankr.com/solana',
  'https://solana-rpc.publicnode.com',
];

function getSolanaRpcEndpoints(): string[] {
  const configuredPrimary = (import.meta.env.VITE_SOLANA_RPC || '').trim();
  const configuredFallbacks = (import.meta.env.VITE_SOLANA_RPC_FALLBACKS || '')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean);

  const endpoints = [
    configuredPrimary,
    ...configuredFallbacks,
    ...DEFAULT_SOLANA_RPC_ENDPOINTS,
  ].filter(Boolean);

  return [...new Set(endpoints)];
}

export async function executePayment(params: PaymentParams): Promise<PaymentResult> {
  if (params.chain === 'solana') {
    return executeSolanaPayment(params);
  } else {
    return executeEVMPayment(params);
  }
}

async function executeEVMPayment(params: EVMPaymentParams): Promise<PaymentResult> {
  const { token, amount, recipientAddress, provider, senderAddress } = params;

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
    const tokenAddress = TOKENS.base[token];
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
  const { amount, recipientAddress, wallet } = params;

  const rpcEndpoints = getSolanaRpcEndpoints();
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
      console.log(`[Solana] RPC endpoint unavailable: ${endpoint}`, error);
    }
  }

  if (!connection) {
    throw new Error(
      `No available Solana RPC endpoint. Last error: ${lastRpcError instanceof Error ? lastRpcError.message : String(lastRpcError)}`
    );
  }
  console.log(`[Solana] Using RPC endpoint: ${selectedRpcEndpoint}`);

  const fromPubkey = new PublicKey(wallet.publicKey.toString());
  const toPubkey = new PublicKey(recipientAddress);
  const mintPubkey = new PublicKey(SOLANA_TOKENS.USDC);

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

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  // Sign and send via Reown wallet
  const signedTx = await wallet.signAndSendTransaction(transaction);
  const signature = signedTx.signature || signedTx;

  // Wait for confirmation
  await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    'confirmed'
  );

  return {
    txHash: signature,
  };
}
