/**
 * import-users-to-onesignal.ts
 *
 * One-shot script that bulk-imports existing Hedwig users into OneSignal.
 *
 * For each user who doesn't yet have an onesignal_subscriptions row we call
 * the OneSignal Users API to create a profile keyed by external_id (privy_id).
 * This means:
 *  - The user exists in OneSignal and can be targeted immediately.
 *  - When the user next opens the app, the SDK's OneSignal.login(privy_id) call
 *    finds and merges with this profile, attaching their push subscription
 *    automatically — no logout/login required.
 *
 * Run with:
 *   npx ts-node -r dotenv/config src/scripts/import-users-to-onesignal.ts
 *
 * Required env vars (already used by the backend):
 *   ONESIGNAL_APP_ID
 *   ONESIGNAL_REST_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ONESIGNAL_APP_ID   = String(process.env.ONESIGNAL_APP_ID   || '').trim();
const ONESIGNAL_REST_KEY = String(process.env.ONESIGNAL_REST_API_KEY || '').trim();
const SUPABASE_URL       = String(process.env.SUPABASE_URL        || '').trim();
const SUPABASE_KEY       = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const BATCH_SIZE         = 20;   // users per batch (stay well under rate limits)
const DELAY_MS           = 300;  // ms between batches

if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_KEY) {
    console.error('❌  ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY must be set.');
    process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ONESIGNAL_USERS_URL = `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a OneSignal user profile keyed by external_id.
 * Returns true on success (200 created / 409 already exists).
 */
async function createOneSignalUser(params: {
    externalId: string;
    email?:     string;
    platform?:  string;
}): Promise<boolean> {
    const body: Record<string, any> = {
        identity: {
            external_id: params.externalId,
        },
        properties: {
            tags: {
                imported:  'true',
                has_email: params.email ? 'true' : 'false',
                ...(params.platform ? { platform: params.platform } : {}),
            },
        },
    };

    const res = await fetch(ONESIGNAL_USERS_URL, {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Key ${ONESIGNAL_REST_KEY}`,
        },
        body: JSON.stringify(body),
    });

    // 200 = created, 409 = already exists — both are fine
    if (res.ok || res.status === 409) return true;

    const text = await res.text().catch(() => '(no body)');
    console.warn(`  ⚠️  OneSignal ${res.status} for ${params.externalId}: ${text.slice(0, 120)}`);
    return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log('🚀  Starting OneSignal user import…\n');

    // 1. Fetch all users that already have a subscription row (skip them)
    const { data: existingRows, error: existingErr } = await supabase
        .from('onesignal_subscriptions')
        .select('external_id');

    if (existingErr) {
        console.error('❌  Failed to query onesignal_subscriptions:', existingErr.message);
        process.exit(1);
    }

    const alreadyImported = new Set((existingRows || []).map((r: any) => String(r.external_id)));
    console.log(`ℹ️   ${alreadyImported.size} users already have OneSignal subscriptions — skipping them.\n`);

    // 2. Fetch all users
    const { data: users, error: usersErr } = await supabase
        .from('users')
        .select('id, privy_id, email, first_name, last_name')
        .not('privy_id', 'is', null);

    if (usersErr || !users) {
        console.error('❌  Failed to query users:', usersErr?.message);
        process.exit(1);
    }

    // 3. Filter to only those not yet in OneSignal
    const pending = users.filter((u: any) => u.privy_id && !alreadyImported.has(String(u.privy_id)));

    console.log(`👥  ${users.length} total users — ${pending.length} need importing.\n`);

    if (pending.length === 0) {
        console.log('✅  Nothing to import. All users are already in OneSignal.');
        return;
    }

    // 4. Fetch platform info from device_tokens so we can tag correctly
    const userIds = pending.map((u: any) => u.id);
    const { data: tokens } = await supabase
        .from('device_tokens')
        .select('user_id, platform')
        .in('user_id', userIds);

    const platformByUserId = new Map<string, string>();
    for (const t of tokens || []) {
        if (t.user_id && t.platform) {
            platformByUserId.set(String(t.user_id), String(t.platform));
        }
    }

    // 5. Import in batches
    let imported = 0;
    let failed   = 0;

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);

        await Promise.all(
            batch.map(async (user: any) => {
                const externalId = String(user.privy_id);
                const email      = user.email ? String(user.email) : undefined;
                const platform   = platformByUserId.get(String(user.id));

                const ok = await createOneSignalUser({ externalId, email, platform });
                if (ok) {
                    imported++;
                    console.log(`  ✅  ${externalId}${email ? ` (${email})` : ''}`);
                } else {
                    failed++;
                }
            })
        );

        if (i + BATCH_SIZE < pending.length) {
            await sleep(DELAY_MS);
        }
    }

    console.log(`\n📊  Done — ${imported} imported, ${failed} failed out of ${pending.length} pending.`);
    console.log('\nℹ️   These users now exist in OneSignal. When they next open the app,');
    console.log('    OneSignal.login(privy_id) will merge their push subscription automatically.');
}

main().catch((err) => {
    console.error('❌  Unexpected error:', err);
    process.exit(1);
});
