export type SendChain = 'base' | 'solana' | 'arbitrum' | 'polygon' | 'celo' | 'lisk';

export const EVM_CHAINS = new Set<SendChain>(['base', 'arbitrum', 'polygon', 'celo', 'lisk']);

export interface SendTokenOption {
    id: string;
    chain: SendChain;
    chainLabel: string;
    asset: 'usdc' | 'usdt' | 'eth' | 'sol';
    token: string;
    name: string;
    decimals: number;
    tokenIcon: any;
    chainIcon: any;
}

export const SEND_TOKEN_OPTIONS: SendTokenOption[] = [
    // Base
    {
        id: 'base-usdc',
        chain: 'base',
        chainLabel: 'Base',
        asset: 'usdc',
        token: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        tokenIcon: require('../../assets/icons/tokens/usdc.png'),
        chainIcon: require('../../assets/icons/networks/base.png'),
    },
    {
        id: 'base-usdt',
        chain: 'base',
        chainLabel: 'Base',
        asset: 'usdt',
        token: 'USDT',
        name: 'Tether',
        decimals: 6,
        tokenIcon: require('../../assets/icons/tokens/usdt.png'),
        chainIcon: require('../../assets/icons/networks/base.png'),
    },
    {
        id: 'base-eth',
        chain: 'base',
        chainLabel: 'Base',
        asset: 'eth',
        token: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        tokenIcon: require('../../assets/icons/tokens/eth.png'),
        chainIcon: require('../../assets/icons/networks/base.png'),
    },
    // Arbitrum
    {
        id: 'arbitrum-usdc',
        chain: 'arbitrum',
        chainLabel: 'Arbitrum',
        asset: 'usdc',
        token: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        tokenIcon: require('../../assets/icons/tokens/usdc.png'),
        chainIcon: require('../../assets/icons/networks/arbitrum.png'),
    },
    {
        id: 'arbitrum-usdt',
        chain: 'arbitrum',
        chainLabel: 'Arbitrum',
        asset: 'usdt',
        token: 'USDT',
        name: 'Tether',
        decimals: 6,
        tokenIcon: require('../../assets/icons/tokens/usdt.png'),
        chainIcon: require('../../assets/icons/networks/arbitrum.png'),
    },
    {
        id: 'arbitrum-eth',
        chain: 'arbitrum',
        chainLabel: 'Arbitrum',
        asset: 'eth',
        token: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        tokenIcon: require('../../assets/icons/tokens/eth.png'),
        chainIcon: require('../../assets/icons/networks/arbitrum.png'),
    },
    // Polygon
    {
        id: 'polygon-usdc',
        chain: 'polygon',
        chainLabel: 'Polygon',
        asset: 'usdc',
        token: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        tokenIcon: require('../../assets/icons/tokens/usdc.png'),
        chainIcon: require('../../assets/icons/networks/polygon.png'),
    },
    {
        id: 'polygon-usdt',
        chain: 'polygon',
        chainLabel: 'Polygon',
        asset: 'usdt',
        token: 'USDT',
        name: 'Tether',
        decimals: 6,
        tokenIcon: require('../../assets/icons/tokens/usdt.png'),
        chainIcon: require('../../assets/icons/networks/polygon.png'),
    },
    // Celo
    {
        id: 'celo-usdc',
        chain: 'celo',
        chainLabel: 'Celo',
        asset: 'usdc',
        token: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        tokenIcon: require('../../assets/icons/tokens/usdc.png'),
        chainIcon: require('../../assets/icons/networks/celo.png'),
    },
    {
        id: 'celo-usdt',
        chain: 'celo',
        chainLabel: 'Celo',
        asset: 'usdt',
        token: 'USDT',
        name: 'Tether',
        decimals: 6,
        tokenIcon: require('../../assets/icons/tokens/usdt.png'),
        chainIcon: require('../../assets/icons/networks/celo.png'),
    },
    // Lisk (USDT only)
    {
        id: 'lisk-usdt',
        chain: 'lisk',
        chainLabel: 'Lisk',
        asset: 'usdt',
        token: 'USDT',
        name: 'Tether',
        decimals: 6,
        tokenIcon: require('../../assets/icons/tokens/usdt.png'),
        chainIcon: require('../../assets/icons/networks/lisk.png'),
    },
    // Solana
    {
        id: 'solana-usdc',
        chain: 'solana',
        chainLabel: 'Solana',
        asset: 'usdc',
        token: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        tokenIcon: require('../../assets/icons/tokens/usdc.png'),
        chainIcon: require('../../assets/icons/networks/solana.png'),
    },
    {
        id: 'solana-sol',
        chain: 'solana',
        chainLabel: 'Solana',
        asset: 'sol',
        token: 'SOL',
        name: 'Solana',
        decimals: 9,
        tokenIcon: require('../../assets/icons/networks/solana.png'),
        chainIcon: require('../../assets/icons/networks/solana.png'),
    },
];

export const isLikelyEvmAddress = (value: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(value.trim());

export const isLikelySolanaAddress = (value: string): boolean => {
    const trimmed = value.trim();
    if (trimmed.length < 32 || trimmed.length > 44) return false;
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed);
};

export const detectRecipientChain = (value: string): SendChain | null => {
    if (isLikelyEvmAddress(value)) return 'base'; // 'base' signals any EVM address
    if (isLikelySolanaAddress(value)) return 'solana';
    return null;
};

/**
 * For EVM addresses ('base' detected chain), returns tokens across ALL EVM chains.
 * For 'solana', returns Solana tokens only.
 * For a specific EVM chain, returns that chain's tokens only.
 */
export const getTokenOptionsForChain = (chain: SendChain): SendTokenOption[] => {
    if (chain === 'base') {
        // EVM address — show tokens from all EVM chains
        return SEND_TOKEN_OPTIONS.filter((o) => EVM_CHAINS.has(o.chain));
    }
    return SEND_TOKEN_OPTIONS.filter((option) => option.chain === chain);
};

export const isValidSendChain = (value: string): value is SendChain =>
    ['base', 'solana', 'arbitrum', 'polygon', 'celo', 'lisk'].includes(value);

export const shortenAddress = (value: string, start = 6, end = 4): string => {
    const trimmed = value.trim();
    if (trimmed.length <= start + end + 3) return trimmed;
    return `${trimmed.slice(0, start)}...${trimmed.slice(-end)}`;
};

export const parseNumeric = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string') return 0;
    const parsed = parseFloat(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
};
