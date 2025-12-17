import axios, { AxiosInstance } from 'axios';

const PAYCREST_API_URL = process.env.PAYCREST_API_URL || 'https://api.paycrest.io/v1';
const PAYCREST_API_KEY = process.env.PAYCREST_API_KEY;

if (!PAYCREST_API_KEY) {
    console.warn('PAYCREST_API_KEY is not defined. Offramp features will not work.');
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
    token: 'USDC' | 'CUSD' | 'USDT';
    network: 'base' | 'celo' | 'solana';
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

export class PaycrestService {
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
            console.error('Paycrest get rate error:', error.response?.data || error.message);
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
            // Convert bank name to Paycrest institution code
            const institutionCode = this.getBankCode(bankName);

            console.log('[Paycrest] Verifying account with:', {
                institution: institutionCode,
                accountIdentifier: accountNumber,
                originalBankName: bankName
            });

            const response = await paycrestClient.post('/verify-account', {
                institution: institutionCode,
                accountIdentifier: accountNumber
            });

            console.log('[Paycrest] Verify account response:', response.data);

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
            console.error('Paycrest verify account error:', error.response?.data || error.message);
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
            const payload = {
                amount: orderData.amount,
                token: orderData.token.toUpperCase(),
                network: orderData.network.toLowerCase(),
                rate: orderData.rate,
                recipient: {
                    institution: orderData.recipient.institution,
                    accountIdentifier: orderData.recipient.accountIdentifier,
                    accountName: orderData.recipient.accountName,
                    currency: orderData.recipient.currency || 'NGN',
                    memo: orderData.recipient.memo || 'Payment',
                },
                returnAddress: orderData.returnAddress,
                reference: orderData.reference || `ref-${Date.now()}`,
            };

            const response = await paycrestClient.post('/sender/orders', payload);

            // Response: { id, receiveAddress, validUntil, senderFee, transactionFee }
            const apiData = response.data; // or response.data.data depending on wrapper

            // Calculate estimated fiat amount based on rate
            const rateVal = parseFloat(orderData.rate);
            const fiatAmount = orderData.amount * rateVal;

            return {
                id: apiData.id,
                orderId: apiData.id,
                receiveAddress: apiData.receiveAddress,
                validUntil: apiData.validUntil,
                senderFee: apiData.senderFee,
                transactionFee: apiData.transactionFee,
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
            console.error('Paycrest create order error:', error.response?.data || error.message);
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
            console.error('Paycrest get order error:', error.response?.data || error.message);
            // Return null or throw?
            throw new Error('Failed to get order status from Paycrest');
        }
    }
}

export default PaycrestService;
