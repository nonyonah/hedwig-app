export const privyConfig = {
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '',
  clientId: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? '',
  loginMethods: ['email', 'google', 'apple'] as const,
  embeddedWallets: {
    ethereum: {
      createOnLogin: 'all-users' as const
    },
    solana: {
      createOnLogin: 'all-users' as const
    }
  }
};

const BACKEND_DIRECT_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hedwig-app.onrender.com';

export const backendConfig = {
  /**
   * Both server and browser call the backend directly. The backend's CORS
   * policy allow-lists the web origin, so no same-origin proxy is needed.
   * (The legacy /api/backend rewrite proxy is bypassed: it was observed
   * returning opaque plain-text 500s for proxied POSTs while direct calls
   * to the same backend URL succeed.)
   */
  get apiBaseUrl(): string {
    return BACKEND_DIRECT_URL;
  },
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001',
  webClientUrl: process.env.NEXT_PUBLIC_WEB_CLIENT_URL ?? 'http://localhost:5173',
  get publicPagesUrl(): string {
    return this.appUrl;
  },
  useMockAuth: process.env.NEXT_PUBLIC_HEDWIG_USE_MOCK_AUTH !== 'false',
  useMockData: process.env.NEXT_PUBLIC_HEDWIG_USE_MOCK_DATA === 'true'
};
