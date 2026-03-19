import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    FlatList,
    ViewToken,
    Image,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../theme/colors';
import { Button } from '../../components/Button';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import { useAuth } from '../../hooks/useAuth';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const SLIDES = [
    {
        lottie: require('../../assets/animations/onboard-invoice.json'),
        accentColor: '#2563EB',
        bgColor: '#EFF6FF',
        title: 'Invoices & payment links',
        text: 'Create professional invoices and shareable payment links in seconds — AI fills in the details for you.',
    },
    {
        lottie: require('../../assets/animations/onboard-clients.json'),
        accentColor: '#7C3AED',
        bgColor: '#F5F3FF',
        title: 'Client management',
        text: 'Keep all your client info, history, and earnings in one place. Never lose track of who owes you.',
    },
    {
        lottie: require('../../assets/animations/onboard-fiat.json'),
        accentColor: '#059669',
        bgColor: '#ECFDF5',
        title: 'Convert to fiat',
        text: 'Get paid in USDC or USDT. Withdraw directly to your local bank account without leaving the app.',
    },
    {
        lottie: require('../../assets/animations/onboard-insights.json'),
        accentColor: '#DB2777',
        bgColor: '#FDF2F8',
        title: 'Insights & goals',
        text: 'See your earnings trends, invoice performance, and set monthly targets to grow your business.',
    },
    {
        lottie: require('../../assets/animations/onboard-contracts.json'),
        accentColor: '#0891B2',
        bgColor: '#ECFEFF',
        title: 'Contracts & proposals',
        text: 'Generate contracts and proposals with Hedwig AI. Send for signature and track when clients view them.',
    },
];

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

    return (
        <View style={[styles.root, { backgroundColor: themeColors.background }]}>
            {/* Logo */}
            <View style={[styles.logoRow, { marginTop: insets.top + 20 }]}>
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
                                : { backgroundColor: '#E2E8F0' },
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
                        {/* Lottie fills the upper portion — no container */}
                        <View
                            style={[
                                styles.lottieArea,
                                { backgroundColor: item.bgColor },
                            ]}
                        >
                            <LottieView
                                source={item.lottie}
                                autoPlay
                                loop
                                style={styles.lottie}
                            />
                        </View>

                        {/* Text sits directly below, no card/panel */}
                        <View style={styles.textArea}>
                            <Text
                                style={[styles.title, { color: themeColors.textPrimary }]}
                            >
                                {item.title}
                            </Text>
                            <Text
                                style={[styles.body, { color: themeColors.textSecondary }]}
                            >
                                {item.text}
                            </Text>
                        </View>
                    </View>
                )}
            />

            {/* Get Started button — fixed */}
            <View
                style={[
                    styles.buttonWrap,
                    { paddingBottom: insets.bottom + 12 },
                ]}
            >
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

const LOTTIE_AREA_HEIGHT = SCREEN_HEIGHT * 0.50;

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    logoRow: {
        alignItems: 'center',
        marginBottom: 8,
    },
    logo: {
        width: 88,
        height: 34,
    },
    dotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 5,
        paddingBottom: 10,
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
        flex: 1,
    },
    lottieArea: {
        width: SCREEN_WIDTH,
        height: LOTTIE_AREA_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomLeftRadius: 36,
        borderBottomRightRadius: 36,
        overflow: 'hidden',
    },
    lottie: {
        width: SCREEN_WIDTH * 0.78,
        height: SCREEN_WIDTH * 0.78,
    },
    textArea: {
        flex: 1,
        paddingHorizontal: 32,
        paddingTop: 28,
        gap: 12,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 26,
        letterSpacing: -0.4,
        lineHeight: 33,
    },
    body: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 15,
        lineHeight: 24,
    },
    buttonWrap: {
        paddingHorizontal: 24,
        paddingTop: 8,
    },
});
