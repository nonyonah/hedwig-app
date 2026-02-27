import { createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { walletConnect, coinbaseWallet, injected } from 'wagmi/connectors';

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
const baseSepoliaRpcUrl = import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const baseMainnetRpcUrl = import.meta.env.VITE_BASE_MAINNET_RPC_URL || 'https://mainnet.base.org';

export const wagmiConfig = createConfig({
  chains: [baseSepolia, base],
  connectors: [
    ...(projectId ? [walletConnect({ projectId })] : []),
    coinbaseWallet({ appName: 'Hedwig Payments' }),
    injected(),
  ],
  transports: {
    [baseSepolia.id]: http(baseSepoliaRpcUrl),
    [base.id]: http(baseMainnetRpcUrl),
  },
});
