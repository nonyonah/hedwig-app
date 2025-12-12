# Hedwig Mobile App

Hedwig is an AI-powered growth partner for African freelancers. It helps them create professional invoices, proposals, and contracts, and facilitates crypto payments across multiple chains including Base, Solana, Celo, and Stacks (Bitcoin L2).

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Expo Go app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) | [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
- Privy App ID (get from https://dashboard.privy.io)
- Stacks API (testnet/mainnet)

### Setup

1. **Install dependencies** (already done ✅)
   ```bash
   cd hedwig-app
   npm install
   ```

2. **Configure Privy**
   
   Edit `.env` file and add your Privy App ID:
   ```env
   EXPO_PUBLIC_PRIVY_APP_ID=your_privy_app_id_here
   ```

3. **Start Expo**
   ```bash
   npm start
   ```

4. **Test on your phone**
   - Open Expo Go app
   - Scan the QR code from terminal
   - App will load on your device

## 📱 Features

### ✅ Implemented
- **Login Screen** - Google & Apple sign-in via Privy
- **Wallet Integration** - Auto-create Base, Celo, Solana wallets
- **Design System** - Matching provided UI designs

### 🚧 Coming Soon
- AI Chat Interface
- Document Generation (Invoices, Proposals, Contracts)
- Payment Links
- Offramp (Paycrest integration)
- Transaction History
- Client & Project Management

## 🎨 Design System

Colors, spacing, and typography extracted from your designs:

- **Primary Blue**: `#3B82F6`
- **Background**: `#FFFFFF`
- **Surface**: `#F5F5F5`

See `constants/theme.ts` for full design tokens.

## 📂 Project Structure

```
hedwig-app/
├── app/                    # Expo Router screens
│   ├── _layout.tsx         # Root layout with Privy provider
│   ├── index.tsx           # Entry point with auth redirect
│   └── sign-in.tsx         # Login screen ✅
├── assets/                 # Images and icons
│   └── logo.png            # Hedwig logo (transparent)
├── components/             # Reusable UI components
├── constants/              # Design system constants
│   └── theme.ts            # Colors, spacing, typography
├── lib/                    # Configuration
│   └── privy.ts            # Privy auth config
└── .env                    # Environment variables
```

## 🔧 Environment Variables

Create a `.env` file:

```env
# Required
EXPO_PUBLIC_PRIVY_APP_ID=your_privy_app_id

# Optional (defaults shown)
EXPO_PUBLIC_API_URL=http://localhost:3000
```

## 📱 Testing with Expo Go

1. **Start the dev server**:
   ```bash
   npm start
   ```

2. **Open Expo Go** on your phone

3. **Scan the QR code** from the terminal

4. **Test sign-in**:
   - Tap "Sign in with Google"
   - Complete authentication
   - Privy will create wallets automatically

## 🔐 Privy Configuration

Current setup:
- **Login Methods**: Google, Apple
- **Chains**: Base (8453), Celo (42220), Solana, Stacks (Bitcoin L2)
- **Theme**: Light mode with blue accent (#3B82F6)

Configured in `lib/privy.ts` and `services/stacksWallet.ts`

## 🐛 Troubleshooting

### "PRIVY_APP_ID is not set"
- Make sure `.env` file exists
- Add `EXPO_PUBLIC_PRIVY_APP_ID=...`
- Restart Expo: `npm start`

### "Network request failed"
- Make sure backend is running: `cd ../hedwig-backend && npm run dev`
- Check `EXPO_PUBLIC_API_URL` in `.env`

### Expo Go won't connect
- Make sure phone and computer are on same WiFi
- Try scanning QR code again
- Check firewall settings

## 🚢 Building for Production

```bash
# Build for iOS
npx expo build:ios

# Build for Android  
npx expo build:android
```

## 📝 Next Steps

1. ✅ Fill in `EXPO_PUBLIC_PRIVY_APP_ID` in `.env`
2. ✅ Test login with Expo Go
3. 🚧 Build AI chat interface
4. 🚧 Implement document generation
5. 🚧 Add offramp screens

---

**Current Status**: ✅ Login screen ready for testing!
