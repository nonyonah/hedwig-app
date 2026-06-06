import { PublicKey } from '@solana/web3.js';
import {
  GATEWAY_EVM_CHAINS,
  GATEWAY_MINTER_EVM,
  GATEWAY_SOLANA_PROGRAMS,
  GATEWAY_SOLANA_USDC_MINT_FOR_MODE,
  type GatewayChainKey,
  type GatewayEvmChainKey,
} from './constants';
import { addressToBytes32 } from './burn-intent-evm';
import type { Hex } from 'viem';

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

const bytesToHex = (bytes: Uint8Array): Hex => {
  let out = '0x';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out as Hex;
};

const pubkeyToBytes32 = (base58: string): Hex => bytesToHex(new PublicKey(base58).toBytes());

export const getSolanaUsdcAta = (ownerBase58: string): PublicKey => {
  const owner = new PublicKey(ownerBase58);
  const mint = new PublicKey(GATEWAY_SOLANA_USDC_MINT_FOR_MODE);
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
};

export interface DestinationFields {
  destinationContract: Hex;
  destinationToken: Hex;
  destinationRecipient: Hex;
  recipientOwnerAddressBytes32?: Hex;
}

export const buildDestinationFields = (
  destChainKey: GatewayChainKey,
  recipientAddress: string,
): DestinationFields => {
  if (destChainKey === 'solana') {
    const ata = getSolanaUsdcAta(recipientAddress);
    return {
      destinationContract: pubkeyToBytes32(GATEWAY_SOLANA_PROGRAMS.minterProgram),
      destinationToken: pubkeyToBytes32(GATEWAY_SOLANA_USDC_MINT_FOR_MODE),
      destinationRecipient: bytesToHex(ata.toBytes()),
      recipientOwnerAddressBytes32: pubkeyToBytes32(recipientAddress),
    };
  }

  const evmConfig = GATEWAY_EVM_CHAINS[destChainKey as GatewayEvmChainKey];
  if (!evmConfig) throw new Error(`Unknown destination chain: ${destChainKey}`);
  return {
    destinationContract: addressToBytes32(GATEWAY_MINTER_EVM),
    destinationToken: addressToBytes32(evmConfig.usdc),
    destinationRecipient: addressToBytes32(recipientAddress as `0x${string}`),
  };
};
