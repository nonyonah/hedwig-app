import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { createLogger } from '../utils/logger';

const logger = createLogger('CoinbasePay');

const CDP_ONRAMP_HOST = 'api.developer.coinbase.com';
const CDP_ONRAMP_BASE_URL = `https://${CDP_ONRAMP_HOST}`;

const COINBASE_CDP_API_KEY_ID =
    process.env.COINBASE_CDP_API_KEY_ID ||
    process.env.CDP_API_KEY_ID ||
    process.env.KEY_NAME;

const COINBASE_CDP_API_KEY_SECRET =
    process.env.COINBASE_CDP_API_KEY_SECRET ||
    process.env.CDP_API_KEY_SECRET ||
    process.env.KEY_SECRET;

const COINBASE_PAY_REDIRECT_URL =
    process.env.COINBASE_PAY_REDIRECT_URL ||
    process.env.APP_URL ||
    'https://pay.riftlabs.xyz/wallet';

const coinbaseOnrampClient: AxiosInstance = axios.create({
    baseURL: CDP_ONRAMP_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
});

if (!COINBASE_CDP_API_KEY_ID || !COINBASE_CDP_API_KEY_SECRET) {
    logger.warn('Coinbase CDP credentials are not configured. US onramp/offramp will not work.');
}

const base64url = (input: Buffer | string): string =>
    Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

const normalizePrivateKey = (value: string): string => value.replace(/\\n/g, '\n').trim();

const decodeBase64Secret = (value: string): Buffer | null => {
    const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
    try {
        return Buffer.from(padded, 'base64');
    } catch {
        return null;
    }
};

const createCdpPrivateKey = (value: string): crypto.KeyObject => {
    const normalized = normalizePrivateKey(value);

    if (normalized.includes('-----BEGIN')) {
        return crypto.createPrivateKey(normalized);
    }

    const decoded = decodeBase64Secret(normalized);
    if (decoded?.length === 64) {
        return crypto.createPrivateKey({
            key: {
                kty: 'OKP',
                crv: 'Ed25519',
                d: base64url(decoded.subarray(0, 32)),
                x: base64url(decoded.subarray(32, 64)),
            },
            format: 'jwk',
        });
    }

    if (decoded && decoded.length > 0) {
        try {
            return crypto.createPrivateKey({ key: decoded, format: 'der', type: 'pkcs8' });
        } catch {
            // Fall through to the descriptive error below.
        }
    }

    throw new Error(
        'Invalid Coinbase CDP API key secret. Use the Secret API Key value from Coinbase CDP, not a Client API key.'
    );
};

const readDerLength = (buffer: Buffer, offset: number): { length: number; offset: number } => {
    const first = buffer[offset++];
    if (first < 0x80) return { length: first, offset };
    const bytes = first & 0x7f;
    let length = 0;
    for (let i = 0; i < bytes; i += 1) {
        length = (length << 8) | buffer[offset++];
    }
    return { length, offset };
};

const readDerInteger = (buffer: Buffer, offset: number): { value: Buffer; offset: number } => {
    if (buffer[offset++] !== 0x02) throw new Error('Invalid ES256 signature');
    const len = readDerLength(buffer, offset);
    offset = len.offset;
    let value = buffer.subarray(offset, offset + len.length);
    offset += len.length;
    while (value.length > 32 && value[0] === 0) value = value.subarray(1);
    if (value.length < 32) value = Buffer.concat([Buffer.alloc(32 - value.length), value]);
    return { value, offset };
};

const derToJose = (signature: Buffer): Buffer => {
    let offset = 0;
    if (signature[offset++] !== 0x30) throw new Error('Invalid ES256 signature sequence');
    const seq = readDerLength(signature, offset);
    offset = seq.offset;
    const r = readDerInteger(signature, offset);
    const s = readDerInteger(signature, r.offset);
    return Buffer.concat([r.value, s.value]);
};

const generateJwt = (method: 'GET' | 'POST', host: string, path: string): string => {
    if (!COINBASE_CDP_API_KEY_ID || !COINBASE_CDP_API_KEY_SECRET) {
        throw new Error('Coinbase CDP credentials are not configured');
    }

    const privateKey = createCdpPrivateKey(COINBASE_CDP_API_KEY_SECRET);
    const asymmetricType = privateKey.asymmetricKeyType;
    const alg = asymmetricType === 'ed25519' ? 'EdDSA' : 'ES256';
    const now = Math.floor(Date.now() / 1000);

    const encodedHeader = base64url(JSON.stringify({
        alg,
        kid: COINBASE_CDP_API_KEY_ID,
        nonce: crypto.randomBytes(16).toString('hex'),
        typ: 'JWT',
    }));

    const encodedPayload = base64url(JSON.stringify({
        iss: 'cdp',
        nbf: now,
        exp: now + 120,
        sub: COINBASE_CDP_API_KEY_ID,
        uri: `${method} ${host}${path}`,
    }));

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature =
        alg === 'EdDSA'
            ? crypto.sign(null, Buffer.from(signingInput), privateKey)
            : derToJose(crypto.sign('sha256', Buffer.from(signingInput), privateKey));

    return `${signingInput}.${base64url(signature)}`;
};

const getAuthHeader = (method: 'GET' | 'POST', host: string, path: string): string =>
    `Bearer ${generateJwt(method, host, path)}`;

const normalizeNetwork = (network: string): string => {
    const lowered = String(network || 'base').toLowerCase();
    if (lowered === 'arbitrum-one') return 'arbitrum';
    return lowered;
};

const appendOptionalParam = (url: URL, key: string, value: string | number | undefined | null) => {
    if (value === undefined || value === null || String(value).trim() === '') return;
    url.searchParams.set(key, String(value));
};

const readCoinbaseError = (error: any): string => {
    const data = error?.response?.data;
    if (!data) return error?.message || 'Coinbase request failed';
    if (typeof data === 'string') return data;
    return (
        data.error_description ||
        data.error?.message ||
        data.error ||
        data.message ||
        JSON.stringify(data)
    );
};

export interface CoinbaseHostedFlowInput {
    direction: 'buy' | 'sell';
    userId: string;
    walletAddress: string;
    network: string;
    asset?: string;
    fiatCurrency?: string;
    amount?: number;
    country?: string;
    subdivision?: string;
    clientIp: string;
    redirectUrl?: string;
}

export interface CoinbaseHostedFlowResponse {
    url: string;
    partnerUserRef: string;
    provider: 'coinbase';
    quote?: any;
}

export interface CoinbaseOfframpTransactionStatusResponse {
    transactions: any[];
    nextPageKey?: string | null;
    totalCount?: number;
}

export class CoinbasePayService {
    static get redirectUrl(): string {
        return COINBASE_PAY_REDIRECT_URL;
    }

    static async createHostedFlow(input: CoinbaseHostedFlowInput): Promise<CoinbaseHostedFlowResponse> {
        return this.createSessionTokenFlow(input);
    }

    private static async createSessionTokenFlow(input: CoinbaseHostedFlowInput): Promise<CoinbaseHostedFlowResponse> {
        const path = '/onramp/v1/token';
        const asset = (input.asset || 'USDC').toUpperCase();
        const network = normalizeNetwork(input.network);
        const partnerUserRef = `hedwig-${input.userId}`.slice(0, 49);
        let response;
        try {
            response = await coinbaseOnrampClient.post(path, {
                addresses: [{ address: input.walletAddress, blockchains: [network] }],
                assets: [asset],
                clientIp: input.clientIp,
            }, {
                headers: { Authorization: getAuthHeader('POST', CDP_ONRAMP_HOST, path) },
            });
        } catch (error: any) {
            const message = readCoinbaseError(error);
            logger.warn('Coinbase session token request failed', {
                status: error?.response?.status,
                message,
                direction: input.direction,
                network,
                asset,
                clientIp: input.clientIp,
            });
            throw new Error(`Coinbase Pay rejected the session request: ${message}`);
        }

        const token = response.data?.token || response.data?.data?.token;
        if (!token) {
            throw new Error('Coinbase did not return a session token');
        }

        const url = new URL(
            input.direction === 'buy'
                ? 'https://pay.coinbase.com/buy/select-asset'
                : 'https://pay.coinbase.com/v3/sell/input'
        );
        url.searchParams.set('sessionToken', token);
        url.searchParams.set('partnerUserRef', partnerUserRef);
        url.searchParams.set('redirectUrl', input.redirectUrl || COINBASE_PAY_REDIRECT_URL);
        url.searchParams.set('defaultAsset', asset);
        if (input.direction === 'buy') {
            url.searchParams.set('defaultNetwork', network);
            url.searchParams.set('defaultPaymentCurrency', (input.fiatCurrency || 'USD').toUpperCase());
            appendOptionalParam(url, 'presetFiatAmount', input.amount);
        } else {
            appendOptionalParam(url, 'presetCryptoAmount', input.amount);
        }

        return { url: url.toString(), partnerUserRef, provider: 'coinbase' };
    }

    static async getOfframpTransactions(
        partnerUserRef: string,
        pageSize = 10,
        pageKey?: string
    ): Promise<CoinbaseOfframpTransactionStatusResponse> {
        const encodedRef = encodeURIComponent(partnerUserRef);
        const path = `/onramp/v1/sell/user/${encodedRef}/transactions`;
        const response = await coinbaseOnrampClient.get(path, {
            params: {
                page_size: pageSize,
                ...(pageKey ? { page_key: pageKey } : {}),
            },
            headers: { Authorization: getAuthHeader('GET', CDP_ONRAMP_HOST, path) },
        });

        return {
            transactions: Array.isArray(response.data?.transactions) ? response.data.transactions : [],
            nextPageKey: response.data?.next_page_key ?? response.data?.nextPageKey ?? null,
            totalCount: response.data?.total_count ?? response.data?.totalCount,
        };
    }
}

export default CoinbasePayService;
