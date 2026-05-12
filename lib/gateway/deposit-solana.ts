// Submit a Gateway Wallet deposit on Solana.
// This mirrors Circle's Solana Gateway deposit instruction without pulling in
// Anchor at runtime, which keeps the mobile bundle smaller and avoids another
// wallet abstraction layer around Privy's Solana provider.

import {
    Connection,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js';
import {
    GATEWAY_SOLANA_EXPLORER_URL,
    GATEWAY_SOLANA_PROGRAMS,
    GATEWAY_SOLANA_RPC_URL,
    GATEWAY_SOLANA_USDC_MINT_FOR_MODE,
    GATEWAY_NETWORK_MODE,
} from './constants';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const DEPOSIT_DISCRIMINATOR = [22, 0] as const;
const solanaDepositLocks = new Map<string, Promise<SolanaDepositResult>>();

export interface DepositSolanaToGatewayArgs {
    /** Privy embedded Solana wallet object. */
    wallet: any;
    /** USDC subunits (6 decimals). */
    amountSubunits: bigint;
    onStatus?: (label: string) => void;
}

export interface SolanaDepositResult {
    depositTxHash: string;
    explorerUrl: string;
}

const encodeU64Le = (value: bigint): Buffer => {
    if (value < 0n || value > 18_446_744_073_709_551_615n) {
        throw new Error('Solana deposit amount is outside the u64 range');
    }
    const buffer = Buffer.alloc(8);
    let n = value;
    for (let i = 0; i < 8; i += 1) {
        buffer[i] = Number(n & 0xffn);
        n >>= 8n;
    }
    return buffer;
};

const findAssociatedTokenAddress = (mint: PublicKey, owner: PublicKey): PublicKey =>
    PublicKey.findProgramAddressSync(
        [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
    )[0];

const findDepositPdas = (programId: PublicKey, usdcMint: PublicKey, owner: PublicKey) => ({
    wallet: PublicKey.findProgramAddressSync(
        [Buffer.from('gateway_wallet')],
        programId
    )[0],
    custody: PublicKey.findProgramAddressSync(
        [Buffer.from('gateway_wallet_custody'), usdcMint.toBuffer()],
        programId
    )[0],
    deposit: PublicKey.findProgramAddressSync(
        [Buffer.from('gateway_deposit'), usdcMint.toBuffer(), owner.toBuffer()],
        programId
    )[0],
    denylist: PublicKey.findProgramAddressSync(
        [Buffer.from('denylist'), owner.toBuffer()],
        programId
    )[0],
    eventAuthority: PublicKey.findProgramAddressSync(
        [Buffer.from('__event_authority')],
        programId
    )[0],
});

const buildDepositInstruction = ({
    programId,
    owner,
    ownerTokenAccount,
    usdcMint,
    amountSubunits,
}: {
    programId: PublicKey;
    owner: PublicKey;
    ownerTokenAccount: PublicKey;
    usdcMint: PublicKey;
    amountSubunits: bigint;
}): TransactionInstruction => {
    const pdas = findDepositPdas(programId, usdcMint, owner);
    const data = Buffer.concat([
        Buffer.from(DEPOSIT_DISCRIMINATOR),
        encodeU64Le(amountSubunits),
    ]);

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
};

export async function depositSolanaToGateway({
    wallet,
    amountSubunits,
    onStatus,
}: DepositSolanaToGatewayArgs): Promise<SolanaDepositResult> {
    const ownerAddress = String(wallet?.address || '');
    if (!ownerAddress) throw new Error('No Solana wallet address found');

    const lockKey = `${ownerAddress}:${amountSubunits.toString()}`;
    const existingDeposit = solanaDepositLocks.get(lockKey);
    if (existingDeposit) {
        onStatus?.('Solana Gateway deposit already pending...');
        return existingDeposit;
    }

    const depositPromise = runSolanaDeposit({ wallet, amountSubunits, onStatus })
        .finally(() => {
            solanaDepositLocks.delete(lockKey);
        });

    solanaDepositLocks.set(lockKey, depositPromise);
    return depositPromise;
}

async function runSolanaDeposit({
    wallet,
    amountSubunits,
    onStatus,
}: DepositSolanaToGatewayArgs): Promise<SolanaDepositResult> {
    const provider = await wallet.getProvider();
    if (!provider) throw new Error('Solana wallet provider unavailable');

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
    const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: owner,
    });
    transaction.add(buildDepositInstruction({
        programId,
        owner,
        ownerTokenAccount,
        usdcMint,
        amountSubunits,
    }));

    const result = await provider.request({
        method: 'signAndSendTransaction',
        params: { transaction, connection },
    });
    const signature = result?.signature || result;
    if (!signature || typeof signature !== 'string') {
        throw new Error('Solana Gateway deposit did not return a transaction signature');
    }

    onStatus?.('Waiting for Solana finality...');
    await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'finalized'
    );

    return {
        depositTxHash: signature,
        explorerUrl: GATEWAY_NETWORK_MODE === 'testnet'
            ? `${GATEWAY_SOLANA_EXPLORER_URL}${signature}?cluster=devnet`
            : `${GATEWAY_SOLANA_EXPLORER_URL}${signature}`,
    };
}
