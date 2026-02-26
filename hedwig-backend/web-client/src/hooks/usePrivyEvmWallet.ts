import { useMemo } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import type { ConnectedWallet } from '@privy-io/react-auth';

function getNumericChainId(caipChainId: string | undefined): number | undefined {
  if (!caipChainId) return undefined;
  const parts = caipChainId.split(':');
  if (parts.length < 2) return undefined;
  const parsed = Number(parts[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function usePrivyEvmWallet() {
  const { connectWallet } = usePrivy();
  const { wallets, ready } = useWallets();

  const evmWallet = useMemo(() => {
    return wallets.find((wallet): wallet is ConnectedWallet => wallet.type === 'ethereum');
  }, [wallets]);

  const connectEvmWallet = () => {
    connectWallet({ walletChainType: 'ethereum-only' });
  };

  return {
    ready,
    evmWallet,
    address: evmWallet?.address,
    chainId: getNumericChainId(evmWallet?.chainId),
    connectEvmWallet,
  };
}
