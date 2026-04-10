import { headers } from 'next/headers';

export type RegionLockedFeature = 'offramp' | 'usd_account';

type RegionLockRule = {
  enabled?: boolean;
  allow?: string[];
  deny?: string[];
  reason?: string;
};

type RegionLockConfig = Partial<Record<RegionLockedFeature, RegionLockRule>>;

type RegionLockDecision = {
  allowed: boolean;
  countryCode: string | null;
  reason: string | null;
};

const REGION_HEADER_KEYS = [
  'x-vercel-ip-country',
  'cf-ipcountry',
  'x-country-code',
  'x-geo-country',
  'x-appengine-country',
];

const REGION_LOCK_FAIL_OPEN = process.env.REGION_LOCK_FAIL_OPEN !== 'false';

const DEFAULT_CONFIG: RegionLockConfig = {};

const normalizeCountryCode = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return normalized;
};

const normalizeList = (list: string[] | undefined): string[] =>
  (list || [])
    .map((item) => normalizeCountryCode(item))
    .filter((item): item is string => Boolean(item));

const tryParseRegionLockConfig = (raw: string): RegionLockConfig | null => {
  try {
    const parsed = JSON.parse(raw);
    const maybeObject =
      typeof parsed === 'string'
        ? JSON.parse(parsed)
        : parsed;

    if (!maybeObject || typeof maybeObject !== 'object' || Array.isArray(maybeObject)) {
      return null;
    }

    return maybeObject as RegionLockConfig;
  } catch {
    return null;
  }
};

const unwrapQuotedValue = (raw: string): string => {
  if (raw.length < 2) return raw;
  const first = raw[0];
  const last = raw[raw.length - 1];
  if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
    return raw.slice(1, -1);
  }
  return raw;
};

const parseRegionLockConfig = (): RegionLockConfig => {
  const raw = process.env.REGION_LOCKS_JSON?.trim();
  if (!raw) return DEFAULT_CONFIG;

  const candidates = Array.from(new Set([raw, unwrapQuotedValue(raw)]));
  for (const candidate of candidates) {
    const parsed = tryParseRegionLockConfig(candidate);
    if (parsed) {
      return parsed;
    }
  }

  console.warn('[region-lock] Failed to parse REGION_LOCKS_JSON. Falling back to no region locks.');
  return DEFAULT_CONFIG;
};

const REGION_LOCK_CONFIG = parseRegionLockConfig();

export const getRequestCountryCode = async (): Promise<string | null> => {
  const headerStore = await headers();
  for (const header of REGION_HEADER_KEYS) {
    const normalized = normalizeCountryCode(headerStore.get(header));
    if (normalized) return normalized;
  }
  return normalizeCountryCode(process.env.REGION_LOCK_DEFAULT_COUNTRY || null);
};

export const getRegionLockDecision = (
  feature: RegionLockedFeature,
  countryCode: string | null
): RegionLockDecision => {
  const rule = REGION_LOCK_CONFIG[feature];
  if (!rule || rule.enabled === false) {
    return { allowed: true, countryCode, reason: null };
  }

  if (!countryCode) {
    if (REGION_LOCK_FAIL_OPEN) {
      return { allowed: true, countryCode: null, reason: null };
    }
    return {
      allowed: false,
      countryCode: null,
      reason: rule.reason || 'This feature is unavailable because we could not determine your region.',
    };
  }

  const deny = normalizeList(rule.deny);
  if (deny.includes(countryCode)) {
    return {
      allowed: false,
      countryCode,
      reason: rule.reason || 'This feature is unavailable in your region.',
    };
  }

  const allow = normalizeList(rule.allow);
  if (allow.length > 0 && !allow.includes(countryCode)) {
    return {
      allowed: false,
      countryCode,
      reason: rule.reason || 'This feature is not yet available in your region.',
    };
  }

  return { allowed: true, countryCode, reason: null };
};

export const getRequestRegionLockDecision = async (
  feature: RegionLockedFeature
): Promise<RegionLockDecision> => {
  const countryCode = await getRequestCountryCode();
  return getRegionLockDecision(feature, countryCode);
};
