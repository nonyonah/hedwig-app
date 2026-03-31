import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    PanResponder,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Image,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { useThemeColors } from '../../theme/colors';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { HugeiconsIcon } from '@hugeicons/react-native';
import * as HugeiconsCore from '@hugeicons/core-free-icons';

const CaretLeft = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).ArrowLeft01Icon} {...props} />;
const CaretDown = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).ArrowDown04Icon} {...props} />;
const LinkIcon = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).Link01Icon} {...props} />;


const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 40;
const CHART_HEIGHT = 220;

type Timeframe = '1' | '7' | '30' | '365';

type CoinMarketResponse = {
    market_cap_rank?: number;
    description?: { en?: string };
    links?: {
        homepage?: string[];
        twitter_screen_name?: string;
    };
    market_data?: {
        current_price?: { usd?: number };
        price_change_percentage_24h?: number;
        market_cap?: { usd?: number };
        total_volume?: { usd?: number };
        circulating_supply?: number;
        total_supply?: number;
    };
};

type ChartResponse = {
    prices: [number, number][];
};

const TOKEN_ICON_MAP: Record<string, any> = {
    ETH: require('../../assets/icons/tokens/eth.png'),
    USDC: require('../../assets/icons/tokens/usdc.png'),
    USDT: require('../../assets/icons/tokens/usdt.png'),
    SOL: require('../../assets/icons/networks/solana.png'),
};

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

export default function TokenDetailsScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const params = useLocalSearchParams<{
        symbol?: string;
        name?: string;
        chain?: string;
        balance?: string;
        balanceUsd?: string;
    }>();

    const symbol = (params.symbol || 'TOKEN').toUpperCase();
    const tokenName = params.name || symbol;
    const balance = Number(params.balance || '0');
    const balanceUsd = Number(params.balanceUsd || '0');
    const coinId = TOKEN_CG_MAP[symbol];

    const [timeframe, setTimeframe] = useState<Timeframe>('1');
    const [readMore, setReadMore] = useState(false);
    const [market, setMarket] = useState<CoinMarketResponse | null>(null);
    const [chart, setChart] = useState<number[]>([]);
    const [loading, setLoading] = useState(true);
    const [chartLoading, setChartLoading] = useState(false);
    const [activeChartIndex, setActiveChartIndex] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        const loadMarket = async () => {
            if (!coinId) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const response = await fetch(
                    `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`
                );
                const data = (await response.json()) as CoinMarketResponse;
                if (!cancelled) setMarket(data);
            } catch {
                if (!cancelled) setMarket(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadMarket();
        return () => {
            cancelled = true;
        };
    }, [coinId]);

    useEffect(() => {
        let cancelled = false;
        const loadChart = async () => {
            if (!coinId) return;
            try {
                setChartLoading(true);
                const response = await fetch(
                    `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${timeframe}`
                );
                const data = (await response.json()) as ChartResponse;
                const values = Array.isArray(data.prices) ? data.prices.map((entry) => entry[1]) : [];
                if (!cancelled) setChart(values);
            } catch {
                if (!cancelled) setChart([]);
            } finally {
                if (!cancelled) setChartLoading(false);
            }
        };

        setActiveChartIndex(null);
        loadChart();
        return () => {
            cancelled = true;
        };
    }, [coinId, timeframe]);

    const price = market?.market_data?.current_price?.usd ?? 0;
    const change = market?.market_data?.price_change_percentage_24h ?? 0;
    const isPositive = change >= 0;
    const activeChartPrice =
        activeChartIndex !== null && chart[activeChartIndex] !== undefined ? chart[activeChartIndex] : price;

    const description = (market?.description?.en || '').replace(/<[^>]*>/g, '').trim();
    const shownDescription = readMore ? description : description.slice(0, 180);

    const website = market?.links?.homepage?.find((link) => !!link) || '';
    const twitter = market?.links?.twitter_screen_name ? `https://x.com/${market.links.twitter_screen_name}` : '';
    const softDividerColor = themeColors.textSecondary + (themeColors.textSecondary.length === 7 ? '26' : '');
    const isStablecoin = STABLECOIN_SYMBOLS.has(symbol);

    const chartBounds = useMemo(() => {
        if (!chart.length) {
            return { min: 0, max: 1, range: 1 };
        }

        let max = Math.max(...chart);
        let min = Math.min(...chart);
        let range = max - min;

        // Prevent exaggerated "EKG" movement for fiat-pegged assets.
        if (isStablecoin) {
            const midpoint = chart.reduce((sum, value) => sum + value, 0) / chart.length || 1;
            const halfBand = 0.01; // +/-1 cent band around peg midpoint
            min = Math.min(min, midpoint - halfBand);
            max = Math.max(max, midpoint + halfBand);
            range = max - min;
        }

        // Generic low-volatility guard for all tokens (including ETH/SOL when movement is tiny).
        const midpoint = chart.reduce((sum, value) => sum + value, 0) / chart.length || 1;
        const relativeRange = midpoint > 0 ? range / midpoint : 0;
        if (relativeRange < 0.02) {
            const halfBand = Math.max(midpoint * 0.015, range / 2, 0.000001); // target ~3% visible band
            min = midpoint - halfBand;
            max = midpoint + halfBand;
            range = max - min;
        }

        if (!Number.isFinite(range) || range <= 0) {
            return { min, max, range: 1 };
        }
        return { min, max, range };
    }, [chart, isStablecoin]);

    const chartPoints = useMemo(() => {
        if (!chart.length) return [] as string[];
        return chart
            .map((value, index) => {
                const x = (index / Math.max(chart.length - 1, 1)) * CHART_WIDTH;
                const y = CHART_HEIGHT - ((value - chartBounds.min) / chartBounds.range) * CHART_HEIGHT;
                return `${x},${y}`;
            });
    }, [chart, chartBounds]);

    const chartYForIndex = useMemo(() => {
        if (!chart.length) return null;
        const index = activeChartIndex === null ? chart.length - 1 : activeChartIndex;
        const value = chart[index] ?? chart[chart.length - 1];
        const y = CHART_HEIGHT - ((value - chartBounds.min) / chartBounds.range) * CHART_HEIGHT;
        return { y, index };
    }, [activeChartIndex, chart, chartBounds]);

    const updateActiveIndex = (x: number) => {
        if (!chart.length) return;
        const clampedX = Math.max(0, Math.min(CHART_WIDTH, x));
        const nextIndex = Math.round((clampedX / CHART_WIDTH) * Math.max(chart.length - 1, 1));
        setActiveChartIndex(nextIndex);
    };

    const chartPanResponder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,
                onPanResponderGrant: (evt) => {
                    updateActiveIndex(evt.nativeEvent.locationX);
                },
                onPanResponderMove: (evt) => {
                    updateActiveIndex(evt.nativeEvent.locationX);
                },
                onPanResponderRelease: () => {},
                onPanResponderTerminate: () => {},
            }),
        [chart]
    );

    const activeIndex = useMemo(() => {
        if (!chart.length) return 0;
        return activeChartIndex === null ? chart.length - 1 : activeChartIndex;
    }, [activeChartIndex, chart.length]);

    const activePoints = useMemo(() => {
        if (!chartPoints.length) return '';
        return chartPoints.slice(0, activeIndex + 1).join(' ');
    }, [chartPoints, activeIndex]);

    const inactivePoints = useMemo(() => {
        if (!chartPoints.length) return '';
        if (activeIndex >= chartPoints.length - 1) return '';
        return chartPoints.slice(activeIndex).join(' ');
    }, [chartPoints, activeIndex]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
            <View style={styles.header}>
                <IOSGlassIconButton
                    onPress={() => router.back()}
                    systemImage="chevron.left"
                    circleStyle={[styles.backButton, { backgroundColor: themeColors.surface }]}
                    icon={<CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                />
            </View>

            {loading ? (
                <View style={styles.loadingState}>
                    <ActivityIndicator size="large" color={themeColors.primary} />
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.content}
                    bounces={false}
                    overScrollMode="never"
                >
                    <View style={styles.tokenHeaderRow}>
                        <Image source={TOKEN_ICON_MAP[symbol] || TOKEN_ICON_MAP.USDC} style={styles.tokenIcon} />
                        <View style={styles.tokenHeaderText}>
                            <Text style={[styles.tokenName, { color: themeColors.textPrimary }]}>{tokenName}</Text>
                            <Text style={[styles.priceText, { color: themeColors.textPrimary }]}>{formatCurrency(activeChartPrice)}</Text>
                        </View>
                        <View style={styles.changeRow}>
                            <CaretDown
                                size={18}
                                color={isPositive ? '#22C55E' : '#EF4444'}
                                strokeWidth={3.5}
                                style={{ transform: [{ rotate: isPositive ? '180deg' : '0deg' }] }}
                            />
                            <Text style={[styles.changeText, { color: isPositive ? '#22C55E' : '#EF4444' }]}>
                                {Math.abs(change).toFixed(2)}%
                            </Text>
                        </View>
                    </View>

                    <View style={styles.chartWrap}>
                        {chartLoading ? (
                            <ActivityIndicator size="small" color={themeColors.primary} />
                        ) : chartPoints.length ? (
                            <View {...chartPanResponder.panHandlers}>
                                <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                                    <Polyline
                                        points={activePoints}
                                        fill="none"
                                        stroke={themeColors.textPrimary}
                                        strokeWidth={4}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    {!!inactivePoints && (
                                        <Polyline
                                            points={inactivePoints}
                                            fill="none"
                                            stroke="#9CA3AF"
                                            strokeWidth={4}
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
                        ) : (
                            <Text style={[styles.chartEmpty, { color: themeColors.textSecondary }]}>Chart unavailable</Text>
                        )}
                    </View>

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
                                <Text
                                    style={[
                                        styles.timeframeText,
                                        { color: timeframe === item.value ? themeColors.textPrimary : themeColors.textSecondary },
                                    ]}
                                >
                                    {item.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={[styles.balanceCard, { borderColor: softDividerColor || themeColors.border }]}>
                        <View style={styles.balanceCol}>
                            <Text style={[styles.balanceLabel, { color: themeColors.textSecondary }]}>Balance</Text>
                            <Text style={[styles.balanceValue, { color: themeColors.textPrimary }]}>{formatBalance(balance)} {symbol}</Text>
                        </View>
                        <View style={[styles.balanceDivider, { backgroundColor: softDividerColor || themeColors.border }]} />
                        <View style={styles.balanceCol}>
                            <Text style={[styles.balanceLabel, { color: themeColors.textSecondary }]}>Value</Text>
                            <Text style={[styles.balanceValue, { color: themeColors.textPrimary }]}>{formatCurrency(balanceUsd)}</Text>
                        </View>
                    </View>

                    {!!description && (
                        <View style={[styles.section, { borderTopColor: softDividerColor || themeColors.border }]}>
                            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Description</Text>
                            <Text style={[styles.descriptionText, { color: themeColors.textSecondary }]}>
                                {shownDescription}
                                {!readMore && description.length > 180 ? '...' : ''}
                            </Text>
                            {description.length > 180 && (
                                <TouchableOpacity style={styles.readMore} onPress={() => setReadMore((prev) => !prev)}>
                                    <Text style={[styles.readMoreText, { color: themeColors.textPrimary }]}>
                                        {readMore ? 'Show Less' : 'Read More'}
                                    </Text>
                                    <CaretDown
                                        size={16}
                                        color={themeColors.textPrimary}
                                        strokeWidth={3}
                                        style={{ transform: [{ rotate: readMore ? '180deg' : '0deg' }] }}
                                    />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

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

                    <View style={[styles.section, { borderTopColor: softDividerColor || themeColors.border }]}>
                        <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Stats</Text>
                        <View style={styles.statRow}>
                            <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Rank</Text>
                            <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>
                                {market?.market_cap_rank ? `#${market.market_cap_rank}` : '-'}
                            </Text>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Market Cap</Text>
                            <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>
                                {formatCurrency(market?.market_data?.market_cap?.usd)}
                            </Text>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>24h Volume</Text>
                            <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>
                                {formatCurrency(market?.market_data?.total_volume?.usd)}
                            </Text>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Total Supply</Text>
                            <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>
                                {formatCompact(market?.market_data?.total_supply)}
                            </Text>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>Circulating Supply</Text>
                            <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>
                                {formatCompact(market?.market_data?.circulating_supply)}
                            </Text>
                        </View>
                    </View>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 24,
    },
    tokenHeaderRow: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    tokenIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        marginRight: 12,
    },
    tokenHeaderText: {
        flex: 1,
    },
    tokenName: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: Platform.OS === 'android' ? 22 : 28,
        marginBottom: 2,
    },
    priceText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: Platform.OS === 'android' ? 13 : 16,
    },
    changeText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: Platform.OS === 'android' ? 13 : 16,
    },
    changeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    chartWrap: {
        minHeight: CHART_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },
    chartEmpty: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: Platform.OS === 'android' ? 12 : 14,
    },
    timeframeRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 20,
    },
    timeframeBtn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
    },
    timeframeText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: Platform.OS === 'android' ? 11 : 13,
    },
    balanceCard: {
        borderTopWidth: 1,
        borderBottomWidth: 1,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    balanceCol: {
        flex: 1,
    },
    balanceDivider: {
        width: 1,
        height: 42,
        marginHorizontal: 14,
    },
    balanceLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: Platform.OS === 'android' ? 10 : 12,
        marginBottom: 6,
    },
    balanceValue: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: Platform.OS === 'android' ? 13 : 16,
    },
    section: {
        borderTopWidth: 1,
        paddingTop: 16,
        marginTop: 8,
    },
    sectionTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: Platform.OS === 'android' ? 19 : 26,
        marginBottom: 10,
    },
    descriptionText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: Platform.OS === 'android' ? 13 : 16,
        lineHeight: Platform.OS === 'android' ? 20 : 24,
    },
    readMore: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    readMoreText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: Platform.OS === 'android' ? 15 : 18,
    },
    linksRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    linkChip: {
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    linkChipText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: Platform.OS === 'android' ? 12 : 14,
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
    },
    statLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: Platform.OS === 'android' ? 12 : 14,
    },
    statValue: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: Platform.OS === 'android' ? 13 : 16,
    },
});
