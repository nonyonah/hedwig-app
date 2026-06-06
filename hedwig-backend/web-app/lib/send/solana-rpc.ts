/**
 * Returns the configured Solana RPC URL. Falls back to clusterApiUrl if not set.
 * Set NEXT_PUBLIC_SOLANA_RPC_URL in your .env to use a dedicated RPC provider.
 */
export function getSolanaRpcUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (envUrl) return envUrl;

  const isDevnet = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet';
  if (isDevnet) {
    const devnet = process.env.NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL;
    if (devnet) return devnet;
    return 'https://api.devnet.solana.com';
  }

  return 'https://api.mainnet-beta.solana.com';
}
