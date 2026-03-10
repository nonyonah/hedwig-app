import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { bridgeUsdService } from '../services/bridgeUsd';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { createLogger } from '../utils/logger';
const router = Router();
const logger = createLogger('UsdAccountsRoute');

type DepositSourceType = 'ACH' | 'EXTERNAL_ADDRESS' | 'UNKNOWN';

const resolveDepositSource = (rawPayload: any): { sourceType: DepositSourceType; sourceLabel: string } => {
    if (!rawPayload || typeof rawPayload !== 'object') {
        return { sourceType: 'UNKNOWN', sourceLabel: 'Unknown source' };
    }

    const payloadText = JSON.stringify(rawPayload).toLowerCase();
    const fromAddressLike =
        payloadText.includes('from_address') ||
        payloadText.includes('fromaddress') ||
        payloadText.includes('wallet_address') ||
        payloadText.includes('onchain') ||
        payloadText.includes('crypto');

    const achLike =
        payloadText.includes('ach') ||
        payloadText.includes('routing_number') ||
        payloadText.includes('bank_account') ||
        payloadText.includes('payment_rail') ||
        payloadText.includes('wire');

    if (fromAddressLike && !achLike) {
        return { sourceType: 'EXTERNAL_ADDRESS', sourceLabel: 'External address' };
    }
    if (achLike) {
        return { sourceType: 'ACH', sourceLabel: 'ACH transfer' };
    }

    return { sourceType: 'UNKNOWN', sourceLabel: 'Unknown source' };
};

const getUsdSettlementConfig = (params: {
    settlementChain: string | null | undefined;
    ethereumWalletAddress?: string | null;
    solanaWalletAddress?: string | null;
}) => {
    const normalizedChain = String(params.settlementChain || 'BASE').toUpperCase();
    if (normalizedChain === 'SOLANA') {
        return {
            chain: 'SOLANA',
            token: 'USDC',
            destinationAddress: params.solanaWalletAddress || null,
            destinationRail: 'solana',
            destinationLabel: 'Solana wallet',
        } as const;
    }

    return {
        chain: 'BASE',
        token: 'USDC',
        destinationAddress: params.ethereumWalletAddress || null,
        destinationRail: 'base',
        destinationLabel: 'Base wallet',
    } as const;
};

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
        const sandboxMode = bridgeUsdService.isSandbox();

        const enabledForUser = bridgeUsdService.isEnabledForUser(user.id, user.email || null);
        const usdAccount = await getUsdAccountByUser(user.id);
        logger.info('USD status resolved', {
            userId: user.id,
            sandboxMode,
            enabledForUser,
            diditKycStatus: user.kyc_status || 'not_started',
            bridgeKycStatus: usdAccount?.bridge_kyc_status || 'not_started',
            accountStatus: usdAccount?.provider_status || 'not_started',
            hasBridgeCustomerId: Boolean(usdAccount?.bridge_customer_id),
            hasVirtualAccountId: Boolean(usdAccount?.bridge_virtual_account_id),
            hasAchAccountNumber: Boolean(usdAccount?.ach_account_number_masked),
        });

        res.json({
            success: true,
            data: {
                diditKycStatus: user.kyc_status || 'not_started',
                bridgeKycStatus: usdAccount?.bridge_kyc_status || 'not_started',
                accountStatus: usdAccount?.provider_status || 'not_started',
                featureEnabled: enabledForUser,
                sandboxMode,
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
        const sandboxMode = bridgeUsdService.isSandbox();

        if (!bridgeUsdService.isEnabledForUser(user.id, user.email || null)) {
            res.status(403).json({
                success: false,
                error: { message: 'USD accounts are not enabled for this user' },
            });
            return;
        }

        if (!sandboxMode && user.kyc_status !== 'approved') {
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
                    bridge_kyc_status: sandboxMode ? 'approved' : (bridgeCustomer.kycStatus || 'pending'),
                    provider_status: sandboxMode ? 'active' : (bridgeCustomer.status || 'pending_kyc'),
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
                bridgeKycStatus: refreshed?.bridge_kyc_status || (sandboxMode ? 'approved' : 'pending'),
                accountStatus: refreshed?.provider_status || (sandboxMode ? 'active' : 'pending_kyc'),
                nextAction: sandboxMode ? 'fetch_account_details' : 'complete_bridge_kyc',
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
 * PATCH /api/usd-accounts/settlement
 * Update where inbound USD deposits settle to USDC (BASE or SOLANA)
 */
router.patch('/settlement', authenticate, async (req: Request, res: Response, next) => {
    try {
        const authUserId = req.user!.id;
        const user = await getOrCreateUser(authUserId);
        const account = await ensureUsdAccountRow(user.id);

        if (!bridgeUsdService.isEnabledForUser(user.id, user.email || null)) {
            res.status(403).json({
                success: false,
                error: { message: 'USD accounts are not enabled for this user' },
            });
            return;
        }

        const requestedChain = String((req.body as any)?.chain || '').toUpperCase();
        if (requestedChain !== 'BASE' && requestedChain !== 'SOLANA') {
            res.status(400).json({
                success: false,
                error: { message: 'Invalid settlement chain. Use BASE or SOLANA.' },
            });
            return;
        }

        if (requestedChain === 'BASE' && !(user as any).ethereum_wallet_address) {
            res.status(400).json({
                success: false,
                error: { message: 'Base wallet not found for this account.' },
            });
            return;
        }

        if (requestedChain === 'SOLANA' && !(user as any).solana_wallet_address) {
            res.status(400).json({
                success: false,
                error: { message: 'Solana wallet not found for this account.' },
            });
            return;
        }

        const { error: updateError } = await supabase
            .from('user_usd_accounts')
            .update({
                settlement_chain: requestedChain,
                settlement_token: 'USDC',
            })
            .eq('id', account.id);

        if (updateError) {
            throw new Error(`Failed to update settlement: ${updateError.message}`);
        }

        const settlement = getUsdSettlementConfig({
            settlementChain: requestedChain,
            ethereumWalletAddress: (user as any).ethereum_wallet_address,
            solanaWalletAddress: (user as any).solana_wallet_address,
        });

        res.json({
            success: true,
            data: {
                settlement: {
                    chain: settlement.chain,
                    token: settlement.token,
                    destination: settlement.destinationAddress,
                },
            },
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
        const sandboxMode = bridgeUsdService.isSandbox();
        const enabledForUser = bridgeUsdService.isEnabledForUser(user.id, user.email || null);
        logger.info('USD details requested', {
            userId: user.id,
            sandboxMode,
            hasBridgeCustomerId: Boolean(account.bridge_customer_id),
            accountStatus: account.provider_status,
            bridgeKycStatus: account.bridge_kyc_status,
            hasStoredAchAccountNumber: Boolean(account.ach_account_number_masked),
        });

        if (!enabledForUser) {
            res.status(403).json({
                success: false,
                error: { message: 'USD accounts are not enabled for this user' },
            });
            return;
        }

        if (!sandboxMode && user.kyc_status !== 'approved') {
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

        let bridgeCustomer;
        try {
            bridgeCustomer = await bridgeUsdService.getCustomer(account.bridge_customer_id);
        } catch (bridgeCustomerError: any) {
            const status = Number(bridgeCustomerError?.response?.status || 0);

            if (status === 404) {
                logger.warn('Stored Bridge customer not found; recreating customer linkage', {
                    userId: user.id,
                    staleBridgeCustomerId: account.bridge_customer_id,
                    sandboxMode,
                });

                const recreatedCustomer = await bridgeUsdService.createOrGetCustomer({
                    externalUserId: user.id,
                    email: user.email || null,
                    firstName: user.first_name || null,
                    lastName: user.last_name || null,
                });

                bridgeCustomer = recreatedCustomer;
                account.bridge_customer_id = recreatedCustomer.id;

                const { error: relinkError } = await supabase
                    .from('user_usd_accounts')
                    .update({
                        bridge_customer_id: recreatedCustomer.id,
                        bridge_kyc_status: sandboxMode ? 'approved' : (recreatedCustomer.kycStatus || 'pending'),
                        provider_status: sandboxMode ? 'active' : (recreatedCustomer.status || 'pending_kyc'),
                    })
                    .eq('id', account.id);

                if (relinkError) {
                    throw new Error(`Failed to relink Bridge customer after 404: ${relinkError.message}`);
                }
            } else if (status === 401) {
                logger.error('Bridge authentication failed while fetching customer', {
                    userId: user.id,
                    bridgeCustomerId: account.bridge_customer_id,
                    sandboxMode,
                });
                res.status(502).json({
                    success: false,
                    error: {
                        message: 'Bridge authentication failed. Verify BRIDGE_API_KEY, BRIDGE_API_BASE_URL, and BRIDGE_ENV in backend runtime config.',
                    },
                });
                return;
            } else {
                throw bridgeCustomerError;
            }
        }

        if (!bridgeCustomer) {
            throw new Error('Unable to resolve Bridge customer for USD account');
        }

        let bridgeKycStatus = sandboxMode ? 'approved' : (bridgeCustomer.kycStatus || account.bridge_kyc_status || 'pending');
        let providerStatus = sandboxMode ? 'active' : (bridgeCustomer.status || account.provider_status || 'pending_kyc');
        logger.info('Bridge customer readiness', {
            userId: user.id,
            bridgeCustomerId: account.bridge_customer_id,
            status: bridgeCustomer.status || null,
            kycStatus: bridgeCustomer.kycStatus || null,
            tosStatus: bridgeCustomer.tosStatus || null,
            hasAcceptedTerms: bridgeCustomer.hasAcceptedTerms ?? null,
            baseEndorsementStatus: bridgeCustomer.baseEndorsementStatus || null,
        });

        const isBridgeApproved = sandboxMode || bridgeKycStatus.toLowerCase() === 'approved';

        let virtualAccountId = account.bridge_virtual_account_id;
        let accountNumberMasked = account.ach_account_number_masked;
        let routingNumberMasked = account.ach_routing_number_masked;
        let bankName = account.bank_name;
        let bankAddress: string | null = null;
        let accountName: string | null = null;
        let enabled = account.feature_enabled;
        const settlement = getUsdSettlementConfig({
            settlementChain: account.settlement_chain,
            ethereumWalletAddress: (user as any).ethereum_wallet_address,
            solanaWalletAddress: (user as any).solana_wallet_address,
        });
        const hasStoredAchDetails = Boolean(account.ach_account_number_masked && account.ach_routing_number_masked);
        const hasStoredVirtualAccount = Boolean(account.bridge_virtual_account_id);

        if (isBridgeApproved && !(hasStoredAchDetails || hasStoredVirtualAccount)) {
            const destinationAddress = settlement.destinationAddress;
            if (!destinationAddress) {
                res.status(400).json({
                    success: false,
                    error: { message: `${settlement.destinationLabel} is required before creating a USD account` },
                });
                return;
            }

            try {
                let customerIdForVirtualAccount = account.bridge_customer_id;
                try {
                    await bridgeUsdService.ensureSandboxCustomerAddressData(customerIdForVirtualAccount);
                    if (sandboxMode) {
                        const activeCustomer = await bridgeUsdService.waitForActiveCustomer(customerIdForVirtualAccount);
                        providerStatus = activeCustomer.status || providerStatus;
                        bridgeKycStatus = activeCustomer.kycStatus || bridgeKycStatus;
                    }
                } catch (customerDataError: any) {
                    const customerDataMsg = String(customerDataError?.message || '').toLowerCase();
                    const recoverableCustomerError =
                        sandboxMode &&
                        (customerDataMsg.includes('missing_address_data') ||
                            customerDataMsg.includes('status code 422'));

                    if (!recoverableCustomerError) {
                        throw customerDataError;
                    }

                    logger.warn('Bridge customer missing required sandbox data; creating replacement customer', {
                        userId: user.id,
                        bridgeCustomerId: customerIdForVirtualAccount,
                        message: customerDataError?.message || 'unknown error',
                    });

                    const replacementCustomer = await bridgeUsdService.createSandboxReplacementCustomer({
                        externalUserId: user.id,
                        email: user.email || null,
                        firstName: user.first_name || null,
                        lastName: user.last_name || null,
                    });

                    customerIdForVirtualAccount = replacementCustomer.id;
                    account.bridge_customer_id = replacementCustomer.id;
                    if (sandboxMode) {
                        const activeReplacement = await bridgeUsdService.waitForActiveCustomer(replacementCustomer.id);
                        providerStatus = activeReplacement.status || providerStatus;
                        bridgeKycStatus = activeReplacement.kycStatus || bridgeKycStatus;
                    }
                    const { error: replacementUpdateError } = await supabase
                        .from('user_usd_accounts')
                        .update({
                            bridge_customer_id: replacementCustomer.id,
                            bridge_kyc_status: sandboxMode ? bridgeKycStatus : (replacementCustomer.kycStatus || bridgeKycStatus),
                            provider_status: sandboxMode ? providerStatus : (replacementCustomer.status || providerStatus),
                        })
                        .eq('id', account.id);
                    if (replacementUpdateError) {
                        throw new Error(`Failed to persist replacement Bridge customer: ${replacementUpdateError.message}`);
                    }
                }

                const virtualAccount = await bridgeUsdService.getOrCreateAchAccount({
                    customerId: customerIdForVirtualAccount,
                    destinationAddress,
                    destinationRail: settlement.destinationRail,
                });
                virtualAccountId = virtualAccount.id || null;
                accountNumberMasked = virtualAccount.accountNumberMasked;
                routingNumberMasked = virtualAccount.routingNumberMasked;
                bankName = virtualAccount.bankName;
                bankAddress = virtualAccount.bankAddress;
                accountName = virtualAccount.accountName;
                enabled = Boolean(virtualAccount.accountNumberMasked && virtualAccount.routingNumberMasked);
            } catch (virtualAccountError: any) {
                const message = String(virtualAccountError?.message || '').toLowerCase();
                const pendingLike =
                    message.includes('kyc') ||
                    message.includes('pending') ||
                    message.includes('review') ||
                    message.includes('not approved');
                const inactiveCustomerLike =
                    sandboxMode &&
                    (message.includes('requires_active_kyc_status') ||
                        message.includes('customer account is not active'));

                logger.warn('Bridge virtual account creation failed', {
                    userId: user.id,
                    bridgeCustomerId: account.bridge_customer_id,
                    message: virtualAccountError?.message || 'unknown error',
                    pendingLike,
                    inactiveCustomerLike,
                });

                if (inactiveCustomerLike) {
                    try {
                        const replacementCustomer = await bridgeUsdService.createSandboxReplacementCustomer({
                            externalUserId: user.id,
                            email: user.email || null,
                            firstName: user.first_name || null,
                            lastName: user.last_name || null,
                        });
                        const activeReplacement = await bridgeUsdService.waitForActiveCustomer(replacementCustomer.id);
                        const retryVirtualAccount = await bridgeUsdService.getOrCreateAchAccount({
                            customerId: replacementCustomer.id,
                            destinationAddress,
                            destinationRail: settlement.destinationRail,
                        });

                        account.bridge_customer_id = replacementCustomer.id;
                        bridgeKycStatus = activeReplacement.kycStatus || bridgeKycStatus;
                        providerStatus = activeReplacement.status || providerStatus;
                        virtualAccountId = retryVirtualAccount.id || null;
                        accountNumberMasked = retryVirtualAccount.accountNumberMasked;
                        routingNumberMasked = retryVirtualAccount.routingNumberMasked;
                        bankName = retryVirtualAccount.bankName;
                        bankAddress = retryVirtualAccount.bankAddress;
                        accountName = retryVirtualAccount.accountName;
                        enabled = Boolean(retryVirtualAccount.accountNumberMasked && retryVirtualAccount.routingNumberMasked);
                    } catch (retryError: any) {
                        logger.warn('Retry after inactive Bridge customer failed', {
                            userId: user.id,
                            message: retryError?.message || 'unknown error',
                        });
                        providerStatus = 'pending_kyc';
                        enabled = false;
                        // Preserve any previously stored details; do not wipe fields.
                        accountNumberMasked = account.ach_account_number_masked;
                        routingNumberMasked = account.ach_routing_number_masked;
                        bankName = account.bank_name;
                    }
                } else if (pendingLike) {
                    // Keep account in pending review state without crashing UI.
                    bridgeKycStatus = bridgeKycStatus || 'pending';
                    providerStatus = 'pending_kyc';
                    enabled = false;
                    // Preserve any previously stored details; do not wipe fields.
                    accountNumberMasked = account.ach_account_number_masked;
                    routingNumberMasked = account.ach_routing_number_masked;
                    bankName = account.bank_name;
                } else {
                    throw virtualAccountError;
                }
            }
        } else if (hasStoredAchDetails || hasStoredVirtualAccount) {
            // Use stable stored account details; avoid creating new virtual accounts on page open.
            enabled = Boolean(account.ach_account_number_masked && account.ach_routing_number_masked);
            if (enabled && providerStatus === 'pending_kyc') {
                providerStatus = 'active';
            }
        }
        logger.info('USD details resolved', {
            userId: user.id,
            sandboxMode,
            bridgeKycStatus,
            providerStatus,
            enabled,
            hasVirtualAccountId: Boolean(virtualAccountId),
            hasAchAccountNumber: Boolean(accountNumberMasked),
            hasAchRouting: Boolean(routingNumberMasked),
            bankName: bankName || null,
        });

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
                featureEnabled: enabledForUser,
                accountReady: enabled,
                sandboxMode,
                ach: {
                    bankName,
                    accountName,
                    bankAddress,
                    accountNumberMasked: accountNumberMasked,
                    routingNumberMasked: routingNumberMasked,
                    rail: 'ACH',
                    currency: 'USD',
                },
                settlement: {
                    chain: settlement.chain,
                    token: settlement.token,
                    destination: settlement.destinationAddress,
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
            ...(resolveDepositSource((item as any).raw_payload)),
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
