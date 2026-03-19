const LEGACY_PUBLIC_HOSTS = [
  'https://pay.hedwigbot.xyz',
  'http://pay.hedwigbot.xyz',
  'https://www.pay.hedwigbot.xyz',
  'http://www.pay.hedwigbot.xyz'
];

const DEFAULT_PUBLIC_WEB_URL = 'https://hedwigbot.xyz';

export function normalizePublicWebUrl(url?: string | null) {
  const value = String(url || '').trim();
  if (!value) return '';

  for (const legacyHost of LEGACY_PUBLIC_HOSTS) {
    if (value.startsWith(legacyHost)) {
      return `${DEFAULT_PUBLIC_WEB_URL}${value.slice(legacyHost.length)}`;
    }
  }

  return value;
}

export function getPublicWebBaseUrl(explicitUrl?: string | null) {
  const normalized = normalizePublicWebUrl(explicitUrl);
  return (normalized || DEFAULT_PUBLIC_WEB_URL).replace(/\/$/, '');
}
