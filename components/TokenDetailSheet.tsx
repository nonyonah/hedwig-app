import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Linking,
    PanResponder,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Image,
    ImageSourcePropType,
} from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useThemeColors, Colors } from '../theme/colors';
import {
    ChevronLeft as CaretLeft,
    ChevronDown as CaretDown,
    Link as LinkIcon,
    ArrowUp,
    X,
} from './ui/AppIcon';
import IOSGlassIconButton from './ui/IOSGlassIconButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 40;
const CHART_HEIGHT = 200;

type Timeframe = '1' | '7' | '30' | '365';

type CoinMarketResponse = {
    market_cap_rank?: number;
    description?: { en?: string };
    links?: { homepage?: string[]; twitter_screen_name?: string };
    market_data?: {
        current_price?: { usd?: number };
        price_change_percentage_24h?: number;
        market_cap?: { usd?: number };
        total_volume?: { usd?: number };
        circulating_supply?: number;
        total_supply?: number;
    };
};

type ChartResponse = { prices: [number, number][] };

const TOKEN_CG_MAP: Record<string, string> = {
    ETH: 'ethereum',
    SOL: 'solana',
    USDC: 'usd-coin',
    USDT: 'tether',
};

const STABLECOIN_SYMBOLS = new Set(['USDC', 'USDT']);

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
    { label: '1D', value: '1' },
    { label: '1W', value: '7' },
    { label: '1M', value: '30' },
    { label: '1Y', value: '365' },
];

const formatCompact = (value?: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
};

const formatCurrency = (value?: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '$0.00';
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatBalance = (value?: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '0.00';
    if (value >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
    return value.toPrecision(8);
};

export type SelectedToken = {
    chain: string;
    name: string;
    symbol: string;
    balance: number;
    balanceUsd: number;
    icon: ImageSourcePropType;
};

type Props = {
    selectedToken: SelectedToken | null;
    onDismiss: () => void;
    onSend: () => void;
    initialPriceChange?: number;
};

const TokenDetailSheet = forwardRef<TrueSheet, Props>(({ selectedToken, onDismiss, onSend, initialPriceChange }, ref) => {
    const themeColors = useThemeColors();

    const symbol = selectedToken ? selectedToken.symbol.toUpperCase() : '';
    const coinId = TOKEN_CG_MAP[symbol] || null;
    const isStablecoin = STABLECOIN_SYMBOLS.has(symbol);

    const [timeframe, setTimeframe] = useState<Timeframe>('1');
    const [readMore, setReadMore] = useState(false);
    const [market, setMarket] = useState<CoinMarketResponse | null>(null);
    const [chart, setChart] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [chartLoading, setChartLoading] = useState(false);
    const [activeChartIndex, setActiveChartIndex] = useState<number | null>(null);

    // Reset when token changes
    useEffect(() => {
        setTimeframe('1');
        setReadMore(false);
        setMarket(null);
        setChart([]);
        setActiveChartIndex(null);
    }, [symbol]);

    // Load market data
    useEffect(() => {
        if (!coinId) { setLoading(false); return; }
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetch(
                    `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`
                );
                const data = (await res.json()) as CoinMarketResponse;
                if (!cancelled) setMarket(data);
            } catch {
                if (!cancelled) setMarket(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [coinId]);

    // Load chart data
    useEffect(() => {
        if (!coinId) return;
        let cancelled = false;
        const load = async () => {
            setChartLoading(true);
            setActiveChartIndex(null);
            try {
                const res = await fetch(
                    `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${timeframe}`
                );
                const data = (await res.json()) as ChartResponse;
                const values = Array.isArray(data.prices) ? data.prices.map((e) => e[1]) : [];
                if (!cancelled) setChart(values);
            } catch {
                if (!cancelled) setChart([]);
            } finally {
                if (!cancelled) setChartLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [coinId, timeframe]);

    const price = market?.market_data?.current_price?.usd ?? 0;
    const change = market?.market_data?.price_change_percentage_24h ?? initialPriceChange ?? 0;
    const isPositive = change >= 0;

    const chartBounds = useMemo(() => {
        if (!chart.length) return { min: 0, max: 1, range: 1 };
        let max = Math.max(...chart);
        let min = Math.min(...chart);
        let range = max - min;
        if (isStablecoin) {
            const mid = chart.reduce((s, v) => s + v, 0) / chart.length || 1;
            min = Math.min(min, mid - 0.01);
            max = Math.max(max, mid + 0.01);
            range = max - min;
        }
        const mid = chart.reduce((s, v) => s + v, 0) / chart.length || 1;
        const relRange = mid > 0 ? range / mid : 0;
        if (relRange < 0.02) {
            const halfBand = Math.max(mid * 0.015, range / 2, 0.000001);
            min = mid - halfBand;
            max = mid + halfBand;
            range = max - min;
        }
        if (!Number.isFinite(range) || range <= 0) return { min, max, range: 1 };
        return { min, max, range };
    }, [chart, isStablecoin]);

    const chartPoints = useMemo(() => {
        if (!chart.length) return [] as string[];
        return chart.map((value, index) => {
            const x = (index / Math.max(chart.length - 1, 1)) * CHART_WIDTH;
            const y = CHART_HEIGHT - ((value - chartBounds.min) / chartBounds.range) * CHART_HEIGHT;
            return `${x},${y}`;
        });
    }, [chart, chartBounds]);

    const activeIndex = useMemo(() => {
        if (!chart.length) return 0;
        return activeChartIndex === null ? chart.length - 1 : activeChartIndex;
    }, [activeChartIndex, chart.length]);

    const activeChartPrice = activeChartIndex !== null && chart[activeChartIndex] !== undefined
        ? chart[activeChartIndex]
        : price;

    const chartYForIndex = useMemo(() => {
        if (!chart.length) return null;
        const idx = activeChartIndex === null ? chart.length - 1 : activeChartIndex;
        const value = chart[idx] ?? chart[chart.length - 1];
        const y = CHART_HEIGHT - ((value - chartBounds.min) / chartBounds.range) * CHART_HEIGHT;
        return { y, index: idx };
    }, [activeChartIndex, chart, chartBounds]);

    const activePoints = useMemo(() => {
        if (!chartPoints.length) return '';
        return chartPoints.slice(0, activeIndex + 1).join(' ');
    }, [chartPoints, activeIndex]);

    const inactivePoints = useMemo(() => {
        if (!chartPoints.length || activeIndex >= chartPoints.length - 1) return '';
        return chartPoints.slice(activeIndex).join(' ');
    }, [chartPoints, activeIndex]);

    const updateActiveIndex = (x: number) => {
        if (!chart.length) return;
        const clamped = Math.max(0, Math.min(CHART_WIDTH, x));
        const idx = Math.round((clamped / CHART_WIDTH) * Math.max(chart.length - 1, 1));
        setActiveChartIndex(idx);
    };

    const chartPanResponder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,
                onPanResponderGrant: (evt) => updateActiveIndex(evt.nativeEvent.locationX),
                onPanResponderMove: (evt) => updateActiveIndex(evt.nativeEvent.locationX),
                onPanResponderRelease: () => {},
                onPanResponderTerminate: () => {},
            }),
        [chart]
    );

    const description = (market?.description?.en || '').replace(/<[^>]*>/g, '').trim();
    const shownDescription = readMore ? description : description.slice(0, 180);
    const website = market?.links?.homepage?.find((l) => !!l) || '';
    const twitter = market?.links?.twitter_screen_name ? `https://x.com/${market.links.twitter_screen_name}` : '';
    const softDividerColor = themeColors.textSecondary + (themeColors.textSecondary.length === 7 ? '26' : '');

    return (
        <TrueSheet
            ref={ref}
            detents={[0.9]}
            cornerRadius={Platform.OS === 'ios' ? 50 : 24}
            {...(Platform.OS === 'ios'
                ? { backgroundBlur: 'regular' as const }
                : { backgroundColor: themeColors.background })}
            grabber={true}
            scrollable={true}
            onDidDismiss={onDismiss}
        >
            {selectedToken ? (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.content}
                    bounces={false}
                    overScrollMode="never"
                >
                    {/* Close button */}
                    <View style={styles.closeRow}>
                        <IOSGlassIconButton
                            onPress={() => (ref as React.RefObject<TrueSheet>)?.current?.dismiss()}
                            systemImage="xmark"
                            circleStyle={styles.closeCircle}
                            icon={<X size={18} color={themeColors.textPrimary} strokeWidth={3} />}
                        />
                    </View>

                    {/* Token header */}
                    <View style={styles.tokenHeaderRow}>
                        <Image source={selectedToken.icon} style={styles.tokenIcon} />
                        <View style={styles.tokenHeaderText}>
                            <Text style={[styles.tokenName, { color: themeColors.textPrimary }]}>
                                {selectedToken.name}
                            </Text>
                            <Text style={[styles.priceText, { color: themeColors.textPrimary }]}>
                                {loading ? '—' : formatCurrency(activeChartPrice || undefined)}
                            </Text>
                        </View>
                        {!loading && !isStablecoin && (
                            <View style={styles.changeRow}>
                                <CaretDown
                                    size={20}
                                    color={isPositive ? '#22C55E' : '#EF4444'}
                                    strokeWidth={3}
                                    style={{ transform: [{ rotate: isPositive ? '180deg' : '0deg' }] }}
                                />
                                <Text style={[styles.changeText, { color: isPositive ? '#22C55E' : '#EF4444' }]}>
                                    {Math.abs(change).toFixed(2)}%
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Chart */}
                    <View style={styles.chartWrap}>
                        {loading || chartLoading ? (
                            <ActivityIndicator color={themeColors.textPrimary} />
                        ) : chartPoints.length ? (
                            <View {...chartPanResponder.panHandlers}>
                                <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                                    <Polyline
                                        points={activePoints}
                                        fill="none"
                                        stroke={themeColors.textPrimary}
                                        strokeWidth={3}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    {!!inactivePoints && (
                                        <Polyline
                                            points={inactivePoints}
                                            fill="none"
                                            stroke="#9CA3AF"
                                            strokeWidth={3}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    )}
                                    {chartYForIndex && (
                                        <>
                                            <Polyline
                                                points={`${(chartYForIndex.index / Math.max(chart.length - 1, 1)) * CHART_WIDTH},0 ${(chartYForIndex.index / Math.max(chart.length - 1, 1)) * CHART_WIDTH},${CHART_HEIGHT}`}
                                                fill="none"
                                                stroke={themeColors.textSecondary}
                                                strokeWidth={1.5}
                                                strokeDasharray="4 4"
                                            />
                                            <Circle
                                                cx={(chartYForIndex.index / Math.max(chart.length - 1, 1)) * CHART_WIDTH}
                                                cy={chartYForIndex.y}
                                                r={6}
                                                fill={themeColors.textPrimary}
                                            />
                                        </>
                                    )}
                                </Svg>
                            </View>
                        ) : !coinId ? null : (
                            <Text style={[styles.chartEmpty, { color: themeColors.textSecondary }]}>
                                Chart unavailable
                            </Text>
                        )}
                    </View>

                    {/* Timeframe selector */}
                    {!!coinId && (
                        <View style={styles.timeframeRow}>
                            {TIMEFRAMES.map((item) => (
                                <TouchableOpacity
                                    key={item.value}
                                    onPress={() => setTimeframe(item.value)}
                                    style={[
                                        styles.timeframeBtn,
                                        { backgroundColor: timeframe === item.value ? themeColors.surface : 'transparent' },
                                    ]}
                                >
                                    <Text style={[
                                        styles.timeframeText,
                                        { color: timeframe === item.value ? themeColors.textPrimary : themeColors.textSecondary },
                                    ]}>
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Balance / Value */}
                    <View style={[styles.balanceCard, { backgroundColor: themeColors.surface }]}>
                        <View style={styles.balanceCol}>
                            <Text style={[styles.balanceLabel, { color: themeColors.textSecondary }]}>Balance</Text>
                            <Text style={[styles.balanceValue, { color: themeColors.textPrimary }]}>
                                {formatBalance(selectedToken.balance)} {symbol}
                            </Text>
                        </View>
                        <View style={styles.balanceCol}>
                            <Text style={[styles.balanceLabel, { color: themeColors.textSecondary, textAlign: 'right' }]}>Value</Text>
                            <Text style={[styles.balanceValue, { color: themeColors.textPrimary, textAlign: 'right' }]}>
                                {formatCurrency(selectedToken.balanceUsd)}
                            </Text>
                        </View>
                    </View>

                    {/* Send button */}
                    <TouchableOpacity
                        style={[styles.sendButton, { backgroundColor: Colors.primary }]}
                        onPress={onSend}
                        activeOpacity={0.85}
                    >
                        <ArrowUp size={20} color="#FFFFFF" />
                        <Text style={styles.sendButtonText}>Send</Text>
                    </TouchableOpacity>

                    {/* Description */}
                    {!!description && (
                        <View style={[styles.section, { borderTopColor: softDividerColor || themeColors.border }]}>
                            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Description</Text>
                            <Text style={[styles.descriptionText, { color: themeColors.textSecondary }]}>
                                {shownDescription}{!readMore && description.length > 180 ? '...' : ''}
                            </Text>
                            {description.length > 180 && (
                                <TouchableOpacity style={styles.readMore} onPress={() => setReadMore((p) => !p)}>
                                    <Text style={[styles.readMoreText, { color: themeColors.textPrimary }]}>
                                        {readMore ? 'Show Less' : 'Read More'}
                                    </Text>
                                    <CaretDown size={16} color={themeColors.textPrimary} strokeWidth={3}
                                        style={{ transform: [{ rotate: readMore ? '180deg' : '0deg' }] }} />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Links */}
                    {(!!website || !!twitter) && (
                        <View style={[styles.section, { borderTopColor: softDividerColor || themeColors.border }]}>
                            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Links</Text>
                            <View style={styles.linksRow}>
                                {!!website && (
                                    <TouchableOpacity
                                        style={[styles.linkChip, { backgroundColor: themeColors.surface }]}
                                        onPress={() => Linking.openURL(website)}
                                    >
                                        <LinkIcon size={16} color={themeColors.textSecondary} />
                                        <Text style={[styles.linkChipText, { color: themeColors.textPrimary }]}>Website</Text>
                                    </TouchableOpacity>
                                )}
                                {!!twitter && (
                                    <TouchableOpacity
                                        style={[styles.linkChip, { backgroundColor: themeColors.surface }]}
                                        onPress={() => Linking.openURL(twitter)}
                                    >
                                        <LinkIcon size={16} color={themeColors.textSecondary} />
                                        <Text style={[styles.linkChipText, { color: themeColors.textPrimary }]}>X (Twitter)</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    )}

                    {/* Stats */}
                    {!!market && (
                        <View style={[styles.section, { borderTopColor: softDividerColor || themeColors.border }]}>
                            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Stats</Text>
                            {[
                                { label: 'Rank', value: market.market_cap_rank ? `#${market.market_cap_rank}` : '-' },
                                { label: 'Market Cap', value: formatCurrency(market.market_data?.market_cap?.usd) },
                                { label: '24h Volume', value: formatCurrency(market.market_data?.total_volume?.usd) },
                                { label: 'Total Supply', value: formatCompact(market.market_data?.total_supply) },
                                { label: 'Circulating Supply', value: formatCompact(market.market_data?.circulating_supply) },
                            ].map(({ label, value }) => (
                                <View key={label} style={styles.statRow}>
                                    <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>{label}</Text>
                                    <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>{value}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </ScrollView>
            ) : (
                <View style={{ height: 200 }} />
            )}
        </TrueSheet>
    );
});

TokenDetailSheet.displayName = 'TokenDetailSheet';
export default TokenDetailSheet;

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
    closeRow: { alignItems: 'flex-end', marginBottom: 4 },
    closeCircle: { width: 32, height: 32, borderRadius: 16 },
    tokenHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: 4 },
    tokenIcon: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
    tokenHeaderText: { flex: 1 },
    tokenName: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 24, marginBottom: 2 },
    priceText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16 },
    changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    changeText: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 22 },
    chartWrap: { minHeight: CHART_HEIGHT, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
    chartEmpty: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14 },
    timeframeRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
    timeframeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
    timeframeText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },
    balanceCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderRadius: 20,
        paddingVertical: 18,
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    balanceCol: { gap: 4 },
    balanceLabel: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13 },
    balanceValue: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 18 },
    sendButton: {
        borderRadius: 999, paddingVertical: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, marginBottom: 8,
    },
    sendButtonText: { color: '#fff', fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16 },
    section: { borderTopWidth: 1, paddingTop: 16, marginTop: 8 },
    sectionTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 22, marginBottom: 10 },
    descriptionText: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15, lineHeight: 22 },
    readMore: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
    readMoreText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
    linksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    linkChip: {
        borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10,
        flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    linkChipText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14 },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
    statLabel: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14 },
    statValue: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
});
