import { createLogger } from '../utils/logger';

const logger = createLogger('SDP');

const SDP_API_URL = process.env.SDP_API_URL || 'http://localhost:8000';
const SDP_API_KEY = process.env.SDP_API_KEY || '';
const SDP_TENANT_NAME = process.env.SDP_TENANT_NAME || 'default';

const USDC_ASSET_ID = process.env.SDP_USDC_ASSET_ID || '';
const DEFAULT_WALLET_ID = process.env.SDP_WALLET_ID || '';

interface SDPDisbursement {
  id: string;
  name: string;
  status: string;
  wallet_id: string;
  asset_id: string;
  created_at: string;
}

interface SDPPayment {
  id: string;
  amount: string;
  status: string;
  receiver_wallet_id: string;
  stellar_transaction_id?: string;
  created_at: string;
}

async function sdpFetch(
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const url = `${SDP_API_URL}${path}`;
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    Authorization: `SDP_${SDP_API_KEY}`,
    'SDP-Tenant-Name': SDP_TENANT_NAME,
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> || {}),
  };

  logger.info('SDP request', { method: options.method || 'GET', url });

  const response = await fetch(url, { ...options, headers });

  if (path === '/health') return response;

  if (!response.ok) {
    const body = await response.text();
    logger.error('SDP request failed', { status: response.status, url, body });
    throw new Error(`SDP API ${response.status}: ${body}`);
  }

  if (response.status === 204) return null;

  return response.json();
}

export const SDPService = {
  async health(): Promise<boolean> {
    try {
      const response = await sdpFetch('/health', { method: 'GET' });
      return response.status === 200;
    } catch {
      return false;
    }
  },

  async getAssets(): Promise<Array<{ id: string; code: string; issuer: string }>> {
    return sdpFetch('/assets', { method: 'GET' });
  },

  async getWallets(): Promise<Array<{ id: string; name: string; enabled: boolean }>> {
    return sdpFetch('/wallets', { method: 'GET' });
  },

  async getOrganization(): Promise<any> {
    return sdpFetch('/organization', { method: 'GET' });
  },

  async getDisbursements(): Promise<Array<SDPDisbursement>> {
    return sdpFetch('/disbursements', { method: 'GET' });
  },

  async getDisbursement(id: string): Promise<SDPDisbursement> {
    return sdpFetch(`/disbursements/${id}`, { method: 'GET' });
  },

  async getDisbursementReceivers(disbursementId: string): Promise<Array<any>> {
    return sdpFetch(`/disbursements/${disbursementId}/receivers`, { method: 'GET' });
  },

  async getPayments(): Promise<Array<SDPPayment>> {
    return sdpFetch('/payments', { method: 'GET' });
  },

  async createDisbursement(params: {
    name: string;
    walletId?: string;
    assetId: string;
    verificationField?: string;
    registrationContactType?: string;
  }): Promise<SDPDisbursement> {
    const registrationContactType = params.registrationContactType || 'EMAIL_AND_WALLET_ADDRESS';
    const body: Record<string, any> = {
      name: params.name,
      asset_id: params.assetId,
      registration_contact_type: registrationContactType,
    };
    // wallet_id is only allowed for EMAIL or PHONE_NUMBER registration types
    if (params.walletId && (registrationContactType === 'EMAIL' || registrationContactType === 'PHONE_NUMBER')) {
      body.wallet_id = params.walletId;
    }
    if (registrationContactType !== 'EMAIL_AND_WALLET_ADDRESS' && params.verificationField) {
      body.verification_field = params.verificationField;
    }
    return sdpFetch('/disbursements', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async uploadInstructions(
    disbursementId: string,
    instructions: Array<{
      email: string;
      amount: string;
      walletAddress: string;
      id?: string;
    }>,
  ): Promise<any> {
    const csvHeader = 'email,amount,walletAddress,id\n';
    const csvRows = instructions
      .map(i => `${i.email},${i.amount},${i.walletAddress},${i.id || `emp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`)
      .join('\n');
    const csvContent = csvHeader + csvRows;

    const formData = new FormData();
    const blob = new Blob([csvContent], { type: 'text/csv' });
    formData.append('file', blob, 'instructions.csv');

    return sdpFetch(`/disbursements/${disbursementId}/instructions`, {
      method: 'POST',
      body: formData as any,
    });
  },

  async startDisbursement(disbursementId: string): Promise<any> {
    return sdpFetch(`/disbursements/${disbursementId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'STARTED' }),
    });
  },

  async pauseDisbursement(disbursementId: string): Promise<any> {
    return sdpFetch(`/disbursements/${disbursementId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PAUSED' }),
    });
  },

  async createPayrollDisbursement(
    name: string,
    items: Array<{
      email: string;
      stellarPublicKey: string;
      amountUsdc: string;
      externalId?: string;
    }>,
    walletId?: string,
    assetId?: string,
  ): Promise<{ disbursementId: string }> {
    const wallet = walletId || DEFAULT_WALLET_ID;
    const asset = assetId || USDC_ASSET_ID;

    if (!wallet) throw new Error('SDP wallet_id not configured');
    if (!asset) throw new Error('SDP USDC asset_id not configured');

    const disbursement = await this.createDisbursement({
      name,
      assetId: asset,
    });

    logger.info('Disbursement created', { id: disbursement.id, status: disbursement.status });

    const instructions = items.map(item => ({
      email: item.email,
      amount: (Number(item.amountUsdc) / 1_000_000).toString(),
      walletAddress: item.stellarPublicKey,
      id: item.externalId,
    }));

    await this.uploadInstructions(disbursement.id, instructions);
    logger.info('Instructions uploaded', { disbursementId: disbursement.id, count: instructions.length });

    await this.startDisbursement(disbursement.id);
    logger.info('Disbursement started', { id: disbursement.id });

    return { disbursementId: disbursement.id };
  },
};
