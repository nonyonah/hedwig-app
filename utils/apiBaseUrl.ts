const PRODUCTION_API_BASE_URL = 'https://pay.hedwigbot.xyz';

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
