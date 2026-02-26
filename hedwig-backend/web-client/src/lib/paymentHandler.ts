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

  // Connect to Solana
  const connection = new Connection(
    import.meta.env.VITE_SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
    'confirmed'
  );

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
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  // Sign and send via Reown wallet
  const signedTx = await wallet.signAndSendTransaction(transaction);
  const signature = signedTx.signature || signedTx;

  // Wait for confirmation
  await connection.confirmTransaction(signature, 'confirmed');

  return {
    txHash: signature,
  };
}
