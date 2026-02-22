import { createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { walletConnect, coinbaseWallet, injected } from 'wagmi/connectors';

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error('VITE_REOWN_PROJECT_ID is not set');
}

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    walletConnect({ projectId }),
    coinbaseWallet({ appName: 'Hedwig Payments' }),
    injected(), // MetaMask and other injected wallets
  ],
  transports: {
    [base.id]: http(),
  },
});
