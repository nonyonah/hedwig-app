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
 *                                          existing subscription's address
 *                                          list instead of creating a new one
 *   CIRCLE_API_BASE_URL                  — override (default https://api.circle.com)
 *   GATEWAY_NETWORK                      — mainnet | testnet (default mainnet)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';
const CIRCLE_API_BASE_URL = (process.env.CIRCLE_API_BASE_URL || 'https://api.circle.com').replace(/\/+$/, '');
const ENDPOINT = process.env.CIRCLE_GATEWAY_WEBHOOK_ENDPOINT || '';
const EXISTING_SUBSCRIPTION_ID = process.env.CIRCLE_GATEWAY_SUBSCRIPTION_ID || '';

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
    notificationTypes: string[];
    addresses: string[];
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

(async () => {
    console.log('→ Fetching user wallet addresses from Supabase…');
    const users = await fetchAllUsers();
    console.log(`  ${users.length} user rows scanned.`);
    const { evm, solana } = collectAddresses(users);
    console.log(`  ${evm.length} unique EVM addresses, ${solana.length} unique Solana addresses.`);

    const addresses = [...evm, ...solana];
    if (addresses.length === 0) abort('No wallet addresses to register.');

    const payload: SubscriptionPayload = {
        endpoint: ENDPOINT,
        notificationTypes: ['gateway.*'],
        addresses,
    };

    if (EXISTING_SUBSCRIPTION_ID) {
        console.log(`→ PATCH-ing existing subscription ${EXISTING_SUBSCRIPTION_ID} with ${addresses.length} addresses…`);
    } else {
        console.log(`→ POST-ing new permissionless subscription with ${addresses.length} addresses…`);
    }

    const result = await createOrUpdateSubscription(payload, EXISTING_SUBSCRIPTION_ID || undefined);
    const subscriptionId = result?.data?.id || result?.id || result?.subscriptionId || null;

    console.log('✓ Done.');
    if (subscriptionId) {
        console.log(`  Subscription ID: ${subscriptionId}`);
        console.log('  Save this as CIRCLE_GATEWAY_SUBSCRIPTION_ID to reuse for future PATCH updates.');
    } else {
        console.log('  Response:');
        console.log(JSON.stringify(result, null, 2));
    }
})().catch((err) => {
    console.error('✖ Unexpected error:', err);
    process.exit(1);
});
