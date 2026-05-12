// Circle Gateway constants — addresses, domains, gas fees, API URLs.
// Sourced from https://developers.circle.com/gateway/references/contract-addresses
// and https://developers.circle.com/gateway/references/fees.
//
// Mode is selected via EXPO_PUBLIC_NETWORK_MODE so the same chain key
// resolves to mainnet contracts in production builds and testnet contracts
// during development.

import type { Address } from 'viem';

export type GatewayNetworkMode = 'mainnet' | 'testnet';

export const GATEWAY_NETWORK_MODE: GatewayNetworkMode =
    process.env.EXPO_PUBLIC_NETWORK_MODE === 'testnet' ? 'testnet' : 'mainnet';

export type GatewayEvmChainKey = 'base' | 'arbitrum' | 'polygon' | 'optimism';
export type GatewayChainKey = GatewayEvmChainKey | 'solana';

// Circle's domain numbering — same on testnet and mainnet.
export const GATEWAY_DOMAINS: Record<GatewayChainKey, number> = {
    base: 6,
    arbitrum: 3,
    polygon: 7,
    optimism: 2,
    solana: 5,
};

// Solana Devnet program IDs (mainnet not yet published in Circle docs at time
// of writing — fall back to the same identifiers and let it 404 cleanly so we
// notice rather than silently routing to the wrong cluster).
export const GATEWAY_SOLANA_PROGRAMS = {
    walletProgram: 'GATEwdfmYNELfp5wDmmR6noSr2vHnAfBPMm2PvCzX5vu',
    minterProgram: 'GATEmKK2ECL1brEngQZWCgMWPbvrEYqsV6u29dAaHavr',
} as const;

export const GATEWAY_SOLANA_USDC_MINT = {
    testnet: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
} as const;

export const GATEWAY_SOLANA_RPC_URL =
    GATEWAY_NETWORK_MODE === 'testnet'
        ? 'https://api.devnet.solana.com'
        : 'https://api.mainnet-beta.solana.com';

export const GATEWAY_SOLANA_EXPLORER_URL =
    GATEWAY_NETWORK_MODE === 'testnet'
        ? 'https://explorer.solana.com/tx/'
        : 'https://solscan.io/tx/';

export interface GatewayEvmChainConfig {
    key: GatewayEvmChainKey;
    name: string;
    domain: number;
    chainIdHex: string;
    chainIdDecimal: number;
    usdc: Address;
    nativeSymbol: 'ETH' | 'POL';
    nativeDecimals: 18;
    rpcUrl: string;
    explorerUrl: string;
    /** Gas fee deducted from unified USDC balance, in 6-decimal subunits. */
    gasFeeUsdc: bigint;
}

const ALCHEMY_API_KEY = String(process.env.EXPO_PUBLIC_ALCHEMY_API_KEY || '').replace(/^"|"$/g, '').trim();
const alchemyRpc = (segment: string, fallback: string): string =>
    ALCHEMY_API_KEY ? `https://${segment}.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : fallback;

const MAINNET_EVM_CHAINS: Record<GatewayEvmChainKey, GatewayEvmChainConfig> = {
    base: {
        key: 'base',
        name: 'Base',
        domain: 6,
        chainIdHex: '0x2105',
        chainIdDecimal: 8453,
        usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        rpcUrl: alchemyRpc('base-mainnet', 'https://mainnet.base.org'),
        explorerUrl: 'https://basescan.org/tx/',
        gasFeeUsdc: 10_000n, // $0.01
    },
    arbitrum: {
        key: 'arbitrum',
        name: 'Arbitrum',
        domain: 3,
        chainIdHex: '0xa4b1',
        chainIdDecimal: 42161,
        usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        rpcUrl: alchemyRpc('arb-mainnet', 'https://arb1.arbitrum.io/rpc'),
        explorerUrl: 'https://arbiscan.io/tx/',
        gasFeeUsdc: 10_000n, // $0.01
    },
    polygon: {
        key: 'polygon',
        name: 'Polygon',
        domain: 7,
        chainIdHex: '0x89',
        chainIdDecimal: 137,
        usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        nativeSymbol: 'POL',
        nativeDecimals: 18,
        rpcUrl: alchemyRpc('polygon-mainnet', 'https://polygon-rpc.com'),
        explorerUrl: 'https://polygonscan.com/tx/',
        gasFeeUsdc: 1_500n, // $0.0015
    },
    optimism: {
        key: 'optimism',
        name: 'Optimism',
        domain: 2,
        chainIdHex: '0xa',
        chainIdDecimal: 10,
        usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        rpcUrl: alchemyRpc('opt-mainnet', 'https://mainnet.optimism.io'),
        explorerUrl: 'https://optimistic.etherscan.io/tx/',
        gasFeeUsdc: 1_500n, // $0.0015 per Circle Gateway fee table
    },
};

const TESTNET_EVM_CHAINS: Record<GatewayEvmChainKey, GatewayEvmChainConfig> = {
    base: {
        key: 'base',
        name: 'Base Sepolia',
        domain: 6,
        chainIdHex: '0x14a34',
        chainIdDecimal: 84532,
        usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        rpcUrl: alchemyRpc('base-sepolia', 'https://sepolia.base.org'),
        explorerUrl: 'https://sepolia.basescan.org/tx/',
        gasFeeUsdc: 10_000n,
    },
    arbitrum: {
        key: 'arbitrum',
        name: 'Arbitrum Sepolia',
        domain: 3,
        chainIdHex: '0x66eee',
        chainIdDecimal: 421614,
        usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        rpcUrl: alchemyRpc('arb-sepolia', 'https://sepolia-rollup.arbitrum.io/rpc'),
        explorerUrl: 'https://sepolia.arbiscan.io/tx/',
        gasFeeUsdc: 10_000n,
    },
    polygon: {
        key: 'polygon',
        name: 'Polygon Amoy',
        domain: 7,
        chainIdHex: '0x13882',
        chainIdDecimal: 80002,
        usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
        nativeSymbol: 'POL',
        nativeDecimals: 18,
        rpcUrl: alchemyRpc('polygon-amoy', 'https://rpc-amoy.polygon.technology'),
        explorerUrl: 'https://amoy.polygonscan.com/tx/',
        gasFeeUsdc: 1_500n,
    },
    optimism: {
        key: 'optimism',
        name: 'OP Sepolia',
        domain: 2,
        chainIdHex: '0xaa37dc',
        chainIdDecimal: 11155420,
        usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
        rpcUrl: alchemyRpc('opt-sepolia', 'https://sepolia.optimism.io'),
        explorerUrl: 'https://sepolia-optimism.etherscan.io/tx/',
        gasFeeUsdc: 1_500n,
    },
};

export const GATEWAY_EVM_CHAINS: Record<GatewayEvmChainKey, GatewayEvmChainConfig> =
    GATEWAY_NETWORK_MODE === 'testnet' ? TESTNET_EVM_CHAINS : MAINNET_EVM_CHAINS;

export const GATEWAY_WALLET_EVM: Address =
    GATEWAY_NETWORK_MODE === 'testnet'
        ? '0x0077777d7EBA4688BDeF3E311b846F25870A19B9'
        : '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE';

export const GATEWAY_MINTER_EVM: Address =
    GATEWAY_NETWORK_MODE === 'testnet'
        ? '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B'
        : '0x2222222d7164433c4C09B0b0D809a9b52C04C205';

/** Solana gas fee in USDC subunits (same on testnet & mainnet per docs). */
export const GATEWAY_SOLANA_GAS_FEE_USDC: bigint = 150_000n; // $0.15

export const GATEWAY_API_BASE_URL =
    GATEWAY_NETWORK_MODE === 'testnet'
        ? 'https://gateway-api-testnet.circle.com/v1'
        : 'https://gateway-api.circle.com/v1';

/** Forwarding Service flat fee, in USDC subunits. */
export const GATEWAY_FORWARDER_FEE_USDC: bigint = 200_000n; // $0.20

/** Cross-chain transfer fee, expressed as numerator / denominator. */
export const GATEWAY_TRANSFER_FEE_NUM: bigint = 1n;
export const GATEWAY_TRANSFER_FEE_DEN: bigint = 20_000n; // 1 / 20_000 = 0.005%

export const GATEWAY_SOLANA_USDC_MINT_FOR_MODE: string =
    GATEWAY_NETWORK_MODE === 'testnet'
        ? GATEWAY_SOLANA_USDC_MINT.testnet
        : GATEWAY_SOLANA_USDC_MINT.mainnet;
