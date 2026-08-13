import type { ComponentType } from 'react';
import { format, isToday, isYesterday, isValid } from 'date-fns';
import {
    Clock as ClockIcon,
    RotateCcw as RotateCcwIcon,
    CheckCircle as CheckCircleIcon,
    TriangleAlert as TriangleAlertIcon,
    X,
} from '../ui/AppIcon';
import type { ActivityItem, ActivityFilter, NetworkFilter, OfframpOrder } from './walletTypes';

// ─── Settlement chains ───────────────────────────────────────────────────────
export const SETTLEMENT_CHAINS = [
    { id: 'base',   name: 'EVM',    icon: require('../../assets/icons/tokens/eth.png') },
    { id: 'solana', name: 'Solana', icon: require('../../assets/icons/networks/solana.png') },
];

// ─── Chain icon map ──────────────────────────────────────────────────────────
export const CHAIN_ICON_MAP: Record<string, any> = {
    base:     require('../../assets/icons/networks/base.png'),
    solana:   require('../../assets/icons/networks/solana.png'),
    arbitrum: require('../../assets/icons/networks/arbitrum.png'),
    polygon:  require('../../assets/icons/networks/polygon.png'),
    optimism: require('../../assets/icons/networks/optimism.png'),
    celo:     require('../../assets/icons/networks/celo.png'),
};

export const getChainIcon = (chain: string) => CHAIN_ICON_MAP[chain?.toLowerCase()] ?? CHAIN_ICON_MAP['base'];

export const CHAIN_DISPLAY_NAMES: Record<string, string> = {
    base: 'Base', arbitrum: 'Arbitrum', polygon: 'Polygon',
    optimism: 'Optimism', celo: 'Celo', solana: 'Solana',
};

// ─── Activity icons ──────────────────────────────────────────────────────────
export const ACTIVITY_ICONS = {
    usdc:    require('../../assets/icons/tokens/usdc.png'),
    base:    require('../../assets/icons/networks/base.png'),
    solana:  require('../../assets/icons/networks/solana.png'),
    arbitrum:require('../../assets/icons/networks/arbitrum.png'),
    polygon: require('../../assets/icons/networks/polygon.png'),
    optimism:require('../../assets/icons/networks/optimism.png'),
    celo:    require('../../assets/icons/networks/celo.png'),
    send:    require('../../assets/icons/status/send.png'),
    receive: require('../../assets/icons/status/receive.png'),
};

export const ACTIVITY_CHAINS: Record<string, { name: string; icon: any }> = {
    base:     { name: 'Base',     icon: ACTIVITY_ICONS.base },
    solana:   { name: 'Solana',   icon: ACTIVITY_ICONS.solana },
    arbitrum: { name: 'Arbitrum', icon: ACTIVITY_ICONS.arbitrum },
    polygon:  { name: 'Polygon',  icon: ACTIVITY_ICONS.polygon },
    optimism: { name: 'Optimism', icon: ACTIVITY_ICONS.optimism },
    celo:     { name: 'Celo',     icon: ACTIVITY_ICONS.celo },
    // Offramp uses uppercase chain keys
    BASE:     { name: 'Base',     icon: ACTIVITY_ICONS.base },
    SOLANA:   { name: 'Solana',   icon: ACTIVITY_ICONS.solana },
    ARBITRUM: { name: 'Arbitrum', icon: ACTIVITY_ICONS.arbitrum },
    POLYGON:  { name: 'Polygon',  icon: ACTIVITY_ICONS.polygon },
    OPTIMISM: { name: 'Optimism', icon: ACTIVITY_ICONS.optimism },
    CELO:     { name: 'Celo',     icon: ACTIVITY_ICONS.celo },
};

// ─── Withdrawal status config ────────────────────────────────────────────────
export const WITHDRAWAL_STATUS_CONFIG: Record<string, { color: string; label: string; Icon: ComponentType<any> }> = {
    PENDING:    { color: '#F59E0B', label: 'Pending',    Icon: (p: any) => <ClockIcon {...p} /> },
    PROCESSING: { color: '#3B82F6', label: 'Processing', Icon: (p: any) => <RotateCcwIcon {...p} /> },
    COMPLETED:  { color: '#10B981', label: 'Completed',  Icon: (p: any) => <CheckCircleIcon {...p} /> },
    FAILED:     { color: '#EF4444', label: 'Failed',     Icon: (p: any) => <TriangleAlertIcon {...p} /> },
    CANCELLED:  { color: '#6B7280', label: 'Cancelled',  Icon: (p: any) => <X {...p} /> },
};

export const NETWORK_FILTER_OPTIONS: Array<{ id: NetworkFilter; label: string; sublabel: string; icon?: any }> = [
    { id: 'all', label: 'All networks', sublabel: 'Show balances across every supported network' },
    { id: 'base', label: 'Base', sublabel: 'Base balances', icon: CHAIN_ICON_MAP.base },
    { id: 'arbitrum', label: 'Arbitrum', sublabel: 'Arbitrum balances', icon: CHAIN_ICON_MAP.arbitrum },
    { id: 'polygon', label: 'Polygon', sublabel: 'Polygon balances', icon: CHAIN_ICON_MAP.polygon },
    { id: 'optimism', label: 'Optimism', sublabel: 'Optimism balances', icon: CHAIN_ICON_MAP.optimism },
    { id: 'solana', label: 'Solana', sublabel: 'Solana balances', icon: CHAIN_ICON_MAP.solana },
];

export const getNetworkFilterLabel = (filter: NetworkFilter): string =>
    NETWORK_FILTER_OPTIONS.find(option => option.id === filter)?.label || 'All networks';

export const ACTIVITY_FILTER_OPTIONS: Array<{ id: ActivityFilter; label: string; sublabel: string }> = [
    { id: 'all', label: 'All', sublabel: 'Show every wallet activity item' },
    { id: 'in', label: 'Received', sublabel: 'Incoming transfers and bought USDC' },
    { id: 'out', label: 'Sent', sublabel: 'Outgoing wallet transfers' },
    { id: 'withdrawals', label: 'Withdrawals', sublabel: 'Bank cash-out activity' },
    { id: 'onramps', label: 'Buy USDC', sublabel: 'Fiat deposits and USDC purchases' },
    { id: 'failed', label: 'Failed', sublabel: 'Failed or cancelled activity' },
];

export const getActivityFilterLabel = (filter: ActivityFilter): string =>
    ACTIVITY_FILTER_OPTIONS.find(option => option.id === filter)?.label || 'All';

export const WALLET_ACTIVITY_RENDER_LIMIT = 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string') return 0;
    const normalized = value.replace(/,/g, '').trim();
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const MAINSTREAM_ACTIVITY_TOKENS = new Set([
    'USDC',
    'USDC.E',
    'ETH',
    'WETH',
    'SOL',
    'POL',
    'MATIC',
    'CELO',
    'USD',
    'USDT',
]);

const SUSPICIOUS_TOKEN_PATTERNS = [
    'http',
    'www',
    '.com',
    '.net',
    '.org',
    '.io',
    '.app',
    '.site',
    '.top',
    '.link',
    '.click',
    '.xyz',
    '://',
    'claim',
    'airdrop',
    'reward',
    'bonus',
    'visit',
    'voucher',
    'coupon',
    'prize',
    'winner',
    'free',
    'swap',
    'scam',
    'phish',
    'verify',
    'connect',
    'official',
];

const KNOWN_SPAM_ZERO_ADDRESSES = new Set([
    '0x0000000000000000000000000000000000000000',
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
]);

const pickFirstNumber = (...values: unknown[]): number | null => {
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const parsed = toNumber(value);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return null;
};

const stringContainsSuspiciousPattern = (...values: unknown[]): boolean =>
    values.some(value => {
        const lower = String(value || '').trim().toLowerCase();
        if (!lower) return false;
        return SUSPICIOUS_TOKEN_PATTERNS.some(pattern => lower.includes(pattern));
    });

const isMainstreamActivityToken = (token: unknown): boolean => {
    const normalized = String(token || '').trim().toUpperCase();
    if (!normalized) return false;
    const lower = normalized.toLowerCase();
    if (SUSPICIOUS_TOKEN_PATTERNS.some(pattern => lower.includes(pattern))) return false;
    return MAINSTREAM_ACTIVITY_TOKENS.has(normalized);
};

export const getActivityUsdValue = (item: ActivityItem): number | null => {
    if (item.kind === 'tx') {
        const tx = item.data as any;
        const explicitUsd = pickFirstNumber(
            tx.amountUsd,
            tx.amount_usd,
            tx.usdAmount,
            tx.usd_amount,
            tx.valueUsd,
            tx.value_usd,
            tx.displayValueUsd,
            tx.display_value_usd,
            tx.display_values?.usd,
            tx.metadata?.valueUsd,
            tx.metadata?.usd
        );
        if (explicitUsd !== null) return explicitUsd;

        const token = item.data.token?.toUpperCase?.() || '';
        const amount = toNumber(item.data.amount);
        if (['USDC', 'USDT', 'USD'].includes(token)) return amount;
        if (['ETH', 'WETH', 'SOL', 'POL', 'MATIC', 'CELO'].includes(token)) {
            return amount < 0.10 ? amount : null;
        }
        return amount;
    }
    if (item.kind === 'withdrawal') return toNumber(item.data.fiatAmount);
    if (item.kind === 'onramp') return toNumber(item.data.cryptoAmount);
    if (item.kind === 'usd') return toNumber(item.data.netUsd || item.data.grossUsd);
    if (item.kind === 'coinbase') {
        if (typeof item.data.fiatAmount === 'number') return item.data.fiatAmount;
        const amount = toNumber(item.data.cryptoAmount);
        return String(item.data.token || '').toUpperCase() === 'USDC' ? amount : amount;
    }
    return null;
};

export const normalizeUsdTransferStatus = (status?: string | null): keyof typeof WITHDRAWAL_STATUS_CONFIG => {
    const key = String(status || 'PENDING').trim().toUpperCase();
    if (key in WITHDRAWAL_STATUS_CONFIG) return key as keyof typeof WITHDRAWAL_STATUS_CONFIG;
    if (key === 'SUCCESS' || key === 'SETTLED') return 'COMPLETED';
    if (key === 'ERROR') return 'FAILED';
    return 'PENDING';
};

export const isUnusualInboundActivity = (item: ActivityItem): boolean => {
    if (item.kind !== 'tx' || item.data.type !== 'IN') return false;
    const tx = item.data as any;
    const token = String(tx.token || '').trim();
    const contractAddress = String(tx.contractAddress || tx.contract_address || tx.rawContract?.address || '').toLowerCase();
    const description = String(tx.description || '').trim();
    const from = String(tx.from || '').toLowerCase();

    if (stringContainsSuspiciousPattern(token, description, tx.tokenName, tx.asset, tx.symbol)) return true;
    if (KNOWN_SPAM_ZERO_ADDRESSES.has(contractAddress) || KNOWN_SPAM_ZERO_ADDRESSES.has(from)) return true;
    if (!isMainstreamActivityToken(token)) return true;

    return false;
};

export const getTokenBalance = (entry: any, decimals: number): number => {
    const displayToken = toNumber(entry?.display_values?.token);
    if (displayToken > 0) return displayToken;
    const rawValue = entry?.raw_value;
    if (typeof rawValue === 'string' && rawValue.length > 0) {
        const parsedRaw = Number(rawValue);
        if (Number.isFinite(parsedRaw) && parsedRaw > 0) return parsedRaw / Math.pow(10, decimals);
    }
    return 0;
};

export const parseFeatureFlag = (value: string | undefined, fallback = false): boolean => {
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
    return fallback;
};

export const parseOptionalNumber = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = toNumber(value);
    return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeOfframpStatus = (
    rawStatus: unknown,
    txHash?: unknown,
    completedAt?: unknown
): OfframpOrder['status'] => {
    const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
    const hasEvidence = Boolean(
        (typeof txHash === 'string' && txHash.trim().length > 0) ||
        (typeof completedAt === 'string' && completedAt.trim().length > 0)
    );
    let normalized: OfframpOrder['status'] = 'PROCESSING';
    switch (status) {
        case 'pending': case 'initiated': normalized = 'PENDING'; break;
        case 'processing': case 'in_progress': case 'submitted': case 'queued': normalized = 'PROCESSING'; break;
        case 'completed': case 'settled': case 'success': case 'validated': case 'paid': case 'done': normalized = 'COMPLETED'; break;
        case 'failed': case 'expired': case 'refunded': case 'reversed': case 'rejected': case 'error': normalized = 'FAILED'; break;
        case 'cancelled': case 'canceled': normalized = 'CANCELLED'; break;
        default: normalized = hasEvidence ? 'COMPLETED' : 'PROCESSING'; break;
    }
    if ((normalized === 'FAILED' || normalized === 'CANCELLED') && hasEvidence) return 'COMPLETED';
    return normalized;
};

export const groupByDate = <T,>(
    items: T[],
    getDate: (item: T) => Date
): { title: string; data: T[] }[] =>
    items.reduce((acc, item) => {
        const date = getDate(item);
        if (!isValid(date)) return acc;
        let title = format(date, 'MMM d');
        if (isToday(date)) title = 'Today';
        if (isYesterday(date)) title = 'Yesterday';
        const existing = acc.find(s => s.title === title);
        if (existing) existing.data.push(item);
        else acc.push({ title, data: [item] });
        return acc;
    }, [] as { title: string; data: T[] }[]);

/** Formats a Date-like value for display, returning '' when the value is invalid. */
export const safeFormatDate = (value: string | Date | null | undefined, formatString: string): string => {
    if (!value) return '';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (!isValid(date)) return '';
    try {
        return format(date, formatString);
    } catch {
        return '';
    }
};