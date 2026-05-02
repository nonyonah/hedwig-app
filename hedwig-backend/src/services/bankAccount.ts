import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { FREE_PLAN_LIMITS, requireProFeatureAccess } from './billingRules';

const logger = createLogger('BankAccount');

const PAYSTACK_BASE = 'https://api.paystack.co';
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_TIMEOUT_MS = Number(process.env.PAYSTACK_TIMEOUT_MS || 6000);

const GOCARDLESS_BASE = process.env.GOCARDLESS_BASE_URL || 'https://api.gocardless.com';
const GOCARDLESS_TOKEN = process.env.GOCARDLESS_TOKEN || '';
const GOCARDLESS_TIMEOUT_MS = Number(process.env.GOCARDLESS_TIMEOUT_MS || 6000);

export type BankCountry = 'NG' | 'US' | 'UK' | 'GH';

export interface BankInfo {
    code: string;
    name: string;
    slug?: string;
}

export interface BankAccountInput {
    country: BankCountry;
    accountHolderName: string;
    bankName: string;
    bankCode?: string | null;
    accountNumber?: string | null;
    routingNumber?: string | null;
    sortCode?: string | null;
    iban?: string | null;
    swiftBic?: string | null;
    accountType?: 'checking' | 'savings' | null;
    showOnInvoice?: boolean;
    isDefault?: boolean;
}

export interface BankAccountRecord {
    id: string;
    userId: string;
    country: BankCountry;
    currency: string;
    accountHolderName: string;
    bankName: string;
    bankCode: string | null;
    accountNumber: string | null;
    routingNumber: string | null;
    sortCode: string | null;
    iban: string | null;
    swiftBic: string | null;
    accountType: 'checking' | 'savings' | null;
    isVerified: boolean;
    verifiedAt: string | null;
    verificationMethod: string | null;
    showOnInvoice: boolean;
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
}

const COUNTRY_CURRENCY: Record<BankCountry, string> = {
    NG: 'NGN',
    GH: 'GHS',
    US: 'USD',
    UK: 'GBP',
};

const PAYSTACK_COUNTRY_CODE: Record<'NG' | 'GH', string> = {
    NG: 'nigeria',
    GH: 'ghana',
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

function validateInput(input: BankAccountInput): string | null {
    const trimmedAccount = input.accountNumber ? input.accountNumber.replace(/\D/g, '') : '';

    if (!input.accountHolderName?.trim()) return 'Account holder name is required';
    if (!input.bankName?.trim()) return 'Bank name is required';

    switch (input.country) {
        case 'NG':
        case 'GH':
            if (!/^\d{10}$/.test(trimmedAccount)) {
                return `${input.country} accounts must be exactly 10 digits`;
            }
            return null;
        case 'US': {
            const routing = input.routingNumber ? input.routingNumber.replace(/\D/g, '') : '';
            if (!/^\d{9}$/.test(routing)) return 'US routing number must be 9 digits';
            if (!/^\d{4,17}$/.test(trimmedAccount)) return 'US account number must be 4–17 digits';
            return null;
        }
        case 'UK': {
            const sort = input.sortCode ? input.sortCode.replace(/\D/g, '') : '';
            if (!/^\d{6}$/.test(sort)) return 'UK sort code must be 6 digits';
            if (!/^\d{8}$/.test(trimmedAccount)) return 'UK account number must be 8 digits';
            return null;
        }
        default:
            return 'Unsupported country';
    }
}

function mapRow(row: any): BankAccountRecord {
    return {
        id: String(row.id),
        userId: String(row.user_id),
        country: row.country as BankCountry,
        currency: row.currency,
        accountHolderName: row.account_holder_name,
        bankName: row.bank_name,
        bankCode: row.bank_code ?? null,
        accountNumber: row.account_number ?? null,
        routingNumber: row.routing_number ?? null,
        sortCode: row.sort_code ?? null,
        iban: row.iban ?? null,
        swiftBic: row.swift_bic ?? null,
        accountType: row.account_type ?? null,
        isVerified: Boolean(row.is_verified),
        verifiedAt: row.verified_at ?? null,
        verificationMethod: row.verification_method ?? null,
        showOnInvoice: row.show_on_invoice !== false,
        isDefault: Boolean(row.is_default),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function buildPayloadFromInput(input: BankAccountInput, currency: string): Record<string, unknown> {
    return {
        country: input.country,
        currency,
        account_holder_name: input.accountHolderName.trim(),
        bank_name: input.bankName.trim(),
        bank_code: input.bankCode || null,
        account_number: input.accountNumber ? input.accountNumber.replace(/\s+/g, '') : null,
        routing_number: input.routingNumber ? input.routingNumber.replace(/\D/g, '') : null,
        sort_code: input.sortCode ? input.sortCode.replace(/\D/g, '') : null,
        iban: input.iban ? input.iban.replace(/\s+/g, '').toUpperCase() : null,
        swift_bic: input.swiftBic ? input.swiftBic.trim().toUpperCase() : null,
        account_type: input.accountType || null,
        show_on_invoice: input.showOnInvoice !== false,
    };
}

export class BankAccountService {
    static async listBanks(country: BankCountry): Promise<BankInfo[]> {
        if (country === 'NG' || country === 'GH') {
            return BankAccountService.listPaystackBanks(country);
        }
        return [];
    }

    private static async listPaystackBanks(country: 'NG' | 'GH'): Promise<BankInfo[]> {
        if (!PAYSTACK_SECRET) {
            logger.warn('PAYSTACK_SECRET_KEY missing; returning empty bank list', { country });
            return [];
        }

        const params = new URLSearchParams({
            country: PAYSTACK_COUNTRY_CODE[country],
            currency: COUNTRY_CURRENCY[country],
            perPage: '200',
        });

        const url = `${PAYSTACK_BASE}/bank?${params.toString()}`;
        const res = await fetchWithTimeout(url, {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET}`,
                Accept: 'application/json',
            },
        }, PAYSTACK_TIMEOUT_MS);

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            logger.error('Paystack /bank failed', { status: res.status, body: text.slice(0, 200) });
            throw new Error(`Bank list lookup failed (${res.status})`);
        }

        const json = await res.json() as { data?: Array<{ name: string; code: string; slug?: string }> };
        return (json.data || []).map((b) => ({ code: b.code, name: b.name, slug: b.slug }));
    }

    static async resolveAccount(params: {
        country: BankCountry;
        bankCode: string;
        accountNumber: string;
    }): Promise<{ verified: boolean; accountName: string | null; method: string | null; reason?: string }> {
        const { country, bankCode, accountNumber } = params;

        if (country === 'NG' || country === 'GH') {
            if (!PAYSTACK_SECRET) {
                return { verified: false, accountName: null, method: null, reason: 'paystack_not_configured' };
            }
            const search = new URLSearchParams({ account_number: accountNumber, bank_code: bankCode });
            const url = `${PAYSTACK_BASE}/bank/resolve?${search.toString()}`;
            try {
                const res = await fetchWithTimeout(url, {
                    headers: {
                        Authorization: `Bearer ${PAYSTACK_SECRET}`,
                        Accept: 'application/json',
                    },
                }, PAYSTACK_TIMEOUT_MS);
                const json = await res.json() as { status?: boolean; data?: { account_name?: string }; message?: string };
                if (!res.ok || !json.status || !json.data?.account_name) {
                    return { verified: false, accountName: null, method: 'paystack', reason: json.message || `http_${res.status}` };
                }
                return { verified: true, accountName: json.data.account_name, method: 'paystack' };
            } catch (err) {
                logger.warn('Paystack resolve failed', { error: err instanceof Error ? err.message : 'unknown' });
                return { verified: false, accountName: null, method: 'paystack', reason: 'network_error' };
            }
        }

        if (country === 'UK') {
            if (!GOCARDLESS_TOKEN) {
                return { verified: false, accountName: null, method: null, reason: 'gocardless_not_configured' };
            }
            const url = `${GOCARDLESS_BASE}/bank_details_lookups`;
            try {
                const res = await fetchWithTimeout(url, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${GOCARDLESS_TOKEN}`,
                        'Content-Type': 'application/json',
                        'GoCardless-Version': '2015-07-06',
                    },
                    body: JSON.stringify({
                        bank_details_lookups: {
                            country_code: 'GB',
                            account_number: accountNumber,
                            branch_code: bankCode,
                        },
                    }),
                }, GOCARDLESS_TIMEOUT_MS);
                const json = await res.json() as any;
                if (!res.ok) {
                    return { verified: false, accountName: null, method: 'gocardless', reason: `http_${res.status}` };
                }
                const ok = Boolean(json?.bank_details_lookups?.available_debit_schemes?.length);
                return { verified: ok, accountName: null, method: 'gocardless' };
            } catch (err) {
                logger.warn('GoCardless lookup failed', { error: err instanceof Error ? err.message : 'unknown' });
                return { verified: false, accountName: null, method: 'gocardless', reason: 'network_error' };
            }
        }

        return { verified: false, accountName: null, method: null, reason: 'verification_unsupported' };
    }

    static async listByUserId(userId: string): Promise<BankAccountRecord[]> {
        const { data, error } = await supabase
            .from('user_bank_accounts')
            .select('*')
            .eq('user_id', userId)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: true });
        if (error) {
            logger.error('Bank accounts fetch failed', { error: error.message });
            throw new Error('Could not load bank accounts');
        }
        return (data || []).map(mapRow);
    }

    static async getByIdForUser(userId: string, id: string): Promise<BankAccountRecord | null> {
        const { data, error } = await supabase
            .from('user_bank_accounts')
            .select('*')
            .eq('user_id', userId)
            .eq('id', id)
            .maybeSingle();
        if (error) throw new Error('Could not load bank account');
        return data ? mapRow(data) : null;
    }

    private static async runVerification(input: BankAccountInput): Promise<{ verified: boolean; method: string | null; resolvedHolderName: string | null }> {
        if ((input.country === 'NG' || input.country === 'GH') && input.bankCode && input.accountNumber) {
            const result = await BankAccountService.resolveAccount({
                country: input.country,
                bankCode: input.bankCode,
                accountNumber: input.accountNumber.replace(/\D/g, ''),
            });
            return { verified: result.verified, method: result.method, resolvedHolderName: result.accountName };
        }
        if (input.country === 'UK' && input.bankCode && input.accountNumber) {
            const result = await BankAccountService.resolveAccount({
                country: 'UK',
                bankCode: input.bankCode,
                accountNumber: input.accountNumber.replace(/\D/g, ''),
            });
            return { verified: result.verified, method: result.method, resolvedHolderName: null };
        }
        return { verified: false, method: null, resolvedHolderName: null };
    }

    static async create(userId: string, input: BankAccountInput): Promise<BankAccountRecord> {
        const validationError = validateInput(input);
        if (validationError) throw new Error(validationError);

        // Free plan: cap to FREE_PLAN_LIMITS.bankAccounts. Pro: unlimited.
        const existing = await BankAccountService.listByUserId(userId);
        if (existing.length >= FREE_PLAN_LIMITS.bankAccounts) {
            const { data: userRow } = await supabase
                .from('users')
                .select('id, email, privy_id, subscription_status, subscription_expiry, created_at')
                .eq('id', userId)
                .maybeSingle();
            if (userRow) {
                const access = await requireProFeatureAccess(userRow as any, 'multi_bank_accounts');
                if (!access.allowed) {
                    throw new Error(access.message || 'Upgrade to Pro to add more bank accounts.');
                }
            }
        }

        const currency = COUNTRY_CURRENCY[input.country];
        const { verified, method, resolvedHolderName } = await BankAccountService.runVerification(input);

        const payload: Record<string, unknown> = {
            user_id: userId,
            ...buildPayloadFromInput(input, currency),
            is_verified: verified,
            verified_at: verified ? new Date().toISOString() : null,
            verification_method: method,
        };
        if (resolvedHolderName) payload.account_holder_name = resolvedHolderName;

        // Determine if this should be the default — first account always is.
        const wantsDefault = input.isDefault === true || existing.length === 0;

        if (wantsDefault) {
            // Clear current default before insert; partial unique index forbids two defaults.
            await supabase.from('user_bank_accounts')
                .update({ is_default: false })
                .eq('user_id', userId)
                .eq('is_default', true);
            payload.is_default = true;
        } else {
            payload.is_default = false;
        }

        const { data, error } = await supabase
            .from('user_bank_accounts')
            .insert(payload)
            .select('*')
            .single();

        if (error || !data) {
            logger.error('Bank account insert failed', { error: error?.message });
            throw new Error(`Failed to create bank account: ${error?.message ?? 'unknown'}`);
        }
        return mapRow(data);
    }

    static async update(userId: string, id: string, input: BankAccountInput): Promise<BankAccountRecord> {
        const validationError = validateInput(input);
        if (validationError) throw new Error(validationError);

        const existing = await BankAccountService.getByIdForUser(userId, id);
        if (!existing) throw new Error('Bank account not found');

        const currency = COUNTRY_CURRENCY[input.country];
        const { verified, method, resolvedHolderName } = await BankAccountService.runVerification(input);

        const payload: Record<string, unknown> = {
            ...buildPayloadFromInput(input, currency),
            is_verified: verified,
            verified_at: verified ? new Date().toISOString() : null,
            verification_method: method,
        };
        if (resolvedHolderName) payload.account_holder_name = resolvedHolderName;

        // Default toggling — explicit true clears other defaults; explicit false
        // is allowed only if another default exists, otherwise the user would
        // have zero defaults.
        if (input.isDefault === true && !existing.isDefault) {
            await supabase.from('user_bank_accounts')
                .update({ is_default: false })
                .eq('user_id', userId)
                .eq('is_default', true);
            payload.is_default = true;
        } else if (input.isDefault === false && existing.isDefault) {
            const others = (await BankAccountService.listByUserId(userId)).filter((b) => b.id !== id);
            if (others.length === 0) {
                payload.is_default = true; // can't unset the only one
            } else {
                payload.is_default = false;
            }
        }

        const { data, error } = await supabase
            .from('user_bank_accounts')
            .update(payload)
            .eq('id', id)
            .eq('user_id', userId)
            .select('*')
            .single();
        if (error || !data) throw new Error(`Failed to update bank account: ${error?.message ?? 'unknown'}`);

        // If we demoted the default and another account exists, promote the
        // first remaining one so the user always has exactly one default.
        if (input.isDefault === false && existing.isDefault) {
            const others = (await BankAccountService.listByUserId(userId)).filter((b) => b.id !== id && !b.isDefault);
            if (others.length > 0) {
                await supabase.from('user_bank_accounts')
                    .update({ is_default: true })
                    .eq('id', others[0].id)
                    .eq('user_id', userId);
            }
        }

        return mapRow(data);
    }

    static async setDefault(userId: string, id: string): Promise<BankAccountRecord> {
        const target = await BankAccountService.getByIdForUser(userId, id);
        if (!target) throw new Error('Bank account not found');

        await supabase.from('user_bank_accounts')
            .update({ is_default: false })
            .eq('user_id', userId)
            .eq('is_default', true);

        const { data, error } = await supabase.from('user_bank_accounts')
            .update({ is_default: true })
            .eq('id', id)
            .eq('user_id', userId)
            .select('*')
            .single();
        if (error || !data) throw new Error(`Failed to set default: ${error?.message ?? 'unknown'}`);
        return mapRow(data);
    }

    static async deleteById(userId: string, id: string): Promise<void> {
        const target = await BankAccountService.getByIdForUser(userId, id);
        if (!target) return;

        const { error } = await supabase
            .from('user_bank_accounts')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);
        if (error) throw new Error(`Failed to delete bank account: ${error.message}`);

        // If we removed the default, promote the most recently created remaining account.
        if (target.isDefault) {
            const remaining = await BankAccountService.listByUserId(userId);
            if (remaining.length > 0) {
                await supabase.from('user_bank_accounts')
                    .update({ is_default: true })
                    .eq('id', remaining[0].id)
                    .eq('user_id', userId);
            }
        }
    }
}
