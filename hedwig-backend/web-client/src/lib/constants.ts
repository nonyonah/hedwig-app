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

export const SOLANA_TOKENS = {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Mainnet USDC
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;

export const SOLANA_RPC = 'https://api.devnet.solana.com';

export const HEDWIG_CONTRACTS = {
    base: '0x1c0A0eFBb438cc7705b947644F6AB88698b2704F',
    baseSepolia: '0x1c0A0eFBb438cc7705b947644F6AB88698b2704F',
    celo: '0xF1c485Ba184262F1EAC91584f6B26fdcaa3F794a',
} as const;
