import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, Platform, UIManager, Alert, Share, ToastAndroid, ActivityIndicator, DeviceEventEmitter } from 'react-native';
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
import { LinearGradient } from 'expo-linear-gradient';
import {
    Settings as Gear, Copy, QrCode,
    ChevronDown as CaretDown, ChevronLeft as CaretLeft,
    X, ArrowUp, Wallet as WalletIcon, Plus, ShieldCheck, ArrowRight,
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
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { format, isToday, isYesterday } from 'date-fns';
import { getUserGradient } from '../../../utils/gradientUtils';
import { formatCurrency } from '../../../utils/currencyUtils';
import AndroidDropdownMenu from '../../../components/ui/AndroidDropdownMenu';
import IOSGlassIconButton from '../../../components/ui/IOSGlassIconButton';
import TokenDetailSheet, { SelectedToken } from '../../../components/TokenDetailSheet';
import { createUsdKycLink, getUsdAccountDetails, getUsdAccountStatus, getUsdTransfers, updateUsdSettlement, UsdAccountDetails, UsdAccountStatus, UsdTransfer } from '../../wallet/usdAccountApi';

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
    celo:     require('../../../assets/icons/networks/celo.png'),
};

const getChainIcon = (chain: string) => CHAIN_ICON_MAP[chain?.toLowerCase()] ?? CHAIN_ICON_MAP['base'];

const CHAIN_DISPLAY_NAMES: Record<string, string> = {
    base: 'Base', arbitrum: 'Arbitrum', polygon: 'Polygon',
    celo: 'Celo', solana: 'Solana',
};

// ─── Activity icons ──────────────────────────────────────────────────────────
const ACTIVITY_ICONS = {
    usdc:    require('../../../assets/icons/tokens/usdc.png'),
    base:    require('../../../assets/icons/networks/base.png'),
    solana:  require('../../../assets/icons/networks/solana.png'),
    arbitrum:require('../../../assets/icons/networks/arbitrum.png'),
    polygon: require('../../../assets/icons/networks/polygon.png'),
    celo:    require('../../../assets/icons/networks/celo.png'),
    send:    require('../../../assets/icons/status/send.png'),
    receive: require('../../../assets/icons/status/receive.png'),
};

const ACTIVITY_CHAINS: Record<string, { name: string; icon: any }> = {
    base:     { name: 'Base',     icon: ACTIVITY_ICONS.base },
    solana:   { name: 'Solana',   icon: ACTIVITY_ICONS.solana },
    arbitrum: { name: 'Arbitrum', icon: ACTIVITY_ICONS.arbitrum },
    polygon:  { name: 'Polygon',  icon: ACTIVITY_ICONS.polygon },
    celo:     { name: 'Celo',     icon: ACTIVITY_ICONS.celo },
    // Offramp uses uppercase chain keys
    BASE:     { name: 'Base',     icon: ACTIVITY_ICONS.base },
    SOLANA:   { name: 'Solana',   icon: ACTIVITY_ICONS.solana },
    ARBITRUM: { name: 'Arbitrum', icon: ACTIVITY_ICONS.arbitrum },
    POLYGON:  { name: 'Polygon',  icon: ACTIVITY_ICONS.polygon },
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
    network: 'base' | 'solana';
    status: 'completed' | 'pending' | 'failed';
    from: string;
    to: string;
}

interface OfframpOrder {
    id: string;
    paycrestOrderId: string;
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
    | { kind: 'withdrawal'; data: OfframpOrder };

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string') return 0;
    const normalized = value.replace(/,/g, '').trim();
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
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
    const navigation = useNavigation();
    const { user, getAccessToken } = useAuth();
    const settings = useSettings();
    const currency = settings?.currency || 'USD';

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
    const receiveSheetRef         = useRef<TrueSheet>(null);
    const sendSheetRef            = useRef<TrueSheet>(null);
    const autoSettlementSheetRef  = useRef<TrueSheet>(null);
    const bridgeKycInfoSheetRef   = useRef<TrueSheet>(null);
    const tokenDetailSheetRef     = useRef<TrueSheet>(null);
    const txDetailSheetRef        = useRef<TrueSheet>(null);
    const withdrawalDetailSheetRef = useRef<TrueSheet>(null);

    const [selectedToken,          setSelectedToken]          = useState<SelectedToken | null>(null);
    const sheetInteractionLockedRef = useRef(false);
    const sheetUnlockTimeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isUpdatingAutoSettlement, setIsUpdatingAutoSettlement] = useState(false);
    const [selectedChain, setSelectedChain] = useState<'base' | 'solana'>('base');

    // Network Filter & Dropdown
    const [networkFilter, setNetworkFilter] = useState<'all' | 'base' | 'solana' | 'arbitrum' | 'polygon' | 'celo'>('all');
    const [usdStatus,    setUsdStatus]    = useState<UsdAccountStatus | null>(null);
    const [usdDetails,   setUsdDetails]   = useState<UsdAccountDetails | null>(null);
    const [usdTransfers, setUsdTransfers] = useState<UsdTransfer[]>([]);
    const [usdLoading,   setUsdLoading]   = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
    const [tokenPriceChanges, setTokenPriceChanges] = useState<Record<string, number>>({});

    const isAutoSettlementEnabled = parseFeatureFlag(process.env.EXPO_PUBLIC_ENABLE_WALLET_AUTO_SETTLEMENT, false);
    const showUsdAccountCard      = parseFeatureFlag(process.env.EXPO_PUBLIC_SHOW_USD_ACCOUNT_CARD, false);
    const isAutoSettlementDisabled = !isAutoSettlementEnabled;

    // ── Activity tab state ──
    const [activeTab,       setActiveTab]       = useState<'coins' | 'activity'>('coins');
    const [transactions,    setTransactions]    = useState<Transaction[]>([]);
    const [offrampOrders,   setOfframpOrders]   = useState<OfframpOrder[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityFilter,  setActivityFilter]  = useState<'all' | 'in' | 'out' | 'withdrawals' | 'failed'>('all');
    const [selectedTx,       setSelectedTx]      = useState<Transaction | null>(null);
    const [selectedOrder,    setSelectedOrder]   = useState<OfframpOrder | null>(null);

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
            receiveSheetRef, sendSheetRef, autoSettlementSheetRef,
            bridgeKycInfoSheetRef, tokenDetailSheetRef,
            txDetailSheetRef, withdrawalDetailSheetRef,
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
                catch { setUsdDetails(null); }
            } else {
                setUsdDetails(null);
            }
            try { setUsdTransfers(await getUsdTransfers(getAccessToken)); }
            catch { setUsdTransfers([]); }
        } catch {
            setUsdStatus(null); setUsdDetails(null); setUsdTransfers([]);
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

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([
            fetchUserData(), fetchBaseBalances(), fetchUsdData(),
            fetchTokenPrices(), fetchTransactions(), fetchOfframpOrders(),
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
            }, 10000);

            return () => {
                clearInterval(balanceInterval);
                clearInterval(priceInterval);
                clearInterval(ordersInterval);
            };
        }, [fetchBaseBalances, fetchUserData, fetchUsdData, fetchTokenPrices, fetchTransactions, fetchOfframpOrders])
    );

    // Update selected order when orders refresh
    useEffect(() => {
        if (!selectedOrder) return;
        const updated = offrampOrders.find(o => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
    }, [offrampOrders, selectedOrder]);

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
    const totalBalance      = toNumber(getBaseTotalUsd()) + usdAccountBalance;
    const usdAccountName    = usdDetails?.ach?.accountName || usdDetails?.ach?.bankName || 'USD Account';
    const usdAccountNumber  = usdDetails?.ach?.accountNumberMasked || 'Tap to complete setup';
    const hasActiveUsdAccountDetails = Boolean(usdDetails?.ach?.accountNumberMasked);
    const canAccessUsdAccountFeature = Boolean(usdStatus?.featureEnabled);

    const bal = (chain: string, asset: string) => walletBalances.find(b => b.chain === chain && b.asset === asset);

    const allTokens = [
        { chain: 'base',     name: 'USD Coin', symbol: 'USDC', balance: getTokenBalance(bal('base','usdc'),    6), balanceUsd: toNumber(bal('base','usdc')?.display_values?.usd),    icon: require('../../../assets/icons/tokens/usdc.png') },
        { chain: 'arbitrum', name: 'USD Coin', symbol: 'USDC', balance: getTokenBalance(bal('arbitrum','usdc'),6), balanceUsd: toNumber(bal('arbitrum','usdc')?.display_values?.usd), icon: require('../../../assets/icons/tokens/usdc.png') },
        { chain: 'polygon',  name: 'USD Coin', symbol: 'USDC', balance: getTokenBalance(bal('polygon','usdc'), 6), balanceUsd: toNumber(bal('polygon','usdc')?.display_values?.usd),  icon: require('../../../assets/icons/tokens/usdc.png') },
        { chain: 'celo',     name: 'USD Coin', symbol: 'USDC', balance: getTokenBalance(bal('celo','usdc'),    6), balanceUsd: toNumber(bal('celo','usdc')?.display_values?.usd),     icon: require('../../../assets/icons/tokens/usdc.png') },
        ...(solanaAddress ? [
            { chain: 'solana', name: 'USD Coin', symbol: 'USDC', balance: getTokenBalance(bal('solana','usdc'),6), balanceUsd: toNumber(bal('solana','usdc')?.display_values?.usd), icon: require('../../../assets/icons/tokens/usdc.png') },
        ] : []),
    ];

    const networkFiltered = allTokens.filter(t => networkFilter === 'all' || t.chain === networkFilter);
    const nonZero = networkFiltered.filter(t => t.balance > 0);
    const filteredTokens = nonZero.length > 0
        ? nonZero
        : networkFiltered.filter(t => t.chain === 'base').slice(0, 1);

    const getNetworkIcon = (filter: string) => CHAIN_ICON_MAP[filter] ?? null;

    // ── Activity derived values ──
    const allActivity: ActivityItem[] = useMemo(() => {
        const txItems = transactions
            .filter(tx => tx.token.toUpperCase() === 'USDC')
            .map(tx => ({ kind: 'tx' as const, data: tx }));
        const wdItems = offrampOrders.map(o => ({ kind: 'withdrawal' as const, data: o }));
        return [...txItems, ...wdItems].sort((a, b) => {
            const dateA = a.kind === 'tx' ? new Date(a.data.date).getTime() : new Date(a.data.createdAt).getTime();
            const dateB = b.kind === 'tx' ? new Date(b.data.date).getTime() : new Date(b.data.createdAt).getTime();
            return dateB - dateA;
        });
    }, [transactions, offrampOrders]);

    const filteredActivity = useMemo(() => allActivity.filter(item => {
        if (activityFilter === 'all')         return true;
        if (activityFilter === 'in')          return item.kind === 'tx' && item.data.type === 'IN';
        if (activityFilter === 'out')         return item.kind === 'tx' && item.data.type === 'OUT';
        if (activityFilter === 'withdrawals') return item.kind === 'withdrawal';
        if (activityFilter === 'failed')      return (
            (item.kind === 'tx' && item.data.status === 'failed') ||
            (item.kind === 'withdrawal' && (item.data.status === 'FAILED' || item.data.status === 'CANCELLED'))
        );
        return true;
    }), [allActivity, activityFilter]);

    const groupedActivity = useMemo(() =>
        groupByDate(filteredActivity, item =>
            item.kind === 'tx' ? new Date(item.data.date) : new Date(item.data.createdAt)
        ),
    [filteredActivity]);

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

    const handleUsdKyc = async () => {
        try {
            const result = await createUsdKycLink(getAccessToken);
            if (!result?.url) { Alert.alert('Unavailable', 'KYC link is not available right now.'); return; }
            await WebBrowser.openBrowserAsync(result.url);
        } catch (error: any) {
            Alert.alert('Could not open KYC', error?.message || 'Please try again later.');
        }
    };

    const handleOpenUsdAccount = () => {
        const normalizedAccountStatus = String(usdStatus?.accountStatus || '').toLowerCase();
        const hasStartedUsdFlow =
            hasActiveUsdAccountDetails ||
            (normalizedAccountStatus.length > 0 && normalizedAccountStatus !== 'not_started') ||
            String(usdStatus?.bridgeKycStatus || '').toLowerCase() === 'approved';
        if (hasStartedUsdFlow) {
            router.push({ pathname: '/wallet/usd-account', params: { view: 'transactions' } } as any);
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
            lockSheetInteractions(260);
            autoSettlementSheetRef.current?.dismiss();
            setTimeout(() => { router.push('/wallet/usd-account' as any); }, 120);
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
                    <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
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
                    </TouchableOpacity>
                    <View style={styles.headerTitleRow} />
                    <TouchableOpacity style={styles.settingsButton} onPress={() => router.push('/settings')}>
                        <Gear size={22} color={themeColors.textPrimary} />
                    </TouchableOpacity>
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
                        <TouchableOpacity style={styles.actionButton} onPress={() => presentSheet(receiveSheetRef)}>
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
                    {showUsdAccountCard && canAccessUsdAccountFeature ? (
                        <View style={styles.usdAccountSection}>
                            <View style={styles.tokenHeader}>
                                <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>USD Account</Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.tokenItem, { backgroundColor: themeColors.surface }]}
                                onPress={handleOpenUsdAccount}
                                activeOpacity={0.9}
                            >
                                <View style={styles.tokenLeft}>
                                    <View style={[styles.tokenIconContainer, { backgroundColor: themeColors.surfaceHighlight || (isDark ? 'rgba(37,99,235,0.22)' : '#EAF0FF') }]}>
                                        <WalletIcon size={20} color={themeColors.textPrimary} />
                                    </View>
                                    <View>
                                        <Text style={[styles.tokenName, { color: themeColors.textPrimary }]}>{usdAccountName}</Text>
                                        <Text style={[styles.tokenSymbol, { color: themeColors.textSecondary }]}>
                                            {usdLoading ? 'Fetching account details...' : usdAccountNumber}
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
                                <TouchableOpacity onPress={() => setActiveTab('coins')} activeOpacity={0.7}>
                                    <Text
                                        numberOfLines={1}
                                        style={[styles.tabTitle, { color: activeTab === 'coins' ? themeColors.textPrimary : themeColors.textSecondary }]}
                                    >
                                        Assets
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setActiveTab('activity')} activeOpacity={0.7}>
                                    <Text
                                        numberOfLines={1}
                                        style={[styles.tabTitle, { color: activeTab === 'activity' ? themeColors.textPrimary : themeColors.textSecondary }]}
                                    >
                                        Activity
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* Right dropdown: network filter for Coins, status filter for Activity */}
                            <View style={styles.tabFilterWrap}>
                                {activeTab === 'coins' ? (
                                    Platform.OS === 'ios' && Host && Menu && ExpoButton ? (
                                        <Host matchContents>
                                            <Menu
                                                label={(
                                                    <View style={[styles.tabFilterButton, { backgroundColor: themeColors.surface }]}>
                                                        {networkFilter !== 'all' && (
                                                            <Image source={getNetworkIcon(networkFilter)} style={styles.networkFilterIcon} />
                                                        )}
                                                        <Text numberOfLines={1} style={[styles.tabFilterText, { color: themeColors.textPrimary }]}>
                                                            {networkFilter === 'all' ? 'All Networks' : CHAIN_DISPLAY_NAMES[networkFilter] ?? networkFilter}
                                                        </Text>
                                                        <CaretDown size={14} color={themeColors.textSecondary} strokeWidth={3} />
                                                    </View>
                                                )}
                                            >
                                                <ExpoButton label="All Networks" onPress={() => setNetworkFilter('all')} />
                                                <ExpoButton label="Base"     onPress={() => setNetworkFilter('base')} />
                                                <ExpoButton label="Arbitrum" onPress={() => setNetworkFilter('arbitrum')} />
                                                <ExpoButton label="Polygon"  onPress={() => setNetworkFilter('polygon')} />
                                                <ExpoButton label="Celo"     onPress={() => setNetworkFilter('celo')} />
                                                <ExpoButton label="Solana"   onPress={() => setNetworkFilter('solana')} />
                                            </Menu>
                                        </Host>
                                    ) : (
                                        <AndroidDropdownMenu
                                            options={[
                                                { label: 'All Networks', onPress: () => setNetworkFilter('all') },
                                                { label: 'Base',     onPress: () => setNetworkFilter('base') },
                                                { label: 'Arbitrum', onPress: () => setNetworkFilter('arbitrum') },
                                                { label: 'Polygon',  onPress: () => setNetworkFilter('polygon') },
                                                { label: 'Celo',     onPress: () => setNetworkFilter('celo') },
                                                { label: 'Solana',   onPress: () => setNetworkFilter('solana') },
                                            ]}
                                            trigger={
                                                <View style={[styles.tabFilterButton, { backgroundColor: themeColors.surface }]}>
                                                    {networkFilter !== 'all' && (
                                                        <Image source={getNetworkIcon(networkFilter)} style={styles.networkFilterIcon} />
                                                    )}
                                                    <Text numberOfLines={1} style={[styles.tabFilterText, { color: themeColors.textPrimary }]}>
                                                        {networkFilter === 'all' ? 'All Networks' : CHAIN_DISPLAY_NAMES[networkFilter] ?? networkFilter}
                                                    </Text>
                                                    <CaretDown size={14} color={themeColors.textSecondary} strokeWidth={3} />
                                                </View>
                                            }
                                        />
                                    )
                                ) : (
                                    /* Activity filter dropdown */
                                    Platform.OS === 'ios' && Host && Menu && ExpoButton ? (
                                        <Host matchContents>
                                            <Menu
                                                label={(
                                                    <View style={[styles.tabFilterButton, { backgroundColor: themeColors.surface }]}>
                                                        <Text numberOfLines={1} style={[styles.tabFilterText, { color: themeColors.textPrimary }]}>
                                                            {activityFilter === 'all' ? 'All' :
                                                             activityFilter === 'in' ? 'Received' :
                                                             activityFilter === 'out' ? 'Sent' :
                                                             activityFilter === 'withdrawals' ? 'Withdrawals' : 'Failed'}
                                                        </Text>
                                                        <CaretDown size={14} color={themeColors.textSecondary} strokeWidth={3} />
                                                    </View>
                                                )}
                                            >
                                                <ExpoButton label="All"         onPress={() => setActivityFilter('all')} />
                                                <ExpoButton label="Received"    onPress={() => setActivityFilter('in')} />
                                                <ExpoButton label="Sent"        onPress={() => setActivityFilter('out')} />
                                                <ExpoButton label="Withdrawals" onPress={() => setActivityFilter('withdrawals')} />
                                                <ExpoButton label="Failed"      onPress={() => setActivityFilter('failed')} />
                                            </Menu>
                                        </Host>
                                    ) : (
                                        <AndroidDropdownMenu
                                            options={[
                                                { label: 'All',         onPress: () => setActivityFilter('all') },
                                                { label: 'Received',    onPress: () => setActivityFilter('in') },
                                                { label: 'Sent',        onPress: () => setActivityFilter('out') },
                                                { label: 'Withdrawals', onPress: () => setActivityFilter('withdrawals') },
                                                { label: 'Failed',      onPress: () => setActivityFilter('failed') },
                                            ]}
                                            trigger={
                                                <View style={[styles.tabFilterButton, { backgroundColor: themeColors.surface }]}>
                                                    <Text numberOfLines={1} style={[styles.tabFilterText, { color: themeColors.textPrimary }]}>
                                                        {activityFilter === 'all' ? 'All' :
                                                         activityFilter === 'in' ? 'Received' :
                                                         activityFilter === 'out' ? 'Sent' :
                                                         activityFilter === 'withdrawals' ? 'Withdrawals' : 'Failed'}
                                                    </Text>
                                                    <CaretDown size={14} color={themeColors.textSecondary} strokeWidth={3} />
                                                </View>
                                            }
                                        />
                                    )
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
                                                <View style={styles.chainBadgeOverlay}>
                                                    <Image source={getChainIcon(item.chain)} style={styles.chainBadgeIcon} />
                                                </View>
                                            </View>
                                            <View>
                                                <Text style={[styles.tokenName, { color: themeColors.textPrimary }]}>{item.name}</Text>
                                                <Text style={[styles.tokenSymbol, { color: themeColors.textSecondary }]}>
                                                    {item.balance === 0
                                                        ? `0 ${item.symbol}`
                                                        : `${item.balance.toFixed(2).replace(/\.?0+$/, '')} ${item.symbol}`}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={styles.tokenRight}>
                                            <Text style={[styles.tokenBalance, { color: themeColors.textPrimary }]}>
                                                ${item.balanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </Text>
                                            {tokenPriceChanges[item.symbol] !== undefined ? (
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

                {/* ──────────────── Bottom sheets ──────────────── */}

                {/* Receive sheet */}
                <TrueSheet
                    ref={receiveSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDismiss={handleSheetDismiss}
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
                    onDismiss={handleSheetDismiss}
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

                {/* Auto-settlement sheet */}
                <TrueSheet
                    ref={autoSettlementSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDismiss={handleSheetDismiss}
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

                {/* Bridge KYC info sheet */}
                <TrueSheet
                    ref={bridgeKycInfoSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDismiss={handleSheetDismiss}
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
                                onPress={() => {
                                    bridgeKycInfoSheetRef.current?.dismiss();
                                    setTimeout(() => router.push('/wallet/usd-account' as any), 120);
                                }}
                            >
                                <Text style={styles.bridgeKycPrimaryButtonText}>Continue to setup</Text>
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

                {/* Token detail sheet */}
                <TokenDetailSheet
                    ref={tokenDetailSheetRef}
                    selectedToken={selectedToken}
                    initialPriceChange={selectedToken ? tokenPriceChanges[selectedToken.symbol] : undefined}
                    onDismiss={() => setSelectedToken(null)}
                    onSend={() => {
                        tokenDetailSheetRef.current?.dismiss();
                        setTimeout(() => sendSheetRef.current?.present(), 320);
                    }}
                />

                {/* Crypto transaction detail sheet */}
                <TrueSheet
                    ref={txDetailSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    grabber={true}
                    onDismiss={handleSheetDismiss}
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
                    onDismiss={handleSheetDismiss}
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
                                        { label: 'Order ID', value: (selectedOrder.paycrestOrderId || selectedOrder.id).slice(0, 18) + '…', copy: selectedOrder.paycrestOrderId || selectedOrder.id },
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
            </SafeAreaView>
        </>
    );
}

const styles = StyleSheet.create({
    container:      { flex: 1 },
    header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    profileImage:   { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    settingsButton: { padding: 8 },
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
