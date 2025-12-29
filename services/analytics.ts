/**
 * PostHog Analytics Service
 * 
 * Centralized analytics tracking with safety guarantees:
 * - Non-blocking event capture
 * - No PII logging
 * - Feature flag to disable
 * - Batched events
 */

import PostHog from 'posthog-react-native';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';

// PostHog configuration
const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

// Singleton instance - initialized lazily
let posthogClient: PostHog | null = null;
let isEnabled = true;

// Common properties attached to all events
const commonProperties = {
    platform: Platform.OS as 'ios' | 'android' | 'web',
    app_version: Application.nativeApplicationVersion || '1.0.0',
    device_model: Device.modelName || undefined,
};

/**
 * Get or create PostHog client
 */
function getClient(): PostHog | null {
    if (!isEnabled || !POSTHOG_API_KEY) {
        return null;
    }

    if (!posthogClient) {
        try {
            posthogClient = new PostHog(POSTHOG_API_KEY, {
                host: POSTHOG_HOST,
            });
            console.log('[Analytics] PostHog client initialized');
        } catch (error) {
            console.error('[Analytics] Failed to initialize PostHog:', error);
            return null;
        }
    }

    return posthogClient;
}

/**
 * Initialize PostHog and identify user
 * Should be called once per app launch after user identity is available
 */
export async function initializeAnalytics(userId?: string): Promise<void> {
    const client = getClient();
    if (!client) {
        if (!POSTHOG_API_KEY) {
            console.log('[Analytics] PostHog API key not configured');
        }
        return;
    }

    // Identify user if provided (use backend user ID, not email)
    if (userId) {
        identifyUser(userId);
    }

    console.log('[Analytics] PostHog initialized successfully');
}

/**
 * Identify user without PII
 */
export function identifyUser(userId: string, properties?: Record<string, any>): void {
    const client = getClient();
    if (!client) return;

    try {
        const safeProperties = properties ? sanitizeProperties(properties) : undefined;
        client.identify(userId, safeProperties);
    } catch (error) {
        console.error('[Analytics] Failed to identify user:', error);
    }
}

/**
 * Capture an analytics event
 * Safe, non-blocking, and batched
 */
export function trackEvent(
    eventName: string,
    properties?: Record<string, any>
): void {
    const client = getClient();
    if (!client) return;

    try {
        const safeProperties = {
            ...commonProperties,
            ...sanitizeProperties(properties || {}),
        };

        client.capture(eventName, safeProperties);
    } catch (error) {
        console.error('[Analytics] Failed to track event:', error);
    }
}

/**
 * Remove PII from properties
 */
function sanitizeProperties(properties: Record<string, any>): Record<string, any> {
    const piiFields = [
        'email', 'phone', 'bank_account', 'account_number', 'wallet_secret',
        'private_key', 'password', 'secret', 'token', 'apiKey', 'api_key'
    ];

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(properties)) {
        const lowerKey = key.toLowerCase();
        const isPII = piiFields.some(field => lowerKey.includes(field));

        if (!isPII && value !== undefined && value !== null) {
            sanitized[key] = value;
        }
    }

    return sanitized;
}

/**
 * Set analytics enabled/disabled
 */
export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
    isEnabled = enabled;
    const client = getClient();

    if (!enabled && client) {
        client.optOut();
    } else if (enabled && client) {
        client.optIn();
    }
}

/**
 * Flush pending events
 */
export function flushEvents(): void {
    const client = getClient();
    if (!client) return;

    try {
        client.flush();
    } catch (error) {
        console.error('[Analytics] Failed to flush events:', error);
    }
}

/**
 * Reset analytics (call on logout)
 */
export function resetAnalytics(): void {
    const client = getClient();
    if (!client) return;

    try {
        client.reset();
    } catch (error) {
        console.error('[Analytics] Failed to reset:', error);
    }
}

/**
 * Get PostHog client for advanced usage (feature flags, etc.)
 */
export function getPostHogClient(): PostHog | null {
    return getClient();
}

// ============================================
// Pre-defined Event Helpers
// ============================================

const Analytics = {
    // Lifecycle
    appOpened: () => trackEvent('app_opened'),
    userOnboarded: () => trackEvent('user_onboarded'),
    userReturned: () => trackEvent('user_returned'),

    // AI Interaction
    aiMessageSent: () => trackEvent('ai_message_sent'),
    aiFunctionTriggered: (functionName: string) =>
        trackEvent('ai_function_triggered', { function_name: functionName }),
    aiResponseSuccess: () => trackEvent('ai_response_success'),
    aiResponseFailed: (error?: string) =>
        trackEvent('ai_response_failed', { error_type: error }),

    // Invoices
    invoiceCreated: (amount: number, currency: string, paymentType: 'crypto' | 'fiat') =>
        trackEvent('invoice_created', { invoice_amount: amount, currency, payment_type: paymentType }),
    invoiceSent: (amount: number, currency: string) =>
        trackEvent('invoice_sent', { invoice_amount: amount, currency }),
    invoicePaid: (amount: number, currency: string, paymentType: 'crypto' | 'fiat') =>
        trackEvent('invoice_paid', { invoice_amount: amount, currency, payment_type: paymentType }),
    invoiceDeleted: () => trackEvent('invoice_deleted'),

    // Payment Links
    paymentLinkCreated: (amount: number, currency: string) =>
        trackEvent('payment_link_created', { amount, currency }),
    paymentLinkOpened: () => trackEvent('payment_link_opened'),
    paymentLinkPaid: (amount: number, currency: string) =>
        trackEvent('payment_link_paid', { amount, currency }),

    // Proposals
    proposalCreated: () => trackEvent('proposal_created'),
    proposalSent: () => trackEvent('proposal_sent'),
    proposalEdited: () => trackEvent('proposal_edited'),
    proposalDeleted: () => trackEvent('proposal_deleted'),

    // Contracts
    contractGenerated: () => trackEvent('contract_generated'),
    contractSentForApproval: () => trackEvent('contract_sent_for_approval'),
    contractApproved: () => trackEvent('contract_approved'),
    contractRejected: () => trackEvent('contract_rejected'),

    // Clients & Projects
    clientCreated: () => trackEvent('client_created'),
    projectCreated: () => trackEvent('project_created'),
    milestoneCreated: () => trackEvent('milestone_created'),
    milestoneCompleted: (amount?: number) =>
        trackEvent('milestone_completed', amount ? { amount } : undefined),

    // Errors
    paymentFailed: (featureName: string, errorType?: string) =>
        trackEvent('payment_failed', { feature_name: featureName, error_type: errorType }),
    invoiceCreationFailed: (errorType?: string) =>
        trackEvent('invoice_creation_failed', { error_type: errorType }),
    contractGenerationFailed: (errorType?: string) =>
        trackEvent('contract_generation_failed', { error_type: errorType }),
    aiFunctionError: (functionName: string, errorType?: string) =>
        trackEvent('ai_function_error', { function_name: functionName, error_type: errorType }),
};

export default Analytics;
