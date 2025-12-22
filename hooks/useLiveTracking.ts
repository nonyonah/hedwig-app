/**
 * useLiveTracking Hook
 * 
 * React hook for managing live tracking of withdrawals
 * Integrates with iOS Live Activities and Android Live Updates
 */

import { useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
    startLiveTracking,
    updateLiveTracking,
    stopLiveTracking,
    cleanupOldTracking,
} from '../services/liveTracking';

interface WithdrawalDetails {
    orderId: string;
    fiatAmount: number;
    fiatCurrency: string;
    bankName: string;
    accountNumber: string;
    status: string;
}

interface OfframpNotificationData {
    type?: string;
    orderId?: string;
    fiatAmount?: number;
    fiatCurrency?: string;
    bankName?: string;
    status?: string;
}

/**
 * Hook to manage live tracking for withdrawals
 */
export function useLiveTracking() {
    const notificationListener = useRef<Notifications.Subscription | null>(null);
    const responseListener = useRef<Notifications.Subscription | null>(null);

    // Handle incoming push notifications for live tracking updates
    useEffect(() => {
        // Listen for incoming notifications (while app is foregrounded)
        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            const data = notification.request.content.data as OfframpNotificationData;

            // Check if this is an offramp status update
            if (data?.type === 'offramp_status' && data?.orderId) {
                console.log('[useLiveTracking] Received offramp status notification:', data);

                // Update live tracking
                handleStatusUpdate({
                    orderId: String(data.orderId),
                    fiatAmount: Number(data.fiatAmount) || 0,
                    fiatCurrency: String(data.fiatCurrency || 'NGN'),
                    bankName: String(data.bankName || 'Bank'),
                    accountNumber: '',
                    status: String(data.status || 'PENDING'),
                });
            }
        });

        // Listen for notification responses (when user taps)
        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data as OfframpNotificationData;

            if (data?.type === 'offramp_status' && data?.orderId) {
                console.log('[useLiveTracking] User tapped offramp notification:', data.orderId);
                // Navigation will be handled by deep linking
            }
        });

        // Cleanup old tracking data on mount
        cleanupOldTracking();

        // Cleanup on app state changes
        const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (nextState === 'active') {
                cleanupOldTracking();
            }
        });

        return () => {
            if (notificationListener.current) {
                notificationListener.current.remove();
            }
            if (responseListener.current) {
                responseListener.current.remove();
            }
            subscription.remove();
        };
    }, []);

    /**
     * Handle status update from notification or API
     */
    const handleStatusUpdate = useCallback(async (details: WithdrawalDetails) => {
        const { status } = details;

        if (status === 'PENDING') {
            // First webhook - start tracking
            await startLiveTracking(details);
        } else {
            // Subsequent updates
            await updateLiveTracking(details);
        }
    }, []);

    /**
     * Manually start tracking for a withdrawal
     */
    const startTracking = useCallback(async (details: WithdrawalDetails) => {
        await startLiveTracking(details);
    }, []);

    /**
     * Manually update tracking
     */
    const updateTracking = useCallback(async (details: WithdrawalDetails) => {
        await updateLiveTracking(details);
    }, []);

    /**
     * Manually stop tracking
     */
    const stopTracking = useCallback(async (orderId: string) => {
        await stopLiveTracking(orderId);
    }, []);

    return {
        startTracking,
        updateTracking,
        stopTracking,
        handleStatusUpdate,
    };
}

/**
 * Request notification permissions (required for Android Live Updates)
 */
export async function requestNotificationPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('[useLiveTracking] Notification permission denied');
            return false;
        }

        console.log('[useLiveTracking] Notification permission granted');
        return true;
    }

    // iOS handles Live Activity permissions automatically
    return true;
}
