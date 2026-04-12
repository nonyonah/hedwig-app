'use client';

export type WebThemePreference = 'light' | 'dark' | 'system';

export const THEME_KEY = 'settings_theme';
export const LEGACY_THEME_KEY = 'hedwig-web-theme';
export const HAPTICS_KEY = 'settings_haptics';
export const LIVE_TRACKING_KEY = 'settings_live_tracking';
export const LOCK_SCREEN_KEY = 'settings_lock_screen';
export const BIOMETRICS_KEY = 'biometricsEnabled';
export const TUTORIAL_KEY = 'hedwig_web_tutorial_v1_completed';
export const THEME_EVENT = 'hedwig:theme-preference-change';

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

const isThemePreference = (value: string | null): value is WebThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

export function getStoredThemePreference(): WebThemePreference {
  if (typeof window === 'undefined') return 'system';
  const fromSettings = window.localStorage.getItem(THEME_KEY);
  if (isThemePreference(fromSettings)) return fromSettings;

  const fromLegacy = window.localStorage.getItem(LEGACY_THEME_KEY);
  if (fromLegacy === 'light' || fromLegacy === 'dark') return fromLegacy;

  return 'system';
}

export function resolveThemePreference(theme: WebThemePreference): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
}

export function applyThemePreference(theme: WebThemePreference) {
  if (typeof window === 'undefined') return;
  document.documentElement.dataset.theme = resolveThemePreference(theme);
}

export function setStoredThemePreference(theme: WebThemePreference) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_KEY, theme);
  window.localStorage.setItem(LEGACY_THEME_KEY, resolveThemePreference(theme));
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

export function subscribeToSystemTheme(
  theme: WebThemePreference,
  onSystemChange: () => void
): (() => void) | undefined {
  if (typeof window === 'undefined' || theme !== 'system') return;
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  const handler = () => onSystemChange();
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}

export function getStoredBoolean(key: string, fallback = true): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return fallback;
  return raw === 'true';
}

export function setStoredBoolean(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value ? 'true' : 'false');
}
