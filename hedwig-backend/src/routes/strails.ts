import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { supabase } from '../lib/supabase';
import StrailsService from '../services/strails';
import { createLogger } from '../utils/logger';

const logger = createLogger('StrailsRoutes');
const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanBVN(bvn: string): string {
  return bvn.replace(/\D/g, '');
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/strails/onboard
 * Onboard the authenticated user with BVN verification.
 * Stores the Strails userId on the user record.
 *
 * Body: { bvn: string (11 digits) }
 */
router.post('/onboard', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) {
      res.status(404).json({ error: { message: 'User not found' } });
      return;
    }

    const bvn = cleanBVN(req.body?.bvn || '');
    if (bvn.length !== 11) {
      res.status(400).json({ error: { message: 'BVN must be 11 digits' } });
      return;
    }

    // Don't allow re-onboarding if already verified
    if (user.strails_user_id) {
      const details = await StrailsService.getUserDetails(user.strails_user_id).catch(() => null);
      if (details?.isActive) {
        res.json({
          success: true,
          data: {
            strailsUserId: user.strails_user_id,
            status: 'active',
            virtualAccount: details.virtualAccounts?.[0] || null,
          },
        });
        return;
      }
    }

    const result = await StrailsService.onboardUser(bvn);

    // Store the userHash immediately so we can poll later
    if (result.userHash) {
      await supabase.from('users').update({
        strails_user_id: result.userHash,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
    }

    res.json({
      success: true,
      data: {
        requestId: result.requestId,
        strailsUserId: result.userHash,
        status: result.status,
      },
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/strails/onboard-status
 * Poll the status of BVN verification onboarding.
 *
 * Body: { requestId: string }
 */
router.post('/onboard-status', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { requestId } = req.body || {};
    if (!requestId) {
      res.status(400).json({ error: { message: 'requestId is required' } });
      return;
    }

    const status = await StrailsService.checkOnboardStatus(requestId);

    // If completed, fetch user details to get VA info
    let virtualAccount = null;
    if (status.status === 'completed' && status.userId) {
      const privyId = req.user!.id;
      const user = await getOrCreateUser(privyId);
      if (user) {
        try {
          const details = await StrailsService.getUserDetails(status.userId);
          const va = details.virtualAccounts?.[0];
          if (va) {
            virtualAccount = va;
            await supabase.from('users').update({
              strails_va_number: va.accountNumber,
              strails_va_bank: va.bankName,
              strails_va_holder: va.accountName,
              strails_onboarded_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', user.id);
          }
        } catch (err) {
          logger.warn('Failed to fetch user details after onboarding', { error: (err as Error).message });
        }
      }
    }

    res.json({
      success: true,
      data: {
        status: status.status,
        strailsUserId: status.userId,
        virtualAccount,
      },
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/strails/virtual-account
 * Get the authenticated user's Strails virtual account details.
 * Uses stored strails_user_id to fetch fresh data from Strails.
 */
router.get('/virtual-account', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) {
      res.status(404).json({ error: { message: 'User not found' } });
      return;
    }

    if (!user.strails_user_id) {
      res.json({ success: true, data: { onboarded: false, virtualAccount: null } });
      return;
    }

    let details;
    try {
      details = await StrailsService.getUserDetails(user.strails_user_id);
    } catch {
      res.json({ success: true, data: { onboarded: true, virtualAccount: null, error: 'Failed to fetch from Strails' } });
      return;
    }

    res.json({
      success: true,
      data: {
        onboarded: true,
        strailsUserId: user.strails_user_id,
        isActive: details.isActive,
        virtualAccount: details.virtualAccounts?.[0] || null,
        wallets: details.walletDetails || null,
      },
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/strails/invoice-va
 * Create a temporary virtual account for an invoice payment.
 * The client pays NGN to this VA → auto-converts to USDC on Base.
 *
 * Body: { invoiceId: string, amount: number (NGN) }
 */
router.post('/invoice-va', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) {
      res.status(404).json({ error: { message: 'User not found' } });
      return;
    }

    const { invoiceId, amount } = req.body || {};
    if (!invoiceId || !amount || amount <= 0) {
      res.status(400).json({ error: { message: 'invoiceId and valid amount are required' } });
      return;
    }

    // Verify the invoice belongs to this user
    const { data: document } = await supabase
      .from('documents')
      .select('id, user_id')
      .eq('id', invoiceId)
      .single();

    if (!document || document.user_id !== user.id) {
      res.status(404).json({ error: { message: 'Invoice not found' } });
      return;
    }

    // Use the fintech VA or create a new user-level onramp
    // For invoice payments, we create a temp VA using the authenticated user's Strails ID
    // If the user hasn't been onboarded yet, we can't create one
    if (!user.strails_user_id) {
      res.status(400).json({
        error: {
          message: 'You must complete Strails onboarding to accept NGN payments.',
          code: 'STRAILS_NOT_ONBOARDED',
        },
      });
      return;
    }

    const result = await StrailsService.createOnrampVirtualAccount({
      userId: user.strails_user_id,
      amount,
      assetSwap: 'USDC',
      autoSwap: true,
      sweepToOfframp: true,
    });

    // Get the virtual account details
    let vaDetails;
    try {
      vaDetails = await StrailsService.getVirtualAccount(result.requestId);
    } catch (err) {
      logger.warn('Could not immediately fetch VA details', { requestId: result.requestId });
    }

    // Store the VA info on the document
    const va = vaDetails?.virtualAccount;
    await supabase.from('documents').update({
      strails_request_id: result.requestId,
      strails_va_number: va?.accountNumber || null,
      strails_va_bank: va?.bankName || null,
      strails_va_holder: va?.accountName || null,
      strails_va_amount: amount,
      strails_va_fees: va?.totalAmountWithFee ? va.totalAmountWithFee - amount : null,
    }).eq('id', invoiceId);

    res.json({
      success: true,
      data: {
        requestId: result.requestId,
        walletAddress: result.walletAddress,
        status: result.status,
        feeBreakdown: result.feeBreakdown,
        virtualAccount: va || null,
      },
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/strails/invoice-va/:requestId
 * Get the VA details and payment status for an invoice's virtual account.
 */
router.get('/invoice-va/:requestId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { requestId } = req.params as { requestId: string };

    const vaDetails = await StrailsService.getVirtualAccount(requestId);

    // Also grab the document that has this requestId
    const { data: document } = await supabase
      .from('documents')
      .select('id, status, amount, strails_va_number, strails_va_amount')
      .eq('strails_request_id', requestId)
      .maybeSingle();

    res.json({
      success: true,
      data: {
        virtualAccount: vaDetails.virtualAccount,
        walletAddress: vaDetails.walletAddress,
        status: vaDetails.status,
        invoice: document || null,
      },
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/strails/offramp
 * Initiate an offramp (cNGN → NGN bank account) for payroll payout.
 *
 * Body: { userId: string, amount: number, accountNumber: string, bankCode: string }
 */
router.post('/offramp', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) {
      res.status(404).json({ error: { message: 'User not found' } });
      return;
    }

    const { userId, amount, accountNumber, bankCode } = req.body || {};

    if (!userId || !amount || amount <= 0 || !accountNumber || !bankCode) {
      res.status(400).json({
        error: { message: 'userId, amount, accountNumber, and bankCode are required' },
      });
      return;
    }

    // Look up the recipient's Strails userId
    const { data: recipient } = await supabase
      .from('users')
      .select('id, strails_user_id, first_name, last_name')
      .eq('id', userId)
      .single();

    if (!recipient?.strails_user_id) {
      res.status(400).json({
        error: { message: 'Recipient has not completed Strails onboarding yet' },
      });
      return;
    }

    const result = await StrailsService.offramp({
      userId: recipient.strails_user_id,
      amount,
      accountNumber,
      bankCode,
    });

    res.json({
      success: true,
      data: {
        requestId: result.requestId,
        status: result.status,
        stage: result.stage,
      },
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;
