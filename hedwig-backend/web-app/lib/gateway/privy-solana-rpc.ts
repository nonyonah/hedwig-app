import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';

const isTestnet = process.env.NEXT_PUBLIC_NETWORK_MODE === 'testnet';

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL
  || (isTestnet
    ? 'https://api.devnet.solana.com'
    : 'https://api.mainnet-beta.solana.com');

function wsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, 'ws').replace(/^https/, 'wss');
}

function entry(rpcUrl: string) {
  return {
    rpc: createSolanaRpc(rpcUrl),
    rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl(rpcUrl)),
  };
}

export function getPrivySolanaRpcs() {
  return {
    'solana:mainnet': entry(SOLANA_RPC),
    'solana:devnet': entry(SOLANA_RPC),
    'solana:testnet': entry(SOLANA_RPC),
  };
}
