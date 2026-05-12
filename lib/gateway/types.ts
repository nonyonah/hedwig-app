// Shared types between EVM and Solana burn intent code paths plus the
// Gateway API request/response shapes we consume.

import type { Hex } from 'viem';

export interface TransferSpec {
    version: number;
    sourceDomain: number;
    destinationDomain: number;
    sourceContract: Hex;        // bytes32 (32-byte hex)
    destinationContract: Hex;
    sourceToken: Hex;
    destinationToken: Hex;
    sourceDepositor: Hex;
    destinationRecipient: Hex;
    sourceSigner: Hex;
    destinationCaller: Hex;
    value: bigint;
    salt: Hex;
    hookData: Hex;
}

export interface BurnIntent {
    maxBlockHeight: bigint;
    maxFee: bigint;
    spec: TransferSpec;
}

export interface SignedBurnIntent {
    burnIntent: BurnIntent;
    signature: Hex;
}

/** Forwarder-only — Solana ATA auto-create hint. */
export interface RecipientSetupOptions {
    includeRecipientSetup: boolean;
    recipientOwnerAddress: Hex; // bytes32 hex of the owner pubkey
}

export interface BurnIntentRequestEntry {
    burnIntent: BurnIntent;
    signature: Hex;
    recipientSetupOptions?: RecipientSetupOptions;
}

export interface GatewayBalanceEntry {
    domain: number;
    /** USDC subunits (6 decimals) as a base-10 string. */
    balance: string;
    /** Pending deposits awaiting finality. */
    pending?: string;
    /** Per-domain depositor address for diagnostics. */
    depositor?: string;
}

export interface GatewayBalancesResponse {
    balances: GatewayBalanceEntry[];
}

export interface GatewayTransferRecord {
    id: string;
    status: 'pending' | 'success' | 'failed' | string;
    attestation?: string;
    signature?: string;
    error?: { message?: string };
    [key: string]: any;
}
