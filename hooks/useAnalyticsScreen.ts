/**
 * Analytics Screen Tracking Hook
 * 
 * Automatically tracks screen views when a screen gains focus.
 * Use this in all screen components for consistent page tracking.
 */

import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { trackScreen } from '../services/analytics';

/**
 * Hook to track screen views automatically when the screen gains focus
 * 
 * @param screenName - Name of the screen (e.g., 'Home', 'Settings', 'Invoice Details')
 * @param properties - Optional additional properties to track
 * 
 * @example
 * ```tsx
 * export default function SettingsScreen() {
 *   useAnalyticsScreen('Settings');
 *   // ... rest of component
 * }
 * ```
 */
export function useAnalyticsScreen(screenName: string, properties?: Record<string, any>) {
    useFocusEffect(
        useCallback(() => {
            trackScreen(screenName, properties);
        }, [screenName, JSON.stringify(properties)])
    );
}

export default useAnalyticsScreen;
