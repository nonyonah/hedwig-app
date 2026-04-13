export type RuntimeNetworkMode = 'mainnet' | 'testnet';
export type EvmPaymentChain =
  | 'base' | 'baseSepolia'
  | 'arbitrum' | 'arbitrumSepolia'
  | 'polygon' | 'polygonAmoy'
  | 'celo' | 'celoAlfajores';
export type SolanaCluster = 'mainnet' | 'devnet';
export type PublicSettlementChain = 'base' | 'solana' | 'arbitrum' | 'polygon' | 'celo';
export type PublicPaymentToken = 'USDC';

/** Read once at module load — flip NEXT_PUBLIC_NETWORK_MODE=testnet to use testnets */
export const NETWORK_MODE: RuntimeNetworkMode =
  (process.env.NEXT_PUBLIC_NETWORK_MODE as RuntimeNetworkMode) === 'testnet'
    ? 'testnet'
    : 'mainnet';

export const EVM_TOKENS = {
  // Base (Mainnet)
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  // Base Sepolia (Testnet)
  baseSepolia: {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  // Arbitrum One (Mainnet)
  arbitrum: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  // Arbitrum Sepolia (Testnet)
  arbitrumSepolia: {
    USDC: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  },
  // Polygon PoS (Mainnet)
  polygon: {
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  },
  // Polygon Amoy (Testnet)
  polygonAmoy: {
    USDC: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  },
  // Celo (Mainnet)
  celo: {
    USDC: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  },
  // Celo Alfajores (Testnet)
  celoAlfajores: {
    USDC: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
  },
} as const;

export const SOLANA_TOKENS = {
  mainnet: {
    USDC: 'EPjFWdd5Au7B7WqSqqxS7ZkFvCPScoqB9Ko6z8bn8js',
  },
  devnet: {
    USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  },
} as const;

/** Chain IDs */
export const EVM_CHAIN_IDS: Record<EvmPaymentChain, number> = {
  base:            8453,
  baseSepolia:     84532,
  arbitrum:        42161,
  arbitrumSepolia: 421614,
  polygon:         137,
  polygonAmoy:     80002,
  celo:            42220,
  celoAlfajores:   44787,
};

const TESTNET_EVM_CHAIN_IDS = new Set<number>([
  84532,   // Base Sepolia
  421614,  // Arbitrum Sepolia
  80002,   // Polygon Amoy
  44787,   // Celo Alfajores
  11155111, // Ethereum Sepolia
]);

/** Map a mainnet chain to its testnet equivalent */
const TESTNET_CHAIN_MAP: Partial<Record<EvmPaymentChain, EvmPaymentChain>> = {
  base:     'baseSepolia',
  arbitrum: 'arbitrumSepolia',
  polygon:  'polygonAmoy',
  celo:     'celoAlfajores',
};

export function getNetworkModeFromEvmChainId(chainId?: number | null): RuntimeNetworkMode {
  if (!chainId || !Number.isFinite(chainId)) return 'mainnet';
  return TESTNET_EVM_CHAIN_IDS.has(chainId) ? 'testnet' : 'mainnet';
}

export function resolveEvmChainForPayment(mode: RuntimeNetworkMode): EvmPaymentChain {
  return mode === 'testnet' ? 'baseSepolia' : 'base';
}

/**
 * Resolve the target chain for payment, honouring testnet mode.
 * If NEXT_PUBLIC_NETWORK_MODE=testnet, each mainnet chain maps to its testnet equivalent.
 */
export function resolvePaymentChain(chain: PublicSettlementChain): EvmPaymentChain | 'solana' {
  if (chain === 'solana') return 'solana';
  if (NETWORK_MODE === 'testnet') {
    return TESTNET_CHAIN_MAP[chain as EvmPaymentChain] ?? (chain as EvmPaymentChain);
  }
  return chain as EvmPaymentChain;
}

export function getSolanaCluster(): SolanaCluster {
  return NETWORK_MODE === 'testnet' ? 'devnet' : 'mainnet';
}

export function getChainId(chain: EvmPaymentChain): number {
  return EVM_CHAIN_IDS[chain] ?? 8453;
}

export function getExplorerUrl(chain: EvmPaymentChain, hash: string) {
  const explorers: Record<EvmPaymentChain, string> = {
    base:        `https://basescan.org/tx/${hash}`,
    baseSepolia: `https://sepolia.basescan.org/tx/${hash}`,
    arbitrum:    `https://arbiscan.io/tx/${hash}`,
    arbitrumSepolia: `https://sepolia.arbiscan.io/tx/${hash}`,
    polygon:     `https://polygonscan.com/tx/${hash}`,
    polygonAmoy: `https://amoy.polygonscan.com/tx/${hash}`,
    celo:        `https://celoscan.io/tx/${hash}`,
    celoAlfajores: `https://alfajores.celoscan.io/tx/${hash}`,
  };
  return explorers[chain] ?? `https://basescan.org/tx/${hash}`;
}

export function getSolanaExplorerUrl(cluster: SolanaCluster, hash: string) {
  return cluster === 'devnet'
    ? `https://explorer.solana.com/tx/${hash}?cluster=devnet`
    : `https://explorer.solana.com/tx/${hash}`;
}

export function resolvePublicSettlementChain(rawChain?: string | null, fallbackHint?: string | null): PublicSettlementChain {
  const combined = `${rawChain || ''} ${fallbackHint || ''}`.toLowerCase();
  if (combined.includes('solana') || combined.includes('sol')) return 'solana';
  if (combined.includes('arbitrum') || combined.includes('arb')) return 'arbitrum';
  if (combined.includes('polygon') || combined.includes('matic')) return 'polygon';
  if (combined.includes('celo')) return 'celo';
  return 'base';
}
