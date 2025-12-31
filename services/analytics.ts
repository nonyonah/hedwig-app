/**
 * PostHog Analytics Service
 * 
 * Provides analytics tracking using PostHog HTTP API directly.
 * This avoids the ESM/CJS interop issues with posthog-react-native package.
 */

import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

// PostHog configuration - Expo requires EXPO_PUBLIC_ prefix for client-side env vars
const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

// Storage keys
const DISTINCT_ID_KEY = '@posthog_distinct_id';
const ANONYMOUS_ID_KEY = '@posthog_anonymous_id';

// State
let distinctId: string | null = null;
let anonymousId: string | null = null;
let isInitialized = false;
let eventQueue: any[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// Common properties added to all events
const getCommonProperties = () => ({
    $os: Platform.OS,
    $os_version: Platform.Version,
    $app_version: Application.nativeApplicationVersion || '1.0.0',
    $device_model: Device.modelName || undefined,
    $device_manufacturer: Device.brand || undefined,
    $lib: 'hedwig-analytics',
    $lib_version: '1.0.0',
});

/**
 * Get or create anonymous ID
 */
async function getOrCreateAnonymousId(): Promise<string> {
    if (anonymousId) return anonymousId;

    try {
        const stored = await AsyncStorage.getItem(ANONYMOUS_ID_KEY);
        if (stored) {
            anonymousId = stored;
            return stored;
        }
    } catch (e) {
        console.log('[Analytics] Error reading anonymous ID:', e);
    }

    // Generate new anonymous ID
    anonymousId = uuid.v4() as string;
    try {
        await AsyncStorage.setItem(ANONYMOUS_ID_KEY, anonymousId);
    } catch (e) {
        console.log('[Analytics] Error storing anonymous ID:', e);
    }

    return anonymousId;
}

/**
 * Get distinct ID (user ID or anonymous ID)
 */
async function getDistinctId(): Promise<string> {
    if (distinctId) return distinctId;
    return getOrCreateAnonymousId();
}

/**
 * Send events to PostHog API
 */
async function sendToPostHog(events: any[]): Promise<boolean> {
    if (!POSTHOG_API_KEY || events.length === 0) return false;

    try {
        const response = await fetch(`${POSTHOG_HOST}/batch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: POSTHOG_API_KEY,
                batch: events,
            }),
        });

        if (!response.ok) {
            console.log('[Analytics] PostHog API error:', response.status);
            return false;
        }

        return true;
    } catch (error) {
        console.log('[Analytics] Failed to send events:', error);
        return false;
    }
}

/**
 * Flush event queue to PostHog
 */
async function flushQueue(): Promise<void> {
    if (eventQueue.length === 0) return;

    console.log('[Analytics] Flushing', eventQueue.length, 'events to PostHog...');
    const eventsToSend = [...eventQueue];
    eventQueue = [];

    const success = await sendToPostHog(eventsToSend);
    if (success) {
        console.log('[Analytics] ✅ Successfully sent', eventsToSend.length, 'events');
    } else {
        console.log('[Analytics] ❌ Failed to send events, requeueing...');
        // Re-add events to queue on failure (will retry on next flush)
        eventQueue = [...eventsToSend, ...eventQueue].slice(0, 100); // Cap at 100 events
    }
}

/**
 * Schedule a flush
 */
function scheduleFlush(): void {
    if (flushTimer) return;

    flushTimer = setTimeout(() => {
        flushTimer = null;
        flushQueue();
    }, 30000); // Flush every 30 seconds
}

/**
 * Initialize PostHog analytics
 */
export async function initializeAnalytics(userId?: string): Promise<void> {
    // Debug: Log all PostHog-related env vars
    console.log('[Analytics] Initializing PostHog...', {
        hasApiKey: !!POSTHOG_API_KEY,
        apiKeyPrefix: POSTHOG_API_KEY?.substring(0, 10) || 'none',
        host: POSTHOG_HOST,
        envCheck: {
            POSTHOG_API_KEY: !!process.env.POSTHOG_API_KEY,
            EXPO_PUBLIC_POSTHOG_API_KEY: !!process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
        }
    });

    if (isInitialized) {
        if (userId) {
            await identifyUser(userId);
        }
        return;
    }

    isInitialized = true;

    if (!POSTHOG_API_KEY) {
        console.log('[Analytics] ⚠️ No API key provided, running in stub mode');
        console.log('[Analytics] To enable PostHog:');
        console.log('[Analytics]   1. Set EXPO_PUBLIC_POSTHOG_API_KEY in your .env file');
        console.log('[Analytics]   2. For EAS builds, set it as an EAS secret: eas secret:create');
        return;
    }

    // Get or create anonymous ID
    await getOrCreateAnonymousId();
    console.log('[Analytics] Anonymous ID:', anonymousId?.substring(0, 8) + '...');

    if (userId) {
        await identifyUser(userId);
    }

    console.log('[Analytics] ✅ PostHog initialized successfully (HTTP mode)');
    console.log('[Analytics] Host:', POSTHOG_HOST);
}

/**
 * Get the PostHog client instance (returns null - using HTTP API directly)
 */
export function getPostHogClient(): null {
    return null;
}

/**
 * Identify user
 */
export async function identifyUser(userId: string, properties?: Record<string, any>): Promise<void> {
    if (!POSTHOG_API_KEY) {
        if (__DEV__) console.log('[Analytics] Identify (stub):', userId);
        return;
    }

    const previousDistinctId = await getDistinctId();
    distinctId = userId;

    try {
        await AsyncStorage.setItem(DISTINCT_ID_KEY, userId);
    } catch (e) {
        console.log('[Analytics] Error storing distinct ID:', e);
    }

    // Send identify event
    const event = {
        event: '$identify',
        distinct_id: userId,
        properties: {
            ...getCommonProperties(),
            $anon_distinct_id: previousDistinctId,
            ...properties,
        },
        timestamp: new Date().toISOString(),
    };

    eventQueue.push(event);
    scheduleFlush();
}

/**
 * Track an event with optional properties
 */
export async function trackEvent(eventName: string, properties?: Record<string, any>): Promise<void> {
    if (!POSTHOG_API_KEY) {
        if (__DEV__) console.log('[Analytics]', eventName, properties || '');
        return;
    }

    const id = await getDistinctId();

    const event = {
        event: eventName,
        distinct_id: id,
        properties: {
            ...getCommonProperties(),
            ...properties,
        },
        timestamp: new Date().toISOString(),
    };

    eventQueue.push(event);

    // Flush immediately if queue is getting large
    if (eventQueue.length >= 20) {
        flushQueue();
    } else {
        scheduleFlush();
    }
}

/**
 * Track a screen view
 */
export async function trackScreen(screenName: string, properties?: Record<string, any>): Promise<void> {
    await trackEvent('$screen', { $screen_name: screenName, ...properties });
}

/**
 * Set user properties
 */
export async function setUserProperties(properties: Record<string, any>): Promise<void> {
    const id = await getDistinctId();
    await identifyUser(id, properties);
}

/**
 * Enable or disable analytics
 */
export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
    // For HTTP mode, we just stop/start tracking
    if (!enabled) {
        eventQueue = [];
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
    }
}

/**
 * Flush all pending events
 */
export function flushEvents(): void {
    flushQueue();
}

/**
 * Reset analytics (e.g., on logout)
 */
export async function resetAnalytics(): Promise<void> {
    distinctId = null;
    eventQueue = [];
    try {
        await AsyncStorage.removeItem(DISTINCT_ID_KEY);
    } catch (e) {
        console.log('[Analytics] Error resetting:', e);
    }
}

/**
 * Shutdown analytics
 */
export async function shutdownAnalytics(): Promise<void> {
    await flushQueue();
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
}

// Pre-defined Event Helpers
const Analytics = {
    // App lifecycle
    appOpened: () => trackEvent('app_opened'),
    appBackgrounded: () => trackEvent('app_backgrounded'),
    appForegrounded: () => trackEvent('app_foregrounded'),

    // User lifecycle
    userOnboarded: () => trackEvent('user_onboarded'),
    userReturned: () => trackEvent('user_returned'),
    userLoggedOut: () => trackEvent('user_logged_out'),

    // AI interactions
    aiMessageSent: () => trackEvent('ai_message_sent'),
    aiFunctionTriggered: (fn: string) => trackEvent('ai_function_triggered', { function_name: fn }),
    aiResponseSuccess: () => trackEvent('ai_response_success'),
    aiResponseFailed: (error?: string) => trackEvent('ai_response_failed', { error_type: error }),

    // Invoice events
    invoiceCreated: (amount: number, currency: string, paymentType: 'crypto' | 'fiat') =>
        trackEvent('invoice_created', { invoice_amount: amount, currency, payment_type: paymentType }),
    invoiceSent: (amount: number, currency: string) => trackEvent('invoice_sent', { invoice_amount: amount, currency }),
    invoicePaid: (amount: number, currency: string, paymentType: 'crypto' | 'fiat') =>
        trackEvent('invoice_paid', { invoice_amount: amount, currency, payment_type: paymentType }),
    invoiceDeleted: () => trackEvent('invoice_deleted'),
    invoiceCreationFailed: (errorType?: string) => trackEvent('invoice_creation_failed', { error_type: errorType }),

    // Payment link events
    paymentLinkCreated: (amount: number, currency: string) => trackEvent('payment_link_created', { amount, currency }),
    paymentLinkOpened: () => trackEvent('payment_link_opened'),
    paymentLinkPaid: (amount: number, currency: string) => trackEvent('payment_link_paid', { amount, currency }),

    // Proposal events
    proposalCreated: () => trackEvent('proposal_created'),
    proposalSent: () => trackEvent('proposal_sent'),
    proposalEdited: () => trackEvent('proposal_edited'),
    proposalDeleted: () => trackEvent('proposal_deleted'),

    // Contract events
    contractGenerated: () => trackEvent('contract_generated'),
    contractSentForApproval: () => trackEvent('contract_sent_for_approval'),
    contractApproved: () => trackEvent('contract_approved'),
    contractRejected: () => trackEvent('contract_rejected'),
    contractGenerationFailed: (errorType?: string) => trackEvent('contract_generation_failed', { error_type: errorType }),

    // Client & project events
    clientCreated: () => trackEvent('client_created'),
    projectCreated: () => trackEvent('project_created'),
    milestoneCreated: () => trackEvent('milestone_created'),
    milestoneCompleted: (amount?: number) => trackEvent('milestone_completed', amount ? { amount } : undefined),

    // Transaction events
    transactionInitiated: (network: string, amount: number, token: string) =>
        trackEvent('transaction_initiated', { network, amount, token }),
    transactionConfirmed: (network: string, amount: number, token: string) =>
        trackEvent('transaction_confirmed', { network, amount, token }),
    transactionFailed: (network: string, errorType?: string) =>
        trackEvent('transaction_failed', { network, error_type: errorType }),

    // Offramp events
    offrampInitiated: (amount: number, currency: string) =>
        trackEvent('offramp_initiated', { amount, currency }),
    offrampCompleted: (amount: number, currency: string) =>
        trackEvent('offramp_completed', { amount, currency }),
    offrampFailed: (errorType?: string) =>
        trackEvent('offramp_failed', { error_type: errorType }),

    // Error events
    paymentFailed: (featureName: string, errorType?: string) =>
        trackEvent('payment_failed', { feature_name: featureName, error_type: errorType }),
    aiFunctionError: (functionName: string, errorType?: string) =>
        trackEvent('ai_function_error', { function_name: functionName, error_type: errorType }),

    // Feature usage
    featureUsed: (featureName: string) => trackEvent('feature_used', { feature_name: featureName }),
    settingsChanged: (setting: string, value: any) =>
        trackEvent('settings_changed', { setting_name: setting, new_value: value }),
};

export default Analytics;
