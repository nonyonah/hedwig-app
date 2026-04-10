export type RuntimeNetworkMode = 'mainnet' | 'testnet';
export type EvmPaymentChain =
  | 'base' | 'baseSepolia'
  | 'arbitrum' | 'arbitrumSepolia'
  | 'polygon' | 'polygonAmoy'
  | 'celo' | 'celoAlfajores'
  | 'lisk' | 'liskSepolia';
export type SolanaCluster = 'mainnet' | 'devnet';
export type PublicSettlementChain = 'base' | 'solana' | 'arbitrum' | 'polygon' | 'celo' | 'lisk';
export type PublicPaymentToken = 'USDC' | 'USDT' | 'ETH';

/** Read once at module load — flip NEXT_PUBLIC_NETWORK_MODE=testnet to use testnets */
export const NETWORK_MODE: RuntimeNetworkMode =
  (process.env.NEXT_PUBLIC_NETWORK_MODE as RuntimeNetworkMode) === 'testnet'
    ? 'testnet'
    : 'mainnet';

export const EVM_TOKENS = {
  // Base (Mainnet)
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  },
  // Base Sepolia (Testnet)
  baseSepolia: {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    USDT: '0x4fada1e00ab72bF65e8d5e8D51bEB6Bba20c4AB7',
  },
  // Arbitrum One (Mainnet)
  arbitrum: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
  // Arbitrum Sepolia (Testnet)
  arbitrumSepolia: {
    USDC: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    USDT: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // no official testnet USDT — use USDC addr as fallback
  },
  // Polygon PoS (Mainnet)
  polygon: {
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  },
  // Polygon Amoy (Testnet)
  polygonAmoy: {
    USDC: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    USDT: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // no official testnet USDT on Amoy
  },
  // Celo (Mainnet)
  celo: {
    USDC: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    USDT: '0x617f3112bf5397D0F8fbe1F4018F1C4F6e97a15d',
  },
  // Celo Alfajores (Testnet)
  celoAlfajores: {
    USDC: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
    USDT: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B', // no official testnet USDT on Alfajores
  },
  // Lisk (Mainnet)
  lisk: {
    USDC: '0xF242275d3a6527d877f2c927a082D53D7413691e',
    USDT: '0x05D032ac25d322df992303dCa074EE7392C117b9',
  },
  // Lisk Sepolia (Testnet)
  liskSepolia: {
    USDC: '0xF242275d3a6527d877f2c927a082D53D7413691e', // placeholder — update when official testnet token is deployed
    USDT: '0x05D032ac25d322df992303dCa074EE7392C117b9', // placeholder
  },
} as const;

export const SOLANA_TOKENS = {
  mainnet: {
    USDC: 'EPjFWdd5Au7B7WqSqqxS7ZkFvCPScoqB9Ko6z8bn8js',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  },
  devnet: {
    USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    USDT: 'EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS',
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
  lisk:            1135,
  liskSepolia:     4202,
};

const TESTNET_EVM_CHAIN_IDS = new Set<number>([
  84532,   // Base Sepolia
  421614,  // Arbitrum Sepolia
  80002,   // Polygon Amoy
  44787,   // Celo Alfajores
  4202,    // Lisk Sepolia
  11155111, // Ethereum Sepolia
]);

/** Map a mainnet chain to its testnet equivalent */
const TESTNET_CHAIN_MAP: Partial<Record<EvmPaymentChain, EvmPaymentChain>> = {
  base:     'baseSepolia',
  arbitrum: 'arbitrumSepolia',
  polygon:  'polygonAmoy',
  celo:     'celoAlfajores',
  lisk:     'liskSepolia',
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
    lisk:        `https://blockscout.lisk.com/tx/${hash}`,
    liskSepolia: `https://sepolia-blockscout.lisk.com/tx/${hash}`,
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
  if (combined.includes('lisk')) return 'lisk';
  return 'base';
}
