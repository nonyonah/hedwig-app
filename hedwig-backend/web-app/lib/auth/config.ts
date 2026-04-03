export const privyConfig = {
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '',
  clientId: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? '',
  loginMethods: ['email', 'google', 'apple'] as const
};

const BACKEND_DIRECT_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://pay.hedwigbot.xyz';

export const backendConfig = {
  /**
   * Server-side (SSR/API routes): call the backend directly.
   * Client-side (browser): route through the Next.js /api/backend/* rewrite to
   * avoid CORS — Next.js proxies the request so the browser never contacts the
   * external backend directly and no cross-origin preflight is needed.
   */
  get apiBaseUrl(): string {
    return typeof window === 'undefined' ? BACKEND_DIRECT_URL : '/api/backend';
  },
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001',
  webClientUrl: process.env.NEXT_PUBLIC_WEB_CLIENT_URL ?? 'http://localhost:5173',
  get publicPagesUrl(): string {
    return this.appUrl;
  },
  useMockAuth: process.env.NEXT_PUBLIC_HEDWIG_USE_MOCK_AUTH !== 'false',
  useMockData: process.env.NEXT_PUBLIC_HEDWIG_USE_MOCK_DATA === 'true'
};
