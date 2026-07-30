/**
 * One-time backfill: compute converted_amount_usd for existing
 * imported_transactions and expenses using the live Frankfurter API
 * (same convertToUsd path as the rest of the app).
 *
 * Picks up records missed by the approximate SQL migration (fx_source = 'backfill-2026-07')
 * and re-converts them with live exchange rates.
 *
 * Usage: npx tsx scripts/backfill-converted-amounts.ts
 */
import { supabase } from '../src/lib/supabase';
import { convertToUsd, getRate } from '../src/services/currency';

async function main() {
  console.log('Backfilling converted amounts via Frankfurter API...');

  // ── 1. imported_transactions ──
  // Include both null converted_amount_usd AND records tagged by the SQL migration
  const { data: txns, error: txnErr } = await supabase
    .from('imported_transactions')
    .select('id, amount, currency')
    .neq('currency', 'USD')
    .not('currency', 'is', null)
    .or('converted_amount_usd.is.null,fx_source.eq.backfill-2026-07');

  if (txnErr) { console.error('Failed to query imported_transactions:', txnErr); process.exit(1); }

  console.log(`Found ${txns?.length || 0} imported_transactions to backfill.`);

  for (const txn of txns || []) {
    try {
      const usd = await convertToUsd(Number(txn.amount), txn.currency as string);
      let rate: number | null = null;
      try { rate = await getRate('USD', txn.currency as string); } catch { /* skip */ }
      const { error: updErr } = await supabase
        .from('imported_transactions')
        .update({ converted_amount_usd: usd, fx_rate: rate, fx_source: 'frankfurter-live' })
        .eq('id', txn.id);
      if (updErr) console.error(`  Failed to update ${txn.id}:`, updErr);
      else console.log(`  Updated ${txn.id}: ${txn.amount} ${txn.currency} → $${usd.toFixed(2)}`);
    } catch (e) {
      console.error(`  Failed to convert ${txn.id} (${txn.amount} ${txn.currency}):`, e);
    }
  }

  // ── 2. expenses (re-convert all non-USD with live rates) ──
  const { data: exps, error: expErr } = await supabase
    .from('expenses')
    .select('id, amount, currency')
    .neq('currency', 'USD')
    .not('currency', 'is', null);

  if (expErr) { console.error('Failed to query expenses:', expErr); process.exit(1); }

  console.log(`\nFound ${exps?.length || 0} expenses to backfill.`);

  for (const exp of exps || []) {
    try {
      const usd = await convertToUsd(Number(exp.amount), exp.currency as string);
      const { error: updErr } = await supabase
        .from('expenses')
        .update({ converted_amount_usd: usd })
        .eq('id', exp.id);
      if (updErr) console.error(`  Failed to update expense ${exp.id}:`, updErr);
      else console.log(`  Updated expense ${exp.id}: ${exp.amount} ${exp.currency} → $${usd.toFixed(2)}`);
    } catch (e) {
      console.error(`  Failed to convert expense ${exp.id} (${exp.amount} ${exp.currency}):`, e);
    }
  }

  console.log('\nDone.');
}

main();
