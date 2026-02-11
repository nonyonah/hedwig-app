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
const SESSION_ID_KEY = '@posthog_session_id';
const SESSION_TIMESTAMP_KEY = '@posthog_session_timestamp';

// Session timeout (30 minutes of inactivity)
const SESSION_TIMEOUT = 30 * 60 * 1000;

// State
let distinctId: string | null = null;
let anonymousId: string | null = null;
let sessionId: string | null = null;
let lastActivityTime: number = Date.now();
let isInitialized = false;
let eventQueue: any[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// Common properties added to all events
const getCommonProperties = () => ({
    $os: Platform.OS,
    $os_version: Platform.Version,
    $app_version: Application.nativeApplicationVersion || '1.0.0',
    $app_build: Application.nativeBuildVersion || '1',
    $device_model: Device.modelName || undefined,
    $device_manufacturer: Device.brand || undefined,
    $session_id: sessionId,
    $lib: 'hedwig-analytics',
    $lib_version: '1.0.0',
});

/**
 * Get or create session ID
 */
async function getOrCreateSessionId(): Promise<string> {
    const now = Date.now();
    
    // Check if we need a new session (timeout or no session)
    if (!sessionId || (now - lastActivityTime) > SESSION_TIMEOUT) {
        sessionId = uuid.v4() as string;
        try {
            await AsyncStorage.setItem(SESSION_ID_KEY, sessionId);
            await AsyncStorage.setItem(SESSION_TIMESTAMP_KEY, now.toString());
        } catch (e) {
            console.log('[Analytics] Error storing session ID:', e);
        }
        
        // Track session start
        console.log('[Analytics] New session started:', sessionId.substring(0, 8) + '...');
    }
    
    lastActivityTime = now;
    return sessionId;
}

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
    }, 30000) as any; // Flush every 30 seconds
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

    // Ensure we have a session
    await getOrCreateSessionId();
    
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
    // Track both $screen and $pageview for better PostHog compatibility
    // $pageview is what PostHog uses for web analytics and some dashboard metrics
    await trackEvent('$pageview', { 
        $current_url: `app://hedwig/${screenName.toLowerCase().replace(/\s+/g, '-')}`,
        $screen_name: screenName,
        $pathname: `/${screenName.toLowerCase().replace(/\s+/g, '-')}`,
        ...properties 
    });
    
    // Also track $screen for mobile-specific analytics
    await trackEvent('$screen', { 
        $screen_name: screenName, 
        ...properties 
    });
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
    sessionId = null;
    eventQueue = [];
    try {
        await AsyncStorage.removeItem(DISTINCT_ID_KEY);
        await AsyncStorage.removeItem(SESSION_ID_KEY);
        await AsyncStorage.removeItem(SESSION_TIMESTAMP_KEY);
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

// Pre-defined Event Helpers with comprehensive tracking properties
const Analytics = {
    // ==================== APP & USER LIFECYCLE ====================
    // Fired on every app launch
    appOpened: () => trackEvent('app_opened', {
        timestamp: new Date().toISOString(),
    }),
    appBackgrounded: () => trackEvent('app_backgrounded'),
    appForegrounded: () => trackEvent('app_foregrounded'),

    // Fired when user completes signup
    signupCompleted: (userId: string, method: 'privy' | 'wallet' | 'email' = 'privy') => 
        trackEvent('signup_completed', {
            user_id: userId,
            signup_method: method,
            timestamp: new Date().toISOString(),
        }),

    // Fired when user completes onboarding (profile, goal setup)
    onboardingCompleted: (userId: string, hasGoal: boolean = false, hasProfile: boolean = false) =>
        trackEvent('onboarding_completed', {
            user_id: userId,
            has_goal: hasGoal,
            has_profile: hasProfile,
            timestamp: new Date().toISOString(),
        }),

    userReturned: () => trackEvent('user_returned'),
    userLoggedOut: () => trackEvent('user_logged_out'),

    // ==================== CLIENT & PROJECT EVENTS ====================
    clientCreated: (userId: string, clientId: string) => 
        trackEvent('client_created', {
            user_id: userId,
            client_id: clientId,
            timestamp: new Date().toISOString(),
        }),

    projectCreated: (userId: string, projectId: string, clientId?: string) => 
        trackEvent('project_created', {
            user_id: userId,
            project_id: projectId,
            client_id: clientId,
            timestamp: new Date().toISOString(),
        }),

    milestoneCreated: (projectId: string) => 
        trackEvent('milestone_created', { project_id: projectId }),

    milestoneCompleted: (projectId: string, amount?: number, currency?: string) => 
        trackEvent('milestone_completed', { 
            project_id: projectId,
            amount,
            currency,
            timestamp: new Date().toISOString(),
        }),

    // ==================== INVOICE & PAYMENT EVENTS ====================
    invoiceCreated: (amount: number, currency: string, paymentType: 'crypto' | 'fiat') =>
        trackEvent('invoice_created', { invoice_amount: amount, currency, payment_type: paymentType }),

    // Fired when invoice is sent to client
    invoiceSent: (userId: string, amount: number, currency: string, invoiceId?: string, clientId?: string) => 
        trackEvent('invoice_sent', { 
            user_id: userId,
            invoice_amount: amount, 
            currency,
            invoice_id: invoiceId,
            client_id: clientId,
            timestamp: new Date().toISOString(),
        }),

    invoiceViewed: (invoiceId: string) => trackEvent('invoice_viewed', { invoice_id: invoiceId }),

    invoicePaid: (amount: number, currency: string, paymentType: 'crypto' | 'fiat') =>
        trackEvent('invoice_paid', { invoice_amount: amount, currency, payment_type: paymentType }),

    invoiceDeleted: () => trackEvent('invoice_deleted'),
    invoiceCreationFailed: (errorType?: string) => trackEvent('invoice_creation_failed', { error_type: errorType }),

    // Fired when a payment is received (via webhook or transaction detection)
    paymentReceived: (userId: string, amount: number, currency: string, txHash?: string, invoiceId?: string, projectId?: string, clientId?: string) =>
        trackEvent('payment_received', {
            user_id: userId,
            amount,
            currency,
            tx_hash: txHash,
            invoice_id: invoiceId,
            project_id: projectId,
            client_id: clientId,
            timestamp: new Date().toISOString(),
        }),

    // ==================== PAYMENT LINK EVENTS ====================
    paymentLinkCreated: (amount: number, currency: string) => 
        trackEvent('payment_link_created', { amount, currency }),
    paymentLinkOpened: () => trackEvent('payment_link_opened'),
    paymentLinkPaid: (amount: number, currency: string) => 
        trackEvent('payment_link_paid', { amount, currency }),

    // ==================== PROPOSAL & CONTRACT EVENTS ====================
    proposalCreated: () => trackEvent('proposal_created'),
    proposalSent: () => trackEvent('proposal_sent'),
    proposalEdited: () => trackEvent('proposal_edited'),
    proposalDeleted: () => trackEvent('proposal_deleted'),

    contractGenerated: () => trackEvent('contract_generated'),
    contractSentForApproval: () => trackEvent('contract_sent_for_approval'),
    contractApproved: () => trackEvent('contract_approved'),
    contractRejected: () => trackEvent('contract_rejected'),
    contractGenerationFailed: (errorType?: string) => 
        trackEvent('contract_generation_failed', { error_type: errorType }),

    // ==================== ACCOUNT & BANKING EVENTS ====================
    // Fired when user creates a USD virtual account
    usdAccountCreated: (userId: string, provider: string = 'bridge') =>
        trackEvent('usd_account_created', {
            user_id: userId,
            provider,
            currency: 'USD',
            timestamp: new Date().toISOString(),
        }),

    // Fired when user creates an NGN virtual account
    ngnAccountCreated: (userId: string, provider: string = 'paycrest') =>
        trackEvent('ngn_account_created', {
            user_id: userId,
            provider,
            currency: 'NGN',
            timestamp: new Date().toISOString(),
        }),

    // Fired when user converts fiat to stablecoin (deposit -> USDC)
    fiatToStablecoinConverted: (userId: string, fiatAmount: number, fiatCurrency: string, stablecoinAmount: number, stablecoin: string = 'USDC') =>
        trackEvent('fiat_to_stablecoin_converted', {
            user_id: userId,
            fiat_amount: fiatAmount,
            fiat_currency: fiatCurrency,
            stablecoin_amount: stablecoinAmount,
            stablecoin,
            timestamp: new Date().toISOString(),
        }),

    // ==================== WITHDRAWAL & OFFRAMP EVENTS ====================
    offrampInitiated: (userId: string, amount: number, currency: string, fiatCurrency?: string) =>
        trackEvent('offramp_initiated', { 
            user_id: userId,
            amount, 
            currency,
            fiat_currency: fiatCurrency,
            timestamp: new Date().toISOString(),
        }),

    // Fired when withdrawal completes successfully
    withdrawalCompleted: (userId: string, amount: number, currency: string, fiatAmount?: number, fiatCurrency?: string, txHash?: string) =>
        trackEvent('withdrawal_completed', {
            user_id: userId,
            amount,
            currency,
            fiat_amount: fiatAmount,
            fiat_currency: fiatCurrency,
            tx_hash: txHash,
            timestamp: new Date().toISOString(),
        }),

    offrampCompleted: (amount: number, currency: string) =>
        trackEvent('offramp_completed', { amount, currency }),

    offrampFailed: (errorType?: string) =>
        trackEvent('offramp_failed', { error_type: errorType }),

    // Fired when platform collects a fee
    platformFeeCollected: (userId: string, feeAmount: number, feeCurrency: string, transactionAmount: number, transactionType: 'invoice' | 'payment_link' | 'offramp' | 'bridge') =>
        trackEvent('platform_fee_collected', {
            user_id: userId,
            fee_amount: feeAmount,
            fee_currency: feeCurrency,
            transaction_amount: transactionAmount,
            transaction_type: transactionType,
            timestamp: new Date().toISOString(),
        }),

    // ==================== TRANSACTION EVENTS ====================
    transactionInitiated: (network: string, amount: number, token: string) =>
        trackEvent('transaction_initiated', { network, amount, token }),

    transactionConfirmed: (network: string, amount: number, token: string) =>
        trackEvent('transaction_confirmed', { network, amount, token }),

    transactionFailed: (network: string, errorType?: string) =>
        trackEvent('transaction_failed', { network, error_type: errorType }),

    // ==================== AI INTERACTION EVENTS ====================
    aiMessageSent: () => trackEvent('ai_message_sent'),
    aiFunctionTriggered: (fn: string) => trackEvent('ai_function_triggered', { function_name: fn }),
    aiResponseSuccess: () => trackEvent('ai_response_success'),
    aiResponseFailed: (error?: string) => trackEvent('ai_response_failed', { error_type: error }),

    // Fired when user accepts an AI-suggested action (e.g., create invoice, send payment link)
    aiActionAccepted: (userId: string, actionType: string, actionDetails?: Record<string, any>) =>
        trackEvent('ai_action_accepted', {
            user_id: userId,
            action_type: actionType,
            ...actionDetails,
            timestamp: new Date().toISOString(),
        }),

    // Fired when user rejects/dismisses an AI-suggested action
    aiActionRejected: (userId: string, actionType: string, reason?: string) =>
        trackEvent('ai_action_rejected', {
            user_id: userId,
            action_type: actionType,
            rejection_reason: reason,
            timestamp: new Date().toISOString(),
        }),

    aiFunctionError: (functionName: string, errorType?: string) =>
        trackEvent('ai_function_error', { function_name: functionName, error_type: errorType }),

    // ==================== ERROR & FEATURE EVENTS ====================
    paymentFailed: (featureName: string, errorType?: string) =>
        trackEvent('payment_failed', { feature_name: featureName, error_type: errorType }),

    featureUsed: (featureName: string) => trackEvent('feature_used', { feature_name: featureName }),

    settingsChanged: (setting: string, value: any) =>
        trackEvent('settings_changed', { setting_name: setting, new_value: value }),

    // ==================== KYC EVENTS ====================
    kycStarted: () => trackEvent('kyc_started', { timestamp: new Date().toISOString() }),
    
    kycCompleted: () => trackEvent('kyc_completed', { timestamp: new Date().toISOString() }),
    
    kycApproved: () => trackEvent('kyc_approved', { timestamp: new Date().toISOString() }),
    
    kycRejected: (reason?: string) => trackEvent('kyc_rejected', { 
        reason,
        timestamp: new Date().toISOString() 
    }),

    offrampBlockedKyc: () => trackEvent('offramp_blocked_kyc', { 
        timestamp: new Date().toISOString() 
    }),
};

export default Analytics;

