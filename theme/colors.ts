import { Color } from 'expo-router';
import { useColorScheme, Platform, type ColorValue } from 'react-native';
import { useSettings } from '../context/SettingsContext';

// Light mode colors — warm cream palette inspired by Ramp/Mercury.
// Blue accent (#2563EB) is the brand color; everything else stays neutral.
const LightColors = {
    primary: '#2563EB', // Blue-600 — brand accent, unchanged
    primaryDark: '#1E40AF', // Blue-800
    primaryLight: '#DBEAFE', // Blue-100
    onPrimary: '#FFFFFF',
    secondary: '#64748B', // Slate-500

    background: '#F3F0E6', // Warm cream — replaces stark white
    surface: '#FFFFFF', // Elevated cards sit on cream
    surfaceHighlight: '#F8F6F0', // Slightly warmer than cream for nested surfaces

    textPrimary: '#1C1A14', // Warm near-black (not blue-slate)
    textSecondary: '#8B8878', // Warm gray for metadata / section labels
    textTertiary: '#ADA99B', // Lighter warm gray
    textPlaceholder: '#C8C4B8', // Warm placeholder

    border: 'rgba(28, 26, 20, 0.07)', // Warm-toned soft divider
    cardShadow: 'rgba(30, 28, 20, 0.08)', // Warm shadow base color

    success: '#10B981', // Emerald-500
    successBackground: '#D1FAE5', // Emerald-100

    error: '#EF4444', // Red-500
    errorBackground: '#FEE2E2', // Red-100

    warning: '#F59E0B', // Amber-500
    warningBackground: '#FEF3C7', // Amber-100

    info: '#3B82F6', // Blue-500
    infoBackground: '#DBEAFE', // Blue-100

    // Amount semantics (Hedwig contract):
    // inflow = emerald, outflow = neutral, failure = error, pending = warning.
    moneyIn: '#10B981',
    moneyOut: '#64748B',

    white: '#FFFFFF',
    black: '#000000',
    transparent: 'transparent',

    // Card backgrounds
    cardBackground: '#FFFFFF', // Cards are white on cream
    inputBackground: '#F8F6F0', // Warm input fields
    modalBackground: '#FFFFFF',
};

// Dark mode colors (near-black surfaces — Linear / Attio / Notion inspired).
// True black is reserved for immersive moments (camera capture, confirmation) only.
const DarkColors: ThemeColors = {
    primary: '#3B82F6', // Blue-500 (slightly brighter for dark mode)
    primaryDark: '#2563EB', // Blue-600
    primaryLight: '#1E3A5F', // Dark blue tint
    onPrimary: '#FFFFFF',
    secondary: '#A1A1AA', // Zinc-400

    background: '#0F0F10', // Near-black page background
    surface: '#161618', // Raised surface
    surfaceHighlight: '#1D1D20', // Top surface / cards

    textPrimary: '#F5F5F6',
    textSecondary: '#A1A1AA', // Zinc-400
    textTertiary: '#70707A', // Zinc-500
    textPlaceholder: '#4B4B52', // Zinc-600

    border: 'rgba(255, 255, 255, 0.08)', // Softer divider for dark surfaces
    cardShadow: 'rgba(0, 0, 0, 0.24)', // Dark mode shadow base color

    success: '#22C55E', // Green-500
    successBackground: '#14532D', // Green-900

    error: '#EF4444', // Red-500
    errorBackground: '#7F1D1D', // Red-900

    warning: '#F59E0B', // Amber-500
    warningBackground: '#78350F', // Amber-900

    info: '#3B82F6', // Blue-500
    infoBackground: '#1E3A5F', // Dark blue

    // Semantic amounts — inflow brighter emerald on dark, outflow neutral zinc.
    moneyIn: '#34D399',
    moneyOut: '#A1A1AA',

    white: '#FFFFFF',
    black: '#000000',
    transparent: 'transparent',

    // Card backgrounds
    cardBackground: '#1D1D20',
    inputBackground: '#1B1B1E',
    modalBackground: '#161618',
};

export type ThemeColors = typeof LightColors;

const getAndroidDynamicColor = (name: string, fallback: string): ColorValue => {
    if (Platform.OS !== 'android') return fallback;
    return ((Color as any).android?.dynamic?.[name] as ColorValue | undefined) ?? fallback;
};

// Kept in sync by useThemeColors() so the static-friendly `Colors` export
// always reflects the active palette (see Colors below).
let activePalette: ThemeColors = LightColors;

function registerActivePalette(palette: ThemeColors) {
    activePalette = palette;
}

export function useThemeColors(): ThemeColors {
    const settings = useSettings();
    useColorScheme(); // Keep Android dynamic colors in sync with system theme changes.

    const isDark = settings.currentTheme === 'dark';
    const palette = isDark ? DarkColors : LightColors;
    const useAndroidDynamicPalette = Platform.OS === 'android';

    if (!useAndroidDynamicPalette) {
        registerActivePalette(palette);
        return palette;
    }

    const resolved: ThemeColors = {
        ...palette,
        primary: getAndroidDynamicColor('primary', palette.primary) as any,
        primaryDark: getAndroidDynamicColor('primaryContainer', palette.primaryDark) as any,
        primaryLight: getAndroidDynamicColor('primaryFixedDim', palette.primaryLight) as any,
        secondary: getAndroidDynamicColor('secondary', palette.secondary) as any,
        // Keep page background neutral and lift cards/blocks using higher surface containers for contrast.
        background: getAndroidDynamicColor('surface', palette.background) as any,
        surface: getAndroidDynamicColor('surfaceContainerHigh', palette.surface) as any,
        surfaceHighlight: getAndroidDynamicColor('surfaceContainerHighest', palette.surfaceHighlight) as any,
        textPrimary: getAndroidDynamicColor('onSurface', palette.textPrimary) as any,
        textSecondary: getAndroidDynamicColor('onSurfaceVariant', palette.textSecondary) as any,
        textTertiary: getAndroidDynamicColor('outline', palette.textTertiary) as any,
        textPlaceholder: getAndroidDynamicColor('outlineVariant', palette.textPlaceholder) as any,
        border: getAndroidDynamicColor('outlineVariant', palette.border) as any,
        cardBackground: getAndroidDynamicColor('surfaceContainerHighest', palette.cardBackground) as any,
        inputBackground: getAndroidDynamicColor('surfaceContainerHigh', palette.inputBackground) as any,
        modalBackground: getAndroidDynamicColor('surfaceContainerHighest', palette.modalBackground) as any,
    };
    registerActivePalette(resolved);
    return resolved;
}

export function useKeyboardAppearance(): 'dark' | 'light' {
    const colorScheme = useColorScheme();
    return colorScheme === 'dark' ? 'dark' : 'light';
}

// Theme-aware static export. Unlike a frozen palette, this reads the palette
// that useThemeColors() most recently resolved, so files that cannot use the
// hook (module-scope StyleSheet.create, helper components) stay correct in
// dark mode instead of silently falling back to the light palette.
export const Colors: ThemeColors = new Proxy(LightColors as ThemeColors, {
    get(_target, prop: string | symbol) {
        if (typeof prop === 'string' && prop in activePalette) {
            return (activePalette as any)[prop];
        }
        return (LightColors as any)[prop];
    },
});

// Export both palettes for direct access if needed
export { LightColors, DarkColors };