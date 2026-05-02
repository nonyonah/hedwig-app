import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { BankAccountService, BankAccountInput, BankCountry } from '../services/bankAccount';
import { createLogger } from '../utils/logger';

const logger = createLogger('BankAccountRoutes');
const router = Router();

const SUPPORTED_COUNTRIES: BankCountry[] = ['NG', 'US', 'UK', 'GH'];

function isSupportedCountry(value: unknown): value is BankCountry {
    return typeof value === 'string' && (SUPPORTED_COUNTRIES as string[]).includes(value);
}

function parseInput(body: any): BankAccountInput | { error: string } {
    if (!isSupportedCountry(body?.country)) {
        return { error: 'country must be NG, US, UK, or GH' };
    }
    const accountTypeRaw = body.accountType ? String(body.accountType).toLowerCase() : null;
    const accountType = accountTypeRaw === 'checking' || accountTypeRaw === 'savings' ? accountTypeRaw : null;
    return {
        country: body.country,
        accountHolderName: String(body.accountHolderName || '').trim(),
        bankName: String(body.bankName || '').trim(),
        bankCode: body.bankCode ? String(body.bankCode) : null,
        accountNumber: body.accountNumber ? String(body.accountNumber) : null,
        routingNumber: body.routingNumber ? String(body.routingNumber) : null,
        sortCode: body.sortCode ? String(body.sortCode) : null,
        iban: body.iban ? String(body.iban) : null,
        swiftBic: body.swiftBic ? String(body.swiftBic) : null,
        accountType,
        showOnInvoice: body.showOnInvoice !== false,
        isDefault: typeof body.isDefault === 'boolean' ? body.isDefault : undefined,
    };
}

/**
 * GET /api/bank-account
 * Returns the authenticated user's bank accounts (default first).
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }
        const records = await BankAccountService.listByUserId(user.id);
        res.json({ success: true, data: { bankAccounts: records } });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bank-account/banks?country=NG
 */
router.get('/banks', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const country = String(req.query.country || '').toUpperCase();
        if (!isSupportedCountry(country)) {
            res.status(400).json({ success: false, error: { message: 'country must be NG, US, UK, or GH' } });
            return;
        }
        const banks = await BankAccountService.listBanks(country);
        res.json({ success: true, data: { country, banks } });
    } catch (error) {
        logger.warn('Bank list error', { error: error instanceof Error ? error.message : 'unknown' });
        next(error);
    }
});

/**
 * POST /api/bank-account/verify
 */
router.post('/verify', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { country, bankCode, accountNumber } = req.body || {};
        if (!isSupportedCountry(country)) {
            res.status(400).json({ success: false, error: { message: 'country must be NG, US, UK, or GH' } });
            return;
        }
        if (!bankCode || !accountNumber) {
            res.status(400).json({ success: false, error: { message: 'bankCode and accountNumber are required' } });
            return;
        }
        const result = await BankAccountService.resolveAccount({
            country,
            bankCode: String(bankCode),
            accountNumber: String(accountNumber).replace(/\D/g, ''),
        });
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/bank-account
 * Creates a new bank account. First account auto-becomes default.
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }
        const parsed = parseInput(req.body || {});
        if ('error' in parsed) {
            res.status(400).json({ success: false, error: { message: parsed.error } });
            return;
        }
        try {
            const record = await BankAccountService.create(user.id, parsed);
            res.json({ success: true, data: { bankAccount: record } });
        } catch (validationError) {
            const message = validationError instanceof Error ? validationError.message : 'Invalid bank account input';
            const isPaywall = /upgrade to pro/i.test(message);
            res.status(isPaywall ? 402 : 400).json({
                success: false,
                error: isPaywall
                    ? { code: 'requires_pro', message }
                    : { message },
            });
        }
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /api/bank-account/:id
 */
router.patch('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }
        const parsed = parseInput(req.body || {});
        if ('error' in parsed) {
            res.status(400).json({ success: false, error: { message: parsed.error } });
            return;
        }
        try {
            const record = await BankAccountService.update(user.id, String(req.params.id), parsed);
            res.json({ success: true, data: { bankAccount: record } });
        } catch (validationError) {
            res.status(400).json({
                success: false,
                error: { message: validationError instanceof Error ? validationError.message : 'Invalid bank account input' },
            });
        }
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/bank-account/:id/default
 */
router.post('/:id/default', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }
        const record = await BankAccountService.setDefault(user.id, String(req.params.id));
        res.json({ success: true, data: { bankAccount: record } });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/bank-account/:id
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }
        await BankAccountService.deleteById(user.id, String(req.params.id));
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export default router;
