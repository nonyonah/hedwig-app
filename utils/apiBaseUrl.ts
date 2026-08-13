const PRODUCTION_API_BASE_URL = 'https://hedwig-app-wuqvha-production.up.railway.app';

const PRIVATE_IPV4_PATTERNS = [
    /^10\./,
    /^127\./,
    /^169\.254\./,
    /^172\.(1[6-9]|2\d|3[0-1])\./,
    /^192\.168\./,
];

const normalizeApiUrl = (input: string | null | undefined): string => {
    const trimmed = (input || '').trim();
    if (!trimmed) return '';

    if (/^https?:\/\/[^/]+/i.test(trimmed)) {
        return trimmed.replace(/\/$/, '');
    }

    if (/^https?:[^/]/i.test(trimmed)) {
        return trimmed.replace(/^https?:/i, (match) => `${match}//`).replace(/\/$/, '');
    }

    return trimmed.replace(/\/$/, '');
};

const isPrivateHostname = (hostname: string): boolean => {
    const lowered = hostname.trim().toLowerCase();
    if (!lowered) return false;
    if (lowered === 'localhost' || lowered === '0.0.0.0') return true;
    if (lowered.endsWith('.local')) return true;
    return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(lowered));
};

export const isUnsafeReleaseApiUrl = (input: string | null | undefined): boolean => {
    const normalized = normalizeApiUrl(input);
    if (!normalized) return false;

    try {
        const url = new URL(normalized);
        return isPrivateHostname(url.hostname);
    } catch {
        return false;
    }
};

export const getApiBaseUrl = (): string => {
    const configured = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
    if (__DEV__) {
        return configured || 'http://localhost:3000';
    }

    if (!configured || isUnsafeReleaseApiUrl(configured)) {
        return PRODUCTION_API_BASE_URL;
    }

    return configured;
};

/**
 * Joins API base + path while safely handling envs where base already ends with /api.
 * Example:
 * - base=https://example.com, path=/api/calendar -> https://example.com/api/calendar
 * - base=https://example.com/api, path=/api/calendar -> https://example.com/api/calendar
 */
export const joinApiUrl = (path: string): string => {
    const base = getApiBaseUrl().replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const baseHasApiSuffix = /\/api$/i.test(base);
    const pathHasApiPrefix = /^\/api(\/|$)/i.test(normalizedPath);

    if (baseHasApiSuffix && pathHasApiPrefix) {
        const trimmedPath = normalizedPath.replace(/^\/api/i, '');
        return `${base}${trimmedPath || '/'}`;
    }

    return `${base}${normalizedPath}`;
};

export const rewriteApiUrlForRuntime = (input: string): string => {
    const normalized = normalizeApiUrl(input);
    if (__DEV__ || !normalized || !isUnsafeReleaseApiUrl(normalized)) {
        return normalized || input;
    }

    try {
        const url = new URL(normalized);
        return normalized.replace(url.origin, PRODUCTION_API_BASE_URL);
    } catch {
        return input;
    }
};

export const getProductionApiBaseUrl = (): string => PRODUCTION_API_BASE_URL;

/**
 * Fetches an API path and returns parsed JSON, or throws a readable error when
 * the server returns non-JSON (e.g. an HTML error page from a web server or a
 * misconfigured EXPO_PUBLIC_API_URL). Prevents the classic
 * "JSON Parse error: Unexpected character: <" that surfaces when the app is
 * pointed at a web client instead of the API host.
 */
export async function fetchApiJson(path: string, init?: RequestInit): Promise<any> {
    const url = joinApiUrl(path);
    let response: Response;
    try {
        response = await fetch(url, init);
    } catch (err: any) {
        throw new ApiFetchError(
            `Could not reach the backend at ${url}. Check EXPO_PUBLIC_API_URL and your connection. (${err?.message || 'network error'})`,
            url,
        );
    }

    const contentType = response.headers?.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        let preview = '';
        try {
            const text = await response.text();
            preview = text.replace(/\s+/g, ' ').trim().slice(0, 120);
        } catch {
            // ignore body read failure
        }
        const htmlish = preview.startsWith('<!') || preview.startsWith('<');
        const message = htmlish
            ? `Backend at ${url} returned an HTML page (not JSON) — your device is hitting a web server, not the Hedwig API. Fix EXPO_PUBLIC_API_URL.`
            : `Backend at ${url} returned a non-JSON response (HTTP ${response.status}, ${contentType || 'no content-type'}).`;
        throw new ApiFetchError(message, url, response.status);
    }

    try {
        return await response.json();
    } catch (err: any) {
        throw new ApiFetchError(
            `Could not parse JSON from ${url} (HTTP ${response.status}): ${err?.message || 'invalid JSON'}`,
            url,
            response.status,
        );
    }
}

export class ApiFetchError extends Error {
    url: string;
    status?: number;

    constructor(message: string, url: string, status?: number) {
        super(message);
        this.name = 'ApiFetchError';
        this.url = url;
        this.status = status;
    }
}
