import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, Platform, UIManager, Alert, Share, ToastAndroid, DeviceEventEmitter, Switch } from 'react-native';
let Menu: any = null;
let ExpoButton: any = null;
let Host: any = null;
if (Platform.OS === 'ios') {
    try {
        const SwiftUI = require('@expo/ui/swift-ui');
        Menu = SwiftUI.Menu;
        ExpoButton = SwiftUI.Button;
        Host = SwiftUI.Host;
    } catch (e) { }
}
import { TrueSheet } from '@hedwig/true-sheet';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, Colors } from '../../../theme/colors';
import { useSettings } from '../../../context/SettingsContext';
import { useAuth } from '../../../hooks/useAuth';
import { useWallet } from '../../../hooks/useWallet';
import { useGatewayBalance, formatGatewayUsdc } from '../../../hooks/useGatewayBalance';
import { useEoaUsdcAutoDeposit } from '../../../hooks/useEoaUsdcAutoDeposit';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Settings as Gear, Copy, QrCode,
    ChevronDown as CaretDown, ChevronLeft as CaretLeft,
    X, ArrowUp, Wallet as WalletIcon, ShieldCheck, ArrowRight,
    ArrowLeftRight as ArrowLeftRightIcon,
    Landmark as LandmarkIcon,
    Clock as ClockIcon,
    CheckCircle as CheckCircleIcon,
    TriangleAlert as TriangleAlertIcon,
    RotateCcw as RotateCcwIcon,
    ArrowUpRight as ArrowUpRightIcon,
    ArrowDownLeft as ArrowDownLeftIcon,
} from '../../../components/ui/AppIcon';
import QRCode from 'react-native-qrcode-svg';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { format, isToday, isYesterday } from 'date-fns';
import { getUserGradient } from '../../../utils/gradientUtils';
import { formatCurrency } from '../../../utils/currencyUtils';
import AndroidDropdownMenu from '../../../components/ui/AndroidDropdownMenu';
import IOSGlassIconButton from '../../../components/ui/IOSGlassIconButton';
import HeaderActionButtons from '../../../components/ui/HeaderActionButtons';
import { SelectorSheet } from '../../../components/SelectorSheet';
import TokenDetailSheet, { SelectedToken } from '../../../components/TokenDetailSheet';
import { createUsdKycLink, enrollUsdAccount, getUsdAccountDetails, getUsdAccountStatus, getUsdTransfers, UsdAccountDetails, UsdAccountStatus, UsdTransfer } from '../../wallet/usdAccountApi';
import { joinApiUrl } from '../../../utils/apiBaseUrl';
import type { OnrampOrder } from '../../../hooks/useOnramp';
import type { CoinbasePayActivitySession } from '../../../hooks/useCoinbasePay';

// ─── Settlement chains ───────────────────────────────────────────────────────
const SETTLEMENT_CHAINS = [
    { id: 'base',   name: 'EVM',    icon: require('../../../assets/icons/tokens/eth.png') },
    { id: 'solana', name: 'Solana', icon: require('../../../assets/icons/networks/solana.png') },
];

// ─── Chain icon map ──────────────────────────────────────────────────────────
const CHAIN_ICON_MAP: Record<string, any> = {
    base:     require('../../../assets/icons/networks/base.png'),
    solana:   require('../../../assets/icons/networks/solana.png'),
    arbitrum: require('../../../assets/icons/networks/arbitrum.png'),
    polygon:  require('../../../assets/icons/networks/polygon.png'),
    optimism: require('../../../assets/icons/networks/optimism.png'),
    celo:     require('../../../assets/icons/networks/celo.png'),
};

const getChainIcon = (chain: string) => CHAIN_ICON_MAP[chain?.toLowerCase()] ?? CHAIN_ICON_MAP['base'];

const CHAIN_DISPLAY_NAMES: Record<string, string> = {
    base: 'Base', arbitrum: 'Arbitrum', polygon: 'Polygon',
    optimism: 'Optimism', celo: 'Celo', solana: 'Solana',
};

// ─── Activity icons ──────────────────────────────────────────────────────────
const ACTIVITY_ICONS = {
    usdc:    require('../../../assets/icons/tokens/usdc.png'),
    base:    require('../../../assets/icons/networks/base.png'),
    solana:  require('../../../assets/icons/networks/solana.png'),
    arbitrum:require('../../../assets/icons/networks/arbitrum.png'),
    polygon: require('../../../assets/icons/networks/polygon.png'),
    optimism:require('../../../assets/icons/networks/optimism.png'),
    celo:    require('../../../assets/icons/networks/celo.png'),
    send:    require('../../../assets/icons/status/send.png'),
    receive: require('../../../assets/icons/status/receive.png'),
};

const ACTIVITY_CHAINS: Record<string, { name: string; icon: any }> = {
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
const WITHDRAWAL_STATUS_CONFIG: Record<string, { color: string; label: string; Icon: React.ComponentType<any> }> = {
    PENDING:    { color: '#F59E0B', label: 'Pending',    Icon: (p: any) => <ClockIcon {...p} /> },
    PROCESSING: { color: '#3B82F6', label: 'Processing', Icon: (p: any) => <RotateCcwIcon {...p} /> },
    COMPLETED:  { color: '#10B981', label: 'Completed',  Icon: (p: any) => <CheckCircleIcon {...p} /> },
    FAILED:     { color: '#EF4444', label: 'Failed',     Icon: (p: any) => <TriangleAlertIcon {...p} /> },
    CANCELLED:  { color: '#6B7280', label: 'Cancelled',  Icon: (p: any) => <X {...p} /> },
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface Transaction {
    id: string;
    type: 'IN' | 'OUT';
    description: string;
    amount: string;
    token: string;
    date: string;
    hash: string;
    network: 'base' | 'solana' | 'optimism' | 'arbitrum' | 'polygon' | 'celo';
    status: 'completed' | 'pending' | 'failed';
    from: string;
    to: string;
}

interface OfframpOrder {
    id: string;
    providerOrderId?: string;
    paycrestOrderId?: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    chain: string;
    token: string;
    cryptoAmount: number;
    fiatCurrency: string;
    fiatAmount: number;
    exchangeRate: number;
    serviceFee: number;
    bankName: string;
    accountNumber: string;
    accountName: string;
    txHash?: string;
    createdAt: string;
    completedAt?: string;
}

type ActivityItem =
    | { kind: 'tx';         data: Transaction  }
    | { kind: 'withdrawal'; data: OfframpOrder }
    | { kind: 'onramp';     data: OnrampOrder  }
    | { kind: 'coinbase';   data: CoinbasePayActivitySession }
    | { kind: 'usd';        data: UsdTransfer };

type ActivityFilter = 'all' | 'in' | 'out' | 'withdrawals' | 'onramps' | 'usd_account' | 'failed';
type NetworkFilter = 'all' | 'base' | 'solana' | 'arbitrum' | 'polygon' | 'optimism' | 'celo';

const NETWORK_FILTER_OPTIONS: Array<{ id: NetworkFilter; label: string; sublabel: string; icon?: any }> = [
    { id: 'all', label: 'All networks', sublabel: 'Show balances across every supported network' },
    { id: 'base', label: 'Base', sublabel: 'Base balances', icon: CHAIN_ICON_MAP.base },
    { id: 'arbitrum', label: 'Arbitrum', sublabel: 'Arbitrum balances', icon: CHAIN_ICON_MAP.arbitrum },
    { id: 'polygon', label: 'Polygon', sublabel: 'Polygon balances', icon: CHAIN_ICON_MAP.polygon },
    { id: 'optimism', label: 'Optimism', sublabel: 'Optimism balances', icon: CHAIN_ICON_MAP.optimism },
    { id: 'solana', label: 'Solana', sublabel: 'Solana balances', icon: CHAIN_ICON_MAP.solana },
];

const getNetworkFilterLabel = (filter: NetworkFilter): string =>
    NETWORK_FILTER_OPTIONS.find(option => option.id === filter)?.label || 'All networks';

const ACTIVITY_FILTER_OPTIONS: Array<{ id: ActivityFilter; label: string; sublabel: string }> = [
    { id: 'all', label: 'All', sublabel: 'Show every wallet activity item' },
    { id: 'in', label: 'Received', sublabel: 'Incoming transfers and bought USDC' },
    { id: 'out', label: 'Sent', sublabel: 'Outgoing wallet transfers' },
    { id: 'withdrawals', label: 'Withdrawals', sublabel: 'Bank cash-out activity' },
    { id: 'onramps', label: 'Buy USDC', sublabel: 'Fiat deposits and USDC purchases' },
    { id: 'usd_account', label: 'USD account', sublabel: 'Incoming USD account deposits' },
    { id: 'failed', label: 'Failed', sublabel: 'Failed or cancelled activity' },
];

const getActivityFilterLabel = (filter: ActivityFilter): string =>
    ACTIVITY_FILTER_OPTIONS.find(option => option.id === filter)?.label || 'All';

const WALLET_ACTIVITY_RENDER_LIMIT = 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toNumber = (value: unknown): number => {
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

const getActivityUsdValue = (item: ActivityItem): number | null => {
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
        return String(item.data.token || '').toUpperCase() === 'USDC' ? toNumber(item.data.cryptoAmount) : toNumber(item.data.cryptoAmount);
    }
    return null;
};

const normalizeUsdTransferStatus = (status?: string | null): keyof typeof WITHDRAWAL_STATUS_CONFIG => {
    const key = String(status || 'PENDING').trim().toUpperCase();
    if (key in WITHDRAWAL_STATUS_CONFIG) return key as keyof typeof WITHDRAWAL_STATUS_CONFIG;
    if (key === 'SUCCESS' || key === 'SETTLED') return 'COMPLETED';
    if (key === 'ERROR') return 'FAILED';
    return 'PENDING';
};

const isUnusualInboundActivity = (item: ActivityItem): boolean => {
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

const getTokenBalance = (entry: any, decimals: number): number => {
    const displayToken = toNumber(entry?.display_values?.token);
    if (displayToken > 0) return displayToken;
    const rawValue = entry?.raw_value;
    if (typeof rawValue === 'string' && rawValue.length > 0) {
        const parsedRaw = Number(rawValue);
        if (Number.isFinite(parsedRaw) && parsedRaw > 0) return parsedRaw / Math.pow(10, decimals);
    }
    return 0;
};

const parseFeatureFlag = (value: string | undefined, fallback = false): boolean => {
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
    return fallback;
};

const parseOptionalNumber = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = toNumber(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeOfframpStatus = (
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

const groupByDate = <T,>(
    items: T[],
    getDate: (item: T) => Date
): { title: string; data: T[] }[] =>
    items.reduce((acc, item) => {
        const date = getDate(item);
        let title = format(date, 'MMM d');
        if (isToday(date)) title = 'Today';
        if (isYesterday(date)) title = 'Yesterday';
        const existing = acc.find(s => s.title === title);
        if (existing) existing.data.push(item);
        else acc.push({ title, data: [item] });
        return acc;
    }, [] as { title: string; data: T[] }[]);

// ─── Withdrawal progress steps ────────────────────────────────────────────────
function ProgressSteps({ status, themeColors }: { status: string; themeColors: any }) {
    const steps = [
        { key: 'PENDING',    label: 'Initiated' },
        { key: 'PROCESSING', label: 'Processing' },
        { key: 'COMPLETED',  label: 'Completed' },
    ];
    const currentIndex = steps.findIndex(s => s.key === status);
    const isFailed = status === 'FAILED' || status === 'CANCELLED';

    return (
        <View style={ps.container}>
            {steps.map((step, index) => {
                const isActive    = index <= currentIndex && !isFailed;
                const isCompleted = index < currentIndex && !isFailed;
                const isCurrent   = index === currentIndex && !isFailed;
                return (
                    <View key={step.key} style={ps.step}>
                        {index > 0 && (
                            <View style={[ps.line, isActive && ps.lineActive]} />
                        )}
                        <View style={[
                            ps.circle,
                            isActive && ps.circleActive,
                            isCurrent && ps.circleCurrent,
                            isFailed && index === currentIndex && ps.circleFailed,
                        ]}>
                            {isCompleted ? (
                                <CheckCircleIcon size={16} color="#FFFFFF" strokeWidth={3} />
                            ) : isFailed && index === currentIndex ? (
                                <X size={16} color="#FFFFFF" strokeWidth={4} />
                            ) : (
                                <Text style={[ps.num, isActive && ps.numActive]}>{index + 1}</Text>
                            )}
                        </View>
                        <Text style={[ps.label, isActive && [ps.labelActive, { color: themeColors.textPrimary }]]}>
                            {step.label}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

const ps = StyleSheet.create({
    container:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    step:         { flex: 1, alignItems: 'center', position: 'relative' },
    line:         { position: 'absolute', top: 14, left: -50, right: 50, height: 2, backgroundColor: '#E5E7EB', zIndex: -1 },
    lineActive:   { backgroundColor: Colors.primary },
    circle:       { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    circleActive: { backgroundColor: Colors.primary },
    circleCurrent:{ backgroundColor: Colors.primary, borderWidth: 3, borderColor: '#DBEAFE' },
    circleFailed: { backgroundColor: '#EF4444' },
    num:          { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12, color: '#9CA3AF' },
    numActive:    { color: '#FFFFFF' },
    label:        { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
    labelActive:  {},
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function WalletScreen() {
    const themeColors = useThemeColors();
    const { currentTheme } = useSettings();
    const isDark = currentTheme === 'dark';
    const router = useRouter();
    const { user, getAccessToken } = useAuth();
    const settings = useSettings();
    const currency = settings?.currency || 'USD';

    const gatewayBalance = useGatewayBalance();

    const {
        balances: walletBalances,
        address: baseAddress,
        solanaAddress,
        getTotalUsd: getBaseTotalUsd,
        fetchBalances: fetchBaseBalances,
    } = useWallet();

    const [userName,    setUserName]    = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});
    const [refreshing,  setRefreshing]  = useState(false);

    // Sheet refs
    const receiveChooserSheetRef  = useRef<TrueSheet>(null);
    const receiveSheetRef         = useRef<TrueSheet>(null);
    const sendSheetRef            = useRef<TrueSheet>(null);
    const activitySettingsSheetRef = useRef<TrueSheet>(null);
    const bridgeKycInfoSheetRef   = useRef<TrueSheet>(null);
    const usdAccountDetailsSheetRef = useRef<TrueSheet>(null);
    const usdAccountAboutSheetRef = useRef<TrueSheet>(null);
    const tokenDetailSheetRef     = useRef<TrueSheet>(null);
    const txDetailSheetRef        = useRef<TrueSheet>(null);
    const withdrawalDetailSheetRef = useRef<TrueSheet>(null);
    const onrampDetailSheetRef    = useRef<TrueSheet>(null);
    const usdTransferDetailSheetRef = useRef<TrueSheet>(null);

    const [selectedToken,          setSelectedToken]          = useState<SelectedToken | null>(null);
    const sheetInteractionLockedRef = useRef(false);
    const sheetUnlockTimeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [selectedChain, setSelectedChain] = useState<'base' | 'solana'>('base');

    // Network Filter & Dropdown
    const [networkFilter, setNetworkFilter] = useState<NetworkFilter>('all');
    const [networkFilterSheetOpen, setNetworkFilterSheetOpen] = useState(false);
    const [usdStatus,    setUsdStatus]    = useState<UsdAccountStatus | null>(null);
    const [usdDetails,   setUsdDetails]   = useState<UsdAccountDetails | null>(null);
    const [usdTransfers, setUsdTransfers] = useState<UsdTransfer[]>([]);
    const [usdLoading,   setUsdLoading]   = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
    const [tokenPriceChanges, setTokenPriceChanges] = useState<Record<string, number>>({});

    const showUsdAccountCard      = parseFeatureFlag(process.env.EXPO_PUBLIC_SHOW_USD_ACCOUNT_CARD, true);

    // ── Activity tab state ──
    const [activeTab,       setActiveTab]       = useState<'coins' | 'activity'>('coins');
    const [transactions,    setTransactions]    = useState<Transaction[]>([]);
    const [offrampOrders,   setOfframpOrders]   = useState<OfframpOrder[]>([]);
    const [onrampOrders,    setOnrampOrders]    = useState<OnrampOrder[]>([]);
    const [coinbaseSessions, setCoinbaseSessions] = useState<CoinbasePayActivitySession[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityFilter,  setActivityFilter]  = useState<ActivityFilter>('all');
    const [activityFilterSheetOpen, setActivityFilterSheetOpen] = useState(false);
    const [selectedTx,       setSelectedTx]      = useState<Transaction | null>(null);
    const [selectedOrder,    setSelectedOrder]   = useState<OfframpOrder | null>(null);
    const [selectedOnrampOrder, setSelectedOnrampOrder] = useState<OnrampOrder | null>(null);
    const [selectedUsdTransfer, setSelectedUsdTransfer] = useState<UsdTransfer | null>(null);

    // ── Sheet helpers ──
    const lockSheetInteractions = useCallback((durationMs = 220) => {
        sheetInteractionLockedRef.current = true;
        if (sheetUnlockTimeoutRef.current) clearTimeout(sheetUnlockTimeoutRef.current);
        sheetUnlockTimeoutRef.current = setTimeout(() => {
            sheetInteractionLockedRef.current = false;
        }, durationMs);
    }, []);

    const dismissAllSheets = useCallback((except?: React.RefObject<TrueSheet | null>) => {
        const refs = [
            receiveChooserSheetRef, receiveSheetRef, sendSheetRef, activitySettingsSheetRef,
            bridgeKycInfoSheetRef, usdAccountDetailsSheetRef, usdAccountAboutSheetRef, tokenDetailSheetRef,
            txDetailSheetRef, withdrawalDetailSheetRef, onrampDetailSheetRef, usdTransferDetailSheetRef,
        ];
        refs.forEach(ref => { if (ref !== except) ref.current?.dismiss(); });
    }, []);

    const presentSheet = useCallback((target: React.RefObject<TrueSheet | null>) => {
        if (sheetInteractionLockedRef.current) return;
        dismissAllSheets(target);
        requestAnimationFrame(() => { target.current?.present(); });
    }, [dismissAllSheets]);

    const handleSheetDismiss = useCallback(() => { lockSheetInteractions(); }, [lockSheetInteractions]);

    const emitTabBarScrollOffset = useCallback((offsetY: number) => {
        if (Platform.OS !== 'android') return;
        DeviceEventEmitter.emit('hedwig:tabbar-scroll', offsetY);
    }, []);

    const handleTabBarAwareScroll = useCallback((event: any) => {
        emitTabBarScrollOffset(event?.nativeEvent?.contentOffset?.y ?? 0);
    }, [emitTabBarScrollOffset]);

    useEffect(() => {
        return () => {
            if (sheetUnlockTimeoutRef.current) clearTimeout(sheetUnlockTimeoutRef.current);
            emitTabBarScrollOffset(0);
        };
    }, [emitTabBarScrollOffset]);

    // ── Data fetching ──
    const fetchUserData = useCallback(async () => {
        if (!user) return;
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const res = await fetch(`${apiUrl}/api/users/profile`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const profileData = await res.json();
            if (profileData.success && profileData.data) {
                const userData = profileData.data.user || profileData.data;
                setUserName({ firstName: userData.firstName || '', lastName: userData.lastName || '' });
                if (userData.avatar) {
                    if (userData.avatar.startsWith('data:') || userData.avatar.startsWith('http')) {
                        setProfileIcon({ imageUri: userData.avatar });
                    } else {
                        try {
                            const parsed = JSON.parse(userData.avatar);
                            if (parsed.imageUri) setProfileIcon({ imageUri: parsed.imageUri });
                        } catch { setProfileIcon({ imageUri: userData.avatar }); }
                    }
                }
            }
        } catch (error) { console.error('Failed to fetch user data:', error); }
    }, [user, getAccessToken]);

    const fetchTokenPrices = useCallback(async () => {
        try {
            const ids = 'ethereum,solana,usd-coin';
            const res = await fetch(
                `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`
            );
            const data = await res.json();
            if (Array.isArray(data)) {
                const map: Record<string, number> = {};
                data.forEach((coin: any) => {
                    if (coin.symbol) map[coin.symbol.toUpperCase()] = coin.price_change_percentage_24h ?? 0;
                });
                setTokenPriceChanges(map);
            }
        } catch { /* ignore */ }
    }, []);

    const fetchUsdData = useCallback(async () => {
        if (!user) return;
        try {
            setUsdLoading(true);
            const status = await getUsdAccountStatus(getAccessToken);
            setUsdStatus(status);
            if (status.featureEnabled || status.accountStatus !== 'not_started') {
                try { setUsdDetails(await getUsdAccountDetails(getAccessToken)); }
                catch {
                    // Preserve previously loaded account details if Bridge or the API is temporarily unavailable.
                    setUsdDetails(current => current);
                }
            } else {
                setUsdDetails(null);
            }
            try { setUsdTransfers(await getUsdTransfers(getAccessToken)); }
            catch { setUsdTransfers([]); }
        } catch {
            // Do not clear USD account state on transient auth/network/backend failures.
            setUsdStatus(current => current);
            setUsdDetails(current => current);
            setUsdTransfers(current => current);
        } finally {
            setUsdLoading(false);
        }
    }, [getAccessToken, user]);

    const fetchTransactions = useCallback(async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const res = await fetch(`${apiUrl}/api/transactions`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setTransactions(data.data || []);
            }
        } catch { /* non-fatal */ }
    }, [getAccessToken]);

    const fetchOfframpOrders = useCallback(async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const res = await fetch(`${apiUrl}/api/offramp/orders`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                const raw: any[] = Array.isArray(data?.data?.orders) ? data.data.orders : [];
                setOfframpOrders(raw.map(o => ({
                    ...o,
                    status: normalizeOfframpStatus(o.status, o.txHash ?? o.tx_hash, o.completedAt ?? o.completed_at),
                })));
            }
        } catch { /* non-fatal */ }
    }, [getAccessToken]);

    const fetchOnrampOrders = useCallback(async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;
            const res = await fetch(joinApiUrl('/api/onramp/orders'), {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                const raw: any[] = Array.isArray(data?.data?.orders) ? data.data.orders : [];
                setOnrampOrders(raw);
            }
        } catch { /* non-fatal */ }
    }, [getAccessToken]);

    const fetchCoinbaseSessions = useCallback(async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;
            const res = await fetch(joinApiUrl('/api/coinbase-pay/sessions'), {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                const raw: any[] = Array.isArray(data?.data?.sessions) ? data.data.sessions : [];
                setCoinbaseSessions(raw);
            }
        } catch { /* non-fatal */ }
    }, [getAccessToken]);

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([
            fetchUserData(), fetchBaseBalances(), fetchUsdData(),
            fetchTokenPrices(), fetchTransactions(), fetchOfframpOrders(), fetchOnrampOrders(), fetchCoinbaseSessions(),
        ]);
        setLastUpdatedAt(new Date());
        setRefreshing(false);
    };

    useFocusEffect(
        React.useCallback(() => {
            fetchUserData();
            fetchBaseBalances();
            fetchUsdData();
            fetchTokenPrices();
            fetchTransactions();
            fetchOfframpOrders();
            fetchOnrampOrders();
            fetchCoinbaseSessions();
            setLastUpdatedAt(new Date());

            const balanceInterval = setInterval(() => {
                fetchBaseBalances();
                setLastUpdatedAt(new Date());
            }, 15000);
            const priceInterval = setInterval(() => {
                fetchTokenPrices();
                fetchUsdData();
            }, 60000);
            // Keep withdrawal statuses live while screen is open
            const ordersInterval = setInterval(() => {
                fetchOfframpOrders();
                fetchOnrampOrders();
                fetchCoinbaseSessions();
            }, 10000);

            return () => {
                clearInterval(balanceInterval);
                clearInterval(priceInterval);
                clearInterval(ordersInterval);
            };
        }, [fetchBaseBalances, fetchUserData, fetchUsdData, fetchTokenPrices, fetchTransactions, fetchOfframpOrders, fetchOnrampOrders, fetchCoinbaseSessions])
    );

    // Update selected order when orders refresh
    useEffect(() => {
        if (!selectedOrder) return;
        const updated = offrampOrders.find(o => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
    }, [offrampOrders, selectedOrder]);

    useEffect(() => {
        if (!selectedOnrampOrder) return;
        const updated = onrampOrders.find(o => o.id === selectedOnrampOrder.id);
        if (updated) setSelectedOnrampOrder(updated);
    }, [onrampOrders, selectedOnrampOrder]);

    // ── Derived values ──
    const selectedAddress     = selectedChain === 'solana' ? (solanaAddress || '') : (baseAddress || '');
    const selectedChainMeta   = SETTLEMENT_CHAINS.find(c => c.id === selectedChain) || SETTLEMENT_CHAINS[0];

    const usdBalanceCandidates: unknown[] = [
        usdDetails?.balances?.availableUsd, usdDetails?.balances?.availableUSD,
        usdDetails?.balances?.currentUsd,   usdDetails?.balances?.currentUSD,
        usdDetails?.availableBalanceUsd,    usdDetails?.available_balance_usd,
        usdDetails?.accountBalanceUsd,      usdDetails?.account_balance_usd,
        usdDetails?.usdBalance,             usdDetails?.usd_balance,
        usdStatus?.balances?.availableUsd,  usdStatus?.balances?.availableUSD,
        usdStatus?.balances?.currentUsd,    usdStatus?.balances?.currentUSD,
        usdStatus?.availableBalanceUsd,     usdStatus?.available_balance_usd,
        usdStatus?.accountBalanceUsd,       usdStatus?.account_balance_usd,
    ];
    const explicitUsdBalance = usdBalanceCandidates
        .map(parseOptionalNumber)
        .find((v): v is number => v !== null);
    const unsettledCompletedUsd = usdTransfers.reduce((sum, t) => {
        const isCompleted = String(t.status || '').toLowerCase() === 'completed';
        const settled = toNumber(t.usdcAmountSettled);
        if (!isCompleted || settled > 0) return sum;
        return sum + toNumber(t.netUsd);
    }, 0);
    const usdAccountBalance = explicitUsdBalance ?? unsettledCompletedUsd;
    const usdAch = (usdDetails?.ach || {}) as Record<string, any>;
    const usdAccountName = String(usdAch.accountName || usdAch.account_name || '').trim();
    const usdBankName = String(usdAch.bankName || usdAch.bank_name || '').trim();
    const usdAccountNumber = String(
        usdAch.accountNumber || usdAch.account_number || usdAch.accountNumberMasked || usdAch.account_number_masked || ''
    ).trim();
    const usdRoutingNumber = String(
        usdAch.routingNumber || usdAch.routing_number || usdAch.routingNumberMasked || usdAch.routing_number_masked || ''
    ).trim();
    const usdDepositMessage = String(
        usdAch.depositMessage || usdAch.deposit_message || usdAch.memo || usdAch.reference || ''
    ).trim();
    const hasActiveUsdAccountDetails = Boolean(
        usdAccountNumber ||
        usdRoutingNumber ||
        usdDetails?.bridgeVirtualAccountId ||
        (String(usdStatus?.accountStatus || '').toLowerCase() === 'active' && usdDetails)
    );
    const normalizedUsdAccountStatus = String(usdStatus?.accountStatus || '').trim().toLowerCase();
    const normalizedUsdKycStatus = String(usdStatus?.bridgeKycStatus || '').trim().toLowerCase();
    const hasStartedUsdAccountFlow = Boolean(
        hasActiveUsdAccountDetails ||
        (normalizedUsdAccountStatus && normalizedUsdAccountStatus !== 'not_started') ||
        ['approved', 'active', 'submitted', 'pending', 'in_review'].includes(normalizedUsdKycStatus)
    );
    const canAccessUsdAccountFeature = Boolean(usdStatus?.featureEnabled);
    const shouldShowUsdAccountCard = showUsdAccountCard && (canAccessUsdAccountFeature || usdLoading || !usdStatus);
    const usdCardTitle = hasActiveUsdAccountDetails
        ? (usdAccountName || usdBankName || 'USD account')
        : !hasStartedUsdAccountFlow || normalizedUsdAccountStatus === 'not_started'
        ? 'Set up USD account'
        : normalizedUsdAccountStatus === 'pending_kyc'
        ? 'Continue USD account setup'
        : 'USD account pending';
    const usdCardSubtitle = hasActiveUsdAccountDetails
        ? (usdAccountNumber || 'View account details')
        : usdLoading
        ? 'Fetching account status...'
        : hasStartedUsdAccountFlow && normalizedUsdAccountStatus !== 'pending_kyc'
        ? 'We’ll show your details here once Bridge returns them'
        : 'Get account details for receiving bank transfers';
    const usdAccountRows: Array<{ label: string; value: string; copyLabel: string }> = [
        { label: 'Account name', value: usdAccountName || usdBankName || 'USD account', copyLabel: 'Account name' },
        { label: 'Account number', value: usdAccountNumber || 'Not assigned', copyLabel: 'Account number' },
        { label: 'Routing number', value: usdRoutingNumber || 'Not assigned', copyLabel: 'Routing number' },
        ...(usdDepositMessage ? [{ label: 'Memo / reference', value: usdDepositMessage, copyLabel: 'Memo / reference' }] : []),
        { label: 'Bank', value: usdBankName || 'Pending setup', copyLabel: 'Bank' },
    ];

    const bal = (chain: string, asset: string) => walletBalances.find(b => b.chain === chain && b.asset === asset);

    // Unified USDC balance combines what already lives in Circle Gateway
    // (instantly spendable across every domain) with USDC currently sitting
    // at the embedded EOA — those EOA balances are auto-deposited into
    // Gateway in the background, but we surface the combined number so the
    // user sees their full spendable balance immediately.
    const unifiedGatewayUsdc = parseFloat(formatGatewayUsdc(gatewayBalance.available)) || 0;
    const eoaUsdcByChain = {
        base: getTokenBalance(bal('base', 'usdc'), 6),
        arbitrum: getTokenBalance(bal('arbitrum', 'usdc'), 6),
        polygon: getTokenBalance(bal('polygon', 'usdc'), 6),
        optimism: getTokenBalance(bal('optimism', 'usdc'), 6),
        solana: getTokenBalance(bal('solana', 'usdc'), 6),
    };
    const eoaUsdcTotal = Object.values(eoaUsdcByChain).reduce((sum, n) => sum + n, 0);
    const unifiedUsdcAmount = unifiedGatewayUsdc + eoaUsdcTotal;

    // Silently drain EOA USDC into Gateway whenever we detect a balance.
    useEoaUsdcAutoDeposit(eoaUsdcByChain, {
        enabled: settings?.gatewayAutoDepositEnabled ?? false,
        onComplete: () => {
            // Refresh both balance sources after a successful deposit so the
            // unified row updates without waiting for the next poll.
            void fetchBaseBalances();
            void gatewayBalance.refresh();
        },
    });

    // When Gateway auto-deposit is OFF, show a per-chain USDC row for each
    // network so users can manage liquidity per chain manually. The unified
    // row remains, sourced solely from Gateway (no EOA-pending pre-sum) so
    // the totals don't double-count.
    const gatewayAutoDepositOn = settings?.gatewayAutoDepositEnabled ?? false;
    const unifiedRowBalance = gatewayAutoDepositOn ? unifiedUsdcAmount : unifiedGatewayUsdc;

    const allTokens = [
        // Unified USDC across every Gateway domain. When auto-deposit is on
        // we add EOA-held USDC so the displayed total matches what will end
        // up in Gateway. When off, only Gateway-side balance counts.
        { chain: 'base', name: 'USD Coin', symbol: 'USDC', balance: unifiedRowBalance, balanceUsd: unifiedRowBalance, icon: require('../../../assets/icons/tokens/usdc.png'), unified: true, pendingDeposit: gatewayAutoDepositOn ? eoaUsdcTotal : 0 } satisfies SelectedToken & { pendingDeposit: number },
        // Per-chain USDC rows — only shown when auto-deposit is OFF so users
        // can see and manage USDC that lives at the EOA on each chain.
        ...(gatewayAutoDepositOn ? [] : [
            { chain: 'base',     name: 'USD Coin', symbol: 'USDC', balance: eoaUsdcByChain.base,     balanceUsd: eoaUsdcByChain.base,     icon: require('../../../assets/icons/tokens/usdc.png') },
            { chain: 'arbitrum', name: 'USD Coin', symbol: 'USDC', balance: eoaUsdcByChain.arbitrum, balanceUsd: eoaUsdcByChain.arbitrum, icon: require('../../../assets/icons/tokens/usdc.png') },
            { chain: 'polygon',  name: 'USD Coin', symbol: 'USDC', balance: eoaUsdcByChain.polygon,  balanceUsd: eoaUsdcByChain.polygon,  icon: require('../../../assets/icons/tokens/usdc.png') },
            { chain: 'optimism', name: 'USD Coin', symbol: 'USDC', balance: eoaUsdcByChain.optimism, balanceUsd: eoaUsdcByChain.optimism, icon: require('../../../assets/icons/tokens/usdc.png') },
            { chain: 'solana',   name: 'USD Coin', symbol: 'USDC', balance: eoaUsdcByChain.solana,   balanceUsd: eoaUsdcByChain.solana,   icon: require('../../../assets/icons/tokens/usdc.png') },
        ]),
        // Native gas tokens for every supported network — always rendered so
        // the user can see them at a glance even at zero balance.
        { chain: 'base',     name: 'Ethereum',  symbol: 'ETH',  balance: getTokenBalance(bal('base','eth'),     18), balanceUsd: toNumber(bal('base','eth')?.display_values?.usd),     icon: require('../../../assets/icons/tokens/eth.png'),         native: true },
        { chain: 'arbitrum', name: 'Ethereum',  symbol: 'ETH',  balance: getTokenBalance(bal('arbitrum','eth'), 18), balanceUsd: toNumber(bal('arbitrum','eth')?.display_values?.usd), icon: require('../../../assets/icons/tokens/eth.png'),         native: true },
        { chain: 'polygon',  name: 'Polygon',   symbol: 'POL',  balance: getTokenBalance(bal('polygon','pol'),  18), balanceUsd: toNumber(bal('polygon','pol')?.display_values?.usd),  icon: require('../../../assets/icons/networks/polygon.png'),   native: true },
        { chain: 'optimism', name: 'Ethereum',  symbol: 'ETH',  balance: getTokenBalance(bal('optimism','eth'),18), balanceUsd: toNumber(bal('optimism','eth')?.display_values?.usd), icon: require('../../../assets/icons/tokens/eth.png'),         native: true },
        { chain: 'solana',   name: 'Solana',    symbol: 'SOL',  balance: getTokenBalance(bal('solana','sol'),   9),  balanceUsd: toNumber(bal('solana','sol')?.display_values?.usd),   icon: require('../../../assets/icons/networks/solana.png'),    native: true },
    ];

    // Unified USDC + native gas rows are always visible. Anything else
    // (legacy per-chain entries, custom tokens) hides at zero to keep the
    // list tight.
    const filteredTokens = useMemo(() => {
        const networkFiltered = allTokens.filter(t => networkFilter === 'all' || t.chain === networkFilter);
        return networkFiltered.filter(t =>
            (t as any).unified || (t as any).native || t.balance > 0
        );
    }, [allTokens, networkFilter]);

    // Total balance = (unified USDC + EOA USDC across all chains) + every
    // native gas token's USD value + USD account credits. The full USDC sum
    // is independent of the auto-deposit toggle — funds count regardless of
    // whether they're in Gateway or still at the EOA.
    const nativeUsdSum = allTokens
        .filter((t) => (t as any).native)
        .reduce((sum, t) => sum + (toNumber(t.balanceUsd) || 0), 0);
    const totalBalance = unifiedGatewayUsdc + eoaUsdcTotal + nativeUsdSum + usdAccountBalance;

    const getNetworkIcon = (filter: string) => CHAIN_ICON_MAP[filter] ?? null;

    // ── Activity derived values ──
    const allActivity: ActivityItem[] = useMemo(() => {
        const txItems = transactions.map(tx => ({ kind: 'tx' as const, data: tx }));
        const wdItems = offrampOrders.map(o => ({ kind: 'withdrawal' as const, data: o }));
        const onrampItems = onrampOrders.map(o => ({ kind: 'onramp' as const, data: o }));
        const coinbaseItems = coinbaseSessions.map(o => ({ kind: 'coinbase' as const, data: o }));
        const usdItems = usdTransfers.map(t => ({ kind: 'usd' as const, data: t }));
        return [...txItems, ...wdItems, ...onrampItems, ...coinbaseItems, ...usdItems].sort((a, b) => {
            const dateA = a.kind === 'tx' ? new Date(a.data.date).getTime() : new Date(a.data.createdAt).getTime();
            const dateB = b.kind === 'tx' ? new Date(b.data.date).getTime() : new Date(b.data.createdAt).getTime();
            return dateB - dateA;
        });
    }, [transactions, offrampOrders, onrampOrders, coinbaseSessions, usdTransfers]);

    const filteredActivity = useMemo(() => allActivity.filter(item => {
        if (settings?.hideMicrotransactions) {
            const usdValue = getActivityUsdValue(item);
            if (usdValue !== null && usdValue < 0.10) return false;
        }

        if (settings?.hideUnusualActivity && isUnusualInboundActivity(item)) {
            return false;
        }

        if (activityFilter === 'all')         return true;
        if (activityFilter === 'in')          return (item.kind === 'tx' && item.data.type === 'IN') || item.kind === 'onramp' || item.kind === 'usd' || (item.kind === 'coinbase' && item.data.direction === 'buy');
        if (activityFilter === 'out')         return item.kind === 'tx' && item.data.type === 'OUT';
        if (activityFilter === 'withdrawals') return item.kind === 'withdrawal' || (item.kind === 'coinbase' && item.data.direction === 'sell');
        if (activityFilter === 'onramps')     return item.kind === 'onramp' || (item.kind === 'coinbase' && item.data.direction === 'buy');
        if (activityFilter === 'usd_account') return item.kind === 'usd';
        if (activityFilter === 'failed')      return (
            (item.kind === 'tx' && item.data.status === 'failed') ||
            (item.kind === 'withdrawal' && (item.data.status === 'FAILED' || item.data.status === 'CANCELLED')) ||
            (item.kind === 'onramp' && (item.data.status === 'FAILED' || item.data.status === 'CANCELLED')) ||
            (item.kind === 'coinbase' && (item.data.status === 'FAILED' || item.data.status === 'CANCELLED')) ||
            (item.kind === 'usd' && normalizeUsdTransferStatus(item.data.status) === 'FAILED')
        );
        return true;
    }), [allActivity, activityFilter, settings?.hideMicrotransactions, settings?.hideUnusualActivity]);

    const visibleActivity = useMemo(
        () => filteredActivity.slice(0, WALLET_ACTIVITY_RENDER_LIMIT),
        [filteredActivity]
    );

    const groupedActivity = useMemo(() =>
        groupByDate(visibleActivity, item =>
            item.kind === 'tx' ? new Date(item.data.date) : new Date(item.data.createdAt)
        ),
    [visibleActivity]);

    const inactiveTabColor = isDark ? 'rgba(255,255,255,0.42)' : 'rgba(15,23,42,0.42)';

    // ── Action handlers ──
    const copySelectedAddress = async () => {
        if (!selectedAddress) return;
        await Clipboard.setStringAsync(selectedAddress);
        if (Platform.OS === 'android') {
            ToastAndroid.show(`${selectedChainMeta.name} wallet address copied`, ToastAndroid.SHORT);
            return;
        }
        Alert.alert('Copied', `${selectedChainMeta.name} wallet address copied`);
    };

    const shareSelectedAddress = async () => {
        if (!selectedAddress) return;
        try {
            await Share.share({ message: `${selectedChainMeta.name} address:\n${selectedAddress}` });
        } catch {
            Alert.alert('Share unavailable', 'Could not open share sheet right now.');
        }
    };

    const handleSendOptionPress = (path: '/wallet/send-address' | '/offramp-history/create') => {
        lockSheetInteractions(260);
        sendSheetRef.current?.dismiss();
        setTimeout(() => { router.push(path as any); }, 120);
    };

    const handleReceiveOptionPress = (option: 'onramp' | 'crypto' | 'usd') => {
        lockSheetInteractions(260);
        receiveChooserSheetRef.current?.dismiss();
        if (option === 'onramp') {
            setTimeout(() => { router.push('/onramp/amount' as any); }, 120);
        } else if (option === 'usd') {
            setTimeout(() => { void handleOpenUsdAccount(); }, 240);
        } else {
            setTimeout(() => { receiveSheetRef.current?.present(); }, 240);
        }
    };

    const handleUsdKyc = async () => {
        try {
            await enrollUsdAccount(getAccessToken).catch(() => undefined);
            const result = await createUsdKycLink(getAccessToken);
            if (!result?.url) { Alert.alert('Unavailable', 'KYC link is not available right now.'); return; }
            await WebBrowser.openBrowserAsync(result.url);
            await fetchUsdData();
        } catch (error: any) {
            Alert.alert('Could not open KYC', error?.message || 'Please try again later.');
        }
    };

    const handleOpenUsdAccount = async () => {
        if (usdStatus && !canAccessUsdAccountFeature) {
            Alert.alert('USD account unavailable', 'USD accounts are not enabled for this account yet.');
            return;
        }
        if (hasActiveUsdAccountDetails) {
            presentSheet(usdAccountDetailsSheetRef);
            return;
        }
        if (hasStartedUsdAccountFlow && normalizedUsdAccountStatus !== 'pending_kyc') {
            try {
                setUsdLoading(true);
                const details = await getUsdAccountDetails(getAccessToken);
                setUsdDetails(details);
                const ach = (details?.ach || {}) as Record<string, any>;
                const accountNumber = String(
                    ach.accountNumber || ach.account_number || ach.accountNumberMasked || ach.account_number_masked || ''
                ).trim();
                const routingNumber = String(
                    ach.routingNumber || ach.routing_number || ach.routingNumberMasked || ach.routing_number_masked || ''
                ).trim();
                if (accountNumber || routingNumber || details?.bridgeVirtualAccountId) {
                    usdAccountDetailsSheetRef.current?.present();
                    return;
                }
            } catch {
                // Keep the user in the pending state instead of restarting setup.
            } finally {
                setUsdLoading(false);
            }
            Alert.alert(
                'USD account is being prepared',
                'Your account setup has already started. We’ll show your account and routing details here once Bridge returns them.'
            );
            return;
        }
        presentSheet(bridgeKycInfoSheetRef);
    };

    const handleSelectAutoSettlementChain = async (chain: 'BASE' | 'SOLANA') => {
        if (isUpdatingAutoSettlement) return;
        if (chain === 'SOLANA' && !solanaAddress) {
            Alert.alert('Solana wallet unavailable', 'Create a Solana wallet first before selecting Solana settlement.');
            return;
        }
        if (chain === 'BASE' && !baseAddress) {
            Alert.alert('Base wallet unavailable', 'Create a Base wallet first before selecting Base settlement.');
            return;
        }
        try {
            setIsUpdatingAutoSettlement(true);
            await updateUsdSettlement(getAccessToken, chain);
            await fetchUsdData();
            lockSheetInteractions(260);
            autoSettlementSheetRef.current?.dismiss();
            setTimeout(() => { usdAccountDetailsSheetRef.current?.present(); }, 300);
        } catch (error: any) {
            Alert.alert('Could not update settlement', error?.message || 'Please try again.');
        } finally {
            setIsUpdatingAutoSettlement(false);
        }
    };

    const openTxDetail = (tx: Transaction) => {
        setSelectedTx(tx);
        Haptics.selectionAsync();
        presentSheet(txDetailSheetRef);
    };

    const openWithdrawalDetail = (order: OfframpOrder) => {
        setSelectedOrder(order);
        Haptics.selectionAsync();
        presentSheet(withdrawalDetailSheetRef);
    };

    const openOnrampDetail = (order: OnrampOrder) => {
        setSelectedOnrampOrder(order);
        Haptics.selectionAsync();
        presentSheet(onrampDetailSheetRef);
    };

    const openUsdTransferDetail = (transfer: UsdTransfer) => {
        setSelectedUsdTransfer(transfer);
        Haptics.selectionAsync();
        presentSheet(usdTransferDetailSheetRef);
    };

    const openCoinbaseSession = async (session: CoinbasePayActivitySession) => {
        Haptics.selectionAsync();
        if (session.txHash) {
            const chain = String(session.chain || '').toLowerCase();
            const url = chain === 'solana'
                ? `https://explorer.solana.com/tx/${session.txHash}`
                : `https://basescan.org/tx/${session.txHash}`;
            await WebBrowser.openBrowserAsync(url, {
                presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
                controlsColor: Colors.primary,
            });
            return;
        }
        if (session.launchUrl && (session.status === 'PENDING' || session.status === 'PROCESSING')) {
            await WebBrowser.openBrowserAsync(session.launchUrl, {
                presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
            });
            return;
        }
        Alert.alert(
            session.direction === 'sell' ? 'Coinbase cash out' : 'Coinbase USDC purchase',
            session.errorMessage || `${session.status.toLowerCase()} on Coinbase.`
        );
    };

    const openExplorer = async (tx: Transaction) => {
        if (!tx.hash) { Alert.alert('Error', 'Transaction hash not available'); return; }
        let url = tx.network === 'base'
            ? `https://basescan.org/tx/${tx.hash}`
            : tx.network === 'solana'
            ? `https://explorer.solana.com/tx/${tx.hash}`
            : '';
        if (url) {
            try {
                await WebBrowser.openBrowserAsync(url, {
                    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
                    controlsColor: Colors.primary,
                });
            } catch { Alert.alert('Error', 'Failed to open block explorer'); }
        } else {
            Alert.alert('Error', 'Explorer not available for this network');
        }
    };

    const copyToClipboard = async (text: string) => {
        await Clipboard.setStringAsync(text);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    // ── Render helpers ──
    const renderActivityItem = (item: ActivityItem, index: number) => {
        if (item.kind === 'tx') {
            const tx = item.data;
            const isReceived = tx.type === 'IN';
            const chainInfo  = ACTIVITY_CHAINS[tx.network] || ACTIVITY_CHAINS.base;
            return (
                <TouchableOpacity
                    key={`tx-${tx.id}`}
                    style={[styles.activityItem, { borderBottomColor: themeColors.border }]}
                    onPress={() => openTxDetail(tx)}
                    activeOpacity={0.7}
                >
                    <View style={styles.activityIconContainer}>
                        <Image source={ACTIVITY_ICONS.usdc} style={styles.activityTokenIcon} />
                        <View style={[styles.activityChainBadge, { backgroundColor: themeColors.background, borderColor: themeColors.background }]}>
                            <Image source={chainInfo.icon} style={styles.activityChainBadgeIcon} />
                        </View>
                    </View>
                    <View style={styles.activityContent}>
                        <Text style={[styles.activityTitle, { color: themeColors.textPrimary }]}>
                            {isReceived ? 'Received' : 'Sent'}
                        </Text>
                        <Text style={[styles.activitySubtitle, { color: themeColors.textSecondary }]} numberOfLines={1} ellipsizeMode="middle">
                            {isReceived ? `From ${tx.from.slice(0,6)}...${tx.from.slice(-4)}` : `To ${tx.to.slice(0,6)}...${tx.to.slice(-4)}`}
                        </Text>
                    </View>
                    <View style={styles.activityRight}>
                        <Text style={[styles.activityAmount, { color: isReceived ? Colors.success : themeColors.textPrimary }]}>
                            {isReceived ? '+' : '-'}{tx.amount} {tx.token}
                        </Text>
                        <Text style={[styles.activityFiat, { color: themeColors.textSecondary }]}>
                            ≈ {formatCurrency(tx.amount || '0', currency)}
                        </Text>
                    </View>
                </TouchableOpacity>
            );
        }

        if (item.kind === 'onramp') {
            const order = item.data;
            const statusCfg = WITHDRAWAL_STATUS_CONFIG[order.status] || WITHDRAWAL_STATUS_CONFIG.PENDING;
            const chainInfo = ACTIVITY_CHAINS[order.chain] || ACTIVITY_CHAINS.BASE;
            const StatusIcon = statusCfg.Icon;
            const providerLabel = order.providerInstitution
                ? `${order.providerInstitution}${order.providerAccountNumber ? ` • ****${order.providerAccountNumber.slice(-4)}` : ''}`
                : `${order.fiatCurrency} deposit`;
            return (
                <TouchableOpacity
                    key={`onramp-${order.id}`}
                    style={[styles.activityItem, { borderBottomColor: themeColors.border }]}
                    onPress={() => openOnrampDetail(order)}
                    activeOpacity={0.7}
                >
                    <View style={styles.activityIconContainer}>
                        <Image source={ACTIVITY_ICONS.usdc} style={styles.activityTokenIcon} />
                        <View style={[styles.activityChainBadge, { backgroundColor: themeColors.background, borderColor: themeColors.background }]}>
                            <Image source={chainInfo.icon} style={styles.activityChainBadgeIcon} />
                        </View>
                    </View>
                    <View style={styles.activityContent}>
                        <Text style={[styles.activityTitle, { color: themeColors.textPrimary }]}>Buy USDC</Text>
                        <Text style={[styles.activitySubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                            {providerLabel}
                        </Text>
                    </View>
                    <View style={styles.activityRight}>
                        <Text style={[styles.activityAmount, { color: Colors.success }]}>
                            +{Number(order.cryptoAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} {order.token}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + '20' }]}>
                            <StatusIcon size={11} color={statusCfg.color} strokeWidth={3} />
                            <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                        </View>
                    </View>
                </TouchableOpacity>
            );
        }

        if (item.kind === 'coinbase') {
            const session = item.data;
            const statusCfg = WITHDRAWAL_STATUS_CONFIG[session.status] || WITHDRAWAL_STATUS_CONFIG.PENDING;
            const chainInfo = ACTIVITY_CHAINS[session.chain] || ACTIVITY_CHAINS.base;
            const StatusIcon = statusCfg.Icon;
            const isBuy = session.direction === 'buy';
            return (
                <TouchableOpacity
                    key={`coinbase-${session.id}`}
                    style={[styles.activityItem, { borderBottomColor: themeColors.border }]}
                    onPress={() => { void openCoinbaseSession(session); }}
                    activeOpacity={0.7}
                >
                    <View style={styles.activityIconContainer}>
                        <Image source={ACTIVITY_ICONS.usdc} style={styles.activityTokenIcon} />
                        <View style={[styles.activityChainBadge, { backgroundColor: themeColors.background, borderColor: themeColors.background }]}>
                            <Image source={chainInfo.icon} style={styles.activityChainBadgeIcon} />
                        </View>
                    </View>
                    <View style={styles.activityContent}>
                        <Text style={[styles.activityTitle, { color: themeColors.textPrimary }]}>
                            {isBuy ? 'Buy USDC' : 'Coinbase cash out'}
                        </Text>
                        <Text style={[styles.activitySubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                            Coinbase • {session.fiatCurrency || 'USD'}
                        </Text>
                    </View>
                    <View style={styles.activityRight}>
                        <Text style={[styles.activityAmount, { color: isBuy ? Colors.success : themeColors.textPrimary }]}>
                            {isBuy
                                ? `+${Number(session.cryptoAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${session.token}`
                                : `${session.fiatCurrency} ${Number(session.fiatAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + '20' }]}>
                            <StatusIcon size={11} color={statusCfg.color} strokeWidth={3} />
                            <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                        </View>
                    </View>
                </TouchableOpacity>
            );
        }

        if (item.kind === 'usd') {
            const transfer = item.data;
            const statusKey = normalizeUsdTransferStatus(transfer.status);
            const statusCfg = WITHDRAWAL_STATUS_CONFIG[statusKey] || WITHDRAWAL_STATUS_CONFIG.PENDING;
            const StatusIcon = statusCfg.Icon;
            const sourceLabel = transfer.sourceLabel || (transfer.sourceType === 'EXTERNAL_ADDRESS' ? 'External address' : transfer.sourceType === 'ACH' ? 'ACH transfer' : 'USD deposit');
            return (
                <TouchableOpacity
                    key={`usd-${transfer.id}`}
                    style={[styles.activityItem, { borderBottomColor: themeColors.border }]}
                    onPress={() => openUsdTransferDetail(transfer)}
                    activeOpacity={0.7}
                >
                    <View style={styles.activityIconContainer}>
                        <View style={[styles.activityTokenIcon, styles.activityBankIcon, { backgroundColor: themeColors.surface }]}>
                            <LandmarkIcon size={22} color={themeColors.textPrimary} />
                        </View>
                        <View style={[styles.activityChainBadge, { backgroundColor: themeColors.background, borderColor: themeColors.background }]}>
                            <Image source={ACTIVITY_ICONS.usdc} style={styles.activityChainBadgeIcon} />
                        </View>
                    </View>
                    <View style={styles.activityContent}>
                        <Text style={[styles.activityTitle, { color: themeColors.textPrimary }]}>USD account deposit</Text>
                        <Text style={[styles.activitySubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                            {sourceLabel}
                        </Text>
                    </View>
                    <View style={styles.activityRight}>
                        <Text style={[styles.activityAmount, { color: Colors.success }]}>
                            +${Number(transfer.grossUsd || transfer.netUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + '20' }]}>
                            <StatusIcon size={11} color={statusCfg.color} strokeWidth={3} />
                            <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                        </View>
                    </View>
                </TouchableOpacity>
            );
        }

        const order = item.data;
        const statusCfg = WITHDRAWAL_STATUS_CONFIG[order.status] || WITHDRAWAL_STATUS_CONFIG.PENDING;
        const chainInfo = ACTIVITY_CHAINS[order.chain] || ACTIVITY_CHAINS.BASE;
        const StatusIcon = statusCfg.Icon;
        return (
            <TouchableOpacity
                key={`wd-${order.id}`}
                style={[styles.activityItem, { borderBottomColor: themeColors.border }]}
                onPress={() => openWithdrawalDetail(order)}
                activeOpacity={0.7}
            >
                <View style={styles.activityIconContainer}>
                    <Image source={ACTIVITY_ICONS.usdc} style={styles.activityTokenIcon} />
                    <View style={[styles.activityChainBadge, { backgroundColor: themeColors.background, borderColor: themeColors.background }]}>
                        <Image source={chainInfo.icon} style={styles.activityChainBadgeIcon} />
                    </View>
                </View>
                <View style={styles.activityContent}>
                    <Text style={[styles.activityTitle, { color: themeColors.textPrimary }]}>Withdrawal</Text>
                    <Text style={[styles.activitySubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                        {order.bankName} • ****{order.accountNumber?.slice(-4)}
                    </Text>
                </View>
                <View style={styles.activityRight}>
                    <Text style={[styles.activityAmount, { color: themeColors.textPrimary }]}>
                        {order.fiatCurrency} {order.fiatAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + '20' }]}>
                        <StatusIcon size={11} color={statusCfg.color} strokeWidth={3} />
                        <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <>
            <SafeAreaView collapsable={false} edges={['top']} style={[styles.container, { backgroundColor: themeColors.background }]}>
                {/* ── Header ── */}
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <View>
                        {profileIcon?.imageUri ? (
                            <Image source={{ uri: profileIcon.imageUri }} style={styles.profileImage} />
                        ) : (
                            <LinearGradient
                                colors={getUserGradient(user?.id)}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                style={styles.profileImage}
                            >
                                <Text style={{ color: 'white', fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 18 }}>
                                    {userName.firstName?.[0] || 'U'}
                                </Text>
                            </LinearGradient>
                        )}
                    </View>
                    <View style={styles.headerTitleRow} />
                    <View style={styles.headerActions}>
                        <HeaderActionButtons />
                        <IOSGlassIconButton
                            label="Activity settings"
                            onPress={() => presentSheet(activitySettingsSheetRef)}
                            systemImage="gearshape.fill"
                            circleStyle={styles.settingsButton}
                            icon={<Gear size={22} color={themeColors.textPrimary} />}
                        />
                    </View>
                </View>

                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    bounces={true}
                    alwaysBounceVertical={true}
                    overScrollMode="always"
                    contentInsetAdjustmentBehavior="automatic"
                    onScroll={handleTabBarAwareScroll}
                    scrollEventThrottle={16}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                >
                    {/* ── Balance ── */}
                    <View style={styles.balanceSection}>
                        <Text style={[styles.totalBalance, { color: themeColors.textPrimary }]}>
                            ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                        <Text style={[styles.addressCopyText, { color: themeColors.textSecondary }]}>
                            {lastUpdatedAt
                                ? `Updated ${lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                : 'Updated just now'}
                        </Text>
                    </View>

                    {/* ── Action buttons ── */}
                    <View style={styles.actionButtons}>
                        <TouchableOpacity style={styles.actionButton} onPress={() => presentSheet(sendSheetRef)}>
                            <View style={[styles.actionIconBox, { backgroundColor: themeColors.surface }]}>
                                <ArrowUp size={24} color={themeColors.textPrimary} />
                            </View>
                            <Text style={[styles.actionButtonLabel, { color: themeColors.textPrimary }]}>Send</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionButton} onPress={() => presentSheet(receiveChooserSheetRef)}>
                            <View style={[styles.actionIconBox, { backgroundColor: themeColors.surface }]}>
                                <QrCode size={24} color={themeColors.textPrimary} />
                            </View>
                            <Text style={[styles.actionButtonLabel, { color: themeColors.textPrimary }]}>Receive</Text>
                        </TouchableOpacity>
                        {!isAutoSettlementDisabled && (
                            <TouchableOpacity style={styles.actionButton} onPress={() => presentSheet(autoSettlementSheetRef)}>
                                <View style={[styles.actionIconBox, { backgroundColor: themeColors.surface }]}>
                                    <Plus size={24} color={themeColors.textPrimary} />
                                </View>
                                <Text style={[styles.actionButtonLabel, { color: themeColors.textPrimary }]}>Add</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* ── USD Account card ── */}
                    {shouldShowUsdAccountCard ? (
                        <View style={styles.usdAccountSection}>
                            <View style={styles.tokenHeader}>
                                <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>USD Account</Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.tokenItem, styles.usdSetupCard, { backgroundColor: themeColors.surface }]}
                                onPress={handleOpenUsdAccount}
                                activeOpacity={0.9}
                            >
                                <View style={styles.tokenLeft}>
                                    <View style={[styles.tokenIconContainer, { backgroundColor: themeColors.surfaceHighlight || (isDark ? 'rgba(37,99,235,0.22)' : '#EAF0FF') }]}>
                                        <WalletIcon size={20} color={themeColors.textPrimary} />
                                    </View>
                                    <View>
                                        <Text style={[styles.tokenName, { color: themeColors.textPrimary }]}>{usdCardTitle}</Text>
                                        <Text style={[styles.tokenSymbol, { color: themeColors.textSecondary }]}>
                                            {usdCardSubtitle}
                                        </Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                            {usdStatus && !usdDetails?.ach?.accountNumberMasked ? (
                                <View style={styles.usdActionRow}>
                                    {usdStatus.sandboxMode ? null : usdStatus.diditKycStatus !== 'approved' ? (
                                        <Text style={[styles.usdMutedText, { color: themeColors.textSecondary }]}>
                                            Didit KYC must be approved before USD account setup.
                                        </Text>
                                    ) : usdStatus.accountStatus === 'not_started' ? null : (
                                        <TouchableOpacity style={[styles.usdActionButton, { backgroundColor: Colors.primary }]} onPress={handleUsdKyc}>
                                            <Text style={styles.usdActionButtonText}>Complete USD Account KYC</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ) : null}
                        </View>
                    ) : null}

                    {/* ── Assets / Activity section ── */}
                    <View style={styles.tokenSection}>
                        {/* Header row — tab labels left, filter dropdown right */}
                        <View style={styles.tokenHeader}>
                            <View style={styles.tabLabels}>
                                <TouchableOpacity
                                    onPress={() => setActiveTab('coins')}
                                    activeOpacity={0.7}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Text
                                        numberOfLines={1}
                                        style={[styles.tabTitle, { color: activeTab === 'coins' ? themeColors.textPrimary : inactiveTabColor }]}
                                    >
                                        Assets
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setActiveTab('activity')}
                                    activeOpacity={0.7}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                    <Text
                                        numberOfLines={1}
                                        style={[styles.tabTitle, { color: activeTab === 'activity' ? themeColors.textPrimary : inactiveTabColor }]}
                                    >
                                        Activity
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* Right dropdown: network filter for Coins, status filter for Activity */}
                            <View style={styles.tabFilterWrap}>
                                {activeTab === 'coins' ? (
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={() => setNetworkFilterSheetOpen(true)}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                        <View style={[styles.tabFilterButton, { backgroundColor: themeColors.surface }]}>
                                            {networkFilter !== 'all' && (
                                                <Image source={getNetworkIcon(networkFilter)} style={styles.networkFilterIcon} />
                                            )}
                                            <Text numberOfLines={1} style={[styles.tabFilterText, { color: themeColors.textPrimary }]}>
                                                {getNetworkFilterLabel(networkFilter)}
                                            </Text>
                                            <CaretDown size={14} color={themeColors.textSecondary} strokeWidth={3} />
                                        </View>
                                    </TouchableOpacity>
                                ) : (
                                    <TouchableOpacity
                                        activeOpacity={0.8}
                                        onPress={() => setActivityFilterSheetOpen(true)}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                        <View style={[styles.tabFilterButton, { backgroundColor: themeColors.surface }]}>
                                            <Text numberOfLines={1} style={[styles.tabFilterText, { color: themeColors.textPrimary }]}>
                                                {getActivityFilterLabel(activityFilter)}
                                            </Text>
                                            <CaretDown size={14} color={themeColors.textSecondary} strokeWidth={3} />
                                        </View>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {/* ── Coins tab content ── */}
                        {activeTab === 'coins' && (
                            <>
                                {filteredTokens.map((item, index) => (
                                    <TouchableOpacity
                                        key={`${item.chain}-${item.symbol}-${index}`}
                                        style={styles.tokenItem}
                                        onPress={() => {
                                            setSelectedToken(item);
                                            tokenDetailSheetRef.current?.present();
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <View style={styles.tokenLeft}>
                                            <View style={styles.tokenIconContainer}>
                                                <Image source={item.icon} style={styles.tokenIconImage} />
                                                {!(item as any).unified ? (
                                                    <View style={styles.chainBadgeOverlay}>
                                                        <Image source={getChainIcon(item.chain)} style={styles.chainBadgeIcon} />
                                                    </View>
                                                ) : null}
                                            </View>
                                            <View>
                                                <Text style={[styles.tokenName, { color: themeColors.textPrimary }]}>{item.name}</Text>
                                                <Text style={[styles.tokenSymbol, { color: themeColors.textSecondary }]}>
                                                    {item.balance === 0
                                                        ? `0 ${item.symbol}`
                                                        : `${item.balance.toFixed(item.symbol === 'USDC' ? 2 : 6).replace(/\.?0+$/, '')} ${item.symbol}`}
                                                </Text>
                                                {(item as any).pendingDeposit > 0 ? (
                                                    <Text style={[styles.tokenSymbol, { color: themeColors.textSecondary, fontSize: 11 }]}>
                                                        {`Moving ${((item as any).pendingDeposit as number).toFixed(2)} USDC to unified balance…`}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        </View>
                                        <View style={styles.tokenRight}>
                                            <Text style={[styles.tokenBalance, { color: themeColors.textPrimary }]}>
                                                ${item.balanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </Text>
                                            {(item as any).unified ? (
                                                <Text style={[styles.chainLabel, { color: themeColors.textSecondary }]}>
                                                    Unified
                                                </Text>
                                            ) : tokenPriceChanges[item.symbol] !== undefined ? (
                                                <Text style={[styles.chainLabel, {
                                                    color: tokenPriceChanges[item.symbol] >= 0 ? '#22C55E' : '#EF4444',
                                                }]}>
                                                    {tokenPriceChanges[item.symbol] >= 0 ? '+' : ''}
                                                    {tokenPriceChanges[item.symbol].toFixed(2)}%
                                                </Text>
                                            ) : (
                                                <Text style={[styles.chainLabel, { color: themeColors.textSecondary }]}>
                                                    {CHAIN_DISPLAY_NAMES[item.chain] ?? item.chain}
                                                </Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                ))}
                                {filteredTokens.length === 0 && (
                                    <View style={styles.emptyState}>
                                        <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                                            No tokens found on {networkFilter === 'all' ? 'any network' : CHAIN_DISPLAY_NAMES[networkFilter] ?? networkFilter}
                                        </Text>
                                    </View>
                                )}
                            </>
                        )}

                        {/* ── Activity tab content ── */}
                        {activeTab === 'activity' && (
                            <>
                                {/* Grouped activity list */}
                                {groupedActivity.length === 0 ? (
                                    <View style={styles.emptyState}>
                                        <ArrowLeftRightIcon size={40} color={themeColors.textSecondary} strokeWidth={2} />
                                        <Text style={[styles.emptyStateText, { color: themeColors.textSecondary, marginTop: 12 }]}>
                                            {activityFilter === 'all' ? 'No activity yet' : 'No matching activity'}
                                        </Text>
                                    </View>
                                ) : (
                                    groupedActivity.map(section => (
                                        <View key={section.title}>
                                            <Text style={[styles.activitySectionHeader, { color: themeColors.textSecondary }]}>
                                                {section.title}
                                            </Text>
                                            {section.data.map((item, idx) => renderActivityItem(item, idx))}
                                        </View>
                                    ))
                                )}
                            </>
                        )}
                    </View>
                </ScrollView>

                <SelectorSheet
                    visible={networkFilterSheetOpen}
                    onClose={() => setNetworkFilterSheetOpen(false)}
                    title="Asset filter"
                    options={NETWORK_FILTER_OPTIONS}
                    selectedId={networkFilter}
                    detentFraction={0.56}
                    onSelect={(id) => {
                        setNetworkFilter(id as NetworkFilter);
                    }}
                />

                <SelectorSheet
                    visible={activityFilterSheetOpen}
                    onClose={() => setActivityFilterSheetOpen(false)}
                    title="Activity filter"
                    options={ACTIVITY_FILTER_OPTIONS}
                    selectedId={activityFilter}
                    detentFraction={0.52}
                    onSelect={(id) => {
                        setActivityFilter(id as ActivityFilter);
                    }}
                />

                {/* ──────────────── Bottom sheets ──────────────── */}

                {/* Receive chooser sheet */}
                <TrueSheet
                    ref={receiveChooserSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDidDismiss={handleSheetDismiss}
                >
                    <View style={styles.sendSheetContent}>
                        <Text style={[styles.sendSheetTitle, { color: themeColors.textPrimary }]}>Receive</Text>
                        <Text style={[styles.sendSheetSubtitle, { color: themeColors.textSecondary }]}>Choose how you want to receive funds</Text>
                        <TouchableOpacity
                            style={[styles.sendOptionCard, { backgroundColor: themeColors.surface }]}
                            onPress={() => handleReceiveOptionPress('onramp')}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={[styles.actionIconBox, { backgroundColor: themeColors.background, width: 40, height: 40 }]}>
                                    <LandmarkIcon size={20} color={themeColors.textPrimary} />
                                </View>
                                <View>
                                    <Text style={[styles.sendOptionTitle, { color: themeColors.textPrimary }]}>Buy USDC</Text>
                                    <Text style={[styles.sendOptionSubtitle, { color: themeColors.textSecondary }]}>Pay with local currency</Text>
                                </View>
                            </View>
                            <CaretLeft size={20} color={themeColors.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.sendOptionCard, { backgroundColor: themeColors.surface }]}
                            onPress={() => handleReceiveOptionPress('crypto')}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={[styles.actionIconBox, { backgroundColor: themeColors.background, width: 40, height: 40 }]}>
                                    <QrCode size={20} color={themeColors.textPrimary} />
                                </View>
                                <View>
                                    <Text style={[styles.sendOptionTitle, { color: themeColors.textPrimary }]}>Receive crypto</Text>
                                    <Text style={[styles.sendOptionSubtitle, { color: themeColors.textSecondary }]}>Share your wallet address or QR</Text>
                                </View>
                            </View>
                            <CaretLeft size={20} color={themeColors.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
                        </TouchableOpacity>
                        {canAccessUsdAccountFeature ? (
                            <TouchableOpacity
                                style={[styles.sendOptionCard, { backgroundColor: themeColors.surface }]}
                                onPress={() => handleReceiveOptionPress('usd')}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                                    <View style={[styles.actionIconBox, { backgroundColor: themeColors.background, width: 40, height: 40 }]}>
                                        <WalletIcon size={20} color={themeColors.textPrimary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.sendOptionTitle, { color: themeColors.textPrimary }]}>USD account</Text>
                                        <Text style={[styles.sendOptionSubtitle, { color: themeColors.textSecondary }]} numberOfLines={2}>
                                            {hasActiveUsdAccountDetails ? 'View account and routing details' : 'Open account details for bank transfers'}
                                        </Text>
                                    </View>
                                </View>
                                <CaretLeft size={20} color={themeColors.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </TrueSheet>

                {/* Receive sheet */}
                <TrueSheet
                    ref={receiveSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDidDismiss={handleSheetDismiss}
                >
                    <View style={styles.bottomSheetContent}>
                        <View style={styles.receiveHeader}>
                            <Text style={[styles.receiveHeaderTitle, { color: themeColors.textPrimary }]}>Receive</Text>
                            <IOSGlassIconButton
                                onPress={() => receiveSheetRef.current?.dismiss()}
                                systemImage="xmark"
                                circleStyle={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                                icon={<X size={22} color={themeColors.textSecondary} strokeWidth={3.5} />}
                            />
                        </View>
                        <View style={styles.receiveBody}>
                            {Platform.OS === 'ios' && Host && Menu && ExpoButton ? (
                                <Host matchContents>
                                    <Menu
                                        label={(
                                            <View style={styles.receiveChainDropdownContainer}>
                                                <View style={[styles.networkFilterButton, { backgroundColor: themeColors.surface }]}>
                                                    <Image source={selectedChainMeta.icon} style={styles.receiveChainDropdownIcon} />
                                                    <Text style={[styles.networkFilterText, { color: themeColors.textPrimary }]}>
                                                        {selectedChainMeta.name}
                                                    </Text>
                                                    <CaretDown size={14} color={themeColors.textSecondary} strokeWidth={3} />
                                                </View>
                                            </View>
                                        )}
                                    >
                                        <ExpoButton label="EVM"    onPress={() => setSelectedChain('base')} />
                                        <ExpoButton label="Solana" onPress={() => setSelectedChain('solana')} />
                                    </Menu>
                                </Host>
                            ) : (
                                <AndroidDropdownMenu
                                    options={[
                                        { label: 'EVM',    onPress: () => setSelectedChain('base') },
                                        { label: 'Solana', onPress: () => setSelectedChain('solana') },
                                    ]}
                                    trigger={
                                        <View style={[styles.receiveChainDropdown, { backgroundColor: themeColors.surface }]}>
                                            <Image source={selectedChainMeta.icon} style={styles.receiveChainDropdownIcon} />
                                            <Text style={[styles.receiveChainDropdownText, { color: themeColors.textPrimary }]}>
                                                {selectedChainMeta.name}
                                            </Text>
                                            <CaretDown size={14} color={themeColors.textSecondary} strokeWidth={3} />
                                        </View>
                                    }
                                />
                            )}
                            <View style={[styles.qrCardCompact, { backgroundColor: themeColors.surface }]}>
                                <QRCode value={selectedAddress || 'no-address'} size={210} backgroundColor="#FFFFFF" color="#000000" />
                            </View>
                            <Text style={[styles.receiveTitle, { color: themeColors.textPrimary }]}>
                                Your {selectedChainMeta.name} Address
                            </Text>
                            <Text style={[styles.receiveSubtext, { color: themeColors.textSecondary }]}>
                                Use this address to receive tokens on{' '}
                                <Text style={[styles.receiveSubtextStrong, { color: themeColors.textPrimary }]}>{selectedChainMeta.name}</Text>.
                            </Text>
                            <TouchableOpacity
                                style={[styles.addressPill, { backgroundColor: themeColors.surface }]}
                                onPress={copySelectedAddress}
                                disabled={!selectedAddress}
                            >
                                <Text style={[styles.addressPillText, { color: themeColors.textPrimary }]} numberOfLines={1} ellipsizeMode="middle">
                                    {selectedAddress || 'Address not available'}
                                </Text>
                                <Copy size={18} color={themeColors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.shareButton, { backgroundColor: Colors.primary }]}
                                onPress={shareSelectedAddress}
                                disabled={!selectedAddress}
                            >
                                <Text style={styles.shareButtonText}>Share</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TrueSheet>

                {/* Send sheet */}
                <TrueSheet
                    ref={sendSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDidDismiss={handleSheetDismiss}
                >
                    <View style={styles.sendSheetContent}>
                        <Text style={[styles.sendSheetTitle,    { color: themeColors.textPrimary }]}>Send</Text>
                        <Text style={[styles.sendSheetSubtitle, { color: themeColors.textSecondary }]}>Choose how you want to move funds</Text>
                        <TouchableOpacity
                            style={[styles.sendOptionCard, { backgroundColor: themeColors.surface }]}
                            onPress={() => handleSendOptionPress('/wallet/send-address')}
                        >
                            <View>
                                <Text style={[styles.sendOptionTitle,    { color: themeColors.textPrimary }]}>Send crypto</Text>
                                <Text style={[styles.sendOptionSubtitle, { color: themeColors.textSecondary }]}>Transfer to any wallet address</Text>
                            </View>
                            <CaretLeft size={20} color={themeColors.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.sendOptionCard, { backgroundColor: themeColors.surface }]}
                            onPress={() => handleSendOptionPress('/offramp-history/create')}
                        >
                            <View>
                                <Text style={[styles.sendOptionTitle,    { color: themeColors.textPrimary }]}>Withdraw to bank</Text>
                                <Text style={[styles.sendOptionSubtitle, { color: themeColors.textSecondary }]}>Cash out to your account</Text>
                            </View>
                            <CaretLeft size={20} color={themeColors.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
                        </TouchableOpacity>
                    </View>
                </TrueSheet>

                {/* Activity settings sheet */}
                <TrueSheet
                    ref={activitySettingsSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDidDismiss={handleSheetDismiss}
                >
                    <View style={styles.sendSheetContent}>
                        <Text style={[styles.sendSheetTitle, { color: themeColors.textPrimary }]}>Activity settings</Text>
                        <Text style={[styles.sendSheetSubtitle, { color: themeColors.textSecondary }]}>
                            Choose which wallet activity stays visible.
                        </Text>

                        <View style={[styles.activitySettingCard, { backgroundColor: themeColors.surface }]}>
                            <View style={styles.activitySettingCopy}>
                                <Text style={[styles.sendOptionTitle, { color: themeColors.textPrimary }]}>Hide microtransactions</Text>
                                <Text style={[styles.sendOptionSubtitle, { color: themeColors.textSecondary }]}>
                                    Filters activity worth less than $0.10.
                                </Text>
                            </View>
                            <Switch
                                value={settings?.hideMicrotransactions ?? false}
                                onValueChange={(enabled) => { void settings?.setHideMicrotransactions(enabled); }}
                                trackColor={{ false: themeColors.border, true: Colors.success }}
                                thumbColor="#FFFFFF"
                                ios_backgroundColor={themeColors.border}
                            />
                        </View>

                        <View style={[styles.activitySettingCard, { backgroundColor: themeColors.surface }]}>
                            <View style={styles.activitySettingCopy}>
                                <Text style={[styles.sendOptionTitle, { color: themeColors.textPrimary }]}>Hide unusual activity</Text>
                                <Text style={[styles.sendOptionSubtitle, { color: themeColors.textSecondary }]}>
                                    Filters inbound spam, obscure coins, and suspicious token transfers.
                                </Text>
                            </View>
                            <Switch
                                value={settings?.hideUnusualActivity ?? false}
                                onValueChange={(enabled) => { void settings?.setHideUnusualActivity(enabled); }}
                                trackColor={{ false: themeColors.border, true: Colors.success }}
                                thumbColor="#FFFFFF"
                                ios_backgroundColor={themeColors.border}
                            />
                        </View>
                    </View>
                </TrueSheet>

                {/* Auto-settlement sheet */}
                <TrueSheet
                    ref={autoSettlementSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDidDismiss={handleSheetDismiss}
                >
                    <View style={styles.sendSheetContent}>
                        <Text style={[styles.sendSheetTitle,    { color: themeColors.textPrimary }]}>Auto-settlement</Text>
                        <Text style={[styles.sendSheetSubtitle, { color: themeColors.textSecondary }]}>
                            Choose where incoming USD settles as USDC
                        </Text>
                        <TouchableOpacity
                            style={[styles.sendOptionCard, { backgroundColor: themeColors.surface }]}
                            onPress={() => handleSelectAutoSettlementChain('BASE')}
                            disabled={isUpdatingAutoSettlement}
                        >
                            <View style={styles.chainOptionLeft}>
                                <Image source={require('../../../assets/icons/networks/base.png')} style={styles.chainOptionIcon} />
                                <Text style={[styles.sendOptionTitle, { color: themeColors.textPrimary, marginBottom: 0 }]}>Base</Text>
                            </View>
                            {isUpdatingAutoSettlement
                                ? <ActivityIndicator size="small" color={themeColors.textSecondary} />
                                : <CaretLeft size={20} color={themeColors.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.sendOptionCard, { backgroundColor: themeColors.surface }]}
                            onPress={() => handleSelectAutoSettlementChain('SOLANA')}
                            disabled={isUpdatingAutoSettlement}
                        >
                            <View style={styles.chainOptionLeft}>
                                <Image source={require('../../../assets/icons/networks/solana.png')} style={styles.chainOptionIcon} />
                                <Text style={[styles.sendOptionTitle, { color: themeColors.textPrimary, marginBottom: 0 }]}>Solana</Text>
                            </View>
                            {isUpdatingAutoSettlement
                                ? <ActivityIndicator size="small" color={themeColors.textSecondary} />
                                : <CaretLeft size={20} color={themeColors.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />}
                        </TouchableOpacity>
                    </View>
                </TrueSheet>

                {/* USD account details sheet */}
                <TrueSheet
                    ref={usdAccountDetailsSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDidDismiss={handleSheetDismiss}
                >
                    <View style={styles.usdAccountDetailsSheet}>
                        <View style={styles.usdAccountDetailsHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.sendSheetTitle, { color: themeColors.textPrimary }]}>USD account</Text>
                                <Text style={[styles.sendSheetSubtitle, { color: themeColors.textSecondary, marginBottom: 0 }]}>
                                    Account and routing details for bank transfers.
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.usdInfoButton, { backgroundColor: themeColors.surface }]}
                                onPress={() => {
                                    usdAccountDetailsSheetRef.current?.dismiss();
                                    setTimeout(() => usdAccountAboutSheetRef.current?.present(), 160);
                                }}
                                activeOpacity={0.85}
                                accessibilityLabel="About this account"
                            >
                                <Text style={[styles.usdInfoButtonText, { color: themeColors.textPrimary }]}>!</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.usdDetailsCard, { backgroundColor: themeColors.surface }]}>
                            {usdAccountRows.map((row, index) => (
                                <View key={row.label}>
                                    <View style={styles.usdDetailsRow}>
                                        <View style={styles.usdDetailsTextWrap}>
                                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>{row.label}</Text>
                                            <Text selectable style={[styles.detailValue, { color: themeColors.textPrimary }]} numberOfLines={1} ellipsizeMode="middle">
                                                {row.value}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            style={[styles.usdCopyButton, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}
                                            onPress={() => copyToClipboard(row.value)}
                                            activeOpacity={0.85}
                                        >
                                            <Copy size={15} color={themeColors.textSecondary} strokeWidth={2.5} />
                                        </TouchableOpacity>
                                    </View>
                                    {index < usdAccountRows.length - 1 ? <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} /> : null}
                                </View>
                            ))}
                        </View>

                        <TouchableOpacity
                            style={[styles.viewButton, { backgroundColor: Colors.primary }]}
                            onPress={() => {
                                const message = usdAccountRows.map(row => `${row.label}: ${row.value}`).join('\n');
                                Share.share({ message }).catch(() => undefined);
                            }}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.viewButtonText}>Share details</Text>
                        </TouchableOpacity>
                    </View>
                </TrueSheet>

                {/* USD account about sheet */}
                <TrueSheet
                    ref={usdAccountAboutSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDidDismiss={handleSheetDismiss}
                >
                    <View style={styles.usdAboutSheet}>
                        <View style={[styles.usdAboutIcon, { backgroundColor: themeColors.surface }]}>
                            <Text style={[styles.usdAboutIconText, { color: themeColors.textPrimary }]}>!</Text>
                        </View>
                        <Text style={[styles.usdAboutTitle, { color: themeColors.textPrimary }]}>About this account</Text>
                        <Text style={[styles.usdAboutBody, { color: themeColors.textSecondary }]}>
                            Use these account details to receive USD bank transfers from clients. Deposits are processed by Bridge and settle into your Hedwig balance after review.
                        </Text>
                        <View style={[styles.usdAboutCard, { backgroundColor: themeColors.surface }]}>
                            {[
                                'Only share these details with clients and trusted payers.',
                                'USD deposits usually settle in one to three business days.',
                                'The minimum recommended deposit is $5. Deposits below $5 may be delayed while they are reviewed or reconciled.',
                                'Hedwig charges a 1% processing fee on USD account deposits.',
                                'If a memo or reference is shown, your client must include it with the transfer.',
                                'ACH deposits can be tracked with a trace number. Wire deposits can be tracked with an IMAD or wire message when available.',
                            ].map(item => (
                                <View key={item} style={styles.usdAboutRow}>
                                    <View style={[styles.usdAboutBullet, { backgroundColor: Colors.primary }]} />
                                    <Text style={[styles.usdAboutText, { color: themeColors.textSecondary }]}>{item}</Text>
                                </View>
                            ))}
                        </View>
                        <TouchableOpacity
                            style={[styles.bridgeKycPrimaryButton, { backgroundColor: Colors.primary, marginBottom: 0 }]}
                            onPress={() => usdAccountAboutSheetRef.current?.dismiss()}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.bridgeKycPrimaryButtonText}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </TrueSheet>

                {/* Bridge KYC info sheet */}
                <TrueSheet
                    ref={bridgeKycInfoSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDidDismiss={handleSheetDismiss}
                >
                    <View style={{ paddingTop: 28, paddingBottom: 26, paddingHorizontal: 20 }}>
                        <View style={styles.bridgeKycSheetContent}>
                            <View style={[styles.bridgeKycIconWrap, { backgroundColor: themeColors.surfaceHighlight || 'rgba(37, 99, 235, 0.14)' }]}>
                                <ShieldCheck size={32} color={themeColors.textPrimary} />
                            </View>
                            <Text style={[styles.bridgeKycTitle, { color: themeColors.textPrimary }]}>Set up your USD account</Text>
                            <Text style={[styles.bridgeKycBody,  { color: themeColors.textSecondary }]}>
                                To issue compliant USD account details, our partner Bridge runs a separate identity review.
                                This verification is independent of your in-app KYC. Once approved, your USD account and routing details are assigned and ready for incoming deposits.
                            </Text>
                            <View style={styles.bridgeKycBullets}>
                                {[
                                    'Bridge verification is required once per user',
                                    'Approval unlocks your account and routing details',
                                    'You can return any time to complete setup',
                                ].map(bullet => (
                                    <View key={bullet} style={styles.bridgeKycBulletRow}>
                                        <View style={[styles.bridgeKycBullet, { backgroundColor: Colors.primary }]} />
                                        <Text style={[styles.bridgeKycBulletText, { color: themeColors.textSecondary }]}>{bullet}</Text>
                                    </View>
                                ))}
                            </View>
                            <TouchableOpacity
                                style={[styles.bridgeKycPrimaryButton, { backgroundColor: Colors.primary }]}
                                onPress={async () => {
                                    bridgeKycInfoSheetRef.current?.dismiss();
                                    setTimeout(() => { void handleUsdKyc(); }, 180);
                                }}
                            >
                                <Text style={styles.bridgeKycPrimaryButtonText}>Verify and create account</Text>
                                <ArrowRight size={18} color="#FFFFFF" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.bridgeKycSecondaryButton, { backgroundColor: themeColors.surfaceHighlight || 'rgba(148,163,184,0.14)' }]}
                                onPress={() => bridgeKycInfoSheetRef.current?.dismiss()}
                            >
                                <Text style={[styles.bridgeKycSecondaryButtonText, { color: themeColors.textPrimary }]}>Not now</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TrueSheet>

                {/* USD account transfer detail sheet */}
                <TrueSheet
                    ref={usdTransferDetailSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDidDismiss={handleSheetDismiss}
                >
                    <View style={{ paddingTop: 28, paddingBottom: 26, paddingHorizontal: 20 }}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <View style={[styles.modalIconContainer, { backgroundColor: themeColors.surface }]}>
                                    <LandmarkIcon size={30} color={themeColors.textPrimary} />
                                </View>
                                <View>
                                    <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>USD account deposit</Text>
                                    <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                                        {selectedUsdTransfer?.createdAt ? format(new Date(selectedUsdTransfer.createdAt), 'MMM d, h:mm a') : ''}
                                    </Text>
                                </View>
                            </View>
                            <IOSGlassIconButton
                                onPress={() => usdTransferDetailSheetRef.current?.dismiss()}
                                systemImage="xmark"
                                circleStyle={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                                icon={<X size={22} color={themeColors.textSecondary} strokeWidth={3.5} />}
                            />
                        </View>

                        {selectedUsdTransfer ? (
                            <ScrollView showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">
                                <View style={[styles.amountCard, { backgroundColor: themeColors.surface }]}>
                                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary, marginBottom: 6 }]}>Amount received</Text>
                                    <Text style={[styles.amountCardValue, { color: themeColors.textPrimary }]}>
                                        +${Number(selectedUsdTransfer.grossUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </Text>
                                    <Text style={[styles.amountCardSubText, { color: themeColors.textSecondary, marginTop: 4 }]}>
                                        Net ${Number(selectedUsdTransfer.netUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} settled
                                    </Text>
                                </View>

                                <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                                    {[
                                        { label: 'Transfer ID', value: selectedUsdTransfer.bridgeTransferId || selectedUsdTransfer.id, copy: selectedUsdTransfer.bridgeTransferId || selectedUsdTransfer.id },
                                        {
                                            label: 'Status',
                                            value: WITHDRAWAL_STATUS_CONFIG[normalizeUsdTransferStatus(selectedUsdTransfer.status)]?.label || 'Pending',
                                        },
                                        {
                                            label: 'Source',
                                            value: selectedUsdTransfer.sourceLabel ||
                                                (selectedUsdTransfer.sourceType === 'EXTERNAL_ADDRESS'
                                                    ? 'External address'
                                                    : selectedUsdTransfer.sourceType === 'ACH'
                                                        ? 'ACH transfer'
                                                        : 'USD deposit'),
                                        },
                                        { label: 'Provider fee', value: `$${Number(selectedUsdTransfer.providerFeeUsd || 0).toFixed(2)}` },
                                        { label: 'Hedwig fee', value: `$${Number(selectedUsdTransfer.hedwigFeeUsd || 0).toFixed(2)}` },
                                        ...(selectedUsdTransfer.usdcTxHash ? [{ label: 'USDC tx', value: `${selectedUsdTransfer.usdcTxHash.slice(0, 10)}…${selectedUsdTransfer.usdcTxHash.slice(-8)}`, copy: selectedUsdTransfer.usdcTxHash }] : []),
                                    ].map((row, i, arr) => (
                                        <View key={row.label}>
                                            <View style={styles.detailRow}>
                                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>{row.label}</Text>
                                                {row.copy ? (
                                                    <TouchableOpacity onPress={() => copyToClipboard(row.copy!)} style={styles.detailValueRow}>
                                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]} numberOfLines={1} ellipsizeMode="middle">{row.value}</Text>
                                                        <Copy size={14} color={themeColors.textSecondary} strokeWidth={2.5} style={{ marginLeft: 6 }} />
                                                    </TouchableOpacity>
                                                ) : (
                                                    <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{row.value}</Text>
                                                )}
                                            </View>
                                            {i < arr.length - 1 && <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />}
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>
                        ) : null}
                    </View>
                </TrueSheet>

                {/* Token detail sheet */}
                <TokenDetailSheet
                    ref={tokenDetailSheetRef}
                    selectedToken={selectedToken}
                    initialPriceChange={selectedToken ? tokenPriceChanges[selectedToken.symbol] : undefined}
                    onDismiss={() => setSelectedToken(null)}
                    onSend={() => {
                        tokenDetailSheetRef.current?.dismiss();
                        // Jump straight into the standard recipient input
                        // flow rather than opening the deprecated bottom
                        // sheet — keeps a real back-stack so users can
                        // navigate backwards naturally.
                        setTimeout(() => router.push('/wallet/send-address' as any), 320);
                    }}
                    onDeposit={() => {
                        tokenDetailSheetRef.current?.dismiss();
                        // Pre-fill with the largest EOA-held USDC chain so the
                        // deposit screen targets whichever leg is stuck.
                        const candidates: Array<[string, number]> = [
                            ['base', eoaUsdcByChain.base],
                            ['arbitrum', eoaUsdcByChain.arbitrum],
                            ['polygon', eoaUsdcByChain.polygon],
                            ['optimism', eoaUsdcByChain.optimism],
                        ];
                        const [bestChain, bestAmount] = candidates.reduce(
                            (best, cur) => (cur[1] > best[1] ? cur : best),
                            ['base', 0]
                        );
                        setTimeout(() => {
                            router.push({
                                pathname: '/wallet/deposit' as any,
                                params: {
                                    network: bestChain,
                                    amount: bestAmount > 0 ? bestAmount.toFixed(2) : '',
                                },
                            });
                        }, 320);
                    }}
                />

                {/* Crypto transaction detail sheet */}
                <TrueSheet
                    ref={txDetailSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDidDismiss={handleSheetDismiss}
                >
                    <View style={{ paddingTop: 28, paddingBottom: 26, paddingHorizontal: 24 }}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <View style={styles.modalIconContainer}>
                                    <Image source={ACTIVITY_ICONS.usdc} style={styles.modalTokenIcon} />
                                    <Image
                                        source={selectedTx?.type === 'IN' ? ACTIVITY_ICONS.receive : ACTIVITY_ICONS.send}
                                        style={styles.modalStatusBadge}
                                    />
                                </View>
                                <View>
                                    <Text style={[styles.modalTitle,    { color: themeColors.textPrimary }]}>
                                        {selectedTx?.type === 'IN' ? 'Received' : 'Sent'}
                                    </Text>
                                    <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                                        {selectedTx?.date ? format(new Date(selectedTx.date), 'MMM d, yyyy • h:mm a') : ''}
                                    </Text>
                                </View>
                            </View>
                            <IOSGlassIconButton
                                onPress={() => txDetailSheetRef.current?.dismiss()}
                                systemImage="xmark"
                                circleStyle={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                                icon={<X size={22} color={themeColors.textSecondary} strokeWidth={3.5} />}
                            />
                        </View>

                        {selectedTx && (
                            <>
                                <View style={[styles.amountCard, { backgroundColor: themeColors.surface }]}>
                                    <Text style={[styles.amountCardValue, { color: themeColors.textPrimary }]}>
                                        {selectedTx.type === 'IN' ? '+' : '-'}${selectedTx.amount}
                                    </Text>
                                    <View style={styles.amountCardSub}>
                                        <Image source={ACTIVITY_ICONS.usdc} style={styles.smallIcon} />
                                        <Text style={[styles.amountCardSubText, { color: themeColors.textSecondary }]}>
                                            {selectedTx.amount} {selectedTx.token}
                                        </Text>
                                    </View>
                                </View>

                                <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                                    <View style={styles.detailRow}>
                                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Transaction ID</Text>
                                        <TouchableOpacity onPress={() => copyToClipboard(selectedTx.hash)} style={styles.detailValueRow}>
                                            <Text style={[styles.detailValue, { color: themeColors.textPrimary }]} numberOfLines={1} ellipsizeMode="middle">
                                                {selectedTx.hash.slice(0, 10)}...{selectedTx.hash.slice(-8)}
                                            </Text>
                                            <Copy size={14} color={themeColors.textSecondary} strokeWidth={3} style={{ marginLeft: 6 }} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                                    <View style={styles.detailRow}>
                                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>
                                            {selectedTx.type === 'IN' ? 'From' : 'To'}
                                        </Text>
                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                            {selectedTx.type === 'IN'
                                                ? `${selectedTx.from.slice(0,6)}...${selectedTx.from.slice(-4)}`
                                                : `${selectedTx.to.slice(0,6)}...${selectedTx.to.slice(-4)}`}
                                        </Text>
                                    </View>
                                    <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                                    <View style={styles.detailRow}>
                                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Chain</Text>
                                        <View style={styles.chainValueRow}>
                                            <Image source={ACTIVITY_CHAINS[selectedTx.network]?.icon || ACTIVITY_ICONS.base} style={styles.smallIcon} />
                                            <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                                {ACTIVITY_CHAINS[selectedTx.network]?.name || 'Base'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                <TouchableOpacity
                                    style={[styles.viewButton, { backgroundColor: Colors.primary }]}
                                    onPress={() => openExplorer(selectedTx)}
                                >
                                    <Text style={styles.viewButtonText}>View on Explorer</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </TrueSheet>

                {/* Withdrawal detail sheet */}
                <TrueSheet
                    ref={withdrawalDetailSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDidDismiss={handleSheetDismiss}
                >
                    <View style={{ paddingTop: 28, paddingBottom: 26, paddingHorizontal: 20 }}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <View style={styles.modalIconContainer}>
                                    <Image
                                        source={selectedOrder ? (ACTIVITY_ICONS.usdc) : ACTIVITY_ICONS.usdc}
                                        style={styles.modalTokenIcon}
                                    />
                                </View>
                                <View>
                                    <Text style={[styles.modalTitle,    { color: themeColors.textPrimary }]}>
                                        {selectedOrder?.status
                                            ? selectedOrder.status.charAt(0).toUpperCase() + selectedOrder.status.slice(1).toLowerCase()
                                            : 'Withdrawal'}
                                    </Text>
                                    <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                                        {selectedOrder?.createdAt ? format(new Date(selectedOrder.createdAt), 'MMM d, h:mm a') : ''}
                                    </Text>
                                </View>
                            </View>
                            <IOSGlassIconButton
                                onPress={() => withdrawalDetailSheetRef.current?.dismiss()}
                                systemImage="xmark"
                                circleStyle={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                                icon={<X size={22} color={themeColors.textSecondary} strokeWidth={3.5} />}
                            />
                        </View>

                        {selectedOrder && (
                            <ScrollView showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">
                                <View style={[styles.progressSection, { backgroundColor: themeColors.surface }]}>
                                    <ProgressSteps status={selectedOrder.status} themeColors={themeColors} />
                                </View>

                                <View style={[styles.amountCard, { backgroundColor: themeColors.surface }]}>
                                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary, marginBottom: 6 }]}>Amount Sent</Text>
                                    <Text style={[styles.amountCardValue, { color: themeColors.textPrimary }]}>
                                        {selectedOrder.fiatCurrency} {selectedOrder.fiatAmount?.toLocaleString()}
                                    </Text>
                                    <Text style={[styles.amountCardSubText, { color: themeColors.textSecondary, marginTop: 4 }]}>
                                        {selectedOrder.cryptoAmount} {selectedOrder.token}
                                    </Text>
                                </View>

                                <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                                    {[
                                        { label: 'Order ID', value: (selectedOrder.providerOrderId || selectedOrder.paycrestOrderId || selectedOrder.id).slice(0, 18) + '…', copy: selectedOrder.providerOrderId || selectedOrder.paycrestOrderId || selectedOrder.id },
                                        { label: 'Bank',     value: selectedOrder.bankName,     sub: selectedOrder.accountNumber },
                                        { label: 'Chain',    value: ACTIVITY_CHAINS[selectedOrder.chain]?.name || 'Base', chainIcon: ACTIVITY_CHAINS[selectedOrder.chain]?.icon },
                                        { label: 'Rate',     value: `1 ${selectedOrder.token} = ${selectedOrder.fiatCurrency} ${Number(selectedOrder.exchangeRate || 0).toLocaleString()}` },
                                    ].map((row, i, arr) => (
                                        <View key={row.label}>
                                            <View style={styles.detailRow}>
                                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>{row.label}</Text>
                                                {row.copy ? (
                                                    <TouchableOpacity onPress={() => copyToClipboard(row.copy!)} style={styles.detailValueRow}>
                                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{row.value}</Text>
                                                        <Copy size={14} color={themeColors.textSecondary} strokeWidth={2.5} style={{ marginLeft: 6 }} />
                                                    </TouchableOpacity>
                                                ) : row.chainIcon ? (
                                                    <View style={styles.chainValueRow}>
                                                        <Image source={row.chainIcon} style={styles.smallIcon} />
                                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{row.value}</Text>
                                                    </View>
                                                ) : (
                                                    <View style={{ alignItems: 'flex-end' }}>
                                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{row.value}</Text>
                                                        {row.sub && <Text style={[styles.detailLabel, { color: themeColors.textSecondary, fontSize: 12 }]}>{row.sub}</Text>}
                                                    </View>
                                                )}
                                            </View>
                                            {i < arr.length - 1 && <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />}
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </TrueSheet>

                {/* Onramp detail sheet */}
                <TrueSheet
                    ref={onrampDetailSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDidDismiss={handleSheetDismiss}
                >
                    <View style={{ paddingTop: 28, paddingBottom: 26, paddingHorizontal: 20 }}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <View style={styles.modalIconContainer}>
                                    <Image source={ACTIVITY_ICONS.usdc} style={styles.modalTokenIcon} />
                                </View>
                                <View>
                                    <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                                        {selectedOnrampOrder?.status
                                            ? selectedOnrampOrder.status.charAt(0).toUpperCase() + selectedOnrampOrder.status.slice(1).toLowerCase()
                                            : 'Buy USDC'}
                                    </Text>
                                    <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                                        {selectedOnrampOrder?.createdAt ? format(new Date(selectedOnrampOrder.createdAt), 'MMM d, h:mm a') : ''}
                                    </Text>
                                </View>
                            </View>
                            <IOSGlassIconButton
                                onPress={() => onrampDetailSheetRef.current?.dismiss()}
                                systemImage="xmark"
                                circleStyle={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                                icon={<X size={22} color={themeColors.textSecondary} strokeWidth={3.5} />}
                            />
                        </View>

                        {selectedOnrampOrder && (
                            <ScrollView showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">
                                <View style={[styles.progressSection, { backgroundColor: themeColors.surface }]}>
                                    <ProgressSteps status={selectedOnrampOrder.status} themeColors={themeColors} />
                                </View>

                                <View style={[styles.amountCard, { backgroundColor: themeColors.surface }]}>
                                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary, marginBottom: 6 }]}>Amount to pay</Text>
                                    <Text style={[styles.amountCardValue, { color: themeColors.textPrimary }]}>
                                        {selectedOnrampOrder.fiatCurrency} {Number(selectedOnrampOrder.providerAmountToTransfer || selectedOnrampOrder.fiatAmount || 0).toLocaleString()}
                                    </Text>
                                    <Text style={[styles.amountCardSubText, { color: themeColors.textSecondary, marginTop: 4 }]}>
                                        {Number(selectedOnrampOrder.cryptoAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} {selectedOnrampOrder.token}
                                    </Text>
                                </View>

                                <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                                    {[
                                        { label: 'Order ID', value: (selectedOnrampOrder.providerOrderId || selectedOnrampOrder.paycrestOrderId || selectedOnrampOrder.id).slice(0, 18) + '…', copy: selectedOnrampOrder.providerOrderId || selectedOnrampOrder.paycrestOrderId || selectedOnrampOrder.id },
                                        { label: 'Deposit bank', value: selectedOnrampOrder.providerInstitution || 'Pending', sub: selectedOnrampOrder.providerAccountNumber || undefined },
                                        { label: 'Account name', value: selectedOnrampOrder.providerAccountName || 'Pending' },
                                        { label: 'Refund bank', value: selectedOnrampOrder.refundInstitution || 'Not set', sub: selectedOnrampOrder.refundAccountNumber || undefined },
                                        { label: 'Chain', value: ACTIVITY_CHAINS[selectedOnrampOrder.chain]?.name || 'Base', chainIcon: ACTIVITY_CHAINS[selectedOnrampOrder.chain]?.icon },
                                        { label: 'Rate', value: `1 ${selectedOnrampOrder.token} = ${selectedOnrampOrder.fiatCurrency} ${Number(selectedOnrampOrder.exchangeRate || 0).toLocaleString()}` },
                                        ...(selectedOnrampOrder.validUntil ? [{ label: 'Deposit window', value: format(new Date(selectedOnrampOrder.validUntil), 'MMM d, h:mm a') }] : []),
                                    ].map((row, i, arr) => (
                                        <View key={row.label}>
                                            <View style={styles.detailRow}>
                                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>{row.label}</Text>
                                                {row.copy ? (
                                                    <TouchableOpacity onPress={() => copyToClipboard(row.copy!)} style={styles.detailValueRow}>
                                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{row.value}</Text>
                                                        <Copy size={14} color={themeColors.textSecondary} strokeWidth={2.5} style={{ marginLeft: 6 }} />
                                                    </TouchableOpacity>
                                                ) : row.chainIcon ? (
                                                    <View style={styles.chainValueRow}>
                                                        <Image source={row.chainIcon} style={styles.smallIcon} />
                                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{row.value}</Text>
                                                    </View>
                                                ) : (
                                                    <View style={{ alignItems: 'flex-end' }}>
                                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{row.value}</Text>
                                                        {row.sub && <Text style={[styles.detailLabel, { color: themeColors.textSecondary, fontSize: 12 }]}>{row.sub}</Text>}
                                                    </View>
                                                )}
                                            </View>
                                            {i < arr.length - 1 && <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />}
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </TrueSheet>
            </SafeAreaView>
        </>
    );
}

const styles = StyleSheet.create({
    container:      { flex: 1 },
    header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    profileImage:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    settingsButton: { width: 40, height: 40, borderRadius: 20 },
    content:        { flex: 1, paddingHorizontal: 20 },

    balanceSection: { marginTop: 24, marginBottom: 28, alignItems: 'flex-start' },
    totalBalance:   { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 44, letterSpacing: -1.5 },
    addressCopyText:{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13 },

    actionButtons:     { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 32 },
    actionButton:      { alignItems: 'center', gap: 8, minWidth: 72 },
    actionIconBox:     { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
    actionButtonLabel: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },

    usdAccountSection:  { marginBottom: 20 },
    tokenHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 },
    sectionTitle:       { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 22 },
    usdMutedText:       { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, lineHeight: 18 },
    usdActionRow:       { marginTop: 12 },
    usdActionButton:    { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
    usdActionButtonText:{ color: '#FFFFFF', fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },
    usdSetupCard:       { borderRadius: 22, paddingHorizontal: 14 },

    tokenSection:       { marginBottom: 100 },

    // ─── Tab labels (text style, same as original header) ───
    tabLabels: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        flex: 1,
    },
    tabTitle: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 22 },
    tabFilterWrap: { flexShrink: 0 },
    tabFilterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    tabFilterText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },

    // ─── Coins ───
    networkFilterButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
    networkFilterIcon:   { width: 16, height: 16, borderRadius: 8 },
    networkFilterText:   { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },

    tokenItem:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 },
    tokenLeft:          { flexDirection: 'row', alignItems: 'center', gap: 14 },
    tokenIconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent', position: 'relative' },
    tokenIconImage:     { width: 32, height: 32, borderRadius: 16 },
    chainBadgeOverlay:  { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    chainBadgeIcon:     { width: 12, height: 12, borderRadius: 6 },
    tokenName:          { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 17 },
    tokenSymbol:        { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, marginTop: 2 },
    chainLabel:         { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13, marginTop: 2 },
    tokenRight:         { alignItems: 'flex-end' },
    tokenBalance:       { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 17, marginBottom: 2 },

    emptyState:     { paddingVertical: 32, alignItems: 'center' },
    emptyStateText: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, textAlign: 'center' },

    // ─── Activity ───
    activitySectionHeader: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 13,
        letterSpacing: 0.2,
        marginTop: 8,
        marginBottom: 2,
    },
    activityItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 11,
        borderBottomWidth: 1,
    },
    activityIconContainer: { position: 'relative', marginRight: 16 },
    activityTokenIcon:     { width: 44, height: 44, borderRadius: 22 },
    activityBankIcon:      { alignItems: 'center', justifyContent: 'center' },
    activityChainBadge: {
        position: 'absolute', bottom: -2, right: -2,
        width: 18, height: 18, borderRadius: 9,
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
    },
    activityChainBadgeIcon: { width: 14, height: 14, borderRadius: 7 },
    activityContent:        { flex: 1 },
    activityTitle:          { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16, marginBottom: 2 },
    activitySubtitle:       { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13 },
    activityRight:          { alignItems: 'flex-end' },
    activityAmount:         { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
    activityFiat:           { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, marginTop: 2 },
    statusBadge:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4, marginTop: 3 },
    statusText:             { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 11 },

    // ─── Sheets ───
    bottomSheetContent:       { paddingBottom: 24 },
    receiveHeader:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    receiveHeaderTitle:       { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 22 },
    closeButton:              { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18 },
    receiveBody:              { alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
    receiveSubtext:           { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, marginBottom: 24, textAlign: 'center', lineHeight: 21, maxWidth: 320 },
    receiveSubtextStrong:     { fontFamily: 'GoogleSansFlex_600SemiBold' },
    receiveChainDropdownContainer: { width: '100%', alignItems: 'center', marginBottom: 22 },
    receiveChainDropdown:     { width: '100%', maxWidth: 320, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 22 },
    receiveChainDropdownIcon: { width: 18, height: 18, borderRadius: 9 },
    receiveChainDropdownText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14 },
    qrCardCompact:            { borderRadius: 20, padding: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 20, alignSelf: 'center' },
    receiveTitle:             { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 19, marginBottom: 8, textAlign: 'center' },
    addressPill:              { width: '100%', maxWidth: 360, minHeight: 54, borderRadius: 999, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    addressPillText:          { flex: 1, marginRight: 12, fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16 },
    shareButton:              { width: '100%', maxWidth: 360, height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    shareButtonText:          { color: '#FFFFFF', fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 18 },

    sendSheetContent:  { paddingHorizontal: 20, ...Platform.select({ ios: { paddingTop: 28, paddingBottom: 16 }, android: { paddingTop: 28, paddingBottom: 24 } }) },
    sendSheetTitle:    { fontFamily: 'GoogleSansFlex_600SemiBold', ...Platform.select({ ios: { fontSize: 22, marginBottom: 3 }, android: { fontSize: 24, marginBottom: 4 } }) },
    sendSheetSubtitle: { fontFamily: 'GoogleSansFlex_400Regular', ...Platform.select({ ios: { fontSize: 13, marginBottom: 12 }, android: { fontSize: 14, marginBottom: 16 } }) },
    sendOptionCard:    { borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...Platform.select({ ios: { padding: 14, marginBottom: 10 }, android: { padding: 16, marginBottom: 12 } }) },
    sendOptionTitle:   { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16, marginBottom: 4 },
    sendOptionSubtitle:{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13 },
    activitySettingCard: { borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, ...Platform.select({ ios: { padding: 14, marginBottom: 10 }, android: { padding: 16, marginBottom: 12 } }) },
    activitySettingCopy: { flex: 1, minWidth: 0 },
    chainOptionLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
    chainOptionIcon:   { width: 20, height: 20, borderRadius: 10 },

    bridgeKycSheetContent:       { alignItems: 'center' },
    bridgeKycIconWrap:           { marginBottom: 16, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
    bridgeKycTitle:              { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 24, marginBottom: 12, textAlign: 'center' },
    bridgeKycBody:               { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 20 },
    bridgeKycBullets:            { alignSelf: 'stretch', marginBottom: 20 },
    bridgeKycBulletRow:          { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    bridgeKycBullet:             { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
    bridgeKycBulletText:         { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15 },
    bridgeKycPrimaryButton:      { borderRadius: 999, minHeight: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 10, width: '100%', flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
    bridgeKycPrimaryButtonText:  { color: '#FFFFFF', fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
    bridgeKycSecondaryButton:    { borderRadius: 999, minHeight: 56, alignItems: 'center', justifyContent: 'center', width: '100%', paddingHorizontal: 18 },
    bridgeKycSecondaryButtonText:{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14 },
    usdAccountDetailsSheet:      { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 22 },
    usdAccountDetailsHeader:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
    usdInfoButton:               { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    usdInfoButtonText:           { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 18 },
    usdDetailsCard:              { borderRadius: 22, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 14 },
    usdDetailsRow:               { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
    usdDetailsTextWrap:          { flex: 1 },
    usdCopyButton:               { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    usdAboutSheet:               { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 22, alignItems: 'center' },
    usdAboutIcon:                { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    usdAboutIconText:            { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 24 },
    usdAboutTitle:               { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 22, marginBottom: 8, textAlign: 'center' },
    usdAboutBody:                { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 16 },
    usdAboutCard:                { alignSelf: 'stretch', borderRadius: 20, padding: 14, marginBottom: 14 },
    usdAboutRow:                 { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
    usdAboutBullet:              { width: 7, height: 7, borderRadius: 4, marginTop: 7 },
    usdAboutText:                { flex: 1, fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, lineHeight: 20 },

    // ─── Detail sheet shared ───
    modalHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16 },
    modalHeaderLeft:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
    modalIconContainer:{ position: 'relative', marginRight: 12 },
    modalTokenIcon:    { width: 40, height: 40, borderRadius: 20 },
    modalStatusBadge:  { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9 },
    modalTitle:        { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 18 },
    modalSubtitle:     { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13, marginTop: 2 },
    amountCard:        { borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20 },
    amountCardValue:   { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 36, marginBottom: 8 },
    amountCardSub:     { flexDirection: 'row', alignItems: 'center' },
    amountCardSubText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 15, marginLeft: 6 },
    smallIcon:         { width: 20, height: 20, borderRadius: 10 },
    detailsCard:       { borderRadius: 16, padding: 16, marginBottom: 20 },
    detailRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
    detailDivider:     { height: 1 },
    detailLabel:       { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 15 },
    detailValue:       { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 15 },
    detailValueRow:    { flexDirection: 'row', alignItems: 'center' },
    chainValueRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
    viewButton:        { borderRadius: 30, paddingVertical: 16, alignItems: 'center' },
    viewButtonText:    { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16, color: '#FFFFFF' },

    // Withdrawal detail: progress
    progressSection: { paddingVertical: 24, paddingHorizontal: 16, borderRadius: 16, marginBottom: 20 },
});
