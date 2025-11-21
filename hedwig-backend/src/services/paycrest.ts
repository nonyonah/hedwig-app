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
        'X-API-Key': PAYCREST_API_KEY || '',
    },
    timeout: 30000,
});

// Types
export interface BankDetails {
    bankName: string;
    accountNumber: string;
    accountName?: string;
}

export interface OfframpOrderRequest {
    amount: string;
    token: 'USDC' | 'CUSD';
    network: 'base' | 'celo';
    recipientBankDetails: BankDetails;
    returnAddress: string; // User's wallet address for refunds
}

export interface OfframpOrderResponse {
    orderId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    amount: string;
    token: string;
    network: string;
    fiatAmount: number;
    fiatCurrency: string;
    exchangeRate: number;
    serviceFee: number;
    bankDetails: BankDetails;
    createdAt: string;
    txHash?: string;
}

export interface ExchangeRate {
    rate: number;
    timestamp: string;
    token: string;
    fiatCurrency: string;
}

export class PaycrestService {
    /**
     * Get current exchange rate for a token pair
     */
    static async getExchangeRate(
        token: 'USDC' | 'CUSD',
        fiatCurrency: string = 'NGN'
    ): Promise<ExchangeRate> {
        try {
            const response = await paycrestClient.get('/rates', {
                params: {
                    token: token.toUpperCase(),
                    currency: fiatCurrency.toUpperCase(),
                },
            });

            return {
                rate: response.data.rate,
                timestamp: response.data.timestamp || new Date().toISOString(),
                token,
                fiatCurrency,
            };
        } catch (error: any) {
            console.error('Paycrest get rate error:', error.response?.data || error.message);
            throw new Error('Failed to fetch exchange rate from Paycrest');
        }
    }

    /**
     * Verify bank account details
     */
    static async verifyBankAccount(
        bankName: string,
        accountNumber: string
    ): Promise<{ accountName: string; verified: boolean }> {
        try {
            const response = await paycrestClient.post('/verify-account', {
                bankName,
                accountNumber,
            });

            return {
                accountName: response.data.accountName,
                verified: response.data.verified || true,
            };
        } catch (error: any) {
            console.error('Paycrest verify account error:', error.response?.data || error.message);
            throw new Error('Failed to verify bank account');
        }
    }

    /**
     * Create an offramp order
     */
    static async createOfframpOrder(
        orderData: OfframpOrderRequest
    ): Promise<OfframpOrderResponse> {
        try {
            const response = await paycrestClient.post('/sender/orders', {
                amount: orderData.amount,
                token: orderData.token.toUpperCase(),
                network: orderData.network,
                recipient: {
                    bankName: orderData.recipientBankDetails.bankName,
                    accountNumber: orderData.recipientBankDetails.accountNumber,
                    accountName: orderData.recipientBankDetails.accountName,
                },
                returnAddress: orderData.returnAddress,
            });

            return {
                orderId: response.data.orderId || response.data.id,
                status: response.data.status,
                amount: response.data.amount,
                token: response.data.token,
                network: response.data.network,
                fiatAmount: response.data.fiatAmount,
                fiatCurrency: response.data.fiatCurrency || 'NGN',
                exchangeRate: response.data.exchangeRate,
                serviceFee: response.data.serviceFee || 0,
                bankDetails: {
                    bankName: orderData.recipientBankDetails.bankName,
                    accountNumber: orderData.recipientBankDetails.accountNumber,
                    accountName: orderData.recipientBankDetails.accountName,
                },
                createdAt: response.data.createdAt || new Date().toISOString(),
            };
        } catch (error: any) {
            console.error('Paycrest create order error:', error.response?.data || error.message);
            throw new Error('Failed to create offramp order');
        }
    }

    /**
     * Get offramp order status
     */
    static async getOrderStatus(orderId: string): Promise<OfframpOrderResponse> {
        try {
            const response = await paycrestClient.get(`/sender/orders/${orderId}`);

            return {
                orderId: response.data.orderId || response.data.id,
                status: response.data.status,
                amount: response.data.amount,
                token: response.data.token,
                network: response.data.network,
                fiatAmount: response.data.fiatAmount,
                fiatCurrency: response.data.fiatCurrency || 'NGN',
                exchangeRate: response.data.exchangeRate,
                serviceFee: response.data.serviceFee || 0,
                bankDetails: response.data.recipientBankDetails || {},
                createdAt: response.data.createdAt,
                txHash: response.data.txHash,
            };
        } catch (error: any) {
            console.error('Paycrest get order error:', error.response?.data || error.message);
            throw new Error('Failed to get order status from Paycrest');
        }
    }

    /**
     * List all offramp orders for a user
     */
    static async listOrders(
        limit: number = 20,
        offset: number = 0
    ): Promise<OfframpOrderResponse[]> {
        try {
            const response = await paycrestClient.get('/sender/orders', {
                params: { limit, offset },
            });

            return response.data.orders || response.data || [];
        } catch (error: any) {
            console.error('Paycrest list orders error:', error.response?.data || error.message);
            throw new Error('Failed to list offramp orders');
        }
    }
}

export default PaycrestService;
