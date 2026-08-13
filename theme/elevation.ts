import { Platform, type ViewStyle } from 'react-native';

// Elevation contract — three tiers: resting card, elevated sheet, floating modal.
// iOS uses warm diffuse shadows; Android uses M3 elevation.
// Shadow color matches the warm cream palette (#1C1A14 based).
export const Elevation: Record<'resting' | 'sheet' | 'modal', ViewStyle> = {
    resting: Platform.select({
        ios: {
            shadowColor: '#1E1C14',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
        },
        android: {
            elevation: 2,
        },
        default: {},
    }) as ViewStyle,

    sheet: Platform.select({
        ios: {
            shadowColor: '#1E1C14',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.10,
            shadowRadius: 24,
        },
        android: {
            elevation: 8,
        },
        default: {},
    }) as ViewStyle,

    modal: Platform.select({
        ios: {
            shadowColor: '#1E1C14',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.14,
            shadowRadius: 30,
        },
        android: {
            elevation: 16,
        },
        default: {},
    }) as ViewStyle,
};

export type ElevationTier = keyof typeof Elevation;
