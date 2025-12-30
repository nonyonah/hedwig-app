import { useSettings } from '../context/SettingsContext';

// Light mode colors (existing)
const LightColors = {
    primary: '#2563EB', // Blue-600
    primaryDark: '#1E40AF', // Blue-800
    primaryLight: '#DBEAFE', // Blue-100
    secondary: '#64748B', // Slate-500

    background: '#FFFFFF',
    surface: '#F8FAFC', // Slate-50
    surfaceHighlight: '#F1F5F9', // Slate-100

    textPrimary: '#0F172A', // Slate-900
    textSecondary: '#64748B', // Slate-500
    textTertiary: '#94A3B8', // Slate-400
    textPlaceholder: '#CBD5E1', // Slate-300

    border: '#E2E8F0', // Slate-200

    success: '#10B981', // Emerald-500
    successBackground: '#D1FAE5', // Emerald-100

    error: '#EF4444', // Red-500
    errorBackground: '#FEE2E2', // Red-100

    warning: '#F59E0B', // Amber-500
    warningBackground: '#FEF3C7', // Amber-100

    info: '#3B82F6', // Blue-500
    infoBackground: '#DBEAFE', // Blue-100

    white: '#FFFFFF',
    black: '#000000',
    transparent: 'transparent',

    // Card backgrounds
    cardBackground: '#F5F5F5',
    inputBackground: '#F5F5F5',
    modalBackground: '#FFFFFF',
};

// Dark mode colors (pure black)
const DarkColors = {
    primary: '#3B82F6', // Blue-500 (slightly brighter for dark mode)
    primaryDark: '#2563EB', // Blue-600
    primaryLight: '#1E3A5F', // Dark blue tint
    secondary: '#94A3B8', // Slate-400

    background: '#000000', // Pure black
    surface: '#0A0A0A', // Near black
    surfaceHighlight: '#141414', // Slightly lighter black

    textPrimary: '#FFFFFF', // White
    textSecondary: '#A1A1AA', // Zinc-400
    textTertiary: '#71717A', // Zinc-500
    textPlaceholder: '#52525B', // Zinc-600

    border: '#27272A', // Zinc-800

    success: '#22C55E', // Green-500
    successBackground: '#14532D', // Green-900

    error: '#EF4444', // Red-500
    errorBackground: '#7F1D1D', // Red-900

    warning: '#F59E0B', // Amber-500
    warningBackground: '#78350F', // Amber-900

    info: '#3B82F6', // Blue-500
    infoBackground: '#1E3A5F', // Dark blue

    white: '#FFFFFF',
    black: '#000000',
    transparent: 'transparent',

    // Card backgrounds
    cardBackground: '#141414',
    inputBackground: '#1A1A1A',
    modalBackground: '#0A0A0A',
};

export type ThemeColors = typeof LightColors;

export function useThemeColors(): ThemeColors {
    const settings = useSettings();
    const isDark = settings.currentTheme === 'dark';
    return isDark ? DarkColors : LightColors;
}

// Export static colors (for backward compatibility where hooks can't be used)
export const Colors = LightColors;

// Export both palettes for direct access if needed
export { LightColors, DarkColors };
