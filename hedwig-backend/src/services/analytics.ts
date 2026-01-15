/**
 * PostHog Backend Analytics Service
 * 
 * Server-side analytics for tracking events that happen via webhooks or backend processes.
 * Uses PostHog HTTP API for direct event submission.
 */

import axios from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger('Analytics');

// PostHog configuration
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';

interface PostHogEvent {
    event: string;
    distinct_id: string;
    properties?: Record<string, any>;
    timestamp?: string;
}

/**
 * Send event to PostHog
 */
async function sendEvent(event: PostHogEvent): Promise<boolean> {
    if (!POSTHOG_API_KEY) {
        logger.debug('PostHog not configured, skipping event', { event: event.event });
        return false;
    }

    try {
        await axios.post(`${POSTHOG_HOST}/capture`, {
            api_key: POSTHOG_API_KEY,
            event: event.event,
            distinct_id: event.distinct_id,
            properties: {
                ...event.properties,
                $lib: 'hedwig-backend',
                $lib_version: '1.0.0',
            },
            timestamp: event.timestamp || new Date().toISOString(),
        });

        logger.debug('Analytics event sent', { event: event.event });
        return true;
    } catch (error: any) {
        logger.error('Failed to send analytics event', { event: event.event, error: error.message });
        return false;
    }
}

/**
 * Backend Analytics Events
 */
const BackendAnalytics = {
    // Payment received via webhook (Alchemy or Paycrest)
    paymentReceived: (userId: string, amount: number, currency: string, txHash?: string, invoiceId?: string, projectId?: string, clientId?: string) =>
        sendEvent({
            event: 'payment_received',
            distinct_id: userId,
            properties: {
                user_id: userId,
                amount,
                currency,
                tx_hash: txHash,
                invoice_id: invoiceId,
                project_id: projectId,
                client_id: clientId,
                timestamp: new Date().toISOString(),
            },
        }),

    // Withdrawal completed via Paycrest
    withdrawalCompleted: (userId: string, amount: number, currency: string, fiatAmount?: number, fiatCurrency?: string, txHash?: string) =>
        sendEvent({
            event: 'withdrawal_completed',
            distinct_id: userId,
            properties: {
                user_id: userId,
                amount,
                currency,
                fiat_amount: fiatAmount,
                fiat_currency: fiatCurrency,
                tx_hash: txHash,
                timestamp: new Date().toISOString(),
            },
        }),

    // Platform fee collected on transactions
    platformFeeCollected: (userId: string, feeAmount: number, feeCurrency: string, transactionAmount: number, transactionType: 'invoice' | 'payment_link' | 'offramp' | 'bridge') =>
        sendEvent({
            event: 'platform_fee_collected',
            distinct_id: userId,
            properties: {
                user_id: userId,
                fee_amount: feeAmount,
                fee_currency: feeCurrency,
                transaction_amount: transactionAmount,
                transaction_type: transactionType,
                timestamp: new Date().toISOString(),
            },
        }),

    // Client created
    clientCreated: (userId: string, clientId: string) =>
        sendEvent({
            event: 'client_created',
            distinct_id: userId,
            properties: {
                user_id: userId,
                client_id: clientId,
                timestamp: new Date().toISOString(),
            },
        }),

    // Project created
    projectCreated: (userId: string, projectId: string, clientId?: string) =>
        sendEvent({
            event: 'project_created',
            distinct_id: userId,
            properties: {
                user_id: userId,
                project_id: projectId,
                client_id: clientId,
                timestamp: new Date().toISOString(),
            },
        }),

    // Invoice sent
    invoiceSent: (userId: string, amount: number, currency: string, invoiceId?: string, clientId?: string) =>
        sendEvent({
            event: 'invoice_sent',
            distinct_id: userId,
            properties: {
                user_id: userId,
                invoice_amount: amount,
                currency,
                invoice_id: invoiceId,
                client_id: clientId,
                timestamp: new Date().toISOString(),
            },
        }),

    // USD account created
    usdAccountCreated: (userId: string, provider: string = 'bridge') =>
        sendEvent({
            event: 'usd_account_created',
            distinct_id: userId,
            properties: {
                user_id: userId,
                provider,
                currency: 'USD',
                timestamp: new Date().toISOString(),
            },
        }),

    // NGN account created
    ngnAccountCreated: (userId: string, provider: string = 'paycrest') =>
        sendEvent({
            event: 'ngn_account_created',
            distinct_id: userId,
            properties: {
                user_id: userId,
                provider,
                currency: 'NGN',
                timestamp: new Date().toISOString(),
            },
        }),

    // Fiat to stablecoin conversion
    fiatToStablecoinConverted: (userId: string, fiatAmount: number, fiatCurrency: string, stablecoinAmount: number, stablecoin: string = 'USDC') =>
        sendEvent({
            event: 'fiat_to_stablecoin_converted',
            distinct_id: userId,
            properties: {
                user_id: userId,
                fiat_amount: fiatAmount,
                fiat_currency: fiatCurrency,
                stablecoin_amount: stablecoinAmount,
                stablecoin,
                timestamp: new Date().toISOString(),
            },
        }),
};

export default BackendAnalytics;
