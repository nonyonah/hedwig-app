import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { supabase } from '../lib/supabase';
import PaycrestService from '../services/paycrest';

const router = Router();

const SUPPORTED_CURRENCIES = ['NGN', 'KES', 'UGX', 'TZS', 'MWK', 'BRL'];

/**
 * GET /user/settlement-preferences
 */
router.get('/settlement-preferences', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    res.json({
      success: true,
      data: {
        autoSettle: user.auto_settle || false,
        bankAccount: user.auto_settle_bank_account || null,
        supportedCurrencies: SUPPORTED_CURRENCIES,
      },
    });
  } catch (error) { next(error); }
});

/**
 * POST /user/settlement-preferences
 */
router.post('/settlement-preferences', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const { autoSettle, bankAccount } = req.body;

    if (autoSettle === true) {
      if (!bankAccount) {
        res.status(400).json({ error: 'Bank account required when auto-settlement is enabled', code: 'BANK_ACCOUNT_REQUIRED' }); return;
      }
      if (!SUPPORTED_CURRENCIES.includes((bankAccount.currency || '').toUpperCase())) {
        res.status(400).json({ error: 'Unsupported currency', code: 'UNSUPPORTED_CURRENCY' }); return;
      }

      // Verify the bank account
      const verifyResult = await PaycrestService.verifyBankAccount(
        bankAccount.institution,
        bankAccount.accountIdentifier,
        bankAccount.currency.toUpperCase()
      );
      if (!verifyResult.verified) {
        res.status(400).json({ error: 'Could not verify bank account', code: 'VERIFICATION_FAILED' }); return;
      }

      // Use resolved account name if provided by verify
      if (verifyResult.accountName && !bankAccount.accountName) {
        bankAccount.accountName = verifyResult.accountName;
      }
    }

    const { error } = await supabase
      .from('users')
      .update({
        auto_settle: autoSettle === true,
        auto_settle_bank_account: autoSettle === true ? bankAccount : null,
      })
      .eq('id', user.id);

    if (error) throw error;

    res.json({
      success: true,
      data: {
        autoSettle: autoSettle === true,
        bankAccount: autoSettle === true ? bankAccount : null,
      },
    });
  } catch (error) { next(error); }
});

export default router;
