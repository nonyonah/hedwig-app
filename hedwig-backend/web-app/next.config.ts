import type { NextConfig } from 'next';
import path from 'path';
import { withSentryConfig } from '@sentry/nextjs';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://pay.hedwigbot.xyz';

// ─── Content-Security-Policy ────────────────────────────────────────────────
// We allow each provider only on the directives they need. If you add a new
// SaaS, drop it into the appropriate bucket below; do not paste into multiple.

const CSP_SCRIPT_SOURCES = [
  "'self'",
  "'unsafe-inline'", // Next.js inline boot scripts; tighten with nonces later
  "'unsafe-eval'",   // some wallet libs / Privy embedded auth still use eval
  'https://*.posthog.com',
  'https://*.i.posthog.com',
  'https://*.privy.io',
  'https://challenges.cloudflare.com', // Privy invisible captcha
  'https://*.userback.io',
  'https://*.polar.sh',
  'https://*.sentry.io',
  'https://browser.sentry-cdn.com',
];

const CSP_STYLE_SOURCES = [
  "'self'",
  "'unsafe-inline'",
  'https://*.privy.io',
  'https://*.userback.io',
  'https://fonts.googleapis.com',
];

const CSP_FONT_SOURCES = [
  "'self'",
  'data:',
  'https://fonts.gstatic.com',
  'https://*.privy.io',
  'https://*.userback.io',
];

const CSP_IMG_SOURCES = [
  "'self'",
  'data:',
  'blob:',
  'https:',
];

const CSP_CONNECT_SOURCES = [
  "'self'",
  BACKEND_URL,
  'https://api.frankfurter.app',
  'https://open.er-api.com',
  // Privy
  'https://*.privy.io',
  'https://auth.privy.io',
  'https://api.privy.io',
  'wss://relay.walletconnect.com',
  'wss://relay.walletconnect.org',
  'https://*.walletconnect.com',
  'https://*.walletconnect.org',
  'https://explorer-api.walletconnect.com',
  'https://*.crossmint.com',
  // Wallets / chains
  'https://*.alchemy.com',
  'https://*.alchemyapi.io',
  'https://*.solana.com',
  'https://api.mainnet-beta.solana.com',
  'https://*.base.org',
  'https://*.coinbase.com',
  'https://mainnet.optimism.io',
  'https://arb1.arbitrum.io',
  'https://polygon-rpc.com',
  // Sentry
  'https://*.sentry.io',
  'https://*.ingest.sentry.io',
  // PostHog
  'https://*.posthog.com',
  'https://*.i.posthog.com',
  // Userback
  'https://*.userback.io',
  // Polar billing
  'https://*.polar.sh',
  'https://api.polar.sh',
  // Composio (agent integrations)
  'https://backend.composio.dev',
  'https://*.composio.dev',
  // Supabase storage / API used by some web flows
  'https://*.supabase.co',
];

const CSP_FRAME_SOURCES = [
  "'self'",
  'https://*.privy.io',
  'https://auth.privy.io',
  'https://challenges.cloudflare.com',
  'https://*.polar.sh',
  'https://*.userback.io',
  // Embedded wallet flows
  'https://*.crossmint.com',
];

const CSP_WORKER_SOURCES = [
  "'self'",
  'blob:',
];

const CSP = [
  `default-src 'self'`,
  `script-src ${CSP_SCRIPT_SOURCES.join(' ')}`,
  `style-src ${CSP_STYLE_SOURCES.join(' ')}`,
  `img-src ${CSP_IMG_SOURCES.join(' ')}`,
  `font-src ${CSP_FONT_SOURCES.join(' ')}`,
  `connect-src ${CSP_CONNECT_SOURCES.join(' ')}`,
  `frame-src ${CSP_FRAME_SOURCES.join(' ')}`,
  `worker-src ${CSP_WORKER_SOURCES.join(' ')}`,
  `media-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self' https://*.polar.sh`,
  `frame-ancestors 'none'`,
  `upgrade-insecure-requests`,
].join('; ');

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  logging: {
    browserToTerminal: false,
  },
  experimental: {
    optimizePackageImports: [
      'recharts',
      'posthog-js',
      '@hugeicons/react',
      '@hugeicons/core-free-icons',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
    ],
  },
  async headers() {
    // Allow opting out of CSP via env (e.g. local debugging).
    const cspKey =
      process.env.CSP_REPORT_ONLY === 'true'
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy';
    const cspDisabled = process.env.CSP_DISABLED === 'true';

    const baseHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];

    const headers = cspDisabled ? baseHeaders : [...baseHeaders, { key: cspKey, value: CSP }];

    return [
      {
        source: '/:path*',
        headers,
      },
    ];
  },
  async rewrites() {
    return [
      {
        // Proxy /api/backend/* → backend server (browser stays same-origin, no CORS)
        source: '/api/backend/:path*',
        destination: `${BACKEND_URL}/:path*`
      }
    ];
  }
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "hedwig-dd",

  project: "hedwig-dd",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
