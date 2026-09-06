import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { emitFinancialEvent, computeEventFingerprint } from '../services/financial-events';
import { resolveRequestIdentity, ownerScope } from '../utils/identity';

const router = Router();
const logger = createLogger('X402');

/**
 * x402 inflow (USDC on Base) — Nche port.
 * Receipts are idempotent on tx_hash; the ledger lives in financial_events
 * (`x402.payment.received`), not a parallel ledger table.
 */

router.post('/receipts', authenticate, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const txHash: string | undefined = b.tx_hash ?? b.txHash;
  const amount = b.amount;
  const payer: string | undefined = b.payer_address ?? b.payerAddress ?? b.payer;
  const recipient: string | undefined = b.recipient_address ?? b.recipientAddress;
  if (!txHash || amount === undefined || !payer || !recipient) {
    return res.status(400).json({ error: 'tx_hash, amount, payer_address, recipient_address required' });
  }
  const identity = await resolveRequestIdentity(req);
  const wsId = b.workspace_id ?? identity.workspaceId;

  const { data: existing } = await supabase
    .from('x402_receipts')
    .select('id')
    .eq('tx_hash', txHash)
    .maybeSingle();
  if (existing) return res.json({ success: true, data: existing, duplicate: true });

  const fingerprint = computeEventFingerprint('x402.payment.received', 'x402_receipt', txHash, txHash);
  const { data: receipt, error } = await supabase
    .from('x402_receipts')
    .insert({
      user_id: identity.internalId,
      workspace_id: wsId,
      payer_address: payer,
      recipient_address: recipient,
      amount,
      chain: b.chain ?? 'base',
      tx_hash: txHash,
      settlement: b.settlement ?? null,
      ledger_event_fingerprint: fingerprint,
    })
    .select('*')
    .single();
  if (error) throw error;

  // Fire-and-forget ledger emission (never breaks the receipt write).
  emitFinancialEvent({
    userId: identity.internalId,
    workspaceId: wsId,
    eventType: 'x402.payment.received',
    entityType: 'x402_receipt',
    entityId: receipt.id,
    version: txHash,
    amount,
    currency: 'USDC',
    direction: 'in',
    source: 'x402',
    payload: { payer_address: payer, recipient_address: recipient, tx_hash: txHash, chain: receipt.chain },
  }).catch((err) => logger.warn('x402 ledger emission failed', { err }));

  return res.status(201).json({ success: true, data: receipt, duplicate: false });
});

router.get('/receipts', authenticate, async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const { data, error } = await supabase
    .from('x402_receipts')
    .select('*')
    .in('user_id', ownerScope(identity))
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return res.json({ success: true, data });
});

export default router;
