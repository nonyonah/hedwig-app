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
 *   CIRCLE_API_BASE_URL                  — override (default https://api.circle.com)
 *   GATEWAY_NETWORK                      — mainnet | testnet (default mainnet)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';
const CIRCLE_API_BASE_URL = (process.env.CIRCLE_API_BASE_URL || 'https://api.circle.com').replace(/\/+$/, '');
const ENDPOINT = process.env.CIRCLE_GATEWAY_WEBHOOK_ENDPOINT || '';
const EXISTING_EVM_SUBSCRIPTION_ID = process.env.CIRCLE_GATEWAY_EVM_SUBSCRIPTION_ID || process.env.CIRCLE_GATEWAY_SUBSCRIPTION_ID || '';
const EXISTING_SOLANA_SUBSCRIPTION_ID = process.env.CIRCLE_GATEWAY_SOLANA_SUBSCRIPTION_ID || '';

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
}

interface CircleSubscription {
    id?: string;
    endpoint?: string;
    environment?: string;
    name?: string;
}

// Circle Gateway domain ids per chain (same on TEST + LIVE — environment distinguishes mainnet/testnet).
const EVM_DOMAINS = ['2', '3', '6', '7']; // optimism, arbitrum, base, polygon
const SOLANA_DOMAIN = '5';

function endpointFor(label: string): string {
    // Circle rejects duplicate subscriptions on the same endpoint URL, and its
    // validator strips query strings. Use distinct path suffixes so EVM and
    // Solana subscriptions can both register.
    if (label === 'EVM') return ENDPOINT;
    return `${ENDPOINT.replace(/\/+$/, '')}/${label.toLowerCase()}`;
}

async function listSubscriptions(environment: 'LIVE' | 'TEST'): Promise<CircleSubscription[]> {
    const url = `${CIRCLE_API_BASE_URL}/v2/notifications/subscriptions/permissionless?environment=${environment}`;
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
    return Array.isArray(body?.data) ? body.data : [];
}

function findSubscriptionId(subscriptions: CircleSubscription[], endpoint: string): string {
    const match = subscriptions.find((item) => item.endpoint === endpoint);
    return String(match?.id || '');
}

async function createOrUpdateSubscription(payload: SubscriptionPayload, subscriptionId?: string) {
    const url = subscriptionId
        ? `${CIRCLE_API_BASE_URL}/v2/notifications/subscriptions/permissionless/${subscriptionId}`
        : `${CIRCLE_API_BASE_URL}/v2/notifications/subscriptions/permissionless`;
    const method = subscriptionId ? 'PATCH' : 'POST';
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${CIRCLE_API_KEY}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const text = await res.text();
    let body: any;
    try {
        body = JSON.parse(text);
    } catch {
        body = text;
    }
    if (!res.ok) {
        console.error(`Circle API ${method} ${url} -> ${res.status}`);
        console.error(body);
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
) {
    if (addresses.length === 0) {
        console.log(`→ Skipping ${label}: no addresses found.`);
        return null;
    }
    const endpoint = endpointFor(label);
    const resolvedSubscriptionId = subscriptionId || findSubscriptionId(existingSubscriptions, endpoint);

    const payload: SubscriptionPayload = {
        endpoint,
        name: `Gateway Webhooks ${label}`,
        enabled: true,
        notificationTypes: ['gateway.*'],
        addresses,
        domains,
        environment,
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

(async () => {
    console.log('→ Fetching user wallet addresses from Supabase…');
    const users = await fetchAllUsers();
    console.log(`  ${users.length} user rows scanned.`);
    const { evm, solana } = collectAddresses(users);
    console.log(`  ${evm.length} unique EVM addresses, ${solana.length} unique Solana addresses.`);

    if (evm.length === 0 && solana.length === 0) abort('No wallet addresses to register.');

    const network = (process.env.GATEWAY_NETWORK || 'mainnet').toLowerCase();
    const isMainnet = network !== 'testnet';
    const environment = isMainnet ? 'LIVE' : 'TEST';
    const existingSubscriptions = await listSubscriptions(environment);

    // Circle filters use flat address and domain lists. Keep EVM and Solana
    // subscriptions separate so the API never validates Solana addresses
    // against EVM domains, or EVM addresses against the Solana domain.
    const evmId = await upsertSubscription('EVM', evm, [...EVM_DOMAINS], EXISTING_EVM_SUBSCRIPTION_ID, environment, existingSubscriptions);
    const solanaId = await upsertSubscription('Solana', solana, [SOLANA_DOMAIN], EXISTING_SOLANA_SUBSCRIPTION_ID, environment, existingSubscriptions);

    console.log('✓ Done.');
    if (evmId) console.log(`  Save EVM as CIRCLE_GATEWAY_EVM_SUBSCRIPTION_ID=${evmId}`);
    if (solanaId) console.log(`  Save Solana as CIRCLE_GATEWAY_SOLANA_SUBSCRIPTION_ID=${solanaId}`);
})().catch((err) => {
    console.error('✖ Unexpected error:', err);
    process.exit(1);
});
