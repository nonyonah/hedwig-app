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

            if (response.data?.status === 'success' && response.data?.data) {
                institutionsCache[currency] = response.data.data;
                cacheTimestamp = now;
                logger.debug('Fetched institutions', { count: response.data.data.length, currency });
                return response.data.data;
            }
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

        // First check our static map for quick lookup
        if (BANK_CODE_MAP[normalizedName]) {
            return BANK_CODE_MAP[normalizedName];
        }

        // Then try to fetch from API and match
        const institutions = await this.getSupportedInstitutions(currency);

        for (const inst of institutions) {
            const instName = (inst.name || '').toLowerCase();
            const instCode = inst.code || '';

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
        try {
            const response = await paycrestClient.get(
                `/rates/${token.toUpperCase()}/${amount}/${fiatCurrency.toUpperCase()}`,
                {
                    params: { network: network.toLowerCase() },
                }
            );

            // API returns { status, message, data: "rate_string" }
            return response.data.data;
        } catch (error: any) {
            logger.error('Error fetching rate', { error: error.response?.data?.message || error.message });
            throw new Error('Failed to fetch exchange rate from Paycrest: ' + (error.response?.data?.message || error.message));
        }
    }

    /**
     * Verify bank account details
     * POST /verify-account
     * Returns account name and verification status
     */
    static async verifyBankAccount(
        bankName: string,
        accountNumber: string
    ): Promise<{ accountName: string; verified: boolean }> {
        try {
            // Convert bank name to Paycrest institution code (async API lookup)
            const institutionCode = await this.findInstitutionCode(bankName);

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

            const payload = {
                amount: orderData.amount,
                token: orderData.token.toUpperCase(),
                network: orderData.network.toLowerCase(),
                rate: orderData.rate,
                recipient: {
                    institution: institutionCode,  // Use the looked-up code
                    accountIdentifier: orderData.recipient.accountIdentifier,
                    accountName: orderData.recipient.accountName,
                    currency: orderData.recipient.currency || 'NGN',
                    memo: orderData.recipient.memo || 'Payment',
                },
                returnAddress: orderData.returnAddress,
                reference: orderData.reference || `ref-${Date.now()}`,
            };

            const response = await paycrestClient.post('/sender/orders', payload);

            logger.info('Created offramp order');

            // Paycrest API returns: { status: "success", message: "...", data: { id, receiveAddress, ... } }
            const apiData = response.data?.data || response.data;

            if (!apiData?.id) {
                logger.error('No order ID in response');
                throw new Error('Paycrest did not return a valid order ID');
            }

            // Calculate estimated fiat amount based on rate
            const rateVal = parseFloat(orderData.rate);
            const fiatAmount = orderData.amount * rateVal;

            return {
                id: apiData.id,
                orderId: apiData.id,
                receiveAddress: apiData.receiveAddress,
                validUntil: apiData.validUntil,
                senderFee: apiData.senderFee || 0,
                transactionFee: apiData.transactionFee || 0,
                status: 'PENDING',
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
