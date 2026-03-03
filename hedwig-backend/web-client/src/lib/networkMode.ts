export type RuntimeNetworkMode = 'mainnet' | 'testnet';
export type EvmPaymentChain = 'base' | 'baseSepolia' | 'celo';
export type SolanaCluster = 'mainnet-beta' | 'devnet';

const TESTNET_EVM_CHAIN_IDS = new Set<number>([
  84532, // Base Sepolia
  11155111, // Ethereum Sepolia
  44787, // Celo Alfajores
]);

export function getNetworkModeFromEvmChainId(chainId?: number | null): RuntimeNetworkMode {
  if (!chainId || !Number.isFinite(chainId)) return 'mainnet';
  return TESTNET_EVM_CHAIN_IDS.has(chainId) ? 'testnet' : 'mainnet';
}

export function resolveEvmChainForPayment(
  requested: EvmPaymentChain,
  mode: RuntimeNetworkMode
): EvmPaymentChain {
  if (requested === 'base' || requested === 'baseSepolia') {
    return mode === 'testnet' ? 'baseSepolia' : 'base';
  }
  return requested;
}

export function resolveSolanaCluster(mode: RuntimeNetworkMode): SolanaCluster {
  return mode === 'testnet' ? 'devnet' : 'mainnet-beta';
}

export const PAYMENT_CHAIN_REGISTRY = {
  base: { id: 'base', label: 'Base' },
  solana: { id: 'solana', label: 'Solana' },
  celo: { id: 'celo', label: 'Celo' },
  polygon: { id: 'polygon', label: 'Polygon' },
  arbitrum: { id: 'arbitrum', label: 'Arbitrum' },
} as const;

