import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';

// Define chains
const base = {
    id: 8453,
    name: 'Base',
    network: 'base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://mainnet.base.org'] },
        public: { http: ['https://mainnet.base.org'] },
    },
    blockExplorers: {
        default: { name: 'BaseScan', url: 'https://basescan.org' },
    },
} as const;

const baseSepolia = {
    id: 84532,
    name: 'Base Sepolia',
    network: 'base-sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://sepolia.base.org'] },
        public: { http: ['https://sepolia.base.org'] },
    },
    blockExplorers: {
        default: { name: 'BaseScan', url: 'https://sepolia.basescan.org' },
    },
} as const;

const celo = {
    id: 42220,
    name: 'Celo',
    network: 'celo',
    nativeCurrency: { name: 'Celo', symbol: 'CELO', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://forno.celo.org'] },
        public: { http: ['https://forno.celo.org'] },
    },
    blockExplorers: {
        default: { name: 'CeloScan', url: 'https://celoscan.io' },
    },
} as const;

// Get project ID from environment variable
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || '';

if (!projectId) {
    console.warn('⚠️ VITE_REOWN_PROJECT_ID is not set. Please add it to your .env file.');
    console.warn('Get your project ID at: https://dashboard.reown.com');
}

// Create ethers adapter
const ethersAdapter = new EthersAdapter();

// Create and export the AppKit instance
export const appKit = createAppKit({
    projectId,
    networks: [base, baseSepolia, celo],
    defaultNetwork: base,
    adapters: [ethersAdapter],
    metadata: {
        name: 'Hedwig',
        description: 'Secure crypto payments for freelancers',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://hedwigbot.xyz',
        icons: ['https://hedwigbot.xyz/icon.png'],
    },
    features: {
        analytics: true,
        email: false, // Disable email authentication
        socials: false, // Disable social authentication (Google, Apple, etc.)
    },
    themeVariables: {
        '--w3m-font-family': '"Rethink Sans", sans-serif',
    },
});

// Export chains for use in payment processing
export const CHAINS = {
    base,
    baseSepolia,
    celo,
} as const;

// Token addresses
export const TOKENS = {
    base: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    },
    baseSepolia: {
        USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    },
    celo: {
        USDC: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
        cUSD: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
    },
} as const;

// HedwigPayment contract ABI (handles 99%/1% fee split atomically)
export const HEDWIG_PAYMENT_ABI = [
    'function pay(address token, uint256 amount, address freelancer, string calldata invoiceId) external',
];

// HedwigPayment contract addresses per chain
export const HEDWIG_CONTRACTS = {
    base: '0x1c0A0eFBb438cc7705b947644F6AB88698b2704F', // HedwigPayment on Base Sepolia (use same for now)
    baseSepolia: '0x1c0A0eFBb438cc7705b947644F6AB88698b2704F', // HedwigPayment on Base Sepolia
    celo: '0xF1c485Ba184262F1EAC91584f6B26fdcaa3F794a', // HedwigPayment on Celo Alfajores
} as const;

