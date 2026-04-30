export type ApiErrorPayload = {
  success?: boolean;
  error?: string | { message?: string; code?: string } | null;
  code?: string | null;
  message?: string | null;
};

const FALLBACK_MESSAGE = 'Something went wrong. Please try again in a moment.';

export function extractApiErrorMessage(payload: ApiErrorPayload | null | undefined, fallback = FALLBACK_MESSAGE): string {
  const error = payload?.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
  return fallback;
}

export function friendlyErrorMessage(error: unknown, fallback = FALLBACK_MESSAGE): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}

export function billingSwitchErrorMessage(payload: ApiErrorPayload | null | undefined): string {
  if (payload?.code === 'BILLING_TRIAL_PLAN_CHANGE_LOCKED') {
    return 'Your Pro trial is already active. You can switch between monthly and yearly billing after the trial ends, or open subscription management to end the trial first.';
  }
  return extractApiErrorMessage(payload, 'Could not switch your billing plan right now. Please try again in a moment.');
}
