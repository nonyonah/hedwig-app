require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const BASE = 'https://api.circle.com';

const EVM_RE = /^0x[a-f0-9]{40}$/i;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users } = await supabase.from('users').select('ethereum_wallet_address, solana_wallet_address');
  if (!users) { console.log('No users'); return; }

  const evmSet = new Set();
  const solSet = new Set();
  for (const u of users) {
    const eth = (u.ethereum_wallet_address || '').trim();
    if (eth && EVM_RE.test(eth)) evmSet.add(eth.toLowerCase());
    const sol = (u.solana_wallet_address || '').trim();
    if (sol && SOL_RE.test(sol)) solSet.add(sol);
  }
  const evm = [...evmSet];
  const sol = [...solSet];
  console.log('EVM:', evm.length, 'unique addresses, Solana:', sol.length);

  const headers = {
    Authorization: 'Bearer ' + CIRCLE_API_KEY,
    'Content-Type': 'application/json',
  };

  const circle = async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    return { ok: res.ok, status: res.status, body: parsed };
  };

  // EVM: Patch existing subscription
  const evmSubId = '91117900-4438-4d63-a36c-563d00bf43a6';
  console.log('\nPatching EVM subscription', evmSubId, 'with', evm.length, 'addresses...');

  const { ok, body: result, status } = await circle('PATCH', '/v2/notifications/subscriptions/permissionless/' + evmSubId, {
    endpoint: 'https://pay.riftlabs.xyz/api/webhooks/circle-gateway',
    name: 'Gateway Webhooks EVM',
    enabled: true,
    environment: 'TEST',
    notificationTypes: ['gateway.deposit.finalized'],
    addresses: evm,
    domains: ['2', '3', '6', '7'],
  });
  console.log('EVM PATCH: HTTP', status, '|', result.message || 'OK');
  if (result.data) {
    console.log('  addresses:', result.data.addresses?.length, 'domains:', result.data.domains?.join(','));
  }

  // If the full batch failed, try incremental patches
  if (!ok) {
    console.log('Full batch failed, trying incremental...');
    const batchSize = 20;
    for (let i = 0; i < evm.length; i += batchSize) {
      const batch = evm.slice(i, i + batchSize);
      const r = await circle('PATCH', '/v2/notifications/subscriptions/permissionless/' + evmSubId, {
        endpoint: 'https://pay.riftlabs.xyz/api/webhooks/circle-gateway',
        name: 'Gateway Webhooks EVM',
        enabled: true,
        environment: 'TEST',
        notificationTypes: ['gateway.deposit.finalized'],
        addresses: batch,
        domains: ['2', '3', '6', '7'],
      });
      console.log('  Batch', Math.floor(i / batchSize) + 1, '(' + batch.length + ' addrs): HTTP', r.status, '|', r.body.message || 'OK');
    }
  }

  // Solana
  console.log('\nSetting up Solana subscription...');
  const solPayload = {
    endpoint: 'https://pay.riftlabs.xyz/api/webhooks/circle-gateway/solana',
    name: 'Gateway Webhooks Solana',
    enabled: true,
    environment: 'TEST',
    notificationTypes: ['gateway.deposit.finalized'],
    addresses: sol,
    domains: ['5'],
  };

  const { body: subs } = await circle('GET', '/v2/notifications/subscriptions/permissionless?environment=TEST');
  const existingSol = (subs.data || []).find(s => s.endpoint === 'https://pay.riftlabs.xyz/api/webhooks/circle-gateway/solana');
  let solSubId = null;

  if (existingSol) {
    console.log('Patching existing Solana sub', existingSol.id, '...');
    const r = await circle('PATCH', '/v2/notifications/subscriptions/permissionless/' + existingSol.id, solPayload);
    console.log('Sol PATCH: HTTP', r.status, '|', r.body.message || 'OK');
    if (r.ok) solSubId = existingSol.id;
  } else {
    console.log('Creating new Solana sub...');
    const r = await circle('POST', '/v2/notifications/subscriptions/permissionless', solPayload);
    console.log('Sol POST: HTTP', r.status, '|', r.body.data?.id || r.body.message || JSON.stringify(r.body));
    if (r.ok && r.body.data?.id) {
      solSubId = r.body.data.id;
    }
  }

  // Solana fallback: if full batch fails, try incremental
  if (!solSubId) {
    console.log('Full Solana batch failed, trying incremental...');
    const batchSize = 20;
    for (let i = 0; i < sol.length; i += batchSize) {
      const batch = sol.slice(i, i + batchSize);
      const r = await circle('POST', '/v2/notifications/subscriptions/permissionless', {
        ...solPayload,
        addresses: batch,
      });
      console.log('  Sol batch', Math.floor(i / batchSize) + 1, '(' + batch.length + ' addrs): HTTP', r.status, '|', r.body.data?.id || r.body.message || JSON.stringify(r.body).slice(0,100));
    }
  }

  console.log('\nDone.');
  if (solSubId) console.log('Solana subscription ID:', solSubId);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
