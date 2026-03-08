import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';

const router = Router();

const isMissingColumnError = (error: any) => {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === '42703' || (message.includes('column') && message.includes('does not exist'));
};

const resolveInternalUserId = async (authUserId: string): Promise<string> => {
    const user = await getOrCreateUser(authUserId);
    return user.id;
};

/**
 * GET /api/beneficiaries
 * List user's saved beneficiaries
 */
router.get('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = await resolveInternalUserId(req.user!.id);

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
            bankCode: b.bank_code,
            bankName: b.bank_name,
            accountNumber: b.account_number,
            accountName: b.account_name,
            currency: b.currency,
            countryId: b.country_id,
            networkId: b.network_id,
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
        const userId = await resolveInternalUserId(req.user!.id);
        const {
            bankCode = null,
            bankName,
            accountNumber,
            accountName,
            currency = 'NGN',
            countryId = null,
            networkId = null,
            isDefault = false
        } = req.body;

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

        const basePayload = {
            user_id: userId,
            bank_name: bankName,
            account_number: accountNumber,
            account_name: accountName,
            currency,
            is_default: isDefault,
        };
        const extendedPayload = {
            ...basePayload,
            bank_code: bankCode,
            country_id: countryId,
            network_id: networkId,
        };

        const { data: existing, error: existingError } = await supabase
            .from('beneficiaries')
            .select('id')
            .eq('user_id', userId)
            .eq('account_number', accountNumber)
            .maybeSingle();

        if (existingError) {
            throw new Error(`Failed to check existing beneficiary: ${existingError.message}`);
        }

        let beneficiaryId: string | null = existing?.id || null;
        if (beneficiaryId) {
            const updateWithExtended = await supabase
                .from('beneficiaries')
                .update(extendedPayload)
                .eq('id', beneficiaryId)
                .eq('user_id', userId)
                .select('id')
                .single();

            if (updateWithExtended.error) {
                if (!isMissingColumnError(updateWithExtended.error)) {
                    throw new Error(`Failed to save beneficiary: ${updateWithExtended.error.message}`);
                }

                const updateWithBase = await supabase
                    .from('beneficiaries')
                    .update(basePayload)
                    .eq('id', beneficiaryId)
                    .eq('user_id', userId)
                    .select('id')
                    .single();

                if (updateWithBase.error) {
                    throw new Error(`Failed to save beneficiary: ${updateWithBase.error.message}`);
                }
                beneficiaryId = updateWithBase.data.id;
            } else {
                beneficiaryId = updateWithExtended.data.id;
            }
        } else {
            const insertWithExtended = await supabase
                .from('beneficiaries')
                .insert(extendedPayload)
                .select('id')
                .single();

            if (insertWithExtended.error) {
                if (!isMissingColumnError(insertWithExtended.error)) {
                    throw new Error(`Failed to save beneficiary: ${insertWithExtended.error.message}`);
                }

                const insertWithBase = await supabase
                    .from('beneficiaries')
                    .insert(basePayload)
                    .select('id')
                    .single();

                if (insertWithBase.error) {
                    throw new Error(`Failed to save beneficiary: ${insertWithBase.error.message}`);
                }
                beneficiaryId = insertWithBase.data.id;
            } else {
                beneficiaryId = insertWithExtended.data.id;
            }
        }

        if (!beneficiaryId) {
            throw new Error('Failed to save beneficiary: no beneficiary ID returned');
        }

        const { data: beneficiary, error } = await supabase
            .from('beneficiaries')
            .select('*')
            .eq('id', beneficiaryId)
            .eq('user_id', userId)
            .single();

        if (error) {
            throw new Error(`Failed to save beneficiary: ${error.message}`);
        }

        res.json({
            success: true,
            data: {
                beneficiary: {
                    id: beneficiary.id,
                    bankCode: beneficiary.bank_code,
                    bankName: beneficiary.bank_name,
                    accountNumber: beneficiary.account_number,
                    accountName: beneficiary.account_name,
                    currency: beneficiary.currency,
                    countryId: beneficiary.country_id,
                    networkId: beneficiary.network_id,
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
        const userId = await resolveInternalUserId(req.user!.id);
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
        const userId = await resolveInternalUserId(req.user!.id);
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
                    bankCode: beneficiary.bank_code,
                    bankName: beneficiary.bank_name,
                    accountNumber: beneficiary.account_number,
                    accountName: beneficiary.account_name,
                    currency: beneficiary.currency,
                    countryId: beneficiary.country_id,
                    networkId: beneficiary.network_id,
                    isDefault: beneficiary.is_default,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
