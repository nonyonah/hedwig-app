// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://45e38d2158a34ffe6a3f856ef8042485@o4510629553176576.ingest.de.sentry.io/4511311093825616",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // See sentry.server.config.ts for the PII rationale.
  sendDefaultPii: process.env.SENTRY_SEND_DEFAULT_PII === 'true',
});
