import axios, { AxiosInstance } from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger('Strails');

const STRAILS_API_URL = process.env.STRAILS_API_URL || 'https://beta.stablesrail.io/v1';
const STRAILS_API_KEY = process.env.STRAILS_API_KEY || '';

if (!STRAILS_API_KEY) {
  logger.warn('STRAILS_API_KEY is not defined. Strails features will not work.');
}

const strailsClient: AxiosInstance = axios.create({
  baseURL: STRAILS_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': STRAILS_API_KEY,
  },
  timeout: 30000,
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface StrailsApiResponse<T = any> {
  status: string;
  response_code: string;
  message: string;
  data?: T;
  error?: string | { message: string; field?: string; reason?: string };
}

interface OnboardUserResponse {
  requestId: string;
  userHash: string;
  status: string;
  message?: string;
}

interface OnboardStatusResponse {
  type: string;
  userId: string;
  status: string;
  createdAt?: string;
  message?: string;
}

interface UserDetailsResponse {
  userId: string;
  isActive: boolean;
  personalDetails: {
    firstName: string;
    middleName?: string;
    lastName: string;
  };
  walletDetails: {
    evmWallet: string;
    bantuWallet?: string;
    solanaWallet?: string;
    walletCreatedAt: string;
  };
  virtualAccounts: Array<{
    accountNumber: string;
    accountName: string;
    bankName: string;
    bankCode: string;
    provider: string;
    accountType: string;
    reference: string;
    createdAt: string;
  }>;
}

interface OnrampResponse {
  requestId: string;
  walletAddress: string;
  status: string;
  autoSwapEnabled?: boolean;
  sweepToOfframpEnabled?: boolean;
  targetAsset?: string;
  feeBreakdown?: {
    baseAmount: number;
    fintechFee: number;
    strailsFee: number;
    totalFee: number;
    totalAmount: number;
  };
  message?: string;
}

interface VirtualAccountResponse {
  requestId: string;
  virtualAccount: {
    accountNumber: string;
    bankName: string;
    accountName: string;
    amount: number;
    baseAmount?: number;
    totalAmountWithFee?: number;
    feeBreakdown?: {
      userRequestedAmount: number;
      fintechFeeAmount: number;
      strailsFeeAmount: number;
      totalFeeAmount: number;
      finalAmount: number;
      amountToWallet: number;
    };
    createdAt: string;
  };
  walletAddress: string;
  status: string;
  version?: string;
}

interface OnrampStatusResponse {
  requestId: string;
  status: string;
  wallet: {
    walletAddress: string;
    owner: string;
    tokenBuy: string;
    autoSwap: boolean;
    sweepToOfframp: boolean;
    amount: string;
    createdAt: string;
    fundedAt?: string;
    transactionHash?: string;
    virtualAccountDetails: {
      accountNumber: string;
      bankName: string;
      accountName: string;
      amount: number;
      createdAt: string;
    };
    virtualAccountStatus: string;
  };
}

interface OfframpResponse {
  requestId: string;
  status: string;
  stage: string;
  tokenAddress?: string;
  vaultAddress?: string;
}

interface FintechVAccountResponse {
  virtualAccount: {
    accountNumber: string;
    accountName: string;
    bankName: string;
    provider: string;
    status: string;
    createdAt: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractError(error: any): string {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.data?.error) {
    const e = error.response.data.error;
    return typeof e === 'string' ? e : e.message || 'Request failed';
  }
  return error?.message || 'Strails request failed';
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const StrailsService = {
  /**
   * Onboard a user with BVN verification.
   * Returns requestId and userHash (which we store as the user's Strails ID).
   */
  async onboardUser(bvn: string): Promise<OnboardUserResponse> {
    logger.info('Onboarding user with BVN', { bvnLast4: bvn.slice(-4) });
    try {
      const { data } = await strailsClient.post<StrailsApiResponse<OnboardUserResponse>>(
        '/onboarduser',
        { bvn }
      );
      if (data.status !== 'Success' && data.response_code !== '00') {
        throw new Error(data.message || 'Onboarding failed');
      }
      if (!data.data) throw new Error('No data returned from onboarding');
      logger.info('User onboarding initiated', { userHash: data.data.userHash, requestId: data.data.requestId });
      return data.data;
    } catch (error: any) {
      logger.error('Failed to onboard user', { error: extractError(error) });
      throw error;
    }
  },

  /**
   * Check the status of a user's onboarding BVN verification.
   */
  async checkOnboardStatus(requestId: string): Promise<OnboardStatusResponse> {
    logger.info('Checking onboard status', { requestId });
    try {
      const { data } = await strailsClient.post<StrailsApiResponse<OnboardStatusResponse>>(
        '/onboardstatus',
        { requestId }
      );
      if (data.status !== 'Success' && data.response_code !== '00') {
        throw new Error(data.message || 'Status check failed');
      }
      if (!data.data) throw new Error('No data returned from status check');
      return data.data;
    } catch (error: any) {
      logger.error('Failed to check onboard status', { error: extractError(error) });
      throw error;
    }
  },

  /**
   * Get detailed user information including virtual accounts and wallet addresses.
   */
  async getUserDetails(userId: string): Promise<UserDetailsResponse> {
    logger.info('Getting user details', { userId });
    try {
      const { data } = await strailsClient.post<StrailsApiResponse<UserDetailsResponse>>(
        '/getuserdetails',
        { userId }
      );
      if (data.status !== 'Success' && data.response_code !== '00') {
        throw new Error(data.message || 'Failed to get user details');
      }
      if (!data.data) throw new Error('No data returned from user details');
      return data.data;
    } catch (error: any) {
      logger.error('Failed to get user details', { error: extractError(error) });
      throw error;
    }
  },

  /**
   * Create a temporary virtual account for one-time NGN funding (used for invoices).
   */
  async createOnrampVirtualAccount(params: {
    userId: string;
    amount: number;
    assetSwap?: string;
    autoSwap?: boolean;
    sweepToOfframp?: boolean;
  }): Promise<OnrampResponse> {
    logger.info('Creating onramp VA', { userId: params.userId, amount: params.amount });
    try {
      const body: Record<string, any> = {
        userId: params.userId,
        amount: params.amount,
        assetSwap: params.assetSwap || 'USDC',
        autoSwap: params.autoSwap !== false,
        sweepToOfframp: params.sweepToOfframp !== false,
      };
      const { data } = await strailsClient.post<StrailsApiResponse<OnrampResponse>>(
        '/cngnonramp',
        body
      );
      if (data.status !== 'Success' && data.response_code !== '00') {
        throw new Error(data.message || 'Failed to create onramp');
      }
      if (!data.data) throw new Error('No data returned from onramp');
      logger.info('Onramp VA created', { requestId: data.data.requestId });
      return data.data;
    } catch (error: any) {
      logger.error('Failed to create onramp VA', { error: extractError(error) });
      throw error;
    }
  },

  /**
   * Get the virtual account details for a payment (bank name, account number, amount).
   */
  async getVirtualAccount(requestId: string): Promise<VirtualAccountResponse> {
    logger.info('Getting virtual account', { requestId });
    try {
      const { data } = await strailsClient.post<StrailsApiResponse<VirtualAccountResponse>>(
        '/getvirtualaccount',
        { requestId }
      );
      if (data.status !== 'Success' && data.response_code !== '00') {
        throw new Error(data.message || 'Virtual account not found');
      }
      if (!data.data) throw new Error('No data returned from virtual account');
      return data.data;
    } catch (error: any) {
      logger.error('Failed to get virtual account', { error: extractError(error) });
      throw error;
    }
  },

  /**
   * Check the status of an onramp/funding request.
   */
  async checkOnrampStatus(walletAddress: string): Promise<OnrampStatusResponse> {
    logger.info('Checking onramp status', { walletAddress });
    try {
      const { data } = await strailsClient.post<StrailsApiResponse<OnrampStatusResponse>>(
        '/cngnonrampstatus',
        { walletAddress }
      );
      if (data.status !== 'Success' && data.response_code !== '00') {
        throw new Error(data.message || 'Status check failed');
      }
      if (!data.data) throw new Error('No data returned from status check');
      return data.data;
    } catch (error: any) {
      logger.error('Failed to check onramp status', { error: extractError(error) });
      throw error;
    }
  },

  /**
   * Offramp cNGN to a Nigerian bank account (for payroll payouts).
   */
  async offramp(params: {
    userId: string;
    amount: number;
    accountNumber: string;
    bankCode: string;
    ticker?: string;
  }): Promise<OfframpResponse> {
    logger.info('Initiating offramp', {
      userId: params.userId,
      amount: params.amount,
      accountNumber: params.accountNumber.slice(-4),
      bankCode: params.bankCode,
    });
    try {
      const { data } = await strailsClient.post<StrailsApiResponse<OfframpResponse>>(
        '/cngnofframp',
        {
          userId: params.userId,
          amount: params.amount,
          accountNumber: params.accountNumber,
          bankCode: params.bankCode,
          ticker: params.ticker || 'CNGN',
        }
      );
      if (data.status !== 'Success' && data.response_code !== '00') {
        throw new Error(data.message || 'Offramp failed');
      }
      if (!data.data) throw new Error('No data returned from offramp');
      logger.info('Offramp initiated', { requestId: data.data.requestId });
      return data.data;
    } catch (error: any) {
      logger.error('Failed to initiate offramp', { error: extractError(error) });
      throw error;
    }
  },

  /**
   * Check the status of an offramp request.
   */
  async checkOfframpStatus(requestId: string): Promise<any> {
    logger.info('Checking offramp status', { requestId });
    try {
      const { data } = await strailsClient.post<StrailsApiResponse>(
        '/cngnofframpstatus',
        { requestId }
      );
      if (data.status !== 'Success' && data.response_code !== '00') {
        throw new Error(data.message || 'Status check failed');
      }
      return data.data;
    } catch (error: any) {
      logger.error('Failed to check offramp status', { error: extractError(error) });
      throw error;
    }
  },

  /**
   * Get the fintech's permanent virtual account details.
   */
  async getFintechVirtualAccount(): Promise<FintechVAccountResponse> {
    logger.info('Getting fintech virtual account');
    try {
      const { data } = await strailsClient.get<StrailsApiResponse<FintechVAccountResponse>>(
        '/getfintechvirtualaccount'
      );
      if (data.status !== 'Success' && data.response_code !== '00') {
        throw new Error(data.message || 'Failed to get fintech virtual account');
      }
      if (!data.data) throw new Error('No data returned from fintech virtual account');
      return data.data;
    } catch (error: any) {
      logger.error('Failed to get fintech virtual account', { error: extractError(error) });
      throw error;
    }
  },

  /** Utility */
  formatNaira,
};

export default StrailsService;
