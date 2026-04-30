// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://45e38d2158a34ffe6a3f856ef8042485@o4510629553176576.ingest.de.sentry.io/4511311093825616",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // PII trade-off
  // ─────────────
  // The wizard defaults this to true. We default it to false on web because
  // request bodies on /api/* often carry invoice totals, client emails, and
  // the hedwig_access_token cookie — none of which we want flowing into a
  // third-party error reporter. Set SENTRY_SEND_DEFAULT_PII=true to flip back
  // (mobile already runs with this enabled).
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: process.env.SENTRY_SEND_DEFAULT_PII === 'true',

  beforeSend(event) {
    // Belt-and-braces: redact known sensitive cookies/headers even when PII is on.
    if (event.request?.cookies && typeof event.request.cookies === 'object') {
      for (const key of Object.keys(event.request.cookies)) {
        if (/token|session|auth/i.test(key)) {
          (event.request.cookies as Record<string, string>)[key] = '[redacted]';
        }
      }
    }
    if (event.request?.headers && typeof event.request.headers === 'object') {
      for (const key of Object.keys(event.request.headers)) {
        if (/authorization|cookie|x-api-key|api[-_]?key/i.test(key)) {
          (event.request.headers as Record<string, string>)[key] = '[redacted]';
        }
      }
    }
    return event;
  },
});
