/**
 * One-off backfill: register every existing user's EVM + Solana wallet
 * addresses with Circle Gateway's permissionless webhook subscription so
 * deposit / mint / forwarded events fire for everyone, not just users who
 * sign up after webhook routing went live.
 *
 * Usage:
 *   cd hedwig-backend
 *   CIRCLE_API_KEY=... CIRCLE_GATEWAY_WEBHOOK_ENDPOINT=https://.../api/webhooks/circle-gateway \
 *     npx ts-node scripts/backfillCircleGatewayWebhook.ts
 *
 * Env vars:
 *   CIRCLE_API_KEY                       — Circle developer console API key
 *   CIRCLE_GATEWAY_WEBHOOK_ENDPOINT      — public POST endpoint Circle will call
 *   CIRCLE_GATEWAY_SUBSCRIPTION_ID       — optional; when set, PATCH the
 *                                          existing EVM subscription for
 *                                          backwards compatibility
 *   CIRCLE_GATEWAY_EVM_SUBSCRIPTION_ID   — optional; PATCH existing EVM subscription
 *   CIRCLE_GATEWAY_SOLANA_SUBSCRIPTION_ID — optional; PATCH existing Solana subscription
 *   CIRCLE_NOTIFICATIONS_API_BASE_URL    — override (default https://api.circle.com)
 *   CIRCLE_API_BASE_URL                  — legacy override fallback
 *   GATEWAY_NETWORK                      — mainnet | testnet (default mainnet)
 *   CIRCLE_ONLY                          — optional evm | solana
 *   CIRCLE_LIST_ONLY                     — set to 1 to print existing subscription IDs and exit
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';
const CIRCLE_NOTIFICATIONS_API_BASE_URL = (
    process.env.CIRCLE_NOTIFICATIONS_API_BASE_URL ||
    process.env.CIRCLE_DEVELOPER_API_BASE_URL ||
    process.env.CIRCLE_API_BASE_URL ||
    'https://api.circle.com'
).replace(/\/+$/, '');
const ENDPOINT = process.env.CIRCLE_GATEWAY_WEBHOOK_ENDPOINT || '';
const EXISTING_EVM_SUBSCRIPTION_ID = process.env.CIRCLE_GATEWAY_EVM_SUBSCRIPTION_ID || process.env.CIRCLE_GATEWAY_SUBSCRIPTION_ID || '';
const EXISTING_SOLANA_SUBSCRIPTION_ID = process.env.CIRCLE_GATEWAY_SOLANA_SUBSCRIPTION_ID || '';
const parseBatchSize = (): number => {
    const raw = String(process.env.CIRCLE_GATEWAY_WEBHOOK_BATCH_SIZE || '20').trim().toLowerCase();
    if (raw === 'all') return Number.MAX_SAFE_INTEGER;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 20;
};
const MAX_ADDRESSES_PER_SUBSCRIPTION = parseBatchSize();
const FORCE_BATCHING = String(process.env.CIRCLE_FORCE_BATCHING || '').trim() === '1';

function abort(message: string): never {
    console.error(`✖ ${message}`);
    process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) abort('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
if (!CIRCLE_API_KEY) abort('CIRCLE_API_KEY must be set');
if (!ENDPOINT) abort('CIRCLE_GATEWAY_WEBHOOK_ENDPOINT must be set');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

interface UserRow {
    id: string;
    ethereum_wallet_address: string | null;
    solana_wallet_address: string | null;
}

async function fetchAllUsers(): Promise<UserRow[]> {
    const out: UserRow[] = [];
    const pageSize = 1000;
    let from = 0;
    // Paginate to avoid Supabase's 1000-row default cap.
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const { data, error } = await supabase
            .from('users')
            .select('id, ethereum_wallet_address, solana_wallet_address')
            .range(from, from + pageSize - 1);
        if (error) abort(`Supabase query failed: ${error.message}`);
        const rows = (data ?? []) as UserRow[];
        out.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
    }
    return out;
}

const EVM_RE = /^0x[a-f0-9]{40}$/i;
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function collectAddresses(users: UserRow[]): { evm: string[]; solana: string[] } {
    const evm = new Set<string>();
    const solana = new Set<string>();
    for (const u of users) {
        const eth = (u.ethereum_wallet_address || '').trim();
        if (eth && EVM_RE.test(eth)) evm.add(eth.toLowerCase());
        const sol = (u.solana_wallet_address || '').trim();
        if (sol && SOLANA_RE.test(sol)) solana.add(sol);
    }
    return { evm: [...evm], solana: [...solana] };
}

interface SubscriptionPayload {
    endpoint: string;
    name: string;
    enabled: boolean;
    notificationTypes: string[];
    addresses: string[];
    domains: string[];
    environment: 'LIVE' | 'TEST';
    restricted: boolean;
}

interface CircleSubscription {
    id?: string;
    endpoint?: string;
    environment?: string;
    name?: string;
}

const NOTIFICATION_TYPES = (process.env.CIRCLE_GATEWAY_NOTIFICATION_TYPES || 'gateway.deposit.finalized,gateway.mint.forwarded,gateway.mint.finalized')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
const CREATE_NOTIFICATION_TYPES = (process.env.CIRCLE_GATEWAY_CREATE_NOTIFICATION_TYPES || 'gateway.*')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

// Circle Gateway domain ids per chain (same on TEST + LIVE — environment distinguishes mainnet/testnet).
const EVM_DOMAINS = ['2', '3', '6', '7']; // optimism, arbitrum, base, polygon
const SOLANA_DOMAIN = '5';
const DOMAIN_LABELS: Record<string, string> = {
    '2': 'Optimism',
    '3': 'Arbitrum',
    '5': 'Solana',
    '6': 'Base',
    '7': 'Polygon',
};

function endpointFor(label: string, batchIndex = 0, domain?: string): string {
    // Circle rejects duplicate subscriptions on the same endpoint URL, and its
    // validator strips query strings. Use distinct path suffixes so EVM and
    // Solana subscriptions can both register.
    const base = ENDPOINT.replace(/\/+$/, '');
    if (label === 'EVM') {
        if (domain) return `${base}/evm/${domain}${batchIndex > 0 ? `-${batchIndex + 1}` : ''}`;
        return batchIndex === 0 ? ENDPOINT : `${base}/evm/${batchIndex + 1}`;
    }
    return batchIndex === 0 ? `${base}/solana` : `${base}/solana/${batchIndex + 1}`;
}

async function listSubscriptions(environment: 'LIVE' | 'TEST'): Promise<CircleSubscription[]> {
    const url = `${CIRCLE_NOTIFICATIONS_API_BASE_URL}/v2/notifications/subscriptions/permissionless?environment=${environment}`;
    const res = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${CIRCLE_API_KEY}`,
            Accept: 'application/json',
        },
    });
    const text = await res.text();
    let body: any;
    try {
        body = JSON.parse(text);
    } catch {
        body = text;
    }
    if (!res.ok) {
        console.error(`Circle API GET ${url} -> ${res.status}`);
        console.error(body);
        abort('Could not list existing Circle Gateway subscriptions.');
    }
    if (Array.isArray(body?.data)) return body.data;
    if (Array.isArray(body?.subscriptions)) return body.subscriptions;
    return [];
}

function findSubscriptionId(subscriptions: CircleSubscription[], endpoint: string): string {
    const match = subscriptions.find((item) => item.endpoint === endpoint);
    return String(match?.id || '');
}

async function createOrUpdateSubscription(payload: SubscriptionPayload, subscriptionId?: string) {
    const url = subscriptionId
        ? `${CIRCLE_NOTIFICATIONS_API_BASE_URL}/v2/notifications/subscriptions/permissionless/${subscriptionId}`
        : `${CIRCLE_NOTIFICATIONS_API_BASE_URL}/v2/notifications/subscriptions/permissionless`;
    const method = subscriptionId ? 'PATCH' : 'POST';
    const send = async (body: SubscriptionPayload) => {
        const res = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${CIRCLE_API_KEY}`,
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
        return { res, body: parsed };
    };

    let { res, body } = await send(payload);
    const shouldRetryCreateWithWildcard =
        !subscriptionId &&
        !res.ok &&
        res.status === 400 &&
        String(body?.message || '').toLowerCase().includes('api parameter invalid') &&
        payload.notificationTypes.join(',') !== CREATE_NOTIFICATION_TYPES.join(',');

    if (shouldRetryCreateWithWildcard) {
        const retryPayload = { ...payload, notificationTypes: CREATE_NOTIFICATION_TYPES };
        console.warn('  Circle rejected specific Gateway event filters on create; retrying with create notificationTypes:', CREATE_NOTIFICATION_TYPES);
        ({ res, body } = await send(retryPayload));
    }

    if (!res.ok) {
        console.error(`Circle API ${method} ${url} -> ${res.status}`);
        console.error(body);
        console.error('Full payload that failed:', JSON.stringify(payload, null, 2));
        abort(`Subscription ${subscriptionId ? 'update' : 'creation'} failed.`);
    }
    return body;
}

async function upsertSubscription(
    label: string,
    addresses: string[],
    domains: string[],
    subscriptionId: string,
    environment: 'LIVE' | 'TEST',
    existingSubscriptions: CircleSubscription[],
    batchIndex = 0,
    domainForEndpoint?: string,
) {
    if (addresses.length === 0) {
        console.log(`→ Skipping ${label}: no addresses found.`);
        return null;
    }
    const endpoint = endpointFor(label, batchIndex, domainForEndpoint);
    const resolvedSubscriptionId = batchIndex === 0
        ? (subscriptionId || findSubscriptionId(existingSubscriptions, endpoint))
        : findSubscriptionId(existingSubscriptions, endpoint);

    const payload: SubscriptionPayload = {
        endpoint,
        name: domainForEndpoint
            ? `Gateway Webhooks ${label} ${DOMAIN_LABELS[domainForEndpoint] || domainForEndpoint}${batchIndex > 0 ? ` ${batchIndex + 1}` : ''}`
            : batchIndex === 0 ? `Gateway Webhooks ${label}` : `Gateway Webhooks ${label} ${batchIndex + 1}`,
        enabled: true,
        notificationTypes: NOTIFICATION_TYPES,
        addresses,
        domains,
        environment,
        restricted: false,
    };

    if (resolvedSubscriptionId) {
        console.log(`→ PATCH-ing existing ${label} subscription ${resolvedSubscriptionId} with ${addresses.length} addresses…`);
    } else {
        console.log(`→ POST-ing new ${label} permissionless subscription with ${addresses.length} addresses…`);
    }
    console.log('  Sample payload:', JSON.stringify({
        endpoint: payload.endpoint,
        environment: payload.environment,
        notificationTypes: payload.notificationTypes,
        domains: payload.domains,
        addresses: payload.addresses.slice(0, 3),
    }, null, 2));

    const result = await createOrUpdateSubscription(payload, resolvedSubscriptionId || undefined);
    const resultId = result?.data?.id || result?.id || result?.subscriptionId || null;
    console.log(`✓ ${label} subscription done.`);
    if (resultId) {
        console.log(`  ${label} subscription ID: ${resultId}`);
    } else {
        console.log(`  ${label} response:`);
        console.log(JSON.stringify(result, null, 2));
    }
    return resultId ? String(resultId) : null;
}

function chunks<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

function batchesForBackfill<T>(items: T[], label: string): T[][] {
    if (items.length === 0) return [];
    if (!FORCE_BATCHING) {
        if (items.length > MAX_ADDRESSES_PER_SUBSCRIPTION) {
            console.log(
                `  ${label}: ignoring CIRCLE_GATEWAY_WEBHOOK_BATCH_SIZE=${MAX_ADDRESSES_PER_SUBSCRIPTION} for backfill; ` +
                'Circle accepts updates to the existing subscription but rejects duplicate domain/type subscriptions. ' +
                'Set CIRCLE_FORCE_BATCHING=1 to force multiple endpoint batches.'
            );
        }
        return [items];
    }
    return chunks(items, MAX_ADDRESSES_PER_SUBSCRIPTION);
}

(async () => {
    console.log('→ Fetching user wallet addresses from Supabase…');
    const users = await fetchAllUsers();
    console.log(`  ${users.length} user rows scanned.`);
    const collected = collectAddresses(users);
    const only = String(process.env.CIRCLE_ONLY || '').trim().toLowerCase();
    const evm = only === 'solana' ? [] : collected.evm;
    const solana = only === 'evm' ? [] : collected.solana;
    console.log(`  ${evm.length} unique EVM addresses, ${solana.length} unique Solana addresses.`);

    if (evm.length === 0 && solana.length === 0) abort('No wallet addresses to register.');

    // Single-address probe mode: useful when Circle returns a generic
    // "API parameter invalid" — surfaces per-address validation faster.
    if (process.env.CIRCLE_SINGLE === '1') {
        if (solana.length > 0) solana.splice(1);
        if (evm.length > 0) evm.splice(1);
        console.log(`[probe] Trimmed to ${evm.length} EVM + ${solana.length} Solana addresses.`);
    }

    const network = (process.env.GATEWAY_NETWORK || 'mainnet').toLowerCase();
    const isMainnet = network !== 'testnet';
    const environment = isMainnet ? 'LIVE' : 'TEST';
    const existingSubscriptions = await listSubscriptions(environment);

    if (process.env.CIRCLE_LIST_ONLY === '1') {
        console.log(`→ Existing Circle Gateway permissionless subscriptions (${environment}):`);
        if (existingSubscriptions.length === 0) {
            console.log('  None found.');
        }
        for (const s of existingSubscriptions) {
            console.log(JSON.stringify({
                id: s.id || null,
                name: s.name || null,
                endpoint: s.endpoint || null,
                environment: s.environment || null,
            }, null, 2));
        }
        console.log('✓ Done.');
        return;
    }

    // Debug helper: dump the schema of an existing subscription so we can
    // pattern-match its field shape on POST.
    if (process.env.CIRCLE_DUMP_EXISTING === '1' && existingSubscriptions.length > 0) {
        console.log('— existing subscriptions —');
        for (const s of existingSubscriptions) {
            console.log(JSON.stringify(s, null, 2));
        }
    }

    // Circle filters use flat address and domain lists. Keep EVM and Solana
    // subscriptions separate so the API never validates Solana addresses
    // against EVM domains, or EVM addresses against the Solana domain.
    const evmIds: string[] = [];
    const evmBatches = FORCE_BATCHING
        ? chunks(evm, MAX_ADDRESSES_PER_SUBSCRIPTION)
        : [evm.slice(0, MAX_ADDRESSES_PER_SUBSCRIPTION), evm.slice(MAX_ADDRESSES_PER_SUBSCRIPTION)].filter((batch) => batch.length > 0);

    if (evm.length > MAX_ADDRESSES_PER_SUBSCRIPTION && !FORCE_BATCHING) {
        console.log(
            `  EVM: keeping ${MAX_ADDRESSES_PER_SUBSCRIPTION} addresses on the primary all-domain subscription; ` +
            `${evm.length - MAX_ADDRESSES_PER_SUBSCRIPTION} overflow addresses will use per-domain subscriptions.`
        );
    }

    if (evmBatches[0]) {
        const id = await upsertSubscription('EVM', evmBatches[0], [...EVM_DOMAINS], EXISTING_EVM_SUBSCRIPTION_ID, environment, existingSubscriptions, 0);
        if (id) evmIds.push(id);
    }

    if (FORCE_BATCHING) {
        const overflowBatches = evmBatches.slice(1);
        for (const [index, batch] of overflowBatches.entries()) {
            const id = await upsertSubscription('EVM', batch, [...EVM_DOMAINS], EXISTING_EVM_SUBSCRIPTION_ID, environment, existingSubscriptions, index + 1);
            if (id) evmIds.push(id);
        }
    } else {
        const overflowAddresses = evmBatches.slice(1).flatMap((batch) => batch);
        if (overflowAddresses.length === 0) {
            // No overflow beyond the primary all-domain subscription.
        } else {
        for (const domain of EVM_DOMAINS) {
            for (const [index, batch] of chunks(overflowAddresses, MAX_ADDRESSES_PER_SUBSCRIPTION).entries()) {
                const id = await upsertSubscription(
                    'EVM',
                    batch,
                    [domain],
                    '',
                    environment,
                    existingSubscriptions,
                    index,
                    domain,
                );
                if (id) evmIds.push(id);
            }
        }
        }
    }
    const solanaIds: string[] = [];
    for (const [index, batch] of batchesForBackfill(solana, 'Solana').entries()) {
        const id = await upsertSubscription('Solana', batch, [SOLANA_DOMAIN], EXISTING_SOLANA_SUBSCRIPTION_ID, environment, existingSubscriptions, index);
        if (id) solanaIds.push(id);
    }

    console.log('✓ Done.');
    if (evmIds.length > 0) console.log(`  EVM subscription IDs: ${evmIds.join(',')}`);
    if (solanaIds.length > 0) console.log(`  Solana subscription IDs: ${solanaIds.join(',')}`);
    if (evmIds[0]) console.log(`  Save first EVM as CIRCLE_GATEWAY_EVM_SUBSCRIPTION_ID=${evmIds[0]}`);
    if (solanaIds[0]) console.log(`  Save first Solana as CIRCLE_GATEWAY_SOLANA_SUBSCRIPTION_ID=${solanaIds[0]}`);
})().catch((err) => {
    console.error('✖ Unexpected error:', err);
    process.exit(1);
});
