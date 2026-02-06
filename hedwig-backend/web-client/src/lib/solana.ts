/**
 * Solana Payment Utilities
 * 
 * Provides functions for SPL token transfers and atomic split payments on Solana.
 * Platform fee: 0.5% for amounts > $1000, 1% for amounts <= $1000
 */

import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';

// Constants
export const SOLANA_RPC = 'https://api.devnet.solana.com';
export const SOLANA_PLATFORM_WALLET = '367XwKWueJw99K5b1jpwKhdYMAGgavoiV7oZvCFkv3Xt';
export const SOLANA_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // Devnet USDC
export const USDC_DECIMALS = 6;
export const LAMPORTS_PER_SOL = 1_000_000_000;

// SPL Token Program IDs
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

/**
 * Calculate platform fee percentage based on amount
 * @param amount - Amount in USD
 * @returns Fee percentage (0.005 for >$1000, 0.01 for <=$1000)
 */
export function calculateFeePercent(amount: number): number {
    return amount > 1000 ? 0.005 : 0.01;
}

/**
 * Calculate platform fee amount
 * @param amount - Amount in USD
 * @returns Fee amount in USD
 */
export function calculatePlatformFee(amount: number): number {
    return amount * calculateFeePercent(amount);
}

/**
 * Get fee display text
 * @param amount - Amount in USD
 * @returns Display string like "0.5%" or "1%"
 */
export function getFeeDisplayText(amount: number): string {
    return amount > 1000 ? '0.5%' : '1%';
}

/**
 * Derive the Associated Token Account (ATA) address for a wallet and token mint
 */
export async function getAssociatedTokenAddress(
    walletAddress: PublicKey,
    mintAddress: PublicKey
): Promise<PublicKey> {
    const [ata] = await PublicKey.findProgramAddress(
        [
            walletAddress.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            mintAddress.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return ata;
}

/**
 * Create instruction to create an Associated Token Account if it doesn't exist
 */
export function createAssociatedTokenAccountInstruction(
    payer: PublicKey,
    associatedToken: PublicKey,
    owner: PublicKey,
    mint: PublicKey
): TransactionInstruction {
    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: associatedToken, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
        keys,
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        data: Buffer.alloc(0),
    });
}

/**
 * Create SPL Token transfer instruction
 */
export function createTokenTransferInstruction(
    source: PublicKey,
    destination: PublicKey,
    owner: PublicKey,
    amount: bigint
): TransactionInstruction {
    const data = new Uint8Array(9);
    data[0] = 3; // Transfer instruction

    const view = new DataView(data.buffer);
    const low = Number(amount & BigInt(0xFFFFFFFF));
    const high = Number((amount >> BigInt(32)) & BigInt(0xFFFFFFFF));
    view.setUint32(1, low, true);
    view.setUint32(5, high, true);

    const keys = [
        { pubkey: source, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
    ];

    return new TransactionInstruction({
        keys,
        programId: TOKEN_PROGRAM_ID,
        data: Buffer.from(data),
    });
}

/**
 * Check if an account exists on-chain
 */
export async function accountExists(
    connection: Connection,
    address: PublicKey
): Promise<boolean> {
    try {
        const info = await connection.getAccountInfo(address);
        return info !== null;
    } catch {
        return false;
    }
}

/**
 * Create a Solana split payment transaction for USDC
 */
export async function createSolanaUSDCSplitTransaction(
    connection: Connection,
    senderPubkey: PublicKey,
    merchantPubkey: PublicKey,
    amount: number
): Promise<Transaction> {
    const platformPubkey = new PublicKey(SOLANA_PLATFORM_WALLET);
    const mintPubkey = new PublicKey(SOLANA_USDC_MINT);
    const transaction = new Transaction();

    // Calculate split amounts with dynamic fee
    const feePercent = calculateFeePercent(amount);
    const totalTokenAmount = BigInt(Math.floor(amount * Math.pow(10, USDC_DECIMALS)));
    const platformFee = BigInt(Math.floor(Number(totalTokenAmount) * feePercent));
    const merchantAmount = totalTokenAmount - platformFee;

    console.log(`[Solana USDC Split] Total: ${totalTokenAmount}, Merchant: ${merchantAmount}, Platform: ${platformFee} (${feePercent * 100}%)`);

    // Get Associated Token Accounts
    const senderATA = await getAssociatedTokenAddress(senderPubkey, mintPubkey);
    const merchantATA = await getAssociatedTokenAddress(merchantPubkey, mintPubkey);
    const platformATA = await getAssociatedTokenAddress(platformPubkey, mintPubkey);

    // Check if merchant ATA exists, create if not
    if (!(await accountExists(connection, merchantATA))) {
        transaction.add(
            createAssociatedTokenAccountInstruction(
                senderPubkey,
                merchantATA,
                merchantPubkey,
                mintPubkey
            )
        );
    }

    // Check if platform ATA exists, create if not
    if (!(await accountExists(connection, platformATA))) {
        transaction.add(
            createAssociatedTokenAccountInstruction(
                senderPubkey,
                platformATA,
                platformPubkey,
                mintPubkey
            )
        );
    }

    // Add USDC transfer to merchant
    transaction.add(
        createTokenTransferInstruction(
            senderATA,
            merchantATA,
            senderPubkey,
            merchantAmount
        )
    );

    // Add USDC transfer to platform
    transaction.add(
        createTokenTransferInstruction(
            senderATA,
            platformATA,
            senderPubkey,
            platformFee
        )
    );

    return transaction;
}

/**
 * Create a Solana split payment transaction for native SOL
 */
export function createSolanaSOLSplitTransaction(
    senderPubkey: PublicKey,
    merchantPubkey: PublicKey,
    amount: number
): Transaction {
    const platformPubkey = new PublicKey(SOLANA_PLATFORM_WALLET);
    const transaction = new Transaction();

    // Calculate split amounts with dynamic fee
    const feePercent = calculateFeePercent(amount);
    const totalLamports = BigInt(Math.floor(amount * LAMPORTS_PER_SOL));
    const platformFee = BigInt(Math.floor(Number(totalLamports) * feePercent));
    const merchantAmount = totalLamports - platformFee;

    console.log(`[Solana SOL Split] Total: ${totalLamports}, Merchant: ${merchantAmount}, Platform: ${platformFee} (${feePercent * 100}%)`);

    // Transfer to merchant
    transaction.add(
        SystemProgram.transfer({
            fromPubkey: senderPubkey,
            toPubkey: merchantPubkey,
            lamports: merchantAmount
        })
    );

    // Transfer to platform
    transaction.add(
        SystemProgram.transfer({
            fromPubkey: senderPubkey,
            toPubkey: platformPubkey,
            lamports: platformFee
        })
    );

    return transaction;
}
