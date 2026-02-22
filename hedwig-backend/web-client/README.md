# Hedwig Web Client

Web client for processing invoice and payment link payments using Reown AppKit for wallet connections.

## Features

- **Multi-chain Support**: Base (EVM) and Solana blockchain payments
- **Wallet Integration**: Reown AppKit for seamless wallet connections
- **Payment Processing**: Invoice and payment link payment flows
- **Token Support**: USDC, USDT, ETH on Base; USDC on Solana

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Reown AppKit Project ID (required)
# Obtain from https://cloud.reown.com/
VITE_REOWN_PROJECT_ID=your_project_id_here

# Backend API URL
VITE_API_URL=https://pay.hedwigbot.xyz

# Solana RPC endpoint
VITE_SOLANA_RPC=https://api.mainnet-beta.solana.com

# UserJot Project ID (for feedback widget)
VITE_USERJOT_PROJECT_ID=your_userjot_project_id

# Web client URL
EXPO_PUBLIC_WEB_CLIENT_URL=https://pay.hedwigbot.xyz
```

### Getting a Reown Project ID

1. Visit [Reown Cloud](https://cloud.reown.com/)
2. Create a new project
3. Copy the Project ID
4. Add it to your `.env` file as `VITE_REOWN_PROJECT_ID`

## Development

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Build

```bash
npm run build
```

## Architecture

### Wallet Connection

The application uses Reown AppKit for wallet connections, supporting:

- **EVM Wallets**: MetaMask, Coinbase Wallet, WalletConnect
- **Solana Wallets**: Phantom, Solflare

### Payment Flow

1. User connects wallet via Reown AppKit
2. User selects chain (Base or Solana) and token
3. Application creates transaction using:
   - Wagmi for EVM transactions
   - Solana Pay for Solana transactions
4. User signs transaction in wallet
5. Application waits for blockchain confirmation
6. Backend is updated with payment status

### Key Components

- `AppKitProvider`: Wraps the application with Reown AppKit configuration
- `useWalletConnection`: Hook for wallet connection state and actions
- `paymentHandler`: Unified payment logic for EVM and Solana chains
- `InvoicePage`: Invoice payment processing
- `PaymentLinkPage`: Payment link processing

## Troubleshooting

### Wallet Connection Issues

- Ensure your wallet extension is installed and unlocked
- Check that you're on the correct network (Base or Solana)
- Try refreshing the page and reconnecting

### Chain Switching Issues

- Some wallets require manual chain switching
- If automatic switching fails, manually switch to Base (Chain ID: 8453) in your wallet

### Transaction Failures

- Check that you have sufficient balance for the transaction and gas fees
- Ensure you're connected to the correct network
- Verify the recipient address is correct

### Configuration Errors

- Verify `VITE_REOWN_PROJECT_ID` is set in your `.env` file
- Ensure all required environment variables are present
- Restart the development server after changing environment variables

## Support

For issues or questions, please contact support or open an issue in the repository.
