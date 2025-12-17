import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export interface PushNotificationState {
    expoPushToken: string | null;
    notification: Notifications.Notification | null;
    error: string | null;
    isRegistered: boolean;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const PUSH_TOKEN_STORAGE_KEY = '@hedwig/push_token';

/**
 * Hook to manage push notifications
 */
export function usePushNotifications() {
    const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
    const [notification, setNotification] = useState<Notifications.Notification | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isRegistered, setIsRegistered] = useState(false);

    const notificationListener = useRef<Notifications.Subscription | null>(null);
    const responseListener = useRef<Notifications.Subscription | null>(null);

    /**
     * Register for push notifications
     */
    async function registerForPushNotifications(): Promise<string | null> {
        // Check if we're on a physical device
        if (!Device.isDevice) {
            setError('Push notifications require a physical device');
            return null;
        }

        try {
            // Check existing permissions
            const { status: existingStatus } = await Notifications.getPermissionsAsync();
            let finalStatus = existingStatus;

            // Request permissions if not granted
            if (existingStatus !== 'granted') {
                const { status } = await Notifications.requestPermissionsAsync();
                finalStatus = status;
            }

            if (finalStatus !== 'granted') {
                setError('Permission not granted for push notifications');
                return null;
            }

            // Get project ID for Expo push token
            // Try multiple sources for project ID
            const projectId =
                Constants.expoConfig?.extra?.eas?.projectId ||
                (Constants as any).easConfig?.projectId ||
                Constants.expoConfig?.owner; // Fallback

            if (!projectId) {
                setError('Project ID not found - configure in app.json');
                return null;
            }

            // Get the Expo push token
            const tokenData = await Notifications.getExpoPushTokenAsync({
                projectId: projectId as string,
            });

            const token = tokenData.data;
            setExpoPushToken(token);

            // Store token locally
            await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);

            // Configure Android notification channel
            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('default', {
                    name: 'Default',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#FF6B35',
                });
            }

            return token;
        } catch (err: any) {
            console.error('[Push] Error registering:', err);
            setError(err.message);
            return null;
        }
    }

    /**
     * Register device token with backend
     */
    async function registerWithBackend(authToken: string): Promise<boolean> {
        if (!expoPushToken) {
            console.log('[Push] No push token available');
            return false;
        }

        try {
            const response = await fetch(`${API_URL}/api/notifications/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                    expoPushToken,
                    platform: Platform.OS,
                }),
            });

            const data = await response.json();

            if (data.success) {
                setIsRegistered(true);
                console.log('[Push] Registered with backend');
                return true;
            } else {
                console.error('[Push] Backend registration failed:', data.error);
                return false;
            }
        } catch (err: any) {
            console.error('[Push] Error registering with backend:', err);
            return false;
        }
    }

    /**
     * Unregister device token from backend
     */
    async function unregisterFromBackend(authToken: string): Promise<boolean> {
        if (!expoPushToken) return true;

        try {
            const response = await fetch(`${API_URL}/api/notifications/unregister`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({ expoPushToken }),
            });

            const data = await response.json();

            if (data.success) {
                setIsRegistered(false);
                await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
            }

            return data.success;
        } catch (err: any) {
            console.error('[Push] Error unregistering from backend:', err);
            return false;
        }
    }

    // Set up notification listeners
    useEffect(() => {
        // Load stored token
        AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY).then(token => {
            if (token) setExpoPushToken(token);
        });

        // Register for push notifications
        registerForPushNotifications();

        // Listen for incoming notifications (foreground)
        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            console.log('[Push] Notification received:', notification);
            setNotification(notification);
        });

        // Listen for notification interactions (tap)
        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            console.log('[Push] Notification tapped:', response);
            const data = response.notification.request.content.data;

            // Handle navigation based on notification type
            if (data?.type === 'transaction' && data?.txHash) {
                // Navigate to transaction details
                console.log('[Push] Navigate to transaction:', data.txHash);
            }
        });

        return () => {
            if (notificationListener.current) {
                notificationListener.current.remove();
            }
            if (responseListener.current) {
                responseListener.current.remove();
            }
        };
    }, []);

    return {
        expoPushToken,
        notification,
        error,
        isRegistered,
        registerForPushNotifications,
        registerWithBackend,
        unregisterFromBackend,
    };
}

export default usePushNotifications;
