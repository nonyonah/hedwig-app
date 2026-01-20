import axios, { AxiosInstance, AxiosError } from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger('BlockradarService');

const BLOCKRADAR_API_URL = 'https://api.blockradar.co/v1';

interface BlockradarAddress {
  id: string;
  address: string;
  name: string;
  network: string;
  blockchain: {
    name: string;
    symbol: string;
  };
  configurations: {
    disableAutoSweep: boolean;
    enableGaslessWithdraw: boolean;
  };
  createdAt: string;
}

interface BlockradarBalance {
  assetId: string;
  asset: {
    symbol: string;
    name: string;
    decimals: number;
  };
  balance: string;
  balanceFormatted: string;
}

interface WithdrawParams {
  toAddress: string;
  amount: string;
  assetId: string;
  metadata?: Record<string, any>;
}

interface WithdrawResponse {
  id: string;
  txHash?: string;
  status: string;
  amount: string;
  fee: string;
}

class BlockradarService {
  private api: AxiosInstance;
  private baseWalletId: string;

  constructor() {
    const apiKey = process.env.BLOCKRADAR_API_KEY;
    this.baseWalletId = process.env.BLOCKRADAR_BASE_WALLET_ID || '';

    if (!apiKey) {
      logger.warn('BLOCKRADAR_API_KEY is not set');
    }

    this.api = axios.create({
      baseURL: BLOCKRADAR_API_URL,
      headers: {
        'x-api-key': apiKey || '',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Add response interceptor for error logging
    this.api.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        logger.error('Blockradar API error', {
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url,
        });
        throw error;
      }
    );
  }

  /**
   * Generate a dedicated address for a user
   * Each user gets their own deposit address that auto-sweeps to master wallet
   */
  async createAddress(
    userId: string,
    userName?: string
  ): Promise<BlockradarAddress> {
    logger.info('Creating Blockradar address', { userId });

    const response = await this.api.post(
      `/wallets/${this.baseWalletId}/addresses`,
      {
        name: userName || `User ${userId.substring(0, 8)}`,
        metadata: { userId },
        enableGaslessWithdraw: true,
        disableAutoSweep: false,
      }
    );

    logger.info('Blockradar address created', {
      addressId: response.data.data.id,
      address: response.data.data.address,
    });

    return response.data.data;
  }

  /**
   * Get address details by ID
   */
  async getAddress(addressId: string): Promise<BlockradarAddress> {
    const response = await this.api.get(`/addresses/${addressId}`);
    return response.data.data;
  }

  /**
   * Get the balance of a specific address
   */
  async getAddressBalance(addressId: string): Promise<BlockradarBalance[]> {
    const response = await this.api.get(`/addresses/${addressId}/balance`);
    return response.data.data || [];
  }

  /**
   * Get all addresses for the master wallet
   */
  async listAddresses(
    page: number = 1,
    limit: number = 100
  ): Promise<BlockradarAddress[]> {
    const response = await this.api.get(
      `/wallets/${this.baseWalletId}/addresses`,
      {
        params: { page, limit },
      }
    );
    return response.data.data || [];
  }

  /**
   * Withdraw from master wallet to an external address
   * Used for offramp to Paycrest
   */
  async withdraw(params: WithdrawParams): Promise<WithdrawResponse> {
    logger.info('Initiating Blockradar withdrawal', {
      toAddress: params.toAddress,
      amount: params.amount,
      assetId: params.assetId,
    });

    const response = await this.api.post(
      `/wallets/${this.baseWalletId}/withdraw`,
      {
        address: params.toAddress,
        amount: params.amount,
        assetId: params.assetId,
        metadata: params.metadata || {},
      }
    );

    logger.info('Withdrawal initiated', {
      id: response.data.data.id,
      status: response.data.data.status,
    });

    return response.data.data;
  }

  /**
   * Get master wallet balance
   */
  async getMasterWalletBalance(): Promise<BlockradarBalance[]> {
    const response = await this.api.get(
      `/wallets/${this.baseWalletId}/balance`
    );
    return response.data.data || [];
  }

  /**
   * Get supported assets for the wallet
   */
  async getAssets(): Promise<any[]> {
    const response = await this.api.get(`/wallets/${this.baseWalletId}/assets`);
    return response.data.data || [];
  }

  /**
   * Get transaction history for an address
   */
  async getAddressTransactions(
    addressId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<any[]> {
    const response = await this.api.get(`/addresses/${addressId}/transactions`, {
      params: { page, limit },
    });
    return response.data.data || [];
  }

  /**
   * Get a specific transaction by ID
   */
  async getTransaction(transactionId: string): Promise<any> {
    const response = await this.api.get(`/transactions/${transactionId}`);
    return response.data.data;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const crypto = require('crypto');
    const secret = process.env.BLOCKRADAR_WEBHOOK_SECRET;

    if (!secret) {
      logger.warn('BLOCKRADAR_WEBHOOK_SECRET is not set');
      return false;
    }

    const hash = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return hash === signature;
  }
}

export default new BlockradarService();
