export const privyConfig = {
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '',
  clientId: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? '',
  loginMethods: ['email', 'wallet'] as const
};

export const backendConfig = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'https://pay.hedwigbot.xyz',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001',
  useMockAuth: process.env.NEXT_PUBLIC_HEDWIG_USE_MOCK_AUTH !== 'false',
  useMockData: process.env.NEXT_PUBLIC_HEDWIG_USE_MOCK_DATA === 'true'
};
