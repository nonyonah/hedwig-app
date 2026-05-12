// Helpers for crafting destination-side fields of a burn intent. Most of the
// work for cross-chain transfers is on the destination side: figuring out
// the right contract / token / recipient encoding for each domain so the
// Gateway Minter on that domain mints USDC to the correct account.

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

// Solana program IDs as `PublicKey` objects, computed once.
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

const bytesToHex = (bytes: Uint8Array): Hex => {
    let out = '0x';
    for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
    return out as Hex;
};

const pubkeyToBytes32 = (base58: string): Hex => bytesToHex(new PublicKey(base58).toBytes());

/** Derive the Associated Token Account address for `owner` holding USDC. */
export const getSolanaUsdcAta = (ownerBase58: string): PublicKey => {
    const owner = new PublicKey(ownerBase58);
    const mint = new PublicKey(GATEWAY_SOLANA_USDC_MINT_FOR_MODE);
    const [ata] = PublicKey.findProgramAddressSync(
        [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
        ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    return ata;
};

/**
 * Build the destination-side burn intent fields for a given chain key and
 * recipient address. The returned object plugs straight into
 * `buildBurnIntent` from burn-intent-evm.ts.
 *
 * For EVM destinations the recipient is the EOA / smart wallet address.
 * For Solana destinations the recipient is the OWNER pubkey — we derive the
 * USDC ATA here so the Gateway Minter mints into the right token account.
 * Returns `recipientOwnerAddress` for the Forwarder's optional ATA setup.
 */
export interface DestinationFields {
    destinationContract: Hex;
    destinationToken: Hex;
    destinationRecipient: Hex;
    /** Only present for Solana destinations. Pass to recipientSetupOptions. */
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
