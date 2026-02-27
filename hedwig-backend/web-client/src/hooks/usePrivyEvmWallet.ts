import { useMemo } from 'react';
import { useAccount, useConnect, useSwitchChain } from 'wagmi';
import { base } from 'viem/chains';

export function usePrivyEvmWallet() {
  const { address, chainId, connector, isConnected, isConnecting } = useAccount();
  const { connectAsync, connectors, isPending: isConnectPending } = useConnect();
  const { switchChainAsync } = useSwitchChain();

  const connectEvmWallet = async () => {
    const preferredConnector =
      connectors.find((item) => item.id === 'injected') ||
      connectors.find((item) => item.id === 'coinbaseWalletSDK') ||
      connectors[0];

    if (!preferredConnector) {
      throw new Error('No EVM wallet connector is available.');
    }

    await connectAsync({
      connector: preferredConnector,
      chainId: base.id,
    });
  };

  const evmWallet = useMemo(() => {
    if (!isConnected || !connector) return null;

    return {
      switchChain: async (targetChainId: number) => {
        await switchChainAsync({ chainId: targetChainId });
      },
      getEthereumProvider: async () => {
        return (await connector.getProvider()) as any;
      },
    };
  }, [connector, isConnected, switchChainAsync]);

  return {
    ready: !isConnecting && !isConnectPending,
    evmWallet,
    address,
    chainId,
    connectEvmWallet,
  };
}
