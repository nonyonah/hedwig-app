/**
 * Patch existing Circle Gateway subscriptions to include ALL user wallet
 * addresses and point to the production webhook endpoint.
 * 
 * Run: npx ts-node scripts/patch-gateway-subscriptions.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY!;
const BASE = 'https://api.circle.com';

const EVM_RE = /^0x[a-f0-9]{40}$/i;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users } = await supabase.from('users').select('ethereum_wallet_address, solana_wallet_address');
  if (!users) { console.log('No users'); return; }

  const evmSet = new Set<string>();
  const solSet = new Set<string>();
  for (const u of users) {
    const eth = (u.ethereum_wallet_address || '').trim();
    if (eth && EVM_RE.test(eth)) evmSet.add(eth.toLowerCase());
    const sol = (u.solana_wallet_address || '').trim();
    if (sol && SOL_RE.test(sol)) solSet.add(sol);
  }
  const evm = [...evmSet];
  const sol = [...solSet];
  console.log(`EVM: ${evm.length} unique addresses, Solana: ${sol.length}`);

  const headers = {
    Authorization: `Bearer ${CIRCLE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  // Helper: POST or PATCH to Circle
  const circle = async (method: string, path: string, body: any) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    return { ok: res.ok, status: res.status, body: parsed };
  };

  // ─── EVM: Patch existing subscription with all addresses ───
  const evmSubId = '91117900-4438-4d63-a36c-563d00bf43a6';
  console.log(`\nPatching EVM subscription ${evmSubId}...`);

  // First get the sub to check its current state
  const { body: current } = await circle('GET', `/v2/notifications/subscriptions/permissionless/${evmSubId}`);
  console.log('Current EVM sub addresses:', current.data?.addresses?.length);
  console.log('Current EVM sub domains:', current.data?.domains);

  // PATCH with all addresses
  const { ok, body: result, status } = await circle('PATCH', `/v2/notifications/subscriptions/permissionless/${evmSubId}`, {
    endpoint: 'https://money.hedwigbot.xyz/api/webhooks/circle-gateway',
    name: 'Gateway Webhooks EVM',
    enabled: true,
    environment: 'TEST',
    notificationTypes: ['gateway.deposit.finalized'],
    addresses: evm,
    domains: ['2', '3', '6', '7'],
  });
  console.log(`EVM PATCH: HTTP ${status} | ${result.message || 'OK'}`);
  if (result.data) console.log(`  addresses: ${result.data.addresses?.length}, domains: ${result.data.domains?.join(',')}`);

  // If PATCH failed, try sending in batches
  if (!ok) {
    console.log('PATCH failed, trying batch approach...');
    // Sending all addresses at once failed
    // Fall back: send first 20, then remaining
    const batchSize = 20;
    for (let i = 0; i < evm.length; i += batchSize) {
      const batch = evm.slice(i, i + batchSize);
      const r = await circle('PATCH', `/v2/notifications/subscriptions/permissionless/${evmSubId}`, {
        endpoint: 'https://money.hedwigbot.xyz/api/webhooks/circle-gateway',
        name: 'Gateway Webhooks EVM',
        enabled: true,
        environment: 'TEST',
        notificationTypes: ['gateway.deposit.finalized'],
        addresses: batch,
        domains: ['2', '3', '6', '7'],
      });
      console.log(`  Batch ${i / batchSize + 1} (${batch.length} addrs): HTTP ${r.status} | ${r.body.message || 'OK'}`);
    }
  }

  // ─── Solana: Create or update subscription ───
  console.log(`\nSetting up Solana subscription...`);

  const solPayload = {
    endpoint: 'https://money.hedwigbot.xyz/api/webhooks/circle-gateway/solana',
    name: 'Gateway Webhooks Solana',
    enabled: true,
    environment: 'TEST',
    notificationTypes: ['gateway.deposit.finalized'],
    addresses: sol,
    domains: ['5'],
  };

  // Check if solana endpoint already has a subscription
  const { body: subs } = await circle('GET', '/v2/notifications/subscriptions/permissionless?environment=TEST');
  const existing = (subs.data || []).find((s: any) => s.endpoint === 'https://money.hedwigbot.xyz/api/webhooks/circle-gateway/solana');

  if (existing) {
    console.log(`Patching existing Solana sub ${existing.id}...`);
    const { ok: pok, body: pbody, status: pstatus } = await circle('PATCH', `/v2/notifications/subscriptions/permissionless/${existing.id}`, solPayload);
    console.log(`Sol PATCH: HTTP ${pstatus} | ${pbody.message || 'OK'}`);
  } else {
    console.log('Creating new Solana sub...');
    const { ok: pok, body: pbody, status: pstatus } = await circle('POST', '/v2/notifications/subscriptions/permissionless', solPayload);
    console.log(`Sol POST: HTTP ${pstatus} | ${pbody.data?.id || pbody.message || JSON.stringify(pbody)}`);
    if (pok && pbody.data?.id) {
      console.log(`  Save this ID as CIRCLE_GATEWAY_SOLANA_SUBSCRIPTION_ID=${pbody.data.id}`);
    }
  }

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
