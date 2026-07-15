'use client';

import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  GATEWAY_SOLANA_PROGRAMS,
  GATEWAY_SOLANA_RPC_URL,
  GATEWAY_SOLANA_USDC_MINT_FOR_MODE,
  GATEWAY_NETWORK_MODE,
} from './constants';
import type { ConnectedStandardSolanaWallet } from '@privy-io/js-sdk-core';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const DEPOSIT_DISCRIMINATOR = [22, 0] as const;

function encodeU64Le(value: bigint): Buffer {
  if (value < 0n || value > 18_446_744_073_709_551_615n) {
    throw new Error('Solana deposit amount is outside the u64 range');
  }
  const buffer = Buffer.alloc(8);
  let n = value;
  for (let i = 0; i < 8; i++) {
    buffer[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return buffer;
}

function findAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

function findDepositPdas(programId: PublicKey, usdcMint: PublicKey, owner: PublicKey) {
  return {
    wallet: PublicKey.findProgramAddressSync(
      [Buffer.from('gateway_wallet')],
      programId,
    )[0],
    custody: PublicKey.findProgramAddressSync(
      [Buffer.from('gateway_wallet_custody'), usdcMint.toBuffer()],
      programId,
    )[0],
    deposit: PublicKey.findProgramAddressSync(
      [Buffer.from('gateway_deposit'), usdcMint.toBuffer(), owner.toBuffer()],
      programId,
    )[0],
    denylist: PublicKey.findProgramAddressSync(
      [Buffer.from('denylist'), owner.toBuffer()],
      programId,
    )[0],
    eventAuthority: PublicKey.findProgramAddressSync(
      [Buffer.from('__event_authority')],
      programId,
    )[0],
  };
}

function buildDepositInstruction({
  programId, owner, ownerTokenAccount, usdcMint, amountSubunits,
}: {
  programId: PublicKey;
  owner: PublicKey;
  ownerTokenAccount: PublicKey;
  usdcMint: PublicKey;
  amountSubunits: bigint;
}): TransactionInstruction {
  const pdas = findDepositPdas(programId, usdcMint, owner);
  const data = Buffer.concat([Buffer.from(DEPOSIT_DISCRIMINATOR), encodeU64Le(amountSubunits)]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: pdas.wallet, isSigner: false, isWritable: false },
      { pubkey: ownerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: pdas.custody, isSigner: false, isWritable: true },
      { pubkey: pdas.deposit, isSigner: false, isWritable: true },
      { pubkey: pdas.denylist, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: pdas.eventAuthority, isSigner: false, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

const backendApiBase = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || window.location.origin)
  : '';

export async function depositSolanaToGateway({
  wallet,
  amountSubunits,
  feePayerAddress,
  accessToken,
  onStatus,
}: {
  wallet: ConnectedStandardSolanaWallet;
  amountSubunits: bigint;
  feePayerAddress?: string;
  accessToken?: string | null;
  onStatus?: (label: string) => void;
}): Promise<{ depositTxHash: string }> {
  const owner = new PublicKey(wallet.address);
  const programId = new PublicKey(GATEWAY_SOLANA_PROGRAMS.walletProgram);
  const usdcMint = new PublicKey(GATEWAY_SOLANA_USDC_MINT_FOR_MODE);
  const connection = new Connection(GATEWAY_SOLANA_RPC_URL, 'confirmed');
  const ownerTokenAccount = findAssociatedTokenAddress(usdcMint, owner);

  onStatus?.('Checking Solana USDC balance...');
  const tokenBalance = await connection.getTokenAccountBalance(ownerTokenAccount).catch(() => null);
  const available = BigInt(tokenBalance?.value?.amount ?? '0');
  if (available < amountSubunits) {
    throw new Error('Insufficient Solana USDC balance for Gateway deposit');
  }

  onStatus?.('Depositing Solana USDC into Gateway...');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  const feePayer = feePayerAddress ? new PublicKey(feePayerAddress) : owner;

  const transaction = new Transaction({
    recentBlockhash: blockhash,
    feePayer,
  });

  transaction.add(buildDepositInstruction({
    programId, owner, ownerTokenAccount, usdcMint, amountSubunits,
  }));

  const serialized = transaction.serialize({ verifySignatures: false, requireAllSignatures: false });

  const { signedTransaction: signedBytes } = await wallet.signTransaction({
    transaction: serialized,
  });

  if (feePayerAddress && accessToken) {
    onStatus?.('Relaying via fee-payer...');
    const res = await fetch(`${backendApiBase}/api/gateway/solana/relay`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transaction: bs58.encode(signedBytes) }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json?.error?.message || 'Fee-payer relay failed');
    }
    return { depositTxHash: json.data.signature };
  }

  const signedTx = Transaction.from(signedBytes);
  const signatureStr = bs58.encode(signedTx.signature!);

  onStatus?.('Submitting Solana transaction...');
  await connection.sendRawTransaction(signedBytes, { preflightCommitment: 'confirmed' });
  await connection.confirmTransaction(
    { signature: signatureStr, blockhash, lastValidBlockHeight },
    'finalized',
  );

  return { depositTxHash: signatureStr };
}
