import type { Hex } from 'viem';

export interface TransferSpec {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  sourceContract: Hex;
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

export interface RecipientSetupOptions {
  includeRecipientSetup: boolean;
  recipientOwnerAddress: Hex;
}

export interface BurnIntentRequestEntry {
  burnIntent: BurnIntent;
  signature: Hex;
  recipientSetupOptions?: RecipientSetupOptions;
}

export interface GatewayTransferRecord {
  id: string;
  status: 'pending' | 'success' | 'failed' | string;
  attestation?: string;
  signature?: string;
  error?: { message?: string };
  destination?: { txHash?: string };
  destinationTxHash?: string;
  txHash?: string;
  [key: string]: any;
}
