import { useAccount, useDisconnect, useSwitchChain } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';

export function useWalletConnection() {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { open } = useAppKit();

  const connectWallet = async () => {
    open();
  };

  const disconnectWallet = async () => {
    disconnect();
  };

  const switchToChain = async (chainId: number) => {
    switchChain({ chainId });
  };

  return {
    address,
    isConnected,
    chainId: chain?.id,
    chainType: 'evm' as const,
    connectWallet,
    disconnectWallet,
    switchToChain,
  };
}
