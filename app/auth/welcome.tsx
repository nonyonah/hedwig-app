import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    FlatList,
    Animated,
    ViewToken,
    Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
    Rect,
    Circle,
    Line,
    Path,
    G,
    Text as SvgText,
    Defs,
    LinearGradient as SvgGradient,
    Stop,
} from 'react-native-svg';
import { useThemeColors } from '../../theme/colors';
import { Button } from '../../components/Button';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import { useAuth } from '../../hooks/useAuth';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ILL_SIZE = Math.min(SCREEN_WIDTH * 0.82, 320);

// ─── Floating wrapper ─────────────────────────────────────────────────────────
function FloatingView({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
    const y = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(y, { toValue: -12, duration: 2000, useNativeDriver: true }),
                Animated.timing(y, { toValue: 0, duration: 2000, useNativeDriver: true }),
            ])
        );
        const t = setTimeout(() => anim.start(), delay);
        return () => { clearTimeout(t); anim.stop(); };
    }, []);

    return <Animated.View style={{ transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

// ─── Illustration 1: Invoice ──────────────────────────────────────────────────
function InvoiceIllustration() {
    const s = ILL_SIZE;
    return (
        <Svg width={s} height={s} viewBox="0 0 320 320">
            <Defs>
                <SvgGradient id="bg1" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#EFF6FF" />
                    <Stop offset="1" stopColor="#DBEAFE" />
                </SvgGradient>
                <SvgGradient id="blue" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#3B82F6" />
                    <Stop offset="1" stopColor="#2563EB" />
                </SvgGradient>
            </Defs>

            {/* Background circle */}
            <Circle cx="160" cy="160" r="148" fill="url(#bg1)" />

            {/* Main invoice card */}
            <G transform="translate(70, 60)">
                {/* Card shadow */}
                <Rect x="4" y="6" width="172" height="200" rx="20" fill="#2563EB" opacity="0.08" />
                {/* Card body */}
                <Rect width="172" height="200" rx="20" fill="white" />

                {/* Blue header strip */}
                <Rect width="172" height="52" rx="20" fill="url(#blue)" />
                <Rect y="32" width="172" height="20" fill="#2563EB" />

                {/* Header text area */}
                <Rect x="16" y="14" width="60" height="8" rx="4" fill="rgba(255,255,255,0.6)" />
                <Rect x="16" y="28" width="90" height="12" rx="6" fill="white" opacity="0.9" />

                {/* Amount badge */}
                <Rect x="108" y="12" width="52" height="28" rx="14" fill="rgba(255,255,255,0.2)" />
                <Rect x="116" y="20" width="36" height="10" rx="5" fill="white" opacity="0.85" />

                {/* Divider */}
                <Line x1="16" y1="72" x2="156" y2="72" stroke="#F1F5F9" strokeWidth="1.5" />

                {/* Line items */}
                {[88, 108, 128].map((y, i) => (
                    <G key={i}>
                        <Rect x="16" y={y} width={60 + i * 10} height="7" rx="3.5"
                            fill="#E2E8F0" />
                        <Rect x={130} y={y} width="26" height="7" rx="3.5"
                            fill={i === 0 ? '#BFDBFE' : '#E2E8F0'} />
                    </G>
                ))}

                {/* Subtotal row */}
                <Line x1="16" y1="148" x2="156" y2="148" stroke="#F1F5F9" strokeWidth="1" />
                <Rect x="16" y="158" width="40" height="7" rx="3.5" fill="#CBD5E1" />
                <Rect x="120" y="156" width="36" height="12" rx="6" fill="#DBEAFE" />

                {/* Send button */}
                <Rect x="16" y="178" width="140" height="14" rx="7" fill="url(#blue)" opacity="0.9" />
            </G>

            {/* Floating badge: Sent ✓ */}
            <G transform="translate(196, 82)">
                <Rect width="62" height="28" rx="14" fill="#10B981" />
                <Rect x="10" y="10" width="8" height="8" rx="4" fill="white" opacity="0.7" />
                <Rect x="24" y="13" width="28" height="6" rx="3" fill="white" opacity="0.85" />
            </G>

            {/* Floating badge: $ amount */}
            <G transform="translate(50, 218)">
                <Rect width="76" height="34" rx="17" fill="white" />
                <Rect x="2" y="2" width="72" height="30" rx="15" fill="white"
                    stroke="#E2E8F0" strokeWidth="1" />
                <Rect x="12" y="11" width="52" height="12" rx="6" fill="#DBEAFE" />
            </G>
        </Svg>
    );
}

// ─── Illustration 2: Clients ──────────────────────────────────────────────────
function ClientsIllustration() {
    const s = ILL_SIZE;
    return (
        <Svg width={s} height={s} viewBox="0 0 320 320">
            <Defs>
                <SvgGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#F5F3FF" />
                    <Stop offset="1" stopColor="#EDE9FE" />
                </SvgGradient>
                <SvgGradient id="purple" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#8B5CF6" />
                    <Stop offset="1" stopColor="#7C3AED" />
                </SvgGradient>
            </Defs>

            <Circle cx="160" cy="160" r="148" fill="url(#bg2)" />

            {/* Client card 1 — back */}
            <G transform="translate(92, 78) rotate(-8 86 60)">
                <Rect width="172" height="72" rx="16" fill="white" opacity="0.7"
                    stroke="#EDE9FE" strokeWidth="1" />
                <Circle cx="26" cy="36" r="16" fill="#DDD6FE" />
                <Rect x="52" y="22" width="80" height="8" rx="4" fill="#E2E8F0" />
                <Rect x="52" y="36" width="56" height="7" rx="3.5" fill="#EDE9FE" />
            </G>

            {/* Client card 2 — back */}
            <G transform="translate(56, 148) rotate(5 86 60)">
                <Rect width="172" height="72" rx="16" fill="white" opacity="0.7"
                    stroke="#EDE9FE" strokeWidth="1" />
                <Circle cx="26" cy="36" r="16" fill="#C4B5FD" />
                <Rect x="52" y="22" width="64" height="8" rx="4" fill="#E2E8F0" />
                <Rect x="52" y="36" width="88" height="7" rx="3.5" fill="#EDE9FE" />
            </G>

            {/* Main client card */}
            <G transform="translate(74, 108)">
                <Rect x="3" y="4" width="172" height="100" rx="20" fill="#7C3AED" opacity="0.1" />
                <Rect width="172" height="100" rx="20" fill="white" />

                {/* Avatar */}
                <Circle cx="34" cy="50" r="26" fill="url(#purple)" />
                <Circle cx="34" cy="40" r="10" fill="rgba(255,255,255,0.8)" />
                <Path d="M14 66 Q34 54 54 66" fill="rgba(255,255,255,0.7)" />

                {/* Name + meta */}
                <Rect x="72" y="28" width="80" height="11" rx="5.5" fill="#1E293B" opacity="0.85" />
                <Rect x="72" y="46" width="56" height="8" rx="4" fill="#CBD5E1" />
                <Rect x="72" y="62" width="36" height="8" rx="4" fill="#EDE9FE" />

                {/* Earnings chip */}
                <Rect x="120" y="58" width="38" height="18" rx="9" fill="#7C3AED" opacity="0.12" />
                <Rect x="126" y="63" width="26" height="8" rx="4" fill="#7C3AED" opacity="0.6" />
            </G>

            {/* Star badge */}
            <G transform="translate(218, 110)">
                <Circle r="18" cx="18" cy="18" fill="#FCD34D" />
                <SvgText x="18" y="23" textAnchor="middle" fontSize="16" fill="white">★</SvgText>
            </G>

            {/* Earnings bubble */}
            <G transform="translate(62, 228)">
                <Rect width="88" height="32" rx="16" fill="white" stroke="#EDE9FE" strokeWidth="1.5" />
                <Rect x="10" y="10" width="68" height="12" rx="6" fill="#DDD6FE" />
            </G>
        </Svg>
    );
}

// ─── Illustration 3: Wallet ───────────────────────────────────────────────────
function WalletIllustration() {
    const s = ILL_SIZE;
    return (
        <Svg width={s} height={s} viewBox="0 0 320 320">
            <Defs>
                <SvgGradient id="bg3" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#ECFDF5" />
                    <Stop offset="1" stopColor="#D1FAE5" />
                </SvgGradient>
                <SvgGradient id="green" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#10B981" />
                    <Stop offset="1" stopColor="#059669" />
                </SvgGradient>
                <SvgGradient id="greenCard" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor="#059669" />
                    <Stop offset="1" stopColor="#047857" />
                </SvgGradient>
            </Defs>

            <Circle cx="160" cy="160" r="148" fill="url(#bg3)" />

            {/* Back card */}
            <G transform="translate(56, 82) rotate(-6 100 60)">
                <Rect width="200" height="118" rx="20" fill="#34D399" opacity="0.4" />
            </G>

            {/* Main card */}
            <G transform="translate(60, 96)">
                <Rect x="2" y="4" width="200" height="118" rx="22" fill="#059669" opacity="0.15" />
                <Rect width="200" height="118" rx="22" fill="url(#greenCard)" />

                {/* Chip */}
                <Rect x="16" y="18" width="32" height="24" rx="6" fill="rgba(255,255,255,0.3)" />
                <Rect x="20" y="22" width="24" height="8" rx="2" fill="rgba(255,255,255,0.2)" />
                <Rect x="20" y="32" width="12" height="6" rx="2" fill="rgba(255,255,255,0.15)" />

                {/* USDC label */}
                <Rect x="148" y="18" width="38" height="18" rx="9" fill="rgba(255,255,255,0.2)" />
                <Rect x="154" y="23" width="26" height="8" rx="4" fill="rgba(255,255,255,0.7)" />

                {/* Balance */}
                <Rect x="16" y="56" width="56" height="10" rx="5" fill="rgba(255,255,255,0.45)" />
                <Rect x="16" y="72" width="120" height="18" rx="9" fill="rgba(255,255,255,0.9)" />

                {/* Card number dots */}
                {[16, 52, 88, 124].map((x, i) => (
                    <G key={i}>
                        <Circle cx={x + 4} cy="102" r="3" fill="rgba(255,255,255,0.5)" />
                        <Circle cx={x + 12} cy="102" r="3" fill="rgba(255,255,255,0.5)" />
                        <Circle cx={x + 20} cy="102" r="3" fill="rgba(255,255,255,0.5)" />
                    </G>
                ))}
                <Rect x="148" y="96" width="40" height="12" rx="4" fill="rgba(255,255,255,0.7)" />
            </G>

            {/* USDC coin */}
            <G transform="translate(210, 186)">
                <Circle cx="26" cy="26" r="26" fill="url(#green)" />
                <Circle cx="26" cy="26" r="18" fill="rgba(255,255,255,0.15)" />
                <SvgText x="26" y="31" textAnchor="middle" fontSize="18" fill="white" fontWeight="bold">$</SvgText>
            </G>

            {/* Withdrawal badge */}
            <G transform="translate(50, 228)">
                <Rect width="106" height="36" rx="18" fill="white" stroke="#D1FAE5" strokeWidth="1.5" />
                <Circle cx="18" cy="18" r="11" fill="url(#green)" />
                <Rect x="36" y="11" width="58" height="8" rx="4" fill="#D1FAE5" />
                <Rect x="36" y="23" width="40" height="6" rx="3" fill="#A7F3D0" />
            </G>
        </Svg>
    );
}

// ─── Illustration 4: Insights ─────────────────────────────────────────────────
function InsightsIllustration() {
    const s = ILL_SIZE;
    const bars = [
        { h: 44, fill: '#FBB6CE' },
        { h: 68, fill: '#F472B6' },
        { h: 52, fill: '#FBB6CE' },
        { h: 88, fill: '#EC4899' },
        { h: 72, fill: '#F472B6' },
        { h: 108, fill: '#DB2777' },
    ];
    return (
        <Svg width={s} height={s} viewBox="0 0 320 320">
            <Defs>
                <SvgGradient id="bg4" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#FDF2F8" />
                    <Stop offset="1" stopColor="#FCE7F3" />
                </SvgGradient>
                <SvgGradient id="pink" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#F472B6" />
                    <Stop offset="1" stopColor="#DB2777" />
                </SvgGradient>
                <SvgGradient id="chartArea" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#DB2777" stopOpacity="0.15" />
                    <Stop offset="1" stopColor="#DB2777" stopOpacity="0" />
                </SvgGradient>
            </Defs>

            <Circle cx="160" cy="160" r="148" fill="url(#bg4)" />

            {/* Chart card */}
            <G transform="translate(58, 72)">
                <Rect x="2" y="4" width="204" height="176" rx="22" fill="#DB2777" opacity="0.08" />
                <Rect width="204" height="176" rx="22" fill="white" />

                {/* Header */}
                <Rect x="16" y="18" width="80" height="10" rx="5" fill="#1E293B" opacity="0.8" />
                <Rect x="16" y="34" width="52" height="8" rx="4" fill="#CBD5E1" />

                {/* Trend badge */}
                <Rect x="148" y="16" width="44" height="22" rx="11" fill="#FCE7F3" />
                <Rect x="156" y="22" width="28" height="10" rx="5" fill="#F472B6" />

                {/* Bar chart */}
                <G transform="translate(14, 148)">
                    {bars.map((b, i) => (
                        <Rect
                            key={i}
                            x={i * 28}
                            y={-b.h}
                            width="20"
                            height={b.h}
                            rx="5"
                            fill={b.fill}
                        />
                    ))}
                </G>

                {/* X axis */}
                <Line x1="14" y1="152" x2="190" y2="152" stroke="#F1F5F9" strokeWidth="1.5" />

                {/* Goal line */}
                <Line x1="14" y1="96" x2="190" y2="96"
                    stroke="#DB2777" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.4" />
                <Rect x="152" y="88" width="36" height="16" rx="8" fill="#DB2777" opacity="0.12" />
                <Rect x="158" y="92" width="24" height="8" rx="4" fill="#DB2777" opacity="0.5" />
            </G>

            {/* Up arrow badge */}
            <G transform="translate(216, 84)">
                <Circle cx="22" cy="22" r="22" fill="url(#pink)" />
                <Path d="M22 30 L22 14 M15 21 L22 14 L29 21"
                    stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </G>

            {/* Monthly target badge */}
            <G transform="translate(56, 262)">
                <Rect width="112" height="34" rx="17" fill="white" stroke="#FCE7F3" strokeWidth="1.5" />
                <Rect x="10" y="11" width="92" height="12" rx="6" fill="#FCE7F3" />
            </G>
        </Svg>
    );
}

// ─── Illustration 5: Contracts ────────────────────────────────────────────────
function ContractIllustration() {
    const s = ILL_SIZE;
    return (
        <Svg width={s} height={s} viewBox="0 0 320 320">
            <Defs>
                <SvgGradient id="bg5" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#ECFEFF" />
                    <Stop offset="1" stopColor="#CFFAFE" />
                </SvgGradient>
                <SvgGradient id="cyan" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#22D3EE" />
                    <Stop offset="1" stopColor="#0891B2" />
                </SvgGradient>
            </Defs>

            <Circle cx="160" cy="160" r="148" fill="url(#bg5)" />

            {/* Back page shadow */}
            <G transform="translate(84, 58) rotate(6 76 100)">
                <Rect width="152" height="196" rx="16" fill="#A5F3FC" opacity="0.5" />
            </G>

            {/* Main document */}
            <G transform="translate(84, 62)">
                <Rect x="2" y="3" width="152" height="196" rx="18" fill="#0891B2" opacity="0.1" />
                <Rect width="152" height="196" rx="18" fill="white" />

                {/* Cyan header bar */}
                <Rect width="152" height="48" rx="18" fill="url(#cyan)" />
                <Rect y="30" width="152" height="18" fill="#0891B2" />

                {/* Doc title */}
                <Rect x="16" y="16" width="52" height="7" rx="3.5" fill="rgba(255,255,255,0.55)" />
                <Rect x="16" y="29" width="76" height="11" rx="5.5" fill="rgba(255,255,255,0.9)" />

                {/* Text lines */}
                {[62, 76, 90, 104, 118].map((y, i) => (
                    <Rect key={i} x="16" y={y} width={i % 2 === 0 ? 120 : 96} height="7" rx="3.5"
                        fill="#E2E8F0" />
                ))}

                {/* Divider */}
                <Line x1="16" y1="136" x2="136" y2="136" stroke="#F1F5F9" strokeWidth="1.5" />

                {/* Parties row */}
                <Rect x="16" y="146" width="44" height="7" rx="3.5" fill="#CBD5E1" />
                <Rect x="80" y="146" width="56" height="7" rx="3.5" fill="#CBD5E1" />

                {/* Signature lines */}
                <Line x1="16" y1="172" x2="60" y2="172" stroke="#0891B2" strokeWidth="2"
                    strokeLinecap="round" opacity="0.5" />
                <Path d="M80 172 Q92 162 104 172 Q116 182 128 172"
                    stroke="#0891B2" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7" />
            </G>

            {/* Signed badge */}
            <G transform="translate(196, 218)">
                <Rect width="74" height="30" rx="15" fill="url(#cyan)" />
                <Circle cx="18" cy="15" r="9" fill="rgba(255,255,255,0.25)" />
                <Rect x="32" y="11" width="30" height="8" rx="4" fill="rgba(255,255,255,0.85)" />
            </G>

            {/* AI spark badge */}
            <G transform="translate(48, 80)">
                <Circle cx="20" cy="20" r="20" fill="url(#cyan)" />
                <SvgText x="20" y="26" textAnchor="middle" fontSize="18" fill="white">✦</SvgText>
            </G>
        </Svg>
    );
}

// ─── Slide data ───────────────────────────────────────────────────────────────
const SLIDES = [
    {
        Illustration: InvoiceIllustration,
        accentColor: '#2563EB',
        title: 'Invoices & payment links',
        text: 'Create professional invoices and shareable payment links in seconds — AI fills in the details for you.',
    },
    {
        Illustration: ClientsIllustration,
        accentColor: '#7C3AED',
        title: 'Client management',
        text: 'Keep all your client info, history, and earnings in one place. Never lose track of who owes you.',
    },
    {
        Illustration: WalletIllustration,
        accentColor: '#059669',
        title: 'Crypto wallet & offramp',
        text: 'Get paid in USDC or USDT on any chain. Withdraw to your local bank account without leaving the app.',
    },
    {
        Illustration: InsightsIllustration,
        accentColor: '#DB2777',
        title: 'Insights & goals',
        text: 'See your earnings trends, invoice performance, and set monthly targets to grow your freelance business.',
    },
    {
        Illustration: ContractIllustration,
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
        if (isReady && user) router.replace('/');
    }, [isReady, user]);

    const onViewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: ViewToken[] }) => {
            if (viewableItems.length > 0 && viewableItems[0].index != null) {
                setActiveIndex(viewableItems[0].index);
            }
        }
    ).current;

    const active = SLIDES[activeIndex];

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
            {/* Logo */}
            <View style={[styles.logoRow, { marginTop: insets.top + 16 }]}>
                <Image
                    source={require('../../assets/images/hedwig-logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </View>

            {/* Dot pagination */}
            <View style={styles.dotsRow}>
                {SLIDES.map((s, i) => (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            i === activeIndex
                                ? [styles.dotActive, { backgroundColor: s.accentColor }]
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
                style={{ flex: 1 }}
                renderItem={({ item }) => (
                    <View style={styles.slide}>
                        <FloatingView delay={0}>
                            <item.Illustration />
                        </FloatingView>

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
    logoRow: {
        alignItems: 'center',
        marginBottom: 4,
    },
    logo: {
        width: 80,
        height: 32,
    },
    dotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 12,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    dotActive: {
        width: 24,
        height: 6,
        borderRadius: 3,
    },
    slide: {
        width: SCREEN_WIDTH,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        gap: 28,
    },
    textBlock: {
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 4,
    },
    slideTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 26,
        letterSpacing: -0.4,
        textAlign: 'center',
        lineHeight: 33,
    },
    slideText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 15,
        lineHeight: 24,
        textAlign: 'center',
    },
    buttonContainer: {
        paddingHorizontal: 24,
        paddingTop: 12,
    },
});
