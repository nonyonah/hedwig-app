import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || '';

// See sentry.server.config.ts for the PII rationale. The browser is the most
// sensitive surface for PII leakage (replay-style auto-capture, session data
// in localStorage, etc.), so we keep this opt-in.
const sendDefaultPii = process.env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII === 'true';

Sentry.init({
  dsn,
  enabled: Boolean(dsn) && process.env.NODE_ENV === 'production',
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  sendDefaultPii,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.2,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
