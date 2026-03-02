import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { bridgeUsdService } from '../services/bridgeUsd';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
const router = Router();

type UsdAccountRow = {
    id: string;
    user_id: string;
    bridge_customer_id: string | null;
    bridge_virtual_account_id: string | null;
    bridge_kyc_status: string;
    provider_status: string;
    ach_account_number_masked: string | null;
    ach_routing_number_masked: string | null;
    bank_name: string | null;
    settlement_chain: string;
    settlement_token: string;
    feature_enabled: boolean;
    created_at: string;
    updated_at: string;
};

const getUsdAccountByUser = async (userId: string): Promise<UsdAccountRow | null> => {
    const { data, error } = await supabase
        .from('user_usd_accounts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw new Error(`Failed to fetch USD account: ${error.message}`);
    return data as UsdAccountRow | null;
};

const ensureUsdAccountRow = async (userId: string): Promise<UsdAccountRow> => {
    const existing = await getUsdAccountByUser(userId);
    if (existing) return existing;

    const { data, error } = await supabase
        .from('user_usd_accounts')
        .insert({
            user_id: userId,
            bridge_kyc_status: 'not_started',
            provider_status: 'not_started',
            feature_enabled: false,
            settlement_chain: 'BASE',
            settlement_token: 'USDC',
        })
        .select('*')
        .single();

    if (error) throw new Error(`Failed to create USD account row: ${error.message}`);
    return data as UsdAccountRow;
};

/**
 * GET /api/usd-accounts/status
 */
router.get('/status', authenticate, async (req: Request, res: Response, next) => {
    try {
        const authUserId = req.user!.id;
        const user = await getOrCreateUser(authUserId);

        const enabledForUser = bridgeUsdService.isEnabledForUser(user.id);
        const usdAccount = await getUsdAccountByUser(user.id);

        res.json({
            success: true,
            data: {
                diditKycStatus: user.kyc_status || 'not_started',
                bridgeKycStatus: usdAccount?.bridge_kyc_status || 'not_started',
                accountStatus: usdAccount?.provider_status || 'not_started',
                featureEnabled: enabledForUser && (usdAccount?.feature_enabled || false),
                settlementChain: usdAccount?.settlement_chain || 'BASE',
                settlementToken: usdAccount?.settlement_token || 'USDC',
                feeConfig: bridgeUsdService.getFeeConfig(),
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/usd-accounts/enroll
 */
router.post('/enroll', authenticate, async (req: Request, res: Response, next) => {
    try {
        const authUserId = req.user!.id;
        const user = await getOrCreateUser(authUserId);

        if (!bridgeUsdService.isEnabledForUser(user.id)) {
            res.status(403).json({
                success: false,
                error: { message: 'USD accounts are not enabled for this user' },
            });
            return;
        }

        if (user.kyc_status !== 'approved') {
            res.status(403).json({
                success: false,
                error: { message: 'Didit KYC must be approved before enrolling for USD accounts' },
                kycRequired: true,
                diditKycStatus: user.kyc_status || 'not_started',
            });
            return;
        }

        const account = await ensureUsdAccountRow(user.id);

        let bridgeCustomerId = account.bridge_customer_id;
        if (!bridgeCustomerId) {
            const bridgeCustomer = await bridgeUsdService.createOrGetCustomer({
                externalUserId: user.id,
                email: user.email || null,
                firstName: user.first_name || null,
                lastName: user.last_name || null,
            });
            bridgeCustomerId = bridgeCustomer.id;

            const { error: updateError } = await supabase
                .from('user_usd_accounts')
                .update({
                    bridge_customer_id: bridgeCustomerId,
                    bridge_kyc_status: bridgeCustomer.kycStatus || 'pending',
                    provider_status: bridgeCustomer.status || 'pending_kyc',
                })
                .eq('id', account.id);
            if (updateError) {
                throw new Error(`Failed to update USD account: ${updateError.message}`);
            }
        }

        const refreshed = await getUsdAccountByUser(user.id);

        res.json({
            success: true,
            data: {
                bridgeCustomerId,
                diditKycStatus: user.kyc_status,
                bridgeKycStatus: refreshed?.bridge_kyc_status || 'pending',
                accountStatus: refreshed?.provider_status || 'pending_kyc',
                nextAction: 'complete_bridge_kyc',
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/usd-accounts/kyc-link
 */
router.post('/kyc-link', authenticate, async (req: Request, res: Response, next) => {
    try {
        const authUserId = req.user!.id;
        const user = await getOrCreateUser(authUserId);
        const account = await ensureUsdAccountRow(user.id);

        if (!account.bridge_customer_id) {
            res.status(400).json({
                success: false,
                error: { message: 'USD account not enrolled yet. Call /enroll first.' },
            });
            return;
        }

        const link = await bridgeUsdService.createKycLink(account.bridge_customer_id);
        if (!link.url) {
            res.status(502).json({
                success: false,
                error: { message: 'Provider did not return a KYC URL' },
            });
            return;
        }

        res.json({
            success: true,
            data: link,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/usd-accounts/details
 */
router.get('/details', authenticate, async (req: Request, res: Response, next) => {
    try {
        const authUserId = req.user!.id;
        const user = await getOrCreateUser(authUserId);
        const account = await ensureUsdAccountRow(user.id);

        if (!bridgeUsdService.isEnabledForUser(user.id)) {
            res.status(403).json({
                success: false,
                error: { message: 'USD accounts are not enabled for this user' },
            });
            return;
        }

        if (user.kyc_status !== 'approved') {
            res.status(403).json({
                success: false,
                error: { message: 'Didit KYC not approved' },
                kycRequired: true,
            });
            return;
        }

        if (!account.bridge_customer_id) {
            res.status(400).json({
                success: false,
                error: { message: 'USD account not enrolled yet' },
            });
            return;
        }

        const bridgeCustomer = await bridgeUsdService.getCustomer(account.bridge_customer_id);
        const bridgeKycStatus = bridgeCustomer.kycStatus || account.bridge_kyc_status || 'pending';
        const providerStatus = bridgeCustomer.status || account.provider_status || 'pending_kyc';

        const isBridgeApproved = bridgeKycStatus.toLowerCase() === 'approved';

        let virtualAccountId = account.bridge_virtual_account_id;
        let accountNumberMasked = account.ach_account_number_masked;
        let routingNumberMasked = account.ach_routing_number_masked;
        let bankName = account.bank_name;
        let enabled = account.feature_enabled;

        if (isBridgeApproved) {
            const virtualAccount = await bridgeUsdService.getOrCreateAchAccount(account.bridge_customer_id);
            virtualAccountId = virtualAccount.id;
            accountNumberMasked = virtualAccount.accountNumberMasked;
            routingNumberMasked = virtualAccount.routingNumberMasked;
            bankName = virtualAccount.bankName;
            enabled = true;
        }

        const { error: updateError } = await supabase
            .from('user_usd_accounts')
            .update({
                bridge_kyc_status: bridgeKycStatus,
                provider_status: providerStatus,
                bridge_virtual_account_id: virtualAccountId,
                ach_account_number_masked: accountNumberMasked,
                ach_routing_number_masked: routingNumberMasked,
                bank_name: bankName,
                feature_enabled: enabled,
            })
            .eq('id', account.id);
        if (updateError) {
            throw new Error(`Failed to update USD account details: ${updateError.message}`);
        }

        res.json({
            success: true,
            data: {
                bridgeCustomerId: account.bridge_customer_id,
                bridgeVirtualAccountId: virtualAccountId,
                diditKycStatus: user.kyc_status || 'not_started',
                bridgeKycStatus,
                accountStatus: providerStatus,
                featureEnabled: enabled,
                ach: {
                    bankName,
                    accountNumberMasked: accountNumberMasked,
                    routingNumberMasked: routingNumberMasked,
                    rail: 'ACH',
                    currency: 'USD',
                },
                settlement: {
                    chain: account.settlement_chain || 'BASE',
                    token: account.settlement_token || 'USDC',
                    destination: user.ethereum_wallet_address || null,
                },
                feeConfig: bridgeUsdService.getFeeConfig(),
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/usd-accounts/transfers
 */
router.get('/transfers', authenticate, async (req: Request, res: Response, next) => {
    try {
        const authUserId = req.user!.id;
        const user = await getOrCreateUser(authUserId);

        const { data, error } = await supabase
            .from('bridge_usd_transfers')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw new Error(`Failed to fetch USD transfers: ${error.message}`);

        const transfers = (data || []).map((item) => ({
            id: item.id,
            bridgeTransferId: item.bridge_transfer_id,
            status: item.status,
            grossUsd: item.usd_amount_gross,
            hedwigFeeUsd: item.hedwig_fee_usd,
            providerFeeUsd: item.provider_fee_usd,
            netUsd: item.usd_amount_net,
            usdcAmountSettled: item.usdc_amount_settled,
            usdcTxHash: item.usdc_tx_hash,
            createdAt: item.created_at,
            completedAt: item.completed_at,
        }));

        res.json({
            success: true,
            data: {
                transfers,
                feeConfig: bridgeUsdService.getFeeConfig(),
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
