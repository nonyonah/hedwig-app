export const appKitConfig = {
  metadata: {
    name: 'Hedwig Payments',
    description: 'Secure crypto payments for freelancers',
    url: 'https://pay.hedwigbot.xyz',
    icons: ['/hedwig-logo.png'],
  },
  themeMode: 'dark' as const,
  themeVariables: {
    '--w3m-accent': '#7c3aed',
    '--w3m-border-radius-master': '24px',
  },
  featuredWalletIds: [
    // MetaMask
    'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
    // Coinbase Wallet
    'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa',
    // Phantom
    'a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393',
    // Solflare
    '8308656f4548bb81b3508afe355cfbb7f0cb6253d1cc7f998080601f838ecee3',
  ],
};
