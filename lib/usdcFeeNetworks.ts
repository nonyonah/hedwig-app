export type NetworkMode = 'mainnet' | 'testnet';
export type EvmUsdcChain = 'base' | 'arbitrum' | 'polygon' | 'celo';

// Lightweight chain config used by legacy UI (chain badges, deposit screen,
// explorer links). Primary USDC payment routing is now handled through
// Circle Gateway in lib/gateway/* — this file no longer carries gas-provider
// metadata or paymaster flags.
export type ChainConfig = {
    key: EvmUsdcChain;
    name: string;
    chainId: string;
    chainIdDecimal: number;
    rpcUrl: string;
    explorerUrl: string;
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: 18;
    };
    usdcAddress: string;
};

export const NETWORK_MODE: NetworkMode =
    process.env.EXPO_PUBLIC_NETWORK_MODE === 'testnet' ? 'testnet' : 'mainnet';

export const SOLANA_CLUSTER = NETWORK_MODE === 'testnet' ? 'devnet' : 'mainnet-beta';

export const SOLANA_USDC_MINT =
    SOLANA_CLUSTER === 'devnet'
        ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
        : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const ALCHEMY_API_KEY = String(process.env.EXPO_PUBLIC_ALCHEMY_API_KEY || '').replace(/^"|"$/g, '').trim();
const alchemyRpc = (network: string, fallback: string): string => (
    ALCHEMY_API_KEY ? `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : fallback
);

const MAINNET_CHAINS: Record<EvmUsdcChain, ChainConfig> = {
    base: {
        key: 'base',
        name: 'Base',
        chainId: '0x2105',
        chainIdDecimal: 8453,
        rpcUrl: 'https://base-mainnet.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up',
        explorerUrl: 'https://basescan.org/tx/',
        nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
        usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
    arbitrum: {
        key: 'arbitrum',
        name: 'Arbitrum',
        chainId: '0xa4b1',
        chainIdDecimal: 42161,
        rpcUrl: 'https://arb1.arbitrum.io/rpc',
        explorerUrl: 'https://arbiscan.io/tx/',
        nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
        usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    },
    polygon: {
        key: 'polygon',
        name: 'Polygon',
        chainId: '0x89',
        chainIdDecimal: 137,
        rpcUrl: 'https://polygon-rpc.com',
        explorerUrl: 'https://polygonscan.com/tx/',
        nativeCurrency: { name: 'Polygon', symbol: 'MATIC', decimals: 18 },
        usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    },
    celo: {
        key: 'celo',
        name: 'Celo',
        chainId: '0xa4ec',
        chainIdDecimal: 42220,
        rpcUrl: 'https://forno.celo.org',
        explorerUrl: 'https://celoscan.io/tx/',
        nativeCurrency: { name: 'Celo', symbol: 'CELO', decimals: 18 },
        usdcAddress: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    },
};

const TESTNET_CHAINS: Record<EvmUsdcChain, ChainConfig> = {
    base: {
        ...MAINNET_CHAINS.base,
        name: 'Base Sepolia',
        chainId: '0x14a34',
        chainIdDecimal: 84532,
        rpcUrl: alchemyRpc('base-sepolia', 'https://sepolia.base.org'),
        explorerUrl: 'https://sepolia.basescan.org/tx/',
        usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    },
    arbitrum: {
        ...MAINNET_CHAINS.arbitrum,
        name: 'Arbitrum Sepolia',
        chainId: '0x66eee',
        chainIdDecimal: 421614,
        rpcUrl: alchemyRpc('arb-sepolia', 'https://sepolia-rollup.arbitrum.io/rpc'),
        explorerUrl: 'https://sepolia.arbiscan.io/tx/',
        usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    },
    polygon: {
        ...MAINNET_CHAINS.polygon,
        name: 'Polygon Amoy',
        chainId: '0x13882',
        chainIdDecimal: 80002,
        rpcUrl: alchemyRpc('polygon-amoy', 'https://rpc-amoy.polygon.technology'),
        explorerUrl: 'https://amoy.polygonscan.com/tx/',
        usdcAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    },
    celo: {
        ...MAINNET_CHAINS.celo,
        name: 'Celo Alfajores',
        chainId: '0xaef3',
        chainIdDecimal: 44787,
        rpcUrl: alchemyRpc('celo-alfajores', 'https://alfajores-forno.celo-testnet.org'),
        explorerUrl: 'https://alfajores.celoscan.io/tx/',
        usdcAddress: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
    },
};

export const EVM_USDC_CHAINS = NETWORK_MODE === 'testnet' ? TESTNET_CHAINS : MAINNET_CHAINS;

export function normalizeEvmUsdcChain(network: string): EvmUsdcChain | null {
    const normalized = network.toLowerCase().trim();
    if (normalized.includes('base')) return 'base';
    if (normalized.includes('arbitrum') || normalized.includes('arb')) return 'arbitrum';
    if (normalized.includes('polygon') || normalized.includes('matic')) return 'polygon';
    if (normalized.includes('celo') || normalized.includes('alfajores')) return 'celo';
    return null;
}

export function getEvmUsdcChain(network: string): ChainConfig | null {
    const key = normalizeEvmUsdcChain(network);
    return key ? EVM_USDC_CHAINS[key] : null;
}

export function getChainAddParams(config: ChainConfig) {
    return {
        chainId: config.chainId,
        chainName: config.name,
        nativeCurrency: config.nativeCurrency,
        rpcUrls: [config.rpcUrl],
        blockExplorerUrls: [config.explorerUrl.replace(/\/tx\/?$/, '')],
    };
}

export function getFeeLabel(_config: ChainConfig | null): string {
    return 'Paid in USDC via Gateway';
}

export function getNativeFeeSymbol(config: ChainConfig | null): string {
    return config?.nativeCurrency.symbol || 'gas';
}

export function getUsdcFeeEstimateFallback(_config: ChainConfig | null): string {
    return 'Paid in USDC via Gateway';
}
