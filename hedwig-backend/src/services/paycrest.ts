import axios, { AxiosInstance } from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger('Paycrest');

const PAYCREST_API_URL = process.env.PAYCREST_API_URL || 'https://api.paycrest.io/v1';
const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY;

if (!PAYCREST_API_KEY) {
    logger.warn('PAYCREST_API_KEY is not defined. Offramp features will not work.');
}

// Paycrest API client
const paycrestClient: AxiosInstance = axios.create({
    baseURL: PAYCREST_API_URL,
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
    network: 'base' | 'solana';
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

        if (normalized === 'base') {
            // Paycrest docs currently show `ethereum` in sender order examples.
            // We still try `base` first to preserve the current integration, then
            // fall back to `ethereum` if the provider rejects the network value.
            return ['base', 'ethereum'];
        }

        return [normalized];
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
                const response = await paycrestClient.get(
                    `/rates/${token.toUpperCase()}/${amount}/${fiatCurrency.toUpperCase()}`,
                    {
                        params: { network: networkCandidate },
                    }
                );

                // API returns { status, message, data: "rate_string" }
                return response.data.data;
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

            const response = await paycrestClient.post('/verify-account', {
                institution: institutionCode,
                accountIdentifier: accountNumber
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
                const payload = {
                    amount: orderData.amount,
                    token: orderData.token.toUpperCase(),
                    network: networkCandidate,
                    rate: orderData.rate,
                    recipient: {
                        institution: institutionCode,
                        accountIdentifier: orderData.recipient.accountIdentifier,
                        accountName: orderData.recipient.accountName,
                        currency: orderData.recipient.currency || 'NGN',
                        memo: orderData.recipient.memo || 'Payment',
                    },
                    returnAddress: orderData.returnAddress,
                    reference: orderData.reference || `ref-${Date.now()}`,
                };

                try {
                    response = await paycrestClient.post('/sender/orders', payload);
                    break;
                } catch (error: any) {
                    lastError = error;
                    logger.warn('Paycrest order creation failed for network candidate', {
                        network: networkCandidate,
                        error: error.response?.data?.message || error.message
                    });
                }
            }

            if (!response) {
                throw lastError || new Error('Paycrest order creation failed');
            }

            logger.info('Created offramp order');

            // Paycrest API returns: { status: "success", message: "...", data: { id, receiveAddress, ... } }
            const apiData = response.data?.data || response.data;

            if (!apiData?.id) {
                logger.error('No order ID in response');
                throw new Error('Paycrest did not return a valid order ID');
            }

            // Prefer provider-returned values when available to avoid UI/backend mismatch.
            const providerRate =
                this.firstFiniteNumber(apiData.exchangeRate, apiData.exchange_rate, apiData.rate);
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

            const senderFee = this.firstFiniteNumber(apiData.senderFee, apiData.sender_fee) ?? 0;
            const transactionFee = this.firstFiniteNumber(apiData.transactionFee, apiData.transaction_fee) ?? 0;
            const statusRaw = String(apiData.status || 'PENDING').toUpperCase();
            const normalizedStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' =
                statusRaw === 'COMPLETED' || statusRaw === 'SUCCESS'
                    ? 'COMPLETED'
                    : statusRaw === 'FAILED' || statusRaw === 'CANCELLED' || statusRaw === 'REFUNDED' || statusRaw === 'EXPIRED'
                        ? 'FAILED'
                        : statusRaw === 'PROCESSING'
                            ? 'PROCESSING'
                            : 'PENDING';

            return {
                id: apiData.id,
                orderId: apiData.id,
                receiveAddress: apiData.receiveAddress,
                validUntil: apiData.validUntil,
                senderFee,
                transactionFee,
                status: normalizedStatus,
                amount: orderData.amount,
                token: orderData.token,
                network: orderData.network,
                fiatAmount: fiatAmount,
                fiatCurrency: orderData.recipient.currency || 'NGN',
                exchangeRate: rateVal,
                createdAt: new Date().toISOString()
            };
        } catch (error: any) {
            logger.error('Error creating order', { error: error.response?.data?.message || error.message });
            throw new Error('Failed to create offramp order: ' + (JSON.stringify(error.response?.data) || error.message));
        }
    }

    /**
     * Get offramp order status
     * GET /sender/orders/:id
     */
    static async getOrderStatus(orderId: string): Promise<any> {
        try {
            const response = await paycrestClient.get(`/sender/orders/${orderId}`);
            return response.data;
        } catch (error: any) {
            logger.error('Error getting order status', { error: error.response?.data?.message || error.message });
            // Return null or throw?
            throw new Error('Failed to get order status from Paycrest');
        }
    }
}

export default PaycrestService;
