/**
 * Registers user wallet addresses with Circle Gateway's permissionless
 * webhook subscription so deposit / mint / forwarded events fire for them.
 *
 * Strategy:
 *   - Two shared subscriptions per environment: one for EVM domains and one
 *     for Solana. Circle validates addresses against selected domains, so
 *     mixed address/domain filters can be rejected.
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

// Circle Gateway domain ids — same numbering on TEST + LIVE.
const EVM_GATEWAY_DOMAINS = ['2', '3', '6', '7'] as const;
const SOLANA_GATEWAY_DOMAINS = ['5'] as const;

function gatewayEnvironment(): 'LIVE' | 'TEST' {
    const mode = String(process.env.GATEWAY_NETWORK || 'mainnet').toLowerCase();
    return mode === 'testnet' ? 'TEST' : 'LIVE';
}

const EVM_RE = /^0x[a-f0-9]{40}$/i;
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const registeredCache = new Set<string>();
let runtimeSubscriptionId: string | null = null;
let runtimeEvmSubscriptionId: string | null = null;
let runtimeSolanaSubscriptionId: string | null = null;

function getConfig(): {
    apiKey: string;
    endpoint: string;
    evmSubscriptionId: string | null;
    solanaSubscriptionId: string | null;
} | null {
    const apiKey = String(process.env.CIRCLE_API_KEY || '').trim();
    const endpoint = String(process.env.CIRCLE_GATEWAY_WEBHOOK_ENDPOINT || '').trim();
    if (!apiKey || !endpoint) return null;
    const legacySubscriptionId = String(process.env.CIRCLE_GATEWAY_SUBSCRIPTION_ID || '').trim() || null;
    const evmSubscriptionId =
        String(process.env.CIRCLE_GATEWAY_EVM_SUBSCRIPTION_ID || '').trim() ||
        legacySubscriptionId ||
        runtimeEvmSubscriptionId ||
        runtimeSubscriptionId ||
        null;
    const solanaSubscriptionId =
        String(process.env.CIRCLE_GATEWAY_SOLANA_SUBSCRIPTION_ID || '').trim() ||
        runtimeSolanaSubscriptionId ||
        null;
    return {
        apiKey,
        endpoint,
        evmSubscriptionId,
        solanaSubscriptionId,
    };
}

function endpointFor(endpoint: string, label: 'EVM' | 'Solana'): string {
    // Circle rejects duplicate subscriptions on the same endpoint URL, and its
    // validator strips query strings. Use distinct path suffixes so EVM and
    // Solana subscriptions can both register.
    if (label === 'EVM') return endpoint;
    return `${endpoint.replace(/\/+$/, '')}/${label.toLowerCase()}`;
}

async function callCircle(
    apiKey: string,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: Record<string, unknown>,
): Promise<{ ok: boolean; body: any }> {
    const res = await fetch(`${CIRCLE_API_BASE_URL}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
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

async function findSubscriptionIdForEndpoint(
    apiKey: string,
    endpoint: string,
): Promise<string | null> {
    const { ok, body } = await callCircle(
        apiKey,
        'GET',
        `/v2/notifications/subscriptions/permissionless?environment=${gatewayEnvironment()}`,
    );
    if (!ok || !Array.isArray(body?.data)) return null;
    const match = body.data.find((item: any) => item?.endpoint === endpoint);
    return match?.id ? String(match.id) : null;
}

async function ensureSubscription(
    apiKey: string,
    endpoint: string,
    seedAddresses: string[],
    domains: readonly string[],
    label: 'EVM' | 'Solana',
): Promise<string | null> {
    const existingId = await findSubscriptionIdForEndpoint(apiKey, endpoint);
    if (existingId) {
        const ok = await patchSubscription(apiKey, existingId, seedAddresses, domains, label);
        return ok ? existingId : null;
    }

    const { ok, body } = await callCircle(apiKey, 'POST', '/v2/notifications/subscriptions/permissionless', {
        endpoint,
        name: `Gateway Webhooks ${label}`,
        enabled: true,
        notificationTypes: NOTIFICATION_TYPES,
        addresses: seedAddresses,
        domains,
        environment: gatewayEnvironment(),
    });
    if (!ok) {
        if (body?.message && String(body.message).includes('associated with another subscription')) {
            const retryId = await findSubscriptionIdForEndpoint(apiKey, endpoint);
            if (retryId) {
                const patched = await patchSubscription(apiKey, retryId, seedAddresses, domains, label);
                return patched ? retryId : null;
            }
        }
        logger.error('Failed to create Circle Gateway subscription', { status: body?.message || body });
        return null;
    }
    const id = body?.data?.id || body?.id || body?.subscriptionId || null;
    if (id) {
        if (label === 'EVM') runtimeEvmSubscriptionId = String(id);
        if (label === 'Solana') runtimeSolanaSubscriptionId = String(id);
        runtimeSubscriptionId = String(id);
        logger.info('Created Circle Gateway subscription', { label, subscriptionId: id });
    }
    return id ? String(id) : null;
}

async function patchSubscription(
    apiKey: string,
    subscriptionId: string,
    addresses: string[],
    domains: readonly string[],
    label: 'EVM' | 'Solana',
): Promise<boolean> {
    const { ok: getOk, body: existing } = await callCircle(
        apiKey,
        'GET',
        `/v2/notifications/subscriptions/permissionless/${subscriptionId}`,
    );
    if (!getOk) {
        logger.warn('Failed to retrieve Circle Gateway subscription before patch', {
            subscriptionId,
            status: existing?.message || existing,
        });
        return false;
    }

    const currentAddresses = Array.isArray(existing?.data?.addresses)
        ? existing.data.addresses
        : [];
    const mergedAddresses = [
        ...new Set([
            ...currentAddresses.map((addr: unknown) => String(addr || '').trim()).filter(Boolean),
            ...addresses,
        ]),
    ];

    const { ok, body } = await callCircle(
        apiKey,
        'PATCH',
        `/v2/notifications/subscriptions/permissionless/${subscriptionId}`,
        {
            name: existing?.data?.name || 'Gateway Webhooks',
            enabled: existing?.data?.enabled ?? true,
            environment: gatewayEnvironment(),
            notificationTypes: NOTIFICATION_TYPES,
            addresses: mergedAddresses,
            domains,
        },
    );
    if (!ok) {
        logger.warn('Failed to patch Circle Gateway subscription', {
            subscriptionId,
            label,
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

const sanitize = (addresses: WalletAddresses): { evm: string[]; solana: string[] } => {
    const evm: string[] = [];
    const solana: string[] = [];
    const eth = (addresses.ethereum || '').trim();
    if (eth && EVM_RE.test(eth)) evm.push(eth.toLowerCase());
    const sol = (addresses.solana || '').trim();
    if (sol && SOLANA_RE.test(sol)) solana.push(sol);
    return { evm, solana };
};

async function registerAddressGroup(input: {
    apiKey: string;
    endpoint: string;
    subscriptionId: string | null;
    addresses: string[];
    domains: readonly string[];
    label: 'EVM' | 'Solana';
}) {
    const fresh = input.addresses.filter((addr) => !registeredCache.has(`${input.label}:${addr}`));
    if (fresh.length === 0) return;

    let subscriptionId = input.subscriptionId;
    if (!subscriptionId) {
        subscriptionId = await ensureSubscription(input.apiKey, input.endpoint, fresh, input.domains, input.label);
        if (!subscriptionId) return;
    } else {
        const ok = await patchSubscription(input.apiKey, subscriptionId, fresh, input.domains, input.label);
        if (!ok) return;
    }

    for (const addr of fresh) registeredCache.add(`${input.label}:${addr}`);
}

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
    await Promise.all([
        registerAddressGroup({
            apiKey: config.apiKey,
            endpoint: endpointFor(config.endpoint, 'EVM'),
            subscriptionId: config.evmSubscriptionId,
            addresses: list.evm,
            domains: EVM_GATEWAY_DOMAINS,
            label: 'EVM',
        }),
        registerAddressGroup({
            apiKey: config.apiKey,
            endpoint: endpointFor(config.endpoint, 'Solana'),
            subscriptionId: config.solanaSubscriptionId,
            addresses: list.solana,
            domains: SOLANA_GATEWAY_DOMAINS,
            label: 'Solana',
        }),
    ]);
}
