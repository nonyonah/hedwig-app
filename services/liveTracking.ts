/**
 * Live Tracking Service
 * 
 * Cross-platform service for iOS Live Activities and Android Live Updates
 * Used to show real-time withdrawal progress on lock screen
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// TEMPORARY: Set to false to disable Live Activities/Updates
// for TestFlight builds. Set back to true when ready to enable.
// ============================================================
const LIVE_ACTIVITIES_ENABLED = false;

// Platform-specific imports (lazy loaded)
let LiveActivity: any = null;
let LiveUpdates: any = null;

// Storage key for tracking active IDs
const ACTIVE_TRACKING_KEY = 'hedwig_active_tracking';

// Status to progress mapping
const STATUS_PROGRESS: Record<string, number> = {
    'PENDING': 0.25,
    'PROCESSING': 0.60,
    'COMPLETED': 1.0,
    'FAILED': 1.0,
};

// Status to icon mapping (for iOS)
const STATUS_ICONS: Record<string, string> = {
    'PENDING': 'pending',
    'PROCESSING': 'processing',
    'COMPLETED': 'complete',
    'FAILED': 'failed',
};

// Status labels
const STATUS_LABELS: Record<string, { title: string; subtitle: string }> = {
    'PENDING': { title: 'Withdrawal Started', subtitle: 'Processing your request...' },
    'PROCESSING': { title: 'Sending to Bank', subtitle: 'Almost there!' },
    'COMPLETED': { title: 'Withdrawal Complete!', subtitle: 'Funds sent to your bank' },
    'FAILED': { title: 'Withdrawal Failed', subtitle: 'Please try again' },
};

interface TrackingData {
    orderId: string;
    activityId?: string; // iOS
    notificationId?: number; // Android
    startedAt: number;
}

interface WithdrawalDetails {
    orderId: string;
    fiatAmount: number;
    fiatCurrency: string;
    bankName: string;
    accountNumber: string;
    status: string;
}

/**
 * Initialize platform-specific modules
 */
async function initModules(): Promise<void> {
    if (Platform.OS === 'ios' && !LiveActivity) {
        try {
            LiveActivity = await import('expo-live-activity');
        } catch (e) {
            console.log('[LiveTracking] expo-live-activity not available');
        }
    }
}

/**
 * Get stored tracking data
 */
async function getStoredTracking(): Promise<Record<string, TrackingData>> {
    try {
        const stored = await AsyncStorage.getItem(ACTIVE_TRACKING_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

/**
 * Store tracking data
 */
async function storeTracking(data: Record<string, TrackingData>): Promise<void> {
    try {
        await AsyncStorage.setItem(ACTIVE_TRACKING_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('[LiveTracking] Failed to store tracking data:', e);
    }
}

/**
 * Format currency amount
 */
function formatAmount(amount: number, currency: string): string {
    const symbols: Record<string, string> = { 'NGN': '₦', 'GHS': '₵', 'KES': 'KSh' };
    const symbol = symbols[currency] || currency;
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

/**
 * Start live tracking for a withdrawal
 * Called on first webhook (order.initiated or order.pending)
 */
export async function startLiveTracking(details: WithdrawalDetails): Promise<void> {
    // Skip if live activities are disabled
    if (!LIVE_ACTIVITIES_ENABLED) {
        console.log('[LiveTracking] Live activities disabled, skipping start');
        return;
    }

    await initModules();

    const { orderId, fiatAmount, fiatCurrency, bankName, status } = details;
    const statusInfo = STATUS_LABELS[status] || STATUS_LABELS.PENDING;
    const progress = STATUS_PROGRESS[status] || 0.25;

    console.log('[LiveTracking] Starting tracking for order:', orderId);

    // Check if live tracking is enabled in settings
    try {
        const settingsLiveTracking = await AsyncStorage.getItem('settings_live_tracking');
        if (settingsLiveTracking === 'false') {
            console.log('[LiveTracking] Live tracking disabled in settings, skipping.');
            return;
        }
    } catch (e) {
        console.warn('[LiveTracking] Failed to check settings, proceeding with default (enabled)');
    }

    const stored = await getStoredTracking();

    // Check if already tracking this order
    if (stored[orderId]) {
        console.log('[LiveTracking] Already tracking order:', orderId);
        return updateLiveTracking(details);
    }

    const trackingData: TrackingData = {
        orderId,
        startedAt: Date.now(),
    };

    if (Platform.OS === 'ios' && LiveActivity) {
        try {
            const activityId = LiveActivity.startActivity(
                {
                    title: statusInfo.title,
                    subtitle: `${formatAmount(fiatAmount, fiatCurrency)} to ${bankName}`,
                    progressBar: { progress },
                    imageName: STATUS_ICONS[status] || 'pending',
                },
                {
                    deepLinkUrl: `/offramp-tracking/${orderId}`,
                }
            );

            if (activityId) {
                trackingData.activityId = activityId;
                console.log('[LiveTracking] iOS Live Activity started:', activityId);
            }
        } catch (e) {
            console.error('[LiveTracking] Failed to start iOS Live Activity:', e);
        }
    } else if (Platform.OS === 'android' && LiveUpdates) {
        try {
            const notificationId = LiveUpdates.startLiveUpdate({
                title: statusInfo.title,
                text: `${formatAmount(fiatAmount, fiatCurrency)} to ${bankName}`,
                subText: statusInfo.subtitle,
                progress: {
                    current: Math.round(progress * 100),
                    max: 100,
                    indeterminate: status === 'PROCESSING',
                },
                shortCriticalText: `${Math.round(progress * 100)}%`,
            });

            if (notificationId) {
                trackingData.notificationId = notificationId;
                console.log('[LiveTracking] Android Live Update started:', notificationId);
            }
        } catch (e) {
            console.error('[LiveTracking] Failed to start Android Live Update:', e);
        }
    }

    // Store tracking data
    stored[orderId] = trackingData;
    await storeTracking(stored);
}

/**
 * Update live tracking for a withdrawal
 */
export async function updateLiveTracking(details: WithdrawalDetails): Promise<void> {
    // Skip if live activities are disabled
    if (!LIVE_ACTIVITIES_ENABLED) {
        return;
    }

    await initModules();

    const { orderId, fiatAmount, fiatCurrency, bankName, status } = details;
    const statusInfo = STATUS_LABELS[status] || STATUS_LABELS.PENDING;
    const progress = STATUS_PROGRESS[status] || 0.5;

    console.log('[LiveTracking] Updating tracking for order:', orderId, 'Status:', status);

    const stored = await getStoredTracking();
    const trackingData = stored[orderId];

    if (!trackingData) {
        console.log('[LiveTracking] No active tracking for order, starting new:', orderId);
        return startLiveTracking(details);
    }

    const isCompleted = status === 'COMPLETED' || status === 'FAILED';

    if (Platform.OS === 'ios' && LiveActivity && trackingData.activityId) {
        try {
            const state = {
                title: statusInfo.title,
                subtitle: `${formatAmount(fiatAmount, fiatCurrency)} to ${bankName}`,
                progressBar: { progress },
                imageName: STATUS_ICONS[status] || 'pending',
            };

            if (isCompleted) {
                // Keep activity visible until user taps (don't auto-dismiss)
                LiveActivity.updateActivity(trackingData.activityId, state);
                console.log('[LiveTracking] iOS Live Activity completed (persisting):', trackingData.activityId);
            } else {
                LiveActivity.updateActivity(trackingData.activityId, state);
                console.log('[LiveTracking] iOS Live Activity updated:', trackingData.activityId);
            }
        } catch (e) {
            console.error('[LiveTracking] Failed to update iOS Live Activity:', e);
        }
    } else if (Platform.OS === 'android' && LiveUpdates && trackingData.notificationId) {
        try {
            const state = {
                title: statusInfo.title,
                text: `${formatAmount(fiatAmount, fiatCurrency)} to ${bankName}`,
                subText: statusInfo.subtitle,
                progress: {
                    current: Math.round(progress * 100),
                    max: 100,
                    indeterminate: status === 'PROCESSING',
                },
                shortCriticalText: isCompleted ? (status === 'COMPLETED' ? '✓' : '✗') : `${Math.round(progress * 100)}%`,
            };

            LiveUpdates.updateLiveUpdate(trackingData.notificationId, state);
            console.log('[LiveTracking] Android Live Update updated:', trackingData.notificationId);
        } catch (e) {
            console.error('[LiveTracking] Failed to update Android Live Update:', e);
        }
    }

    // If completed/failed, keep in storage but mark as done
    if (isCompleted) {
        // Keep for reference but could clean up later
        stored[orderId] = { ...trackingData, startedAt: Date.now() };
        await storeTracking(stored);
    }
}

/**
 * Stop live tracking for a withdrawal
 * Called when user dismisses or we want to force stop
 */
export async function stopLiveTracking(orderId: string): Promise<void> {
    // Skip if live activities are disabled
    if (!LIVE_ACTIVITIES_ENABLED) {
        return;
    }

    await initModules();

    console.log('[LiveTracking] Stopping tracking for order:', orderId);

    const stored = await getStoredTracking();
    const trackingData = stored[orderId];

    if (!trackingData) {
        console.log('[LiveTracking] No active tracking for order:', orderId);
        return;
    }

    if (Platform.OS === 'ios' && LiveActivity && trackingData.activityId) {
        try {
            LiveActivity.stopActivity(trackingData.activityId, {
                title: 'Withdrawal Complete',
                subtitle: 'Tap for details',
                progressBar: { progress: 1.0 },
                imageName: 'complete',
            });
            console.log('[LiveTracking] iOS Live Activity stopped:', trackingData.activityId);
        } catch (e) {
            console.error('[LiveTracking] Failed to stop iOS Live Activity:', e);
        }
    } else if (Platform.OS === 'android' && LiveUpdates && trackingData.notificationId) {
        try {
            LiveUpdates.stopLiveUpdate(trackingData.notificationId);
            console.log('[LiveTracking] Android Live Update stopped:', trackingData.notificationId);
        } catch (e) {
            console.error('[LiveTracking] Failed to stop Android Live Update:', e);
        }
    }

    // Remove from storage
    delete stored[orderId];
    await storeTracking(stored);
}

/**
 * Check if we're currently tracking an order
 */
export async function isTrackingOrder(orderId: string): Promise<boolean> {
    const stored = await getStoredTracking();
    return !!stored[orderId];
}

/**
 * Get all active tracking orders
 */
export async function getActiveTrackingOrders(): Promise<string[]> {
    const stored = await getStoredTracking();
    return Object.keys(stored);
}

/**
 * Clean up old tracking data (older than 24 hours)
 */
export async function cleanupOldTracking(): Promise<void> {
    const stored = await getStoredTracking();
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    let cleaned = false;
    for (const orderId of Object.keys(stored)) {
        if (now - stored[orderId].startedAt > maxAge) {
            delete stored[orderId];
            cleaned = true;
        }
    }

    if (cleaned) {
        await storeTracking(stored);
        console.log('[LiveTracking] Cleaned up old tracking data');
    }
}
