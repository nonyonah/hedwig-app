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

const CIRCLE_NOTIFICATIONS_API_BASE_URL = (
    process.env.CIRCLE_NOTIFICATIONS_API_BASE_URL ||
    process.env.CIRCLE_DEVELOPER_API_BASE_URL ||
    'https://api.circle.com'
).replace(/\/+$/, '');
const NOTIFICATION_TYPES = (process.env.CIRCLE_GATEWAY_NOTIFICATION_TYPES || 'gateway.deposit.finalized,gateway.mint.forwarded,gateway.mint.finalized')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const MAX_ADDRESSES_PER_SUBSCRIPTION = Math.max(
    1,
    Number(process.env.CIRCLE_GATEWAY_WEBHOOK_BATCH_SIZE || 10) || 10,
);

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

function endpointFor(endpoint: string, label: 'EVM' | 'Solana', batchIndex = 0, domain?: string): string {
    // Circle rejects duplicate subscriptions on the same endpoint URL, and its
    // validator strips query strings. Use distinct path suffixes so EVM and
    // Solana subscriptions can both register.
    const base = endpoint.replace(/\/+$/, '');
    if (label === 'EVM') {
        if (domain) return `${base}/evm/${domain}${batchIndex > 0 ? `-${batchIndex + 1}` : ''}`;
        return batchIndex === 0 ? endpoint : `${base}/evm/${batchIndex + 1}`;
    }
    return batchIndex === 0 ? `${base}/solana` : `${base}/solana/${batchIndex + 1}`;
}

async function callCircle(
    apiKey: string,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: Record<string, unknown>,
): Promise<{ ok: boolean; body: any }> {
    const res = await fetch(`${CIRCLE_NOTIFICATIONS_API_BASE_URL}${path}`, {
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
    const items = await listSubscriptions(apiKey);
    const match = items.find((item: any) => item?.endpoint === endpoint);
    return match?.id ? String(match.id) : null;
}

async function listSubscriptions(apiKey: string): Promise<any[]> {
    const { ok, body } = await callCircle(
        apiKey,
        'GET',
        `/v2/notifications/subscriptions/permissionless?environment=${gatewayEnvironment()}`,
    );
    const items = Array.isArray(body?.data)
        ? body.data
        : Array.isArray(body?.subscriptions)
            ? body.subscriptions
            : [];
    return ok ? items : [];
}

async function findWritableSubscription(
    apiKey: string,
    baseEndpoint: string,
    label: 'EVM' | 'Solana',
    domain?: string,
): Promise<{ id: string | null; endpoint: string; batchIndex: number }> {
    const existing = await listSubscriptions(apiKey);
    const usedEndpoints = new Set(existing.map((item: any) => String(item?.endpoint || '')).filter(Boolean));

    for (let index = 0; index < 20; index += 1) {
        const endpoint = endpointFor(baseEndpoint, label, index, domain);
        const match = existing.find((item: any) => item?.endpoint === endpoint);
        const addressCount = Array.isArray(match?.addresses) ? match.addresses.length : 0;
        if (match?.id && addressCount < MAX_ADDRESSES_PER_SUBSCRIPTION) {
            return { id: String(match.id), endpoint, batchIndex: index };
        }
        if (!usedEndpoints.has(endpoint)) {
            return { id: null, endpoint, batchIndex: index };
        }
    }

    return { id: null, endpoint: endpointFor(baseEndpoint, label, Date.now(), domain), batchIndex: Date.now() };
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
        const ok = await patchSubscription(apiKey, existingId, endpoint, seedAddresses, domains, label);
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
        restricted: false,
    });
    if (!ok) {
        if (body?.message && String(body.message).includes('associated with another subscription')) {
            const retryId = await findSubscriptionIdForEndpoint(apiKey, endpoint);
            if (retryId) {
                const patched = await patchSubscription(apiKey, retryId, endpoint, seedAddresses, domains, label);
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
    endpoint: string,
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

    const subscription = existing?.data ?? existing;
    const currentAddresses = Array.isArray(subscription?.addresses)
        ? subscription.addresses
        : [];
    const mergedAddresses = [
        ...new Set([
            ...currentAddresses.map((addr: unknown) => String(addr || '').trim()).filter(Boolean),
            ...addresses,
        ]),
    ];
    if (mergedAddresses.length > MAX_ADDRESSES_PER_SUBSCRIPTION) {
        logger.info('Circle Gateway subscription is full; will use another batch endpoint', {
            subscriptionId,
            label,
            addressCount: mergedAddresses.length,
            maxAddresses: MAX_ADDRESSES_PER_SUBSCRIPTION,
        });
        return false;
    }

    const { ok, body } = await callCircle(
        apiKey,
        'PATCH',
        `/v2/notifications/subscriptions/permissionless/${subscriptionId}`,
        {
            endpoint,
            name: subscription?.name || `Gateway Webhooks ${label}`,
            enabled: subscription?.enabled ?? true,
            environment: gatewayEnvironment(),
            notificationTypes: NOTIFICATION_TYPES,
            addresses: mergedAddresses,
            domains,
            restricted: false,
        },
    );
    if (!ok) {
        logger.warn('Failed to patch Circle Gateway subscription', {
            subscriptionId,
            label,
            addressCount: mergedAddresses.length,
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
    let endpoint = input.endpoint;
    if (!subscriptionId) {
        const candidate = await findWritableSubscription(input.apiKey, input.endpoint, input.label);
        endpoint = candidate.endpoint;
        subscriptionId = candidate.id;
        if (!subscriptionId) {
            if (input.label === 'EVM' && candidate.batchIndex > 0) {
                await Promise.all(EVM_GATEWAY_DOMAINS.map(async (domain) => {
                    const domainCandidate = await findWritableSubscription(input.apiKey, input.endpoint, 'EVM', domain);
                    const domainSubscriptionId = domainCandidate.id || await ensureSubscription(
                        input.apiKey,
                        domainCandidate.endpoint,
                        fresh,
                        [domain],
                        'EVM',
                    );
                    if (domainSubscriptionId && domainCandidate.id) {
                        await patchSubscription(input.apiKey, domainSubscriptionId, domainCandidate.endpoint, fresh, [domain], 'EVM');
                    }
                }));
                for (const addr of fresh) registeredCache.add(`${input.label}:${addr}`);
                return;
            }
            subscriptionId = await ensureSubscription(input.apiKey, endpoint, fresh, input.domains, input.label);
        }
        if (!subscriptionId) return;
    } else {
        const ok = await patchSubscription(input.apiKey, subscriptionId, endpoint, fresh, input.domains, input.label);
        if (!ok) {
            if (input.label === 'EVM') {
                await Promise.all(EVM_GATEWAY_DOMAINS.map(async (domain) => {
                    const candidate = await findWritableSubscription(input.apiKey, input.endpoint, 'EVM', domain);
                    const domainSubscriptionId = candidate.id || await ensureSubscription(
                        input.apiKey,
                        candidate.endpoint,
                        fresh,
                        [domain],
                        'EVM',
                    );
                    if (domainSubscriptionId && candidate.id) {
                        await patchSubscription(input.apiKey, domainSubscriptionId, candidate.endpoint, fresh, [domain], 'EVM');
                    }
                }));
                for (const addr of fresh) registeredCache.add(`${input.label}:${addr}`);
                return;
            }
            const candidate = await findWritableSubscription(input.apiKey, input.endpoint, input.label);
            endpoint = candidate.endpoint;
            subscriptionId = candidate.id || await ensureSubscription(input.apiKey, endpoint, fresh, input.domains, input.label);
            if (!subscriptionId) return;
        }
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
            endpoint: config.endpoint,
            subscriptionId: config.evmSubscriptionId,
            addresses: list.evm,
            domains: EVM_GATEWAY_DOMAINS,
            label: 'EVM',
        }),
        registerAddressGroup({
            apiKey: config.apiKey,
            endpoint: config.endpoint,
            subscriptionId: config.solanaSubscriptionId,
            addresses: list.solana,
            domains: SOLANA_GATEWAY_DOMAINS,
            label: 'Solana',
        }),
    ]);
}
