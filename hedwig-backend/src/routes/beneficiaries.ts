import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';

const router = Router();

/**
 * GET /api/beneficiaries
 * List user's saved beneficiaries
 */
router.get('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;

        const { data: beneficiaries, error } = await supabase
            .from('beneficiaries')
            .select('*')
            .eq('user_id', userId)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(`Failed to fetch beneficiaries: ${error.message}`);
        }

        const formatted = beneficiaries.map(b => ({
            id: b.id,
            bankName: b.bank_name,
            accountNumber: b.account_number,
            accountName: b.account_name,
            currency: b.currency,
            isDefault: b.is_default,
            createdAt: b.created_at,
        }));

        res.json({
            success: true,
            data: { beneficiaries: formatted },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/beneficiaries
 * Add a new beneficiary
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;
        const { bankName, accountNumber, accountName, currency = 'NGN', isDefault = false } = req.body;

        if (!bankName || !accountNumber || !accountName) {
            res.status(400).json({
                success: false,
                error: { message: 'bankName, accountNumber, and accountName are required' },
            });
            return;
        }

        // If setting as default, unset any existing defaults
        if (isDefault) {
            await supabase
                .from('beneficiaries')
                .update({ is_default: false })
                .eq('user_id', userId);
        }

        const { data: beneficiary, error } = await supabase
            .from('beneficiaries')
            .upsert({
                user_id: userId,
                bank_name: bankName,
                account_number: accountNumber,
                account_name: accountName,
                currency,
                is_default: isDefault,
            }, { onConflict: 'user_id,account_number' })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to save beneficiary: ${error.message}`);
        }

        res.json({
            success: true,
            data: {
                beneficiary: {
                    id: beneficiary.id,
                    bankName: beneficiary.bank_name,
                    accountNumber: beneficiary.account_number,
                    accountName: beneficiary.account_name,
                    currency: beneficiary.currency,
                    isDefault: beneficiary.is_default,
                    createdAt: beneficiary.created_at,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/beneficiaries/:id
 * Remove a beneficiary
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;

        const { error } = await supabase
            .from('beneficiaries')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            throw new Error(`Failed to delete beneficiary: ${error.message}`);
        }

        res.json({
            success: true,
            data: { message: 'Beneficiary deleted successfully' },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/beneficiaries/:id/default
 * Set a beneficiary as default
 */
router.put('/:id/default', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;

        // Unset all defaults first
        await supabase
            .from('beneficiaries')
            .update({ is_default: false })
            .eq('user_id', userId);

        // Set this one as default
        const { data: beneficiary, error } = await supabase
            .from('beneficiaries')
            .update({ is_default: true })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to set default: ${error.message}`);
        }

        res.json({
            success: true,
            data: {
                beneficiary: {
                    id: beneficiary.id,
                    bankName: beneficiary.bank_name,
                    accountNumber: beneficiary.account_number,
                    accountName: beneficiary.account_name,
                    currency: beneficiary.currency,
                    isDefault: beneficiary.is_default,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
