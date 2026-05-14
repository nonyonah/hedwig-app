/**
 * Registers user wallet addresses with Circle Gateway's permissionless
 * webhook subscription so deposit / mint / forwarded events fire for them.
 *
 * Strategy:
 *   - One shared subscription per environment, identified by
 *     CIRCLE_GATEWAY_SUBSCRIPTION_ID.
 *   - On first call we create it via POST /v2/notifications/subscriptions/permissionless
 *     and remember the returned id in-memory (operators paste it back into the
 *     env var so subsequent deploys reuse it).
 *   - Each subsequent call PATCH-es that subscription with the additional
 *     address. Circle's API dedupes server-side; we still cache locally so we
 *     don't hammer them on every signup.
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('CircleGatewayWebhooks');

const CIRCLE_API_BASE_URL = (process.env.CIRCLE_API_BASE_URL || 'https://api.circle.com').replace(/\/+$/, '');
const NOTIFICATION_TYPES = ['gateway.*'];

const EVM_RE = /^0x[a-f0-9]{40}$/i;
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const registeredCache = new Set<string>();
let runtimeSubscriptionId: string | null = null;

function getConfig(): {
    apiKey: string;
    endpoint: string;
    subscriptionId: string | null;
} | null {
    const apiKey = String(process.env.CIRCLE_API_KEY || '').trim();
    const endpoint = String(process.env.CIRCLE_GATEWAY_WEBHOOK_ENDPOINT || '').trim();
    if (!apiKey || !endpoint) return null;
    const envSubscriptionId = String(process.env.CIRCLE_GATEWAY_SUBSCRIPTION_ID || '').trim() || null;
    return {
        apiKey,
        endpoint,
        subscriptionId: envSubscriptionId || runtimeSubscriptionId,
    };
}

async function callCircle(
    apiKey: string,
    method: 'POST' | 'PATCH',
    path: string,
    body: Record<string, unknown>,
): Promise<{ ok: boolean; body: any }> {
    const res = await fetch(`${CIRCLE_API_BASE_URL}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: any;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = text;
    }
    return { ok: res.ok, body: parsed };
}

async function ensureSubscription(
    apiKey: string,
    endpoint: string,
    seedAddresses: string[],
): Promise<string | null> {
    const { ok, body } = await callCircle(apiKey, 'POST', '/v2/notifications/subscriptions/permissionless', {
        endpoint,
        notificationTypes: NOTIFICATION_TYPES,
        addresses: seedAddresses,
    });
    if (!ok) {
        logger.error('Failed to create Circle Gateway subscription', { status: body?.message || body });
        return null;
    }
    const id = body?.data?.id || body?.id || body?.subscriptionId || null;
    if (id) {
        runtimeSubscriptionId = String(id);
        logger.info('Created Circle Gateway subscription', { subscriptionId: id });
    }
    return id ? String(id) : null;
}

async function patchSubscription(
    apiKey: string,
    subscriptionId: string,
    addresses: string[],
): Promise<boolean> {
    const { ok, body } = await callCircle(
        apiKey,
        'PATCH',
        `/v2/notifications/subscriptions/permissionless/${subscriptionId}`,
        { addresses },
    );
    if (!ok) {
        logger.warn('Failed to patch Circle Gateway subscription', {
            subscriptionId,
            status: body?.message || body,
        });
        return false;
    }
    return true;
}

export interface WalletAddresses {
    ethereum?: string | null;
    solana?: string | null;
}

const sanitize = (addresses: WalletAddresses): string[] => {
    const out: string[] = [];
    const eth = (addresses.ethereum || '').trim();
    if (eth && EVM_RE.test(eth)) out.push(eth.toLowerCase());
    const sol = (addresses.solana || '').trim();
    if (sol && SOLANA_RE.test(sol)) out.push(sol);
    return out;
};

/**
 * Add one user's wallet addresses to the shared Circle Gateway subscription.
 * Safe to call concurrently from request handlers — silently no-ops when
 * CIRCLE_API_KEY or CIRCLE_GATEWAY_WEBHOOK_ENDPOINT is unset.
 */
export async function registerGatewayWebhookAddresses(addresses: WalletAddresses): Promise<void> {
    const config = getConfig();
    if (!config) {
        logger.debug('Circle Gateway webhook registration skipped (missing CIRCLE_API_KEY or CIRCLE_GATEWAY_WEBHOOK_ENDPOINT)');
        return;
    }
    const list = sanitize(addresses);
    if (list.length === 0) return;

    const fresh = list.filter((addr) => !registeredCache.has(addr));
    if (fresh.length === 0) return;

    let subscriptionId = config.subscriptionId;
    if (!subscriptionId) {
        subscriptionId = await ensureSubscription(config.apiKey, config.endpoint, fresh);
        if (!subscriptionId) return;
    } else {
        const ok = await patchSubscription(config.apiKey, subscriptionId, fresh);
        if (!ok) return;
    }

    for (const addr of fresh) registeredCache.add(addr);
}
