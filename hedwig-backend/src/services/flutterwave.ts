import axios, { AxiosInstance } from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger('Flutterwave');

/**
 * Flutterwave NGN virtual accounts + transfers (replaces Strails).
 *
 * Docs: https://developer.flutterwave.com/v3.0/docs/ngn-virtual-accounts
 * - Static VA (permanent, per-user collection account) requires customer
 *   BVN/NIN. BVN is passed through transiently — NEVER persisted.
 * - Webhooks carry `verif-hash`; endpoint must answer 200 fast (60s timeout,
 *   3 retries @ 30min). Reconcile on tx_ref; flw_ref is the session id.
 * - Test mode: FLWSECK_TEST… keys. Static VA also needs a test BVN in sandbox.
 */

export interface FlutterwaveVirtualAccount {
  flwRef: string;
  orderRef: string;
  accountNumber: string;
  bankName: string;
  expiry: string | null;
  amount: string;
  note: string;
}

export interface FlutterwaveTransfer {
  id: number;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  fee: number;
  raw: Record<string, unknown>;
}

class FlutterwaveService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly client: AxiosInstance | null;

  constructor() {
    this.apiKey = process.env.FLUTTERWAVE_SECRET_KEY || '';
    this.baseUrl = (process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3').replace(/\/$/, '');
    if (!this.apiKey) {
      logger.warn('FLUTTERWAVE_SECRET_KEY is not configured. NGN account calls will fail.');
      this.client = null;
      return;
    }
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
    });
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  isTestMode(): boolean {
    return this.apiKey.startsWith('FLWSECK_TEST');
  }

  private requireClient(): AxiosInstance {
    if (!this.client) throw new Error('Flutterwave is not configured (missing FLUTTERWAVE_SECRET_KEY)');
    return this.client;
  }

  /** Create a STATIC (permanent) NGN virtual account. BVN or NIN required (either works);
   *  the identifier is passed through transiently — NEVER persisted. */
  async createStaticVirtualAccount(params: {
    email: string;
    txRef: string;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    narration?: string | null;
    bvn?: string | null;
    nin?: string | null;
    bankCode?: string | null;
  }): Promise<FlutterwaveVirtualAccount> {
    const bvn = (params.bvn ?? '').replace(/\D/g, '');
    const nin = (params.nin ?? '').replace(/\D/g, '');
    const idDoc = bvn.length === 11 ? { bvn } : nin.length === 11 ? { nin } : null;
    if (!idDoc) throw new Error('A valid 11-digit BVN or NIN is required');
    const body: Record<string, unknown> = {
      email: params.email,
      tx_ref: params.txRef,
      is_permanent: true,
      firstname: params.firstName ?? 'Hedwig',
      lastname: params.lastName ?? 'User',
      narration: params.narration ?? 'Hedwig NGN collection account',
      ...idDoc,
    };
    if (params.phone) body.phonenumber = params.phone;
    if (params.bankCode) body.bank_code = params.bankCode;
    // Sandbox provisioning is slow (single-digit seconds baseline even for
    // trivial calls) — allow headroom so slow successes aren't cut off.
    const { data } = await this.requireClient().post('/virtual-account-numbers', body, { timeout: 120000 });
    if (data?.status !== 'success') {
      throw new Error(data?.message || 'Flutterwave virtual account creation failed');
    }
    const d = data.data as Record<string, string>;
    return {
      flwRef: d.flw_ref,
      orderRef: d.order_ref,
      accountNumber: d.account_number,
      bankName: d.bank_name,
      expiry: d.expiry_date === 'N/A' ? null : (d.expiry_date ?? null),
      amount: d.amount,
      note: d.note ?? '',
    };
  }

  /** Create a DYNAMIC (single-use, amount-bound) VA for one invoice collection. No BVN needed. */
  async createDynamicVirtualAccount(params: {
    email: string;
    txRef: string;
    amount: number;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    narration?: string | null;
  }): Promise<FlutterwaveVirtualAccount> {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new Error('Dynamic virtual accounts require an amount greater than zero');
    }
    const { data } = await this.requireClient().post('/virtual-account-numbers', {
      email: params.email,
      tx_ref: params.txRef,
      amount: params.amount,
      phonenumber: params.phone ?? undefined,
      firstname: params.firstName ?? 'Hedwig',
      lastname: params.lastName ?? 'User',
      narration: params.narration ?? 'Invoice collection',
    }, { timeout: 120000 });
    if (data?.status !== 'success') {
      throw new Error(data?.message || 'Flutterwave dynamic account creation failed');
    }
    const d = data.data as Record<string, string>;
    return {
      flwRef: d.flw_ref,
      orderRef: d.order_ref,
      accountNumber: d.account_number,
      bankName: d.bank_name,
      expiry: d.expiry_date === 'N/A' ? null : (d.expiry_date ?? null),
      amount: d.amount,
      note: d.note ?? '',
    };
  }

  /** NGN bank transfer (offramp leg). */
  async initiateTransfer(params: {
    accountBank: string;
    accountNumber: string;
    amount: number;
    narration?: string | null;
    reference?: string | null;
    beneficiaryName?: string | null;
  }): Promise<FlutterwaveTransfer> {
    const reference = params.reference ?? `hedwig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data } = await this.requireClient().post('/transfers', {
      account_bank: params.accountBank,
      account_number: params.accountNumber,
      amount: params.amount,
      currency: 'NGN',
      narration: params.narration ?? 'Hedwig payout',
      reference,
      beneficiary_name: params.beneficiaryName ?? undefined,
    });
    if (data?.status !== 'success') {
      throw new Error(data?.message || 'Flutterwave transfer failed');
    }
    const d = data.data as Record<string, unknown>;
    return {
      id: Number(d.id ?? 0),
      reference: String(d.reference ?? reference),
      status: String(d.status ?? 'pending'),
      amount: Number(d.amount ?? params.amount),
      currency: 'NGN',
      fee: Number(d.fee ?? 0),
      raw: d,
    };
  }

  async getTransfer(id: number): Promise<Record<string, unknown>> {
    const { data } = await this.requireClient().get(`/transfers/${id}`);
    return (data?.data ?? {}) as Record<string, unknown>;
  }

  /** Verify a transaction server-side before crediting (docs best practice). */
  async verifyTransaction(id: number | string): Promise<Record<string, unknown>> {
    const { data } = await this.requireClient().get(`/transactions/${id}/verify`);
    return (data?.data ?? {}) as Record<string, unknown>;
  }

  /** NGN transfer banks (for the offramp bank picker). */
  async listBanks(): Promise<Array<{ code: string; name: string }>> {
    const { data } = await this.requireClient().get('/banks/NG');
    const list = (data?.data ?? []) as Array<{ code?: string; name?: string }>;
    return list
      .filter((b) => b.code && b.name)
      .map((b) => ({ code: b.code as string, name: b.name as string }));
  }

  /** Webhook authenticity: verif-hash header must equal FLW_SECRET_HASH. */
  verifyWebhookSignature(signature: string | string[] | undefined): boolean {
    const secret = process.env.FLW_SECRET_HASH || '';
    if (!secret) {
      logger.warn('FLW_SECRET_HASH is not configured; rejecting webhook');
      return false;
    }
    const sig = Array.isArray(signature) ? signature[0] : signature;
    return !!sig && sig === secret;
  }
}

export default new FlutterwaveService();
