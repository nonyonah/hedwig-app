import axios, { AxiosInstance } from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger('Paycrest');

const PAYCREST_API_URL = process.env.PAYCREST_API_URL || 'https://api.paycrest.io/v1';
const PAYCREST_API_URL_V2 = process.env.PAYCREST_API_URL_V2 || 'https://api.paycrest.io/v2';
const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY;

if (!PAYCREST_API_KEY) {
    logger.warn('PAYCREST_API_KEY is not defined. Offramp features will not work.');
}

// Paycrest v1 client (offramp + legacy endpoints)
const paycrestClient: AxiosInstance = axios.create({
    baseURL: PAYCREST_API_URL,
    headers: {
        'Content-Type': 'application/json',
        'API-Key': PAYCREST_API_KEY || '',
    },
    timeout: 30000,
});

// Paycrest v2 client (onramp uses the unified source/destination order shape)
const paycrestClientV2: AxiosInstance = axios.create({
    baseURL: PAYCREST_API_URL_V2,
    headers: {
        'Content-Type': 'application/json',
        'API-Key': PAYCREST_API_KEY || '',
    },
    timeout: 30000,
});

// Nigerian Bank Name to Paycrest Institution Code Mapping
// See: https://docs.paycrest.io/resources/code-standards
const BANK_CODE_MAP: Record<string, string> = {
    // Major Banks (SWIFT codes)
    'gtb': 'GTBINGLA',
    'gtbank': 'GTBINGLA',
    'guaranty trust bank': 'GTBINGLA',
    'first bank': 'FBNINGLA',
    'firstbank': 'FBNINGLA',
    'zenith': 'ABORNGLA',
    'zenith bank': 'ABOLNGLA',
    'uba': 'UNLOIGLA',
    'access': 'ACGDIGLA',
    'access bank': 'ACGDIGLA',

    // Fintech/Mobile Banks (Custom PC codes)
    'opay': 'OPAYNGPC',
    'kuda': 'KUDANGPC',
    'moniepoint': 'MONINGPC',
    'palmpay': 'ABORNGPC',
    'carbon': 'CABONGPC',

    // Add more as needed
};

// Types
export interface BankDetails {
    institution: string; // Bank Name
    accountIdentifier: string; // Account Number
    accountName?: string;
    currency?: string;
    memo?: string;
}

export interface OfframpOrderRequest {
    amount: number;
    token: 'USDC' | 'USDT';
    network: 'base' | 'solana' | 'arbitrum' | 'polygon' | 'celo' | 'lisk' | 'optimism';
    rate: string; // Rate fetched from getExchangeRate
    recipient: BankDetails;
    returnAddress: string; // User's wallet address for refunds
    reference?: string;
}

export interface OfframpOrderResponse {
    id: string;
    receiveAddress: string;
    validUntil: string;
    senderFee: number;
    transactionFee: number;
    // Database mapping fields (optional in raw response but useful for service return)
    orderId?: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    amount: number;
    token: string;
    network: string;
    fiatAmount?: number;
    fiatCurrency?: string;
    exchangeRate?: number;
    createdAt?: string;
    txHash?: string;
}

export interface ExchangeRate {
    rate: string;
    timestamp?: string;
    token: string;
    fiatCurrency: string;
}

// Cache for supported institutions
let institutionsCache: { [currency: string]: any[] } = {};
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export class PaycrestService {
    private static isLikelyInstitutionCode(value: string): boolean {
        const normalized = String(value || '').trim();
        if (!normalized) return false;
        return /^[A-Z0-9]{6,}$/.test(normalized);
    }

    private static normalizeInstitutions(payload: any): Array<{ code: string; name: string }> {
        const rawInstitutions =
            (Array.isArray(payload?.data) && payload.data) ||
            payload?.data?.institutions ||
            payload?.data?.banks ||
            payload?.institutions ||
            payload?.banks ||
            [];

        if (!Array.isArray(rawInstitutions)) {
            return [];
        }

        return rawInstitutions
            .map((institution: any) => ({
                code: String(
                    institution?.code ||
                    institution?.id ||
                    institution?.institution_id ||
                    institution?.institutionCode ||
                    ''
                ).trim(),
                name: String(
                    institution?.name ||
                    institution?.institution_name ||
                    institution?.displayName ||
                    ''
                ).trim(),
            }))
            .filter((institution) => institution.code && institution.name);
    }

    private static getNetworkCandidates(network: string): string[] {
        const normalized = String(network || '').toLowerCase();

        // Paycrest network identifiers (try most specific first, fall back to aliases)
        const candidates: Record<string, string[]> = {
            base:     ['base', 'ethereum'],
            arbitrum: ['arbitrum-one', 'arbitrum'],
            'arbitrum-one': ['arbitrum-one', 'arbitrum'],
            polygon:  ['polygon', 'matic'],
            optimism: ['optimism'],
            celo:     ['celo'],
            lisk:     ['lisk'],
            solana:   ['solana'],
        };

        return candidates[normalized] ?? [normalized];
    }

    private static toNumber(value: any): number | null {
        if (value === null || value === undefined) return null;
        const num = typeof value === 'number' ? value : parseFloat(String(value));
        return Number.isFinite(num) ? num : null;
    }

    private static firstFiniteNumber(...values: any[]): number | null {
        for (const value of values) {
            const parsed = this.toNumber(value);
            if (parsed !== null) return parsed;
        }
        return null;
    }

    private static extractProviderError(error: any): { status: number | null; body: any; message: string } {
        const status = error?.response?.status ?? null;
        const body = error?.response?.data;
        const providerMessage =
            body?.message ||
            body?.error ||
            (typeof body === 'string' && body.trim() ? body.trim() : null) ||
            error?.message ||
            (status ? `HTTP ${status} from Paycrest` : 'Unknown Paycrest error');

        return { status, body, message: providerMessage };
    }

    private static normalizeOrderStatus(status: any): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' {
        const statusRaw = String(status || 'PENDING').toUpperCase();
        if (statusRaw === 'COMPLETED' || statusRaw === 'SUCCESS' || statusRaw === 'SETTLED' || statusRaw === 'VALIDATED') {
            return 'COMPLETED';
        }
        if (statusRaw === 'FAILED' || statusRaw === 'CANCELLED' || statusRaw === 'REFUNDED' || statusRaw === 'EXPIRED') {
            return 'FAILED';
        }
        if (statusRaw === 'PROCESSING' || statusRaw === 'SETTLING' || statusRaw === 'DEPOSITED' || statusRaw === 'PENDING') {
            return 'PROCESSING';
        }
        return 'PENDING';
    }
    /**
     * Get supported institutions for a currency
     * GET /institutions/{currency}
     */
    static async getSupportedInstitutions(currency: string = 'NGN'): Promise<any[]> {
        // Check cache
        const now = Date.now();
        if (institutionsCache[currency] && (now - cacheTimestamp) < CACHE_TTL) {
            return institutionsCache[currency];
        }

        try {
            const response = await paycrestClient.get(`/institutions/${currency.toUpperCase()}`);
            const institutions = this.normalizeInstitutions(response.data);

            if (institutions.length > 0) {
                institutionsCache[currency] = institutions;
                cacheTimestamp = now;
                logger.debug('Fetched institutions', { count: institutions.length, currency });
                return institutions;
            }

            logger.warn('Paycrest institutions response did not contain usable bank entries', {
                currency,
                hasData: Boolean(response.data),
                status: response.data?.status || null,
            });

            return [];
        } catch (error: any) {
            logger.error('Error fetching institutions', { error: error.response?.data?.message || error.message });
            return [];
        }
    }

    /**
     * Find institution code by matching bank name
     * Uses API institutions list for better matching
     */
    static async findInstitutionCode(bankName: string, currency: string = 'NGN'): Promise<string> {
        const normalizedName = bankName.toLowerCase().trim();

        if (this.isLikelyInstitutionCode(bankName)) {
            return bankName.toUpperCase();
        }

        // First check our static map for quick lookup
        if (BANK_CODE_MAP[normalizedName]) {
            return BANK_CODE_MAP[normalizedName];
        }

        // Then try to fetch from API and match
        const institutions = await this.getSupportedInstitutions(currency);

        for (const inst of institutions) {
            const instName = (inst.name || '').toLowerCase();
            const instCode = inst.code || '';

            if (instCode.toLowerCase() === normalizedName) {
                logger.debug('Matched institution code directly');
                return instCode;
            }

            // Match by name containing the bank name or vice versa
            if (instName.includes(normalizedName) || normalizedName.includes(instName)) {
                logger.debug('Matched bank name');
                return instCode;
            }
        }

        // Fall back to uppercase bank name as code
        logger.debug('No bank match found');
        return bankName.toUpperCase();
    }

    /**
     * Get current exchange rate for a token pair
     * GET /rates/:token/:amount/:currency?network=:network
     */
    static async getExchangeRate(
        token: string,
        amount: number,
        fiatCurrency: string = 'NGN',
        network: string = 'base'
    ): Promise<string> {
        const networkCandidates = this.getNetworkCandidates(network);
        let lastError: any = null;

        for (const networkCandidate of networkCandidates) {
            try {
                // Paycrest v2: GET /rates/{network}/{token}/{amount}/{fiat}
                // returns { status, data: { buy: { rate }, sell: { rate } } }
                // Offramp (crypto -> fiat) uses sell.rate.
                const response = await paycrestClientV2.get(
                    `/rates/${encodeURIComponent(networkCandidate)}/${encodeURIComponent(token.toUpperCase())}/${encodeURIComponent(String(amount))}/${encodeURIComponent(fiatCurrency.toUpperCase())}`
                );

                const payload = response.data?.data ?? response.data;
                const sellRateRaw =
                    payload?.sell?.rate ??
                    payload?.data?.sell?.rate ??
                    payload?.sell_rate ??
                    payload?.sellRate ??
                    payload?.rate ??
                    payload;

                const rateString = typeof sellRateRaw === 'string' ? sellRateRaw : String(sellRateRaw ?? '');
                if (rateString && Number.isFinite(parseFloat(rateString))) {
                    return rateString;
                }
                lastError = new Error('Paycrest /v2/rates response missing sell rate');
                logger.warn('Offramp rate response missing usable sell rate', {
                    network: networkCandidate,
                    payload,
                });
            } catch (error: any) {
                lastError = error;
                logger.warn('Error fetching rate from Paycrest', {
                    network: networkCandidate,
                    error: error.response?.data?.message || error.message
                });
            }
        }

        throw new Error('Failed to fetch exchange rate from Paycrest: ' + (lastError?.response?.data?.message || lastError?.message || 'Unknown error'));
    }

    /**
     * Get the buy-side exchange rate used for an onramp quote.
     * GET /v2/rates/:network/:token/:amount/:fiat
     *
     * Paycrest v2 returns both buy and sell rates. Use data.buy.rate for
     * onramp (fiat -> stablecoin) and data.sell.rate for offramp display.
     * Response shape: { status, data: { buy: { rate, providerIds }, sell: ... } }
     * — fall back to a flat string for older response variants.
     */
    static async getOnrampBuyRate(
        token: string,
        amount: number,
        fiatCurrency: string,
        network: string
    ): Promise<string> {
        const networkCandidates = this.getNetworkCandidates(network);
        let lastError: any = null;

        for (const networkCandidate of networkCandidates) {
            try {
                const response = await paycrestClientV2.get(
                    `/rates/${encodeURIComponent(networkCandidate)}/${encodeURIComponent(token.toUpperCase())}/${encodeURIComponent(String(amount))}/${encodeURIComponent(fiatCurrency.toUpperCase())}`
                );

                const payload = response.data?.data ?? response.data;
                const buyRateRaw =
                    payload?.buy?.rate ??
                    payload?.data?.buy?.rate ??
                    payload?.buy_rate ??
                    payload?.buyRate ??
                    payload?.rate ??
                    payload;

                const rateString = typeof buyRateRaw === 'string' ? buyRateRaw : String(buyRateRaw ?? '');
                if (rateString && Number.isFinite(parseFloat(rateString))) {
                    return rateString;
                }
                lastError = new Error('Paycrest /v2/rates response missing buy rate');
                logger.warn('Onramp rate response missing usable buy rate', {
                    network: networkCandidate,
                    payload,
                });
            } catch (error: any) {
                lastError = error;
                const status = error.response?.status || null;
                const providerMessage = error.response?.data?.message || error.message;
                logger.warn('Error fetching onramp buy rate', {
                    network: networkCandidate,
                    status,
                    error: providerMessage,
                });
            }
        }

        throw new Error('Failed to fetch onramp rate from Paycrest: ' + (lastError?.response?.data?.message || lastError?.message || 'Unknown error'));
    }

    /**
     * Verify bank account details
     * POST /verify-account
     * Returns account name and verification status
     */
    static async verifyBankAccount(
        bankName: string,
        accountNumber: string,
        currency: string = 'NGN'
    ): Promise<{ accountName: string; verified: boolean }> {
        try {
            // Convert bank name to Paycrest institution code (async API lookup)
            const institutionCode = await this.findInstitutionCode(bankName, currency);

            logger.debug('Verifying bank account');

            const response = await paycrestClientV2.post('/verify-account', {
                institution: institutionCode,
                accountIdentifier: accountNumber,
                currency: currency.toUpperCase(),
            });

            logger.debug('Account verification response received');

            // Paycrest returns: { status: "success", message: "Operation successful", data: "Account Name" }
            // The account name is directly in the data field as a string
            const accountName = typeof response.data?.data === 'string'
                ? response.data.data
                : '';

            return {
                accountName: accountName,
                verified: response.data?.status === 'success' && accountName !== '',
            };
        } catch (error: any) {
            logger.error('Error verifying account', { error: error.response?.data?.message || error.message });
            return { accountName: '', verified: false };
        }
    }

    /**
     * Convert common bank names to Paycrest institution codes
     */
    static getBankCode(bankName: string): string {
        const normalizedName = bankName.toLowerCase().trim();
        return BANK_CODE_MAP[normalizedName] || bankName.toUpperCase();
    }

    /**
     * Create an offramp order
     * POST /sender/orders
     */
    static async createOfframpOrder(
        orderData: OfframpOrderRequest
    ): Promise<OfframpOrderResponse> {
        try {
            // Lookup the correct institution code from Paycrest API
            const institutionCode = await this.findInstitutionCode(
                orderData.recipient.institution,
                orderData.recipient.currency || 'NGN'
            );

            let response: any = null;
            let lastError: any = null;

            for (const networkCandidate of this.getNetworkCandidates(orderData.network)) {
                // Paycrest v2 unified order shape — crypto -> fiat (offramp).
                // Docs: POST /v2/sender/orders with source.type=crypto and
                // destination.type=fiat. `amountIn` defaults to crypto, so we
                // omit it to match the published offramp example.
                const payload: Record<string, any> = {
                    amount: String(orderData.amount),
                    source: {
                        type: 'crypto',
                        currency: orderData.token.toUpperCase(),
                        network: networkCandidate,
                        refundAddress: orderData.returnAddress,
                    },
                    destination: {
                        type: 'fiat',
                        currency: (orderData.recipient.currency || 'NGN').toUpperCase(),
                        recipient: {
                            institution: institutionCode,
                            accountIdentifier: orderData.recipient.accountIdentifier,
                            accountName: orderData.recipient.accountName,
                            memo: orderData.recipient.memo || 'Payment',
                        },
                    },
                    reference: orderData.reference || `ref-${Date.now()}`,
                };

                if (orderData.rate) {
                    payload.rate = orderData.rate;
                }

                try {
                    response = await paycrestClientV2.post('/sender/orders', payload);
                    break;
                } catch (error: any) {
                    lastError = error;
                    const providerError = this.extractProviderError(error);
                    logger.warn('Paycrest order creation failed for network candidate', {
                        network: networkCandidate,
                        status: providerError.status,
                        body: providerError.body,
                        message: providerError.message,
                    });
                }
            }

            if (!response) {
                throw lastError || new Error('Paycrest order creation failed');
            }

            logger.info('Created offramp order');

            // Paycrest API returns: { status: "success", message: "...", data: { id, receiveAddress, ... } }
            const apiData = response.data?.data || response.data;
            const providerAccount =
                apiData.providerAccount ||
                apiData.provider_account ||
                apiData.receiveAddress ||
                apiData.receive_address ||
                apiData.paymentDetails ||
                apiData.payment_details ||
                {};

            if (!apiData?.id) {
                logger.error('No order ID in response', { rawKeys: Object.keys(apiData || {}) });
                throw new Error('Paycrest did not return a valid order ID');
            }

            const receiveAddress =
                providerAccount.receiveAddress ||
                providerAccount.receive_address ||
                providerAccount.address ||
                providerAccount.depositAddress ||
                providerAccount.deposit_address ||
                apiData.receiveAddress ||
                apiData.receive_address ||
                apiData.depositAddress ||
                apiData.deposit_address ||
                null;

            if (!receiveAddress) {
                logger.error('Paycrest offramp order missing receive address', {
                    orderId: apiData.id,
                    rawKeys: Object.keys(apiData || {}),
                    providerKeys: Object.keys(providerAccount || {}),
                });
                throw new Error('Paycrest did not return a crypto receive address');
            }

            // Prefer provider-returned values when available to avoid UI/backend mismatch.
            const providerRate =
                this.firstFiniteNumber(apiData.exchangeRate, apiData.exchange_rate, apiData.rate, apiData.quote?.rate);
            const rateVal = providerRate ?? parseFloat(orderData.rate);

            const providerFiatAmount =
                this.firstFiniteNumber(
                    apiData.fiatAmount,
                    apiData.fiat_amount,
                    apiData.recipientAmount,
                    apiData.recipient_amount,
                    apiData.payoutAmount,
                    apiData.payout_amount,
                    apiData.settlementAmount,
                    apiData.settlement_amount,
                    apiData.recipient?.amount
                );
            const fiatAmount = providerFiatAmount ?? (orderData.amount * rateVal);

            const senderFee = this.firstFiniteNumber(apiData.senderFee, apiData.sender_fee, apiData.fees?.senderFee) ?? 0;
            const transactionFee = this.firstFiniteNumber(apiData.transactionFee, apiData.transaction_fee, apiData.fees?.transactionFee) ?? 0;
            const validUntil =
                providerAccount.validUntil ||
                providerAccount.valid_until ||
                apiData.validUntil ||
                apiData.valid_until ||
                apiData.expiresAt ||
                apiData.expires_at ||
                '';

            return {
                id: apiData.id,
                orderId: apiData.id,
                receiveAddress,
                validUntil,
                senderFee,
                transactionFee,
                status: this.normalizeOrderStatus(apiData.status),
                amount: orderData.amount,
                token: orderData.token,
                network: orderData.network,
                fiatAmount: fiatAmount,
                fiatCurrency: orderData.recipient.currency || 'NGN',
                exchangeRate: rateVal,
                createdAt: new Date().toISOString()
            };
        } catch (error: any) {
            const providerError = this.extractProviderError(error);
            logger.error('Error creating order', {
                status: providerError.status,
                body: providerError.body,
                error: providerError.message,
            });
            throw new Error(`Failed to create offramp order: ${providerError.message}`);
        }
    }

    /**
     * Get offramp order status
     * GET /sender/orders/:id
     */
    static async getOrderStatus(orderId: string): Promise<any> {
        try {
            const response = await paycrestClientV2.get(`/sender/orders/${orderId}`);
            return response.data;
        } catch (error: any) {
            const providerError = this.extractProviderError(error);
            logger.error('Error getting order status', {
                status: providerError.status,
                body: providerError.body,
                error: providerError.message,
            });
            throw new Error('Failed to get order status from Paycrest');
        }
    }

    /**
     * Create an onramp (fiat -> crypto) order using the v2 unified order shape.
     * POST /v2/sender/orders
     * The user deposits `providerAccount.amountToTransfer` of `fiatCurrency` to
     * the returned virtual bank account; Paycrest then settles `token` to the
     * recipient address on `network`.
     */
    static async createOnrampOrder(orderData: OnrampOrderRequest): Promise<OnrampOrderResponse> {
        const refundInstitutionCode = await this.findInstitutionCode(
            orderData.refundAccount.institution,
            orderData.fiatCurrency
        );

        const networkCandidates = this.getNetworkCandidates(orderData.network);
        const reference = orderData.reference || `onramp-${Date.now()}`;
        let lastError: any = null;
        let response: any = null;

        for (const networkCandidate of networkCandidates) {
            const payload: Record<string, any> = {
                amount: String(orderData.fiatAmount),
                amountIn: 'fiat',
                source: {
                    type: 'fiat',
                    currency: orderData.fiatCurrency.toUpperCase(),
                    refundAccount: {
                        institution: refundInstitutionCode,
                        accountIdentifier: orderData.refundAccount.accountIdentifier,
                        accountName: orderData.refundAccount.accountName,
                    },
                },
                destination: {
                    type: 'crypto',
                    currency: orderData.token.toUpperCase(),
                    recipient: {
                        address: orderData.recipientAddress,
                        network: networkCandidate,
                    },
                },
                reference,
            };

            if (orderData.rate) {
                payload.rate = orderData.rate;
            }

            try {
                response = await paycrestClientV2.post('/sender/orders', payload);
                break;
            } catch (error: any) {
                lastError = error;
                logger.warn('Paycrest onramp order creation failed for network candidate', {
                    network: networkCandidate,
                    error: error.response?.data?.message || error.message,
                });
            }
        }

        if (!response) {
            throw lastError || new Error('Paycrest onramp order creation failed');
        }

        const apiData = response.data?.data || response.data;
        if (!apiData?.id) {
            logger.error('No onramp order id in response', { raw: response.data });
            throw new Error('Paycrest did not return a valid onramp order ID');
        }

        // Paycrest v2 has bounced between several shapes for the virtual
        // account block: top-level `providerAccount` / `provider_account`,
        // nested under `receiveAddress` / `paymentDetails`, or sibling fields
        // like `accountIdentifier` directly on the order. Coalesce across all
        // observed shapes so the user always sees the deposit details.
        const provider =
            apiData.providerAccount ||
            apiData.provider_account ||
            apiData.receiveAddress ||
            apiData.receive_address ||
            apiData.paymentDetails ||
            apiData.payment_details ||
            {};

        const institution =
            provider.institution ||
            provider.bankName ||
            provider.bank_name ||
            apiData.institution ||
            apiData.bankName ||
            apiData.bank_name ||
            null;

        const accountIdentifier =
            provider.accountIdentifier ||
            provider.account_identifier ||
            provider.accountNumber ||
            provider.account_number ||
            apiData.accountIdentifier ||
            apiData.account_identifier ||
            apiData.accountNumber ||
            apiData.account_number ||
            null;

        const accountName =
            provider.accountName ||
            provider.account_name ||
            apiData.accountName ||
            apiData.account_name ||
            null;

        const amountToTransfer = this.firstFiniteNumber(
            provider.amountToTransfer,
            provider.amount_to_transfer,
            apiData.amountToTransfer,
            apiData.amount_to_transfer,
            apiData.amount,
        );

        const validUntil =
            provider.validUntil ||
            provider.valid_until ||
            apiData.validUntil ||
            apiData.valid_until ||
            apiData.expiresAt ||
            apiData.expires_at ||
            null;

        if (!institution || !accountIdentifier) {
            logger.warn('Paycrest onramp order missing virtual account fields', {
                orderId: apiData.id,
                rawKeys: Object.keys(apiData),
                providerKeys: Object.keys(provider),
            });
        }

        return {
            id: apiData.id,
            status: String(apiData.status || 'initiated').toLowerCase(),
            reference: apiData.reference || reference,
            providerAccount: {
                institution,
                accountIdentifier,
                accountName,
                amountToTransfer: amountToTransfer ?? null,
                currency: provider.currency || orderData.fiatCurrency.toUpperCase(),
                validUntil,
            },
            exchangeRate: this.firstFiniteNumber(apiData.exchangeRate, apiData.exchange_rate, apiData.rate),
            estimatedCryptoAmount: this.firstFiniteNumber(
                apiData.cryptoAmount,
                apiData.crypto_amount,
                apiData.destinationAmount,
                apiData.destination_amount,
            ),
        };
    }
}

export interface OnrampOrderRequest {
    fiatAmount: number;
    fiatCurrency: 'NGN' | 'KES' | 'TZS' | 'MWK' | 'UGX' | 'BRL';
    token: 'USDC';
    network: 'base' | 'polygon' | 'celo' | 'arbitrum' | 'optimism';
    recipientAddress: string;
    refundAccount: {
        institution: string;
        accountIdentifier: string;
        accountName: string;
    };
    rate?: string;
    reference?: string;
}

export interface OnrampOrderResponse {
    id: string;
    status: string;
    reference: string | null;
    providerAccount: {
        institution: string | null;
        accountIdentifier: string | null;
        accountName: string | null;
        amountToTransfer: number | null;
        currency: string;
        validUntil: string | null;
    };
    exchangeRate: number | null;
    estimatedCryptoAmount: number | null;
}

export default PaycrestService;
