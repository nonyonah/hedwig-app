export type SendChain = 'base' | 'solana';

export interface SendTokenOption {
    id: string;
    chain: SendChain;
    chainLabel: string;
    asset: 'usdc' | 'eth' | 'sol';
    token: string;
    name: string;
    decimals: number;
    tokenIcon: any;
    chainIcon: any;
}

export const SEND_TOKEN_OPTIONS: SendTokenOption[] = [
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
    if (isLikelyEvmAddress(value)) return 'base';
    if (isLikelySolanaAddress(value)) return 'solana';
    return null;
};

export const getTokenOptionsForChain = (chain: SendChain): SendTokenOption[] =>
    SEND_TOKEN_OPTIONS.filter((option) => option.chain === chain);

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
