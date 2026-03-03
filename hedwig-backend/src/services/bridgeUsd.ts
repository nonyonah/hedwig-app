import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { createLogger } from '../utils/logger';

const logger = createLogger('BridgeUsd');

export interface BridgeUsdCustomer {
    id: string;
    status?: string;
    kycStatus?: string;
    hasAcceptedTerms?: boolean;
    tosStatus?: string;
    baseEndorsementStatus?: string;
}

export interface BridgeVirtualAccount {
    id: string;
    accountNumberMasked: string | null;
    routingNumberMasked: string | null;
    bankName: string | null;
    bankAddress: string | null;
    accountName: string | null;
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
    private readonly webhookPublicKey: string;
    private readonly client: AxiosInstance | null;

    constructor() {
        this.apiKey = process.env.BRIDGE_API_KEY || '';
        this.apiBaseUrl = this.resolveApiBaseUrl();
        this.webhookPublicKey = (process.env.BRIDGE_WEBHOOK_PUBLIC_KEY || '').replace(/\\n/g, '\n');

        if (!this.apiKey) {
            logger.warn('BRIDGE_API_KEY is not configured. USD account provider calls will fail.');
            this.client = null;
            return;
        }

        this.client = axios.create({
            baseURL: this.apiBaseUrl,
            timeout: 30000,
            headers: {
                'Api-Key': this.apiKey,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        });

        logger.info('Bridge USD client configured', {
            baseUrl: this.apiBaseUrl,
            sandbox: this.isSandboxMode(),
            hasWebhookPublicKey: Boolean(this.webhookPublicKey),
        });
    }

    isEnabledForUser(userId: string): boolean {
        const forceEnabled = process.env.USD_ACCOUNTS_FORCE_ENABLE === 'true';
        if (forceEnabled) return true;

        const sandboxMode = this.isSandboxMode();
        const globallyEnabled = process.env.USD_ACCOUNTS_ENABLED === 'true';

        // In sandbox, allow testing without requiring production rollout flags.
        if (!sandboxMode && !globallyEnabled) return false;

        const allowlistRaw = process.env.USD_ACCOUNTS_BETA_ALLOWLIST || '';
        const allowlist = allowlistRaw
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);

        if (allowlist.length === 0) return true;
        return allowlist.includes(userId);
    }

    getFeeConfig() {
        const feePercent = Number(process.env.USD_ACCOUNT_DEPOSIT_FEE_PERCENT || '0');
        const feeMin = Number(process.env.USD_ACCOUNT_FEE_MIN_USD || '0.25');
        const feeMax = Number(process.env.USD_ACCOUNT_FEE_MAX_USD || '10');

        return {
            feePercent: Number.isFinite(feePercent) ? feePercent : 0,
            feeMin: Number.isFinite(feeMin) ? feeMin : 0.25,
            feeMax: Number.isFinite(feeMax) ? feeMax : 10,
        };
    }

    calculateFees(amountUsd: number, providerFeeUsd: number) {
        const { feePercent, feeMin, feeMax } = this.getFeeConfig();
        const normalizedPercent = Number.isFinite(feePercent) ? feePercent : 0;
        const normalizedProviderFee = Math.max(0, Number.isFinite(providerFeeUsd) ? providerFeeUsd : 0);

        let hedwigFeeUsd = 0;
        if (normalizedPercent > 0) {
            const rawHedwigFee = amountUsd * (normalizedPercent / 100);
            const boundedHedwigFee = Math.max(feeMin, Math.min(rawHedwigFee, feeMax));
            hedwigFeeUsd = Math.max(0, boundedHedwigFee);
        }

        const netSettlementUsd = Math.max(0, amountUsd - hedwigFeeUsd - normalizedProviderFee);

        return {
            feePercent: normalizedPercent,
            hedwigFeeUsd,
            providerFeeUsd: normalizedProviderFee,
            netSettlementUsd,
        };
    }

    isSandbox(): boolean {
        return this.isSandboxMode();
    }

    private isSandboxMode(): boolean {
        const bridgeEnv = (process.env.BRIDGE_ENV || '').toLowerCase();
        if (bridgeEnv === 'sandbox' || bridgeEnv === 'test') return true;

        const apiBase = (this.apiBaseUrl || process.env.BRIDGE_API_BASE_URL || '').toLowerCase();
        if (apiBase.includes('sandbox')) return true;

        const apiKey = (this.apiKey || process.env.BRIDGE_API_KEY || '').toLowerCase();
        if (apiKey.startsWith('sk-test-')) return true;

        return false;
    }

    private resolveApiBaseUrl(): string {
        const configured = (process.env.BRIDGE_API_BASE_URL || '').trim();
        const apiKey = (process.env.BRIDGE_API_KEY || '').trim().toLowerCase();
        const isTestKey = apiKey.startsWith('sk-test-');
        const sandboxBase = 'https://api.sandbox.bridge.xyz';
        const productionBase = 'https://api.bridge.xyz';

        if (!configured) {
            return isTestKey ? sandboxBase : productionBase;
        }

        const normalized = configured.replace(/\/+$/, '');
        if (isTestKey && normalized === productionBase) {
            logger.warn('Using sandbox Bridge base URL because BRIDGE_API_KEY is a test key.');
            return sandboxBase;
        }

        return normalized;
    }

    private buildIdempotencyKey(prefix: string): string {
        return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    private buildCustomerCreatePayload(params: {
        externalUserId: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
    }): Record<string, unknown> {
        const sandboxMode = this.isSandboxMode();
        const firstName = (params.firstName || 'John').trim();
        const lastName = (params.lastName || 'Doe').trim();
        const email = params.email || `${params.externalUserId}@example.com`;

        // Bridge sandbox works best with Customers API full payload.
        if (sandboxMode) {
            return {
                first_name: firstName,
                last_name: lastName,
                email,
                type: 'individual',
                ...this.buildSandboxCustomerIdentityFields(),
            };
        }

        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        return {
            full_name: fullName || undefined,
            email,
            type: 'individual',
        };
    }

    private buildSandboxCustomerIdentityFields(): Record<string, unknown> {
        return {
            // Match Bridge sandbox customer shape for virtual account creation.
            address: {
                street_line_1: '123 Main St',
                street_line_2: 'Apt 1',
                city: 'New York',
                state: 'NY',
                postal_code: '10001',
                country: 'USA',
            },
            birth_date: '1990-01-01',
            phone: '+15555555555',
            tax_identification_number: '111-11-1111',
            signed_agreement_id: crypto.randomUUID(),
            has_accepted_terms_of_service: true,
            identifying_information: [
                {
                    type: 'ssn',
                    issuing_country: 'usa',
                    number: '111-11-1111',
                },
            ],
        };
    }

    private buildSandboxReplacementEmail(email: string): string {
        const atIndex = email.indexOf('@');
        if (atIndex <= 0) {
            return `${email.replace(/[^a-zA-Z0-9._+-]/g, '')}+bridge${Date.now()}@example.com`;
        }

        const local = email.slice(0, atIndex);
        const domain = email.slice(atIndex + 1);
        return `${local}+bridge${Date.now()}@${domain}`;
    }

    async ensureSandboxCustomerAddressData(customerId: string): Promise<void> {
        if (!this.isSandboxMode()) return;
        const client = this.requireClient();
        const payload = this.buildSandboxCustomerIdentityFields();
        try {
            await client.put(`/v0/customers/${customerId}`, payload);
        } catch (putError: any) {
            throw new Error(this.describeAxiosError(putError));
        }
    }

    async waitForActiveCustomer(
        customerId: string,
        options?: { retries?: number; delayMs?: number }
    ): Promise<BridgeUsdCustomer> {
        const retries = Math.max(1, options?.retries ?? 6);
        const delayMs = Math.max(200, options?.delayMs ?? 800);
        let latest: BridgeUsdCustomer = await this.getCustomer(customerId);

        for (let attempt = 0; attempt < retries; attempt += 1) {
            const status = (latest.status || '').toLowerCase();
            const kycStatus = (latest.kycStatus || '').toLowerCase();
            if (status === 'active' || status === 'approved' || kycStatus === 'active' || kycStatus === 'approved') {
                return latest;
            }

            await new Promise((resolve) => setTimeout(resolve, delayMs));
            latest = await this.getCustomer(customerId);
        }

        return latest;
    }

    verifyWebhookSignature(rawBody: string, signatureHeader?: string | null): boolean {
        if (!this.webhookPublicKey) {
            logger.warn('BRIDGE_WEBHOOK_PUBLIC_KEY missing. Skipping signature verification.');
            return true;
        }
        if (!signatureHeader) return false;

        try {
            const parts = signatureHeader.split(',');
            const timestamp = parts.find((part) => part.startsWith('t='))?.split('=')[1];
            const signature = parts.find((part) => part.startsWith('v0='))?.split('=')[1];
            if (!timestamp || !signature) return false;

            const ts = Number(timestamp);
            if (!Number.isFinite(ts)) return false;

            // Reject replayed events older than 10 minutes (docs recommendation)
            const nowMs = Date.now();
            if (Math.abs(nowMs - ts) > 10 * 60 * 1000) return false;

            const signedPayload = `${timestamp}.${rawBody}`;

            // Bridge docs sample signs a SHA-256 digest.
            const digest = crypto.createHash('sha256').update(signedPayload, 'utf8').digest();
            const verifierDigest = crypto.createVerify('RSA-SHA256');
            verifierDigest.update(digest);
            const okDigest = verifierDigest.verify(this.webhookPublicKey, signature, 'base64');
            if (okDigest) return true;

            // Fallback for providers signing the raw payload directly.
            const verifierRaw = crypto.createVerify('RSA-SHA256');
            verifierRaw.update(signedPayload, 'utf8');
            return verifierRaw.verify(this.webhookPublicKey, signature, 'base64');
        } catch (error) {
            logger.warn('Bridge webhook signature verification failed', {
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return false;
        }
    }

    async createOrGetCustomer(params: {
        externalUserId: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
    }): Promise<BridgeUsdCustomer> {
        const client = this.requireClient();
        const createPayload = this.buildCustomerCreatePayload(params);

        try {
            const createResp = await client.post('/v0/customers', createPayload, {
                headers: {
                    'Idempotency-Key': this.buildIdempotencyKey(`customer_${params.externalUserId}`),
                },
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
            params: params.email ? { email: params.email } : undefined,
        });
        const payload = this.extractPayload(findResp.data);
        const list = Array.isArray(payload) ? payload : [payload];
        const matched = list.find((entry) => {
            if (!entry || typeof entry !== 'object') return false;
            const record = entry as Record<string, unknown>;
            const email = typeof record.email === 'string' ? record.email.toLowerCase() : null;
            return Boolean(params.email && email === params.email.toLowerCase());
        }) || list[0];
        return this.mapCustomer(matched);
    }

    async createSandboxReplacementCustomer(params: {
        externalUserId: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
    }): Promise<BridgeUsdCustomer> {
        if (!this.isSandboxMode()) {
            throw new Error('Sandbox replacement customer creation is only available in sandbox mode.');
        }
        const client = this.requireClient();

        const baseEmail = params.email || `${params.externalUserId}@example.com`;
        const replacementEmail = this.buildSandboxReplacementEmail(baseEmail);
        const payload = this.buildCustomerCreatePayload({
            externalUserId: `${params.externalUserId}_${Date.now()}`,
            email: replacementEmail,
            firstName: params.firstName,
            lastName: params.lastName,
        });

        const createResp = await client.post('/v0/customers', payload, {
            headers: {
                'Idempotency-Key': this.buildIdempotencyKey(`customer_replacement_${params.externalUserId}`),
            },
        });
        const data = this.extractPayload(createResp.data);
        return this.mapCustomer(data);
    }

    async createKycLink(customerId: string): Promise<{ url: string; expiresAt?: string | null }> {
        const client = this.requireClient();
        const response = await client.post(`/v0/customers/${customerId}/kyc_links`, {}, {
            headers: {
                'Idempotency-Key': this.buildIdempotencyKey(`kyc_${customerId}`),
            },
        });
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

    async getOrCreateAchAccount(params: {
        customerId: string;
        destinationAddress: string;
        developerFeePercent?: string;
    }): Promise<BridgeVirtualAccount> {
        const client = this.requireClient();
        const { customerId, destinationAddress, developerFeePercent } = params;
        const requestedRail = (process.env.BRIDGE_USD_DESTINATION_PAYMENT_RAIL || 'base').toLowerCase();
        const railsToTry = Array.from(new Set([requestedRail, 'ethereum']));
        const createErrors: string[] = [];

        for (const rail of railsToTry) {
            try {
                const createResponse = await client.post(`/v0/customers/${customerId}/virtual_accounts`, {
                    ...(developerFeePercent ? { developer_fee_percent: developerFeePercent } : {}),
                    source: {
                        currency: 'usd',
                    },
                    destination: {
                        currency: 'usdc',
                        payment_rail: rail,
                        address: destinationAddress,
                    },
                }, {
                    headers: {
                        'Idempotency-Key': this.buildIdempotencyKey(`va_${customerId}_${rail}`),
                    },
                });
                const data = this.extractPayload(createResponse.data);
                const mapped = this.mapVirtualAccount(data);
                if (mapped.id || mapped.accountNumberMasked || mapped.routingNumberMasked) {
                    return mapped;
                }
                createErrors.push(`rail=${rail}: created virtual account response missing ACH fields`);
            } catch (error: any) {
                const message = String(error?.response?.data?.message || error?.message || '').toLowerCase();
                const normalized = this.describeAxiosError(error);
                createErrors.push(`rail=${rail}: ${normalized}`);

                if (message.includes('already') || message.includes('exists')) {
                    break;
                }
            }
        }

        try {
            const listResponse = await client.get(`/v0/customers/${customerId}/virtual_accounts`);
            const payload = this.extractPayload(listResponse.data);
            const first = Array.isArray(payload) ? payload[0] : payload;
            const mapped = this.mapVirtualAccount(first);
            if (mapped.id || mapped.accountNumberMasked || mapped.routingNumberMasked) {
                return mapped;
            }
            throw new Error('Listed virtual account response missing ACH fields');
        } catch (listError: any) {
            const normalizedList = this.describeAxiosError(listError);
            const combinedError = createErrors.length
                ? `${createErrors.join(' | ')} | list: ${normalizedList}`
                : normalizedList;
            throw new Error(`Bridge virtual account error: ${combinedError}`);
        }
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
        const status =
            this.readString(obj, ['status', 'state', 'account_status', 'customer_status']) ||
            this.readString(obj, ['kyc_status', 'kycStatus']) ||
            undefined;
        const endorsements =
            (obj.endorsements && Array.isArray(obj.endorsements) ? obj.endorsements : null) as
                | Array<Record<string, unknown>>
                | null;
        const baseEndorsement = endorsements?.find((entry) => {
            const name = String(entry?.name || entry?.type || '').toLowerCase();
            return name.includes('base');
        });
        return {
            id: this.readString(obj, ['id', 'customer_id', 'customerId']) || '',
            status,
            kycStatus: this.readString(obj, ['kyc_status', 'kycStatus', 'verification_status']) || undefined,
            hasAcceptedTerms:
                this.readBoolean(obj, ['has_accepted_terms_of_service', 'hasAcceptedTermsOfService']) ?? undefined,
            tosStatus: this.readString(obj, ['tos_status', 'tosStatus']) || undefined,
            baseEndorsementStatus:
                (baseEndorsement && this.readString(baseEndorsement, ['status', 'state'])) || undefined,
        };
    }

    private mapVirtualAccount(raw: unknown): BridgeVirtualAccount {
        const obj = this.pickVirtualAccountCandidate(raw);
        const sourceDepositInstructions =
            this.readObject(obj, ['source_deposit_instructions']) ||
            this.readObject(obj, ['sourceDepositInstructions']) ||
            {};
        const sourcePaymentRail =
            this.readArrayFirstObject(sourceDepositInstructions, ['payment_rails', 'paymentRails', 'rails']) ||
            this.readObject(sourceDepositInstructions, ['payment_rail', 'paymentRail', 'ach']) ||
            {};
        return {
            id:
                this.readString(obj, ['id', 'virtual_account_id', 'virtualAccountId', 'virtualAccountId']) ||
                this.readString(sourceDepositInstructions, ['id', 'virtual_account_id']) ||
                '',
            accountNumberMasked:
                this.readString(sourcePaymentRail, ['account_number', 'bank_account_number']) ||
                this.readString(sourceDepositInstructions, ['bank_account_number', 'account_number']) ||
                this.readString(obj, ['account_number_masked', 'accountNumberMasked', 'account_number']) ||
                null,
            routingNumberMasked:
                this.readString(sourcePaymentRail, ['routing_number', 'bank_routing_number']) ||
                this.readString(sourceDepositInstructions, ['bank_routing_number', 'routing_number']) ||
                this.readString(obj, ['routing_number_masked', 'routingNumberMasked', 'routing_number']) ||
                null,
            bankName:
                this.readString(sourcePaymentRail, ['bank_name']) ||
                this.readString(sourceDepositInstructions, ['bank_name']) ||
                this.readString(obj, ['bank_name', 'bankName']) ||
                null,
            bankAddress:
                this.readString(sourcePaymentRail, ['bank_address']) ||
                this.readString(sourceDepositInstructions, ['bank_address']) ||
                this.readString(obj, ['bank_address', 'bankAddress']) ||
                null,
            accountName:
                this.readString(sourceDepositInstructions, ['bank_beneficiary_name']) ||
                this.readString(obj, ['account_name', 'accountName']) ||
                null,
        };
    }

    private pickVirtualAccountCandidate(raw: unknown): Record<string, unknown> {
        if (Array.isArray(raw)) {
            const first = raw.find((item) => item && typeof item === 'object');
            return (first as Record<string, unknown>) || {};
        }

        const obj = (raw || {}) as Record<string, unknown>;
        const nested =
            this.readObject(obj, ['virtual_account', 'virtualAccount', 'account', 'item', 'result', 'data']) ||
            {};
        const candidate = Object.keys(nested).length > 0 ? nested : obj;
        return candidate;
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

    private readBoolean(obj: Record<string, unknown>, keys: string[]): boolean | null {
        for (const key of keys) {
            const value = obj[key];
            if (typeof value === 'boolean') return value;
        }
        return null;
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

    private readArrayFirstObject(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
        for (const key of keys) {
            const value = obj[key];
            if (Array.isArray(value)) {
                const first = value.find((entry) => entry && typeof entry === 'object');
                if (first && typeof first === 'object') {
                    return first as Record<string, unknown>;
                }
            }
        }
        return null;
    }

    private describeAxiosError(error: any): string {
        const status = error?.response?.status;
        const responseData = error?.response?.data;
        const message = String(error?.message || 'Unknown Bridge API error');
        const serialized =
            responseData && typeof responseData === 'object'
                ? JSON.stringify(responseData)
                : String(responseData || '');

        if (status) {
            return `${status} ${message}${serialized ? `: ${serialized}` : ''}`;
        }
        return `${message}${serialized ? `: ${serialized}` : ''}`;
    }
}

export const bridgeUsdService = new BridgeUsdService();
export default BridgeUsdService;
