import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    FlatList,
    Animated,
    ViewToken,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../theme/colors';
import { Button } from '../../components/Button';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import { useAuth } from '../../hooks/useAuth';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Animated illustration for each slide ────────────────────────────────────
function SlideIllustration({
    bgColor,
    accentColor,
    shape,
    delay = 0,
}: {
    bgColor: string;
    accentColor: string;
    shape: 'invoice' | 'clients' | 'wallet' | 'insights' | 'contract';
    delay?: number;
}) {
    const float = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(1)).current;
    const rotate = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const floatAnim = Animated.loop(
            Animated.sequence([
                Animated.timing(float, { toValue: -14, duration: 1800, useNativeDriver: true }),
                Animated.timing(float, { toValue: 0, duration: 1800, useNativeDriver: true }),
            ])
        );
        const pulseAnim = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1.08, duration: 1400, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
            ])
        );
        const rotateAnim = Animated.loop(
            Animated.sequence([
                Animated.timing(rotate, { toValue: 1, duration: 3600, useNativeDriver: true }),
                Animated.timing(rotate, { toValue: 0, duration: 3600, useNativeDriver: true }),
            ])
        );

        const timeout = setTimeout(() => {
            floatAnim.start();
            pulseAnim.start();
            rotateAnim.start();
        }, delay);

        return () => {
            clearTimeout(timeout);
            floatAnim.stop();
            pulseAnim.stop();
            rotateAnim.stop();
        };
    }, []);

    const rotateDeg = rotate.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '6deg'] });

    return (
        <View style={styles.illustrationContainer}>
            {/* Outer glow ring */}
            <Animated.View
                style={[
                    styles.glowRing,
                    { borderColor: accentColor, transform: [{ scale: pulse }] },
                ]}
            />
            {/* Background blob */}
            <View style={[styles.blob, { backgroundColor: bgColor }]} />

            {/* Floating shape */}
            <Animated.View
                style={[
                    styles.floatingGroup,
                    { transform: [{ translateY: float }] },
                ]}
            >
                {shape === 'invoice' && <InvoiceShape accentColor={accentColor} rotate={rotateDeg} />}
                {shape === 'clients' && <ClientsShape accentColor={accentColor} rotate={rotateDeg} />}
                {shape === 'wallet' && <WalletShape accentColor={accentColor} rotate={rotateDeg} />}
                {shape === 'insights' && <InsightsShape accentColor={accentColor} rotate={rotateDeg} />}
                {shape === 'contract' && <ContractShape accentColor={accentColor} rotate={rotateDeg} />}
            </Animated.View>
        </View>
    );
}

// ─── Shape components ─────────────────────────────────────────────────────────
function InvoiceShape({ accentColor, rotate }: { accentColor: string; rotate: any }) {
    return (
        <View style={styles.shapeWrap}>
            <Animated.View style={[styles.card3d, { backgroundColor: '#fff', transform: [{ rotate }] }]}>
                <View style={[styles.cardTopBar, { backgroundColor: accentColor }]} />
                <View style={styles.cardLines}>
                    <View style={[styles.cardLine, { width: '70%', backgroundColor: accentColor + '40' }]} />
                    <View style={[styles.cardLine, { width: '50%', backgroundColor: accentColor + '30' }]} />
                    <View style={[styles.cardLine, { width: '60%', backgroundColor: accentColor + '30' }]} />
                </View>
                <View style={[styles.cardBadge, { backgroundColor: accentColor }]}>
                    <Text style={styles.cardBadgeText}>$</Text>
                </View>
            </Animated.View>
            {/* Floating check circle */}
            <View style={[styles.floatBubble, { backgroundColor: accentColor, bottom: -10, right: -10 }]}>
                <Text style={styles.floatBubbleIcon}>✓</Text>
            </View>
        </View>
    );
}

function ClientsShape({ accentColor, rotate }: { accentColor: string; rotate: any }) {
    return (
        <View style={styles.shapeWrap}>
            {/* Back avatars */}
            <View style={[styles.avatar, { backgroundColor: accentColor + '60', left: 10, top: 20 }]} />
            <View style={[styles.avatar, { backgroundColor: accentColor + '40', right: 10, top: 30 }]} />
            {/* Main avatar */}
            <Animated.View style={[styles.avatarMain, { backgroundColor: accentColor, transform: [{ rotate }] }]}>
                <Text style={styles.avatarEmoji}>👤</Text>
            </Animated.View>
            {/* Connection lines */}
            <View style={[styles.connLine, { backgroundColor: accentColor + '50', top: 55, left: 38 }]} />
            <View style={[styles.connLine, { backgroundColor: accentColor + '50', top: 55, right: 38, transform: [{ rotate: '0deg' }] }]} />
            <View style={[styles.floatBubble, { backgroundColor: accentColor, top: -8, right: 16 }]}>
                <Text style={styles.floatBubbleIcon}>★</Text>
            </View>
        </View>
    );
}

function WalletShape({ accentColor, rotate }: { accentColor: string; rotate: any }) {
    return (
        <View style={styles.shapeWrap}>
            <Animated.View style={[styles.walletCard, { backgroundColor: accentColor, transform: [{ rotate }] }]}>
                <View style={styles.walletTopRow}>
                    <View style={styles.walletDot} />
                    <View style={[styles.walletDot, { opacity: 0.6 }]} />
                </View>
                <Text style={styles.walletAmount}>$2,840</Text>
                <View style={styles.walletChip}>
                    <Text style={styles.walletChipText}>USDC</Text>
                </View>
            </Animated.View>
            {/* Coin */}
            <View style={[styles.floatBubble, { backgroundColor: '#F59E0B', bottom: -10, left: -8, width: 36, height: 36 }]}>
                <Text style={[styles.floatBubbleIcon, { fontSize: 16 }]}>₿</Text>
            </View>
        </View>
    );
}

function InsightsShape({ accentColor, rotate }: { accentColor: string; rotate: any }) {
    const bars = [0.4, 0.65, 0.5, 0.8, 0.7, 1.0];
    return (
        <View style={styles.shapeWrap}>
            <Animated.View style={[styles.chartCard, { backgroundColor: '#fff', transform: [{ rotate }] }]}>
                <View style={[styles.chartTopBar, { backgroundColor: accentColor + '20' }]}>
                    <Text style={[styles.chartLabel, { color: accentColor }]}>Revenue</Text>
                </View>
                <View style={styles.chartBars}>
                    {bars.map((h, i) => (
                        <View
                            key={i}
                            style={[
                                styles.bar,
                                {
                                    height: h * 60,
                                    backgroundColor: i === 5 ? accentColor : accentColor + '60',
                                    borderRadius: 4,
                                },
                            ]}
                        />
                    ))}
                </View>
            </Animated.View>
            <View style={[styles.floatBubble, { backgroundColor: accentColor, top: -10, right: 0 }]}>
                <Text style={styles.floatBubbleIcon}>↑</Text>
            </View>
        </View>
    );
}

function ContractShape({ accentColor, rotate }: { accentColor: string; rotate: any }) {
    return (
        <View style={styles.shapeWrap}>
            <Animated.View style={[styles.card3d, { backgroundColor: '#fff', transform: [{ rotate }] }]}>
                <View style={[styles.cardTopBar, { backgroundColor: accentColor }]}>
                    <Text style={[styles.cardTopLabel, { color: '#fff' }]}>CONTRACT</Text>
                </View>
                <View style={styles.cardLines}>
                    <View style={[styles.cardLine, { width: '90%', backgroundColor: accentColor + '30' }]} />
                    <View style={[styles.cardLine, { width: '80%', backgroundColor: accentColor + '20' }]} />
                    <View style={[styles.cardLine, { width: '85%', backgroundColor: accentColor + '20' }]} />
                    <View style={[styles.cardLine, { width: '60%', backgroundColor: accentColor + '20' }]} />
                </View>
                {/* Signature line */}
                <View style={styles.signatureRow}>
                    <View style={[styles.signatureLine, { backgroundColor: accentColor }]} />
                </View>
            </Animated.View>
            <View style={[styles.floatBubble, { backgroundColor: accentColor, bottom: -10, left: -10 }]}>
                <Text style={styles.floatBubbleIcon}>✍</Text>
            </View>
        </View>
    );
}

// ─── Slide data ───────────────────────────────────────────────────────────────
const SLIDES = [
    {
        shape: 'invoice' as const,
        bgColor: '#EFF6FF',
        accentColor: '#2563EB',
        title: 'Invoices & payment links',
        text: 'Create professional invoices and shareable payment links in seconds — AI fills in the details for you.',
    },
    {
        shape: 'clients' as const,
        bgColor: '#F5F3FF',
        accentColor: '#7C3AED',
        title: 'Client management',
        text: 'Keep all your client info, history, and earnings in one place. Never lose track of who owes you.',
    },
    {
        shape: 'wallet' as const,
        bgColor: '#ECFDF5',
        accentColor: '#059669',
        title: 'Crypto wallet & offramp',
        text: 'Get paid in USDC or USDT on any chain. Withdraw to your local bank account without leaving the app.',
    },
    {
        shape: 'insights' as const,
        bgColor: '#FDF2F8',
        accentColor: '#DB2777',
        title: 'Insights & goals',
        text: 'See your earnings trends, invoice performance, and set monthly targets to grow your freelance business.',
    },
    {
        shape: 'contract' as const,
        bgColor: '#ECFEFF',
        accentColor: '#0891B2',
        title: 'Contracts & proposals',
        text: 'Generate contracts and proposals with Hedwig AI. Send for signature and track when clients view them.',
    },
];

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function WelcomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const { user, isReady } = useAuth();
    const flatListRef = useRef<FlatList>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    useAnalyticsScreen('Welcome');

    useEffect(() => {
        if (isReady && user) {
            router.replace('/');
        }
    }, [isReady, user]);

    const onViewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: ViewToken[] }) => {
            if (viewableItems.length > 0 && viewableItems[0].index != null) {
                setActiveIndex(viewableItems[0].index);
            }
        }
    ).current;

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
            {/* Dot pagination */}
            <View style={[styles.dotsRow, { marginTop: insets.top + 20 }]}>
                {SLIDES.map((_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            i === activeIndex
                                ? [styles.dotActive, { backgroundColor: SLIDES[activeIndex].accentColor }]
                                : { backgroundColor: themeColors.border },
                        ]}
                    />
                ))}
            </View>

            {/* Slides */}
            <FlatList
                ref={flatListRef}
                data={SLIDES}
                keyExtractor={(_, i) => String(i)}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                bounces={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
                renderItem={({ item }) => (
                    <View style={styles.slide}>
                        <SlideIllustration
                            bgColor={item.bgColor}
                            accentColor={item.accentColor}
                            shape={item.shape}
                        />
                        <View style={styles.textBlock}>
                            <Text style={[styles.slideTitle, { color: themeColors.textPrimary }]}>
                                {item.title}
                            </Text>
                            <Text style={[styles.slideText, { color: themeColors.textSecondary }]}>
                                {item.text}
                            </Text>
                        </View>
                    </View>
                )}
            />

            {/* Fixed bottom button */}
            <View style={[styles.buttonContainer, { paddingBottom: insets.bottom + 8 }]}>
                <Button
                    title="Get Started"
                    onPress={() => router.push('/auth/login')}
                    variant="primary"
                    size="large"
                />
            </View>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    dotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        paddingBottom: 8,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    dotActive: {
        width: 22,
        height: 6,
        borderRadius: 3,
    },
    slide: {
        width: SCREEN_WIDTH,
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
    },

    // Illustration
    illustrationContainer: {
        width: 260,
        height: 260,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
    },
    glowRing: {
        position: 'absolute',
        width: 240,
        height: 240,
        borderRadius: 120,
        borderWidth: 1.5,
        opacity: 0.3,
    },
    blob: {
        position: 'absolute',
        width: 210,
        height: 210,
        borderRadius: 105,
    },
    floatingGroup: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    shapeWrap: {
        width: 160,
        height: 160,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },

    // Card (invoice / contract)
    card3d: {
        width: 130,
        height: 110,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 6,
    },
    cardTopBar: {
        height: 24,
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    cardTopLabel: {
        fontSize: 9,
        fontFamily: 'GoogleSansFlex_600SemiBold',
        letterSpacing: 1,
    },
    cardLines: {
        flex: 1,
        padding: 10,
        gap: 6,
        justifyContent: 'center',
    },
    cardLine: {
        height: 6,
        borderRadius: 3,
    },
    cardBadge: {
        position: 'absolute',
        bottom: -8,
        right: -8,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
        elevation: 4,
    },
    cardBadgeText: {
        color: '#fff',
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: 15,
    },

    // Avatars (clients)
    avatar: {
        position: 'absolute',
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    avatarMain: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 6,
    },
    avatarEmoji: {
        fontSize: 34,
    },
    connLine: {
        position: 'absolute',
        width: 40,
        height: 2,
        borderRadius: 1,
    },

    // Wallet
    walletCard: {
        width: 140,
        height: 90,
        borderRadius: 16,
        padding: 12,
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
        elevation: 6,
    },
    walletTopRow: {
        flexDirection: 'row',
        gap: 4,
    },
    walletDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.8)',
    },
    walletAmount: {
        color: '#fff',
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: 20,
        letterSpacing: -0.5,
    },
    walletChip: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    walletChipText: {
        color: '#fff',
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 9,
    },

    // Chart
    chartCard: {
        width: 140,
        height: 110,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 6,
    },
    chartTopBar: {
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    chartLabel: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 10,
    },
    chartBars: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 10,
        paddingBottom: 10,
        gap: 5,
    },
    bar: {
        flex: 1,
    },

    // Signature
    signatureRow: {
        paddingHorizontal: 12,
        paddingBottom: 10,
    },
    signatureLine: {
        height: 1.5,
        borderRadius: 1,
        width: '60%',
        opacity: 0.6,
    },

    // Floating bubble
    floatBubble: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
    },
    floatBubbleIcon: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },

    // Text
    textBlock: {
        alignItems: 'center',
        gap: 12,
    },
    slideTitle: {
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: 28,
        letterSpacing: -0.5,
        textAlign: 'center',
        lineHeight: 34,
    },
    slideText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        lineHeight: 25,
        textAlign: 'center',
    },

    // Button
    buttonContainer: {
        paddingHorizontal: 24,
        paddingTop: 16,
    },
});
