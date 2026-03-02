import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { createLogger } from '../utils/logger';

const logger = createLogger('BridgeUsd');

export interface BridgeUsdCustomer {
    id: string;
    status?: string;
    kycStatus?: string;
}

export interface BridgeVirtualAccount {
    id: string;
    accountNumberMasked: string | null;
    routingNumberMasked: string | null;
    bankName: string | null;
}

export interface BridgeUsdTransfer {
    id: string;
    status: string;
    amountUsd: number;
    providerFeeUsd: number;
    usdcAmountSettled: number;
    usdcTxHash: string | null;
    raw: Record<string, unknown>;
}

export interface BridgeTransferEvent {
    eventId: string;
    eventType: string;
    transferId: string;
    customerId: string | null;
    status: string;
    amountUsd: number;
    providerFeeUsd: number;
    usdcAmountSettled: number;
    usdcTxHash: string | null;
    payload: Record<string, unknown>;
}

class BridgeUsdService {
    private readonly apiBaseUrl: string;
    private readonly apiKey: string;
    private readonly webhookSecret: string;
    private readonly client: AxiosInstance | null;

    constructor() {
        this.apiBaseUrl = process.env.BRIDGE_API_BASE_URL || 'https://api.bridge.xyz';
        this.apiKey = process.env.BRIDGE_API_KEY || '';
        this.webhookSecret = process.env.BRIDGE_WEBHOOK_SECRET || '';

        if (!this.apiKey) {
            logger.warn('BRIDGE_API_KEY is not configured. USD account provider calls will fail.');
            this.client = null;
            return;
        }

        this.client = axios.create({
            baseURL: this.apiBaseUrl,
            timeout: 30000,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
        });
    }

    isEnabledForUser(userId: string): boolean {
        const globallyEnabled = process.env.USD_ACCOUNTS_ENABLED === 'true';
        if (!globallyEnabled) return false;

        const allowlistRaw = process.env.USD_ACCOUNTS_BETA_ALLOWLIST || '';
        const allowlist = allowlistRaw
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);

        if (allowlist.length === 0) return true;
        return allowlist.includes(userId);
    }

    getFeeConfig() {
        const feePercent = Number(process.env.USD_ACCOUNT_DEPOSIT_FEE_PERCENT || '1');
        const feeMin = Number(process.env.USD_ACCOUNT_FEE_MIN_USD || '0.25');
        const feeMax = Number(process.env.USD_ACCOUNT_FEE_MAX_USD || '10');

        return {
            feePercent: Number.isFinite(feePercent) ? feePercent : 1,
            feeMin: Number.isFinite(feeMin) ? feeMin : 0.25,
            feeMax: Number.isFinite(feeMax) ? feeMax : 10,
        };
    }

    calculateFees(amountUsd: number, providerFeeUsd: number) {
        const { feePercent, feeMin, feeMax } = this.getFeeConfig();
        const rawHedwigFee = amountUsd * (feePercent / 100);
        const boundedHedwigFee = Math.max(feeMin, Math.min(rawHedwigFee, feeMax));
        const hedwigFeeUsd = Math.max(0, boundedHedwigFee);
        const netSettlementUsd = Math.max(0, amountUsd - hedwigFeeUsd - providerFeeUsd);

        return {
            feePercent,
            hedwigFeeUsd,
            providerFeeUsd,
            netSettlementUsd,
        };
    }

    verifyWebhookSignature(rawBody: string, signature?: string | null): boolean {
        if (!this.webhookSecret) {
            logger.warn('BRIDGE_WEBHOOK_SECRET missing. Skipping signature verification.');
            return true;
        }
        if (!signature) return false;

        const expected = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(rawBody, 'utf8')
            .digest('hex');

        const normalized = signature.trim().replace(/^sha256=/i, '');
        const sigBuf = Buffer.from(normalized, 'utf8');
        const expectedBuf = Buffer.from(expected, 'utf8');
        if (sigBuf.length !== expectedBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expectedBuf);
    }

    async createOrGetCustomer(params: {
        externalUserId: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
    }): Promise<BridgeUsdCustomer> {
        const client = this.requireClient();

        try {
            const createResp = await client.post('/v0/customers', {
                external_id: params.externalUserId,
                email: params.email,
                first_name: params.firstName,
                last_name: params.lastName,
            });
            const data = this.extractPayload(createResp.data);
            return this.mapCustomer(data);
        } catch (error: any) {
            const message = String(error?.response?.data?.message || error?.message || '').toLowerCase();
            if (!message.includes('already') && !message.includes('exists')) {
                throw error;
            }
        }

        const findResp = await client.get('/v0/customers', {
            params: { external_id: params.externalUserId },
        });
        const payload = this.extractPayload(findResp.data);
        const first = Array.isArray(payload) ? payload[0] : payload;
        return this.mapCustomer(first);
    }

    async createKycLink(customerId: string): Promise<{ url: string; expiresAt?: string | null }> {
        const client = this.requireClient();
        const response = await client.post(`/v0/customers/${customerId}/kyc_links`, {});
        const data = this.extractPayload(response.data) as Record<string, unknown>;

        return {
            url: this.readString(data, ['url', 'kyc_url', 'link']) || '',
            expiresAt: this.readString(data, ['expires_at', 'expiresAt']) || null,
        };
    }

    async getCustomer(customerId: string): Promise<BridgeUsdCustomer> {
        const client = this.requireClient();
        const response = await client.get(`/v0/customers/${customerId}`);
        const data = this.extractPayload(response.data);
        return this.mapCustomer(data);
    }

    async getOrCreateAchAccount(customerId: string): Promise<BridgeVirtualAccount> {
        const client = this.requireClient();

        try {
            const createResponse = await client.post('/v0/virtual_accounts', {
                customer_id: customerId,
                rail: 'ach',
                currency: 'usd',
            });
            const data = this.extractPayload(createResponse.data);
            return this.mapVirtualAccount(data);
        } catch (error: any) {
            const message = String(error?.response?.data?.message || error?.message || '').toLowerCase();
            if (!message.includes('already') && !message.includes('exists')) {
                throw error;
            }
        }

        const listResponse = await client.get('/v0/virtual_accounts', {
            params: { customer_id: customerId, rail: 'ach' },
        });
        const payload = this.extractPayload(listResponse.data);
        const first = Array.isArray(payload) ? payload[0] : payload;
        return this.mapVirtualAccount(first);
    }

    parseTransferEvent(payload: Record<string, unknown>): BridgeTransferEvent {
        const eventId = this.readString(payload, ['id', 'event_id', 'eventId']) || `evt_${Date.now()}`;
        const eventType =
            this.readString(payload, ['type', 'event', 'event_type', 'eventType']) || 'transfer.updated';

        const transferObj =
            this.readObject(payload, ['data', 'transfer']) ||
            this.readObject(payload, ['transfer']) ||
            payload;

        const transferId =
            this.readString(transferObj, ['id', 'transfer_id', 'transferId']) ||
            this.readString(payload, ['transfer_id', 'transferId']) ||
            '';

        const customerId =
            this.readString(transferObj, ['customer_id', 'customerId']) ||
            this.readString(payload, ['customer_id', 'customerId']) ||
            null;

        const status =
            this.readString(transferObj, ['status', 'state']) ||
            this.readString(payload, ['status', 'state']) ||
            'pending';

        const amountUsd = this.readNumber(transferObj, ['amount_usd', 'amount', 'gross_amount_usd']) ||
            this.readNumber(payload, ['amount_usd', 'amount']) ||
            0;
        const providerFeeUsd =
            this.readNumber(transferObj, ['provider_fee_usd', 'network_fee_usd', 'fee_usd']) ||
            this.readNumber(payload, ['provider_fee_usd', 'network_fee_usd', 'fee_usd']) ||
            0;
        const usdcAmountSettled =
            this.readNumber(transferObj, ['usdc_amount_settled', 'settled_amount_usdc']) ||
            this.readNumber(payload, ['usdc_amount_settled', 'settled_amount_usdc']) ||
            0;
        const usdcTxHash =
            this.readString(transferObj, ['usdc_tx_hash', 'tx_hash', 'txHash']) ||
            this.readString(payload, ['usdc_tx_hash', 'tx_hash', 'txHash']) ||
            null;

        return {
            eventId,
            eventType,
            transferId,
            customerId,
            status,
            amountUsd,
            providerFeeUsd,
            usdcAmountSettled,
            usdcTxHash,
            payload,
        };
    }

    private requireClient() {
        if (!this.client) {
            throw new Error('Bridge USD is not configured (missing BRIDGE_API_KEY)');
        }
        return this.client;
    }

    private extractPayload(input: unknown): unknown {
        if (input && typeof input === 'object' && 'data' in (input as Record<string, unknown>)) {
            return (input as Record<string, unknown>).data;
        }
        return input;
    }

    private mapCustomer(raw: unknown): BridgeUsdCustomer {
        const obj = (raw || {}) as Record<string, unknown>;
        return {
            id: this.readString(obj, ['id', 'customer_id', 'customerId']) || '',
            status: this.readString(obj, ['status', 'state']) || undefined,
            kycStatus: this.readString(obj, ['kyc_status', 'kycStatus', 'verification_status']) || undefined,
        };
    }

    private mapVirtualAccount(raw: unknown): BridgeVirtualAccount {
        const obj = (raw || {}) as Record<string, unknown>;
        return {
            id: this.readString(obj, ['id', 'virtual_account_id', 'virtualAccountId']) || '',
            accountNumberMasked:
                this.readString(obj, ['account_number_masked', 'accountNumberMasked', 'account_number']) || null,
            routingNumberMasked:
                this.readString(obj, ['routing_number_masked', 'routingNumberMasked', 'routing_number']) || null,
            bankName: this.readString(obj, ['bank_name', 'bankName']) || null,
        };
    }

    private readString(obj: Record<string, unknown>, keys: string[]): string | null {
        for (const key of keys) {
            const value = obj[key];
            if (typeof value === 'string' && value.length > 0) {
                return value;
            }
        }
        return null;
    }

    private readNumber(obj: Record<string, unknown>, keys: string[]): number {
        for (const key of keys) {
            const value = obj[key];
            if (typeof value === 'number' && Number.isFinite(value)) return value;
            if (typeof value === 'string' && value.trim().length > 0) {
                const parsed = Number(value);
                if (Number.isFinite(parsed)) return parsed;
            }
        }
        return 0;
    }

    private readObject(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
        for (const key of keys) {
            const value = obj[key];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                return value as Record<string, unknown>;
            }
        }
        return null;
    }
}

export const bridgeUsdService = new BridgeUsdService();
export default BridgeUsdService;
