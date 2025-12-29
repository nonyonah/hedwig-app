/**
 * PostHog Analytics Service (Stub)
 * 
 * Note: The posthog-react-native package has ESM/CJS interop issues.
 * This is a stub that logs events to console in dev mode.
 * 
 * To enable full PostHog:
 * 1. Wait for posthog-react-native to fix the module export issue
 * 2. Or use a custom HTTP implementation to send events directly
 */

import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';

const IS_DEV = __DEV__;

// Common properties
const commonProperties = {
    platform: Platform.OS,
    app_version: Application.nativeApplicationVersion || '1.0.0',
    device_model: Device.modelName || undefined,
};

/**
 * Initialize analytics
 */
export async function initializeAnalytics(userId?: string): Promise<void> {
    if (IS_DEV) {
        console.log('[Analytics] Initialized (stub mode)', userId ? `for user: ${userId}` : '');
    }
}

/**
 * Identify user
 */
export function identifyUser(userId: string, properties?: Record<string, any>): void {
    if (IS_DEV) {
        console.log('[Analytics] Identify:', userId);
    }
}

/**
 * Track event
 */
export function trackEvent(eventName: string, properties?: Record<string, any>): void {
    if (IS_DEV) {
        console.log('[Analytics]', eventName, properties || '');
    }
}

export async function setAnalyticsEnabled(enabled: boolean): Promise<void> { }
export function flushEvents(): void { }
export function resetAnalytics(): void { }
export function getPostHogClient(): null { return null; }

// Pre-defined Event Helpers
const Analytics = {
    appOpened: () => trackEvent('app_opened'),
    userOnboarded: () => trackEvent('user_onboarded'),
    userReturned: () => trackEvent('user_returned'),
    aiMessageSent: () => trackEvent('ai_message_sent'),
    aiFunctionTriggered: (fn: string) => trackEvent('ai_function_triggered', { function_name: fn }),
    aiResponseSuccess: () => trackEvent('ai_response_success'),
    aiResponseFailed: (error?: string) => trackEvent('ai_response_failed', { error_type: error }),
    invoiceCreated: (amount: number, currency: string, paymentType: 'crypto' | 'fiat') =>
        trackEvent('invoice_created', { invoice_amount: amount, currency, payment_type: paymentType }),
    invoiceSent: (amount: number, currency: string) => trackEvent('invoice_sent', { invoice_amount: amount, currency }),
    invoicePaid: (amount: number, currency: string, paymentType: 'crypto' | 'fiat') =>
        trackEvent('invoice_paid', { invoice_amount: amount, currency, payment_type: paymentType }),
    invoiceDeleted: () => trackEvent('invoice_deleted'),
    paymentLinkCreated: (amount: number, currency: string) => trackEvent('payment_link_created', { amount, currency }),
    paymentLinkOpened: () => trackEvent('payment_link_opened'),
    paymentLinkPaid: (amount: number, currency: string) => trackEvent('payment_link_paid', { amount, currency }),
    proposalCreated: () => trackEvent('proposal_created'),
    proposalSent: () => trackEvent('proposal_sent'),
    proposalEdited: () => trackEvent('proposal_edited'),
    proposalDeleted: () => trackEvent('proposal_deleted'),
    contractGenerated: () => trackEvent('contract_generated'),
    contractSentForApproval: () => trackEvent('contract_sent_for_approval'),
    contractApproved: () => trackEvent('contract_approved'),
    contractRejected: () => trackEvent('contract_rejected'),
    clientCreated: () => trackEvent('client_created'),
    projectCreated: () => trackEvent('project_created'),
    milestoneCreated: () => trackEvent('milestone_created'),
    milestoneCompleted: (amount?: number) => trackEvent('milestone_completed', amount ? { amount } : undefined),
    paymentFailed: (featureName: string, errorType?: string) =>
        trackEvent('payment_failed', { feature_name: featureName, error_type: errorType }),
    invoiceCreationFailed: (errorType?: string) => trackEvent('invoice_creation_failed', { error_type: errorType }),
    contractGenerationFailed: (errorType?: string) => trackEvent('contract_generation_failed', { error_type: errorType }),
    aiFunctionError: (functionName: string, errorType?: string) =>
        trackEvent('ai_function_error', { function_name: functionName, error_type: errorType }),
};

export default Analytics;
