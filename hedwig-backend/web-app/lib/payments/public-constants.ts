export type RuntimeNetworkMode = 'mainnet' | 'testnet';
export type EvmPaymentChain = 'base' | 'baseSepolia';
export type SolanaCluster = 'mainnet' | 'devnet';
export type PublicSettlementChain = 'base' | 'solana';
export type PublicPaymentToken = 'USDC' | 'ETH';

export const EVM_TOKENS = {
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  },
  baseSepolia: {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  }
} as const;

export const SOLANA_TOKENS = {
  mainnet: {
    USDC: 'EPjFWdd5Au7B7WqSqqxS7ZkFvCPScoqB9Ko6z8bn8js'
  },
  devnet: {
    USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
  }
} as const;

const TESTNET_EVM_CHAIN_IDS = new Set<number>([
  84532, // Base Sepolia
  11155111, // Ethereum Sepolia
  44787 // Celo Alfajores
]);

export function getNetworkModeFromEvmChainId(chainId?: number | null): RuntimeNetworkMode {
  if (!chainId || !Number.isFinite(chainId)) return 'mainnet';
  return TESTNET_EVM_CHAIN_IDS.has(chainId) ? 'testnet' : 'mainnet';
}

export function resolveEvmChainForPayment(mode: RuntimeNetworkMode): EvmPaymentChain {
  return mode === 'testnet' ? 'baseSepolia' : 'base';
}

export function getChainId(chain: EvmPaymentChain): number {
  return chain === 'baseSepolia' ? 84532 : 8453;
}

export function getExplorerUrl(chain: EvmPaymentChain, hash: string) {
  return chain === 'baseSepolia'
    ? `https://sepolia.basescan.org/tx/${hash}`
    : `https://basescan.org/tx/${hash}`;
}

export function getSolanaExplorerUrl(cluster: SolanaCluster, hash: string) {
  return cluster === 'devnet'
    ? `https://explorer.solana.com/tx/${hash}?cluster=devnet`
    : `https://explorer.solana.com/tx/${hash}`;
}

export function resolvePublicSettlementChain(rawChain?: string | null, fallbackHint?: string | null): PublicSettlementChain {
  const combined = `${rawChain || ''} ${fallbackHint || ''}`.toLowerCase();
  if (combined.includes('solana') || combined.includes('sol')) {
    return 'solana';
  }
  return 'base';
}
