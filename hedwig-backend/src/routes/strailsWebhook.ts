import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { createLogger } from '../utils/logger';

const logger = createLogger('StrailsWebhook');
const router = Router();

const STRAILS_WEBHOOK_SECRET = process.env.STRAILS_WEBHOOK_SECRET || '';

// ─── Webhook Verification ─────────────────────────────────────────────────────

function verifySignature(req: Request): boolean {
  if (!STRAILS_WEBHOOK_SECRET) {
    logger.warn('STRAILS_WEBHOOK_SECRET not set — skipping signature verification');
    return true;
  }

  const signature = req.headers['x-strails-signature'] as string;
  const timestamp = req.headers['x-strails-timestamp'] as string;

  if (!signature || !timestamp) {
    logger.warn('Missing webhook signature headers', {
      hasSignature: Boolean(signature),
      hasTimestamp: Boolean(timestamp),
    });
    return false;
  }

  const payload = JSON.stringify(req.body);
  const expected = crypto
    .createHmac('sha256', STRAILS_WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  if (signature !== expected) {
    logger.warn('Invalid webhook signature');
    return false;
  }

  return true;
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

async function handleDepositReceived(payload: any) {
  const { depositId, virtualAccount, deposit, depositor } = payload;

  logger.info('Deposit received on user VA', {
    depositId,
    accountNumber: virtualAccount?.accountNumber,
    amount: deposit?.amount,
    depositor: depositor?.name,
  });
}

async function handleDepositFundingCompleted(payload: any) {
  const { depositId, amount, currency, transactionHash } = payload;

  logger.info('Deposit funding completed', {
    depositId,
    amount,
    currency,
    transactionHash,
  });
}

async function handleVirtualAccountCreated(payload: any) {
  const { vaId, accountNumber, bankName, accountName } = payload;

  logger.info('Virtual account created', {
    vaId,
    accountNumber,
    bankName,
    accountName,
  });
}

async function handleOfframpCompleted(payload: any) {
  const { amount, currency, bankAccount, payoutDetails } = payload;

  logger.info('Offramp completed', {
    amount,
    currency,
    bankAccount: bankAccount?.accountNumber,
    payoutRef: payoutDetails?.reference,
  });

  // Update any pending payout records
}

async function handleOfframpFailed(payload: any) {
  const { amount, currency, bankAccount, error: err } = payload;

  logger.error('Offramp failed', {
    amount,
    currency,
    bankAccount: bankAccount?.accountNumber,
    error: err?.message || err,
  });
}

async function handleWalletFundingCompleted(payload: any) {
  const { walletAddress, amount, transactionHash } = payload;

  logger.info('Wallet funding completed', {
    walletAddress,
    amount,
    transactionHash,
  });

  // cNGN has been minted to the wallet
  // If autoSwap was enabled, USDC will follow
}

// ─── Route ────────────────────────────────────────────────────────────────────

const EVENT_HANDLERS: Record<string, (payload: any) => Promise<void>> = {
  'fintech.user.deposit.received': handleDepositReceived,
  'fintech.user.deposit.funding.completed': handleDepositFundingCompleted,
  'virtual.account.created': handleVirtualAccountCreated,
  'wallet.funding.completed': handleWalletFundingCompleted,
  'fintech.offramp.completed': handleOfframpCompleted,
  'fintech.offramp.failed': handleOfframpFailed,
  'vault.return.payout.completed': handleOfframpCompleted,
  'vault.return.payout.failed': handleOfframpFailed,
  'fintech.virtual_account.deposit.received': handleDepositReceived,
};

/**
 * POST /api/webhooks/strails
 * Receives webhook events from Strails.
 * Verifies HMAC signature (if STRAILS_WEBHOOK_SECRET is configured).
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Verify signature
    if (STRAILS_WEBHOOK_SECRET && !verifySignature(req)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const eventType = req.headers['x-strails-event'] as string
      || req.body?.eventType
      || req.body?.type;

    const payload = req.body?.payload || req.body?.data || req.body;

    logger.info('Strails webhook received', {
      eventType,
      eventId: req.headers['x-webhook-id'] || req.body?.eventId,
    });

    // Acknowledge immediately
    res.status(200).json({ received: true });

    // Process asynchronously
    if (eventType && EVENT_HANDLERS[eventType]) {
      EVENT_HANDLERS[eventType](payload).catch((err) => {
        logger.error('Failed to process webhook event', {
          eventType,
          error: (err as Error).message,
        });
      });
    } else {
      logger.info('Unhandled Strails webhook event', { eventType });
    }
  } catch (error: any) {
    logger.error('Error processing Strails webhook', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
