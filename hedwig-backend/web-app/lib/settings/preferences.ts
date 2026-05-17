'use client';

export const HAPTICS_KEY = 'settings_haptics';
export const LIVE_TRACKING_KEY = 'settings_live_tracking';
export const LOCK_SCREEN_KEY = 'settings_lock_screen';
export const BIOMETRICS_KEY = 'biometricsEnabled';
export const TUTORIAL_KEY = 'hedwig_web_tutorial_v1_completed';

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
