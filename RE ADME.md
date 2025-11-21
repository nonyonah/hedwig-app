# Hedwig Mobile App

AI-powered freelancer platform for African markets - Mobile app built with Expo and React Native.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Expo Go app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) | [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
- Reown Project ID (get from https://dashboard.reown.com)

### Setup

1. **Install dependencies** (already done ✅)
   ```bash
   cd hedwig-app
   npm install
   ```

2. **Configure Reown AppKit**
   
   Edit `.env` file and add your Reown Project ID:
   ```env
   EXPO_PUBLIC_REOWN_PROJECT_ID=your_reown_project_id_here
   ```
   
   **How to get your Project ID:**
   1. Go to https://dashboard.reown.com
   2. Create a new project or select an existing one
   3. Go to "Mobile Application IDs" section
   4. Add your iOS Bundle ID: `com.hedwig.app`
   5. Add your Android Package Name: `com.hedwig.app`
   6. Copy your Project ID
   7. Paste it in `.env`

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
- **Login Screen** - Connect with Google, Apple, or 500+ wallets
- **Multi-chain Wallets** - Auto-create Base, Celo, Solana wallets
- **Reown AppKit Integration** - Industry-standard Web3 authentication
- **Design System** - Matching provided UI designs

### 🚧 Coming Soon
- AI Chat Interface
- Document Generation (Invoices, Proposals, Contracts)
- Payment Links
- Offramp (Paycrest integration)
- Transaction History
- Client & Project Management

## 🔐 Why Reown AppKit?

**Reown (formerly WalletConnect)** is more budget-friendly than Privy and provides:
- ✅ **Free tier** with generous limits
- ✅ **500+ wallet support** out of the box
- ✅ **Social logins** (Google, Apple, X, GitHub, Discord)
- ✅ **Email authentication**
- ✅ **Multi-chain support** (Base, Celo, Solana, and more)
- ✅ **No vendor lock-in** - open-source protocol
- ✅ **Better pricing** for production apps

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
│   ├── _layout.tsx         # Root layout with SafeAreaProvider
│   ├── index.tsx           # Entry point with auth redirect
│   └── sign-in.tsx         # Login screen ✅
├── assets/                 # Images and icons
│   └── logo.png            # Hedwig logo (transparent)
├── components/             # Reusable UI components
├── constants/              # Design system constants
│   └── theme.ts            # Colors, spacing, typography
├── lib/                    # Configuration
│   └── reown.ts            # Reown AppKit config
└── .env                    # Environment variables
```

## 🔧 Environment Variables

Create a `.env` file:

```env
# Required
EXPO_PUBLIC_REOWN_PROJECT_ID=your_reown_project_id

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
   - Tap "Connect Wallet"
   - Choose from:
     - **Google Sign-in** (easiest)
     - **Apple Sign-in**
     - **500+ wallet apps** (MetaMask, Coinbase, etc.)
   - Complete authentication
   - Reown creates wallets automatically for Base, Celo, Solana

## 🔐 Reown Configuration

Current setup in `lib/reown.ts`:
- **Login Methods**: Google, Apple, Email, 500+ wallets
- **Chains**: Base (8453), Celo (42220), Solana
- **Adapters**: Ethers.js (EVM) + Solana Web3.js
- **Features**: Email + Social logins enabled

**What happens when user signs in:**
1. Reown modal opens with login options
2. User selects Google/Apple/Email/Wallet
3. Completes authentication
4. Reown creates embedded wallets (self-custodial)
5. Generates addresses for Base, Celo, Solana
6. App receives wallet address and connection status

## 🐛 Troubleshooting

### "REOWN_PROJECT_ID is not set"
- Make sure `.env` file exists
- Add `EXPO_PUBLIC_REOWN_PROJECT_ID=...`
- Restart Expo: `npm start`

### "Network request failed"
- Make sure backend is running: `cd ../hedwig-backend && npm run dev`
- Check `EXPO_PUBLIC_API_URL` in `.env`

### Expo Go won't connect
- Make sure phone and computer are on same WiFi
- Try scanning QR code again
- Check firewall settings

### Dependencies conflict
- Run: `npm install --legacy-peer-deps`
- This is expected with React Native 0.81 and newer packages

## 🚢 Building for Production

```bash
# Build for iOS
npx expo build:ios

# Build for Android  
npx expo build:android
```

## 📝 Next Steps

1. ✅ Get Reown Project ID from https://dashboard.reown.com
2. ✅ Add Project ID to `.env`
3. ✅ Add Mobile Application IDs in Reown Dashboard
4. ✅ Test login with Expo Go
5. 🚧 Build AI chat interface
6. 🚧 Implement document generation
7. 🚧 Add offramp screens

---

**Current Status**: ✅ Login screen ready with Reown AppKit (Google, Apple, 500+ wallets)!

**Migration**: Changed from Privy to Reown for better pricing and wallet support ✨
