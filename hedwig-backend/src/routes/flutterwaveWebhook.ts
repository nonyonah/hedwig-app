import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import flutterwave from '../services/flutterwave';
import { emitFinancialEvent } from '../services/financial-events';

const logger = createLogger('FlutterwaveWebhook');
const router = Router();

/**
 * POST /api/webhooks/flutterwave
 *
 * Verifies `verif-hash`, answers 200 immediately per Flutterwave's contract
 * (60s timeout, 3 retries @ 30min), and processes asynchronously.
 * - charge.completed (bank_transfer, successful): credit the matched NGN
 *   virtual_accounts row (by provider flw_ref, idempotent), emit a deposit
 *   financial event keyed on flw_ref.
 * - transfer.completed: informational timeline log for payouts.
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  if (!flutterwave.verifyWebhookSignature(req.headers['verif-hash'])) {
    res.status(401).end();
    return;
  }
  const body = req.body ?? {};
  // Acknowledge first; process after the response is on its way.
  res.status(200).end();

  setImmediate(async () => {
    try {
      const event = String(body.event ?? '');
      const data = (body.data ?? {}) as Record<string, unknown>;

      if (event === 'charge.completed' && String(data.status ?? '').toLowerCase() === 'successful') {
        const flwRef = String(data.flw_ref ?? '');
        const txRef = String(data.tx_ref ?? '');
        const amount = Number(data.amount ?? 0);
        const currency = String(data.currency ?? 'NGN').toUpperCase();
        if (!flwRef || !Number.isFinite(amount) || amount <= 0) return;

        // Match the inflow to a provisioned NGN row. Static accounts receive
        // fresh flw_ref/tx_ref per inflow, so resolve via customer email
        // first, falling back to the creation references.
        const customer = (data.customer ?? {}) as Record<string, unknown>;
        const customerEmail = String(customer.email ?? '').toLowerCase().trim();
        let match: Record<string, unknown> | null = null;
        if (customerEmail) {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .ilike('email', customerEmail)
            .maybeSingle();
          if (user) {
            const { data: row } = await supabase
              .from('virtual_accounts')
              .select('*')
              .eq('user_id', (user as { id: string }).id)
              .eq('currency', 'NGN')
              .eq('provider', 'flutterwave')
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            match = (row as Record<string, unknown> | null) ?? null;
          }
        }
        if (!match) {
          const { data: rows } = await supabase
            .from('virtual_accounts')
            .select('*')
            .eq('currency', 'NGN')
            .eq('provider', 'flutterwave')
            .eq('status', 'active');
          match =
            ((rows ?? []).find(
              (r) => r.provider_ref === flwRef || (txRef && r.provider_ref === txRef)
            ) as Record<string, unknown> | undefined) ?? null;
        }
        if (!match) {
          logger.warn('VA inflow matched no account', { flwRef, txRef });
          return;
        }

        const newBalance = Number(match.balance ?? 0) + amount;
        let newBalanceUsd = Number(match.balance_usd ?? 0);
        try {
          const { convertToUsd } = await import('../services/currency');
          newBalanceUsd += await convertToUsd(amount, currency);
        } catch {
          // keep the cached USD snapshot on FX failure
        }
        await supabase
          .from('virtual_accounts')
          .update({ balance: newBalance, balance_usd: newBalanceUsd, updated_at: new Date().toISOString() })
          .eq('id', match.id);

        // Idempotent ledger emission keyed on the Flutterwave session id.
        await emitFinancialEvent({
          userId: match.user_id as string,
          workspaceId: (match.workspace_id as string) ?? null,
          eventType: 'wallet.deposit.received',
          entityType: 'flutterwave_inflow',
          entityId: flwRef,
          version: flwRef,
          amount,
          currency,
          direction: 'in',
          source: 'flutterwave',
          payload: {
            flw_ref: flwRef,
            tx_ref: txRef,
            account_id: match.id,
            originator: (body.meta_data as Record<string, unknown> | undefined)?.originatorname ?? null,
          },
        });
        logger.info('VA inflow credited', { flwRef, amount, currency });
        return;
      }

      if (event === 'transfer.completed') {
        logger.info('transfer webhook', {
          reference: String(data.reference ?? ''),
          status: String(data.status ?? ''),
          amount: data.amount ?? null,
        });
      }
    } catch (err) {
      logger.warn('webhook processing failed', { message: err instanceof Error ? err.message : String(err) });
    }
  });
}));

export default router;
