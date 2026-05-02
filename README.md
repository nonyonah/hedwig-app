# Hedwig

**Hedwig is a payments and business management platform built for African freelancers.** It combines AI-powered invoicing, multi-chain crypto payments, and smart email intelligence into a single workspace — so you spend less time chasing money and more time doing your best work.

---

## What Hedwig does

### Get paid faster
- Create professional **invoices, proposals, and contracts** in seconds with AI assistance
- Share **payment links** that clients pay via crypto (Base, Solana, Celo, Stacks/Bitcoin L2)
- Receive payments in USDC across multiple chains — Hedwig handles the wallet, you handle the work
- Set up **recurring invoices** that auto-send on your schedule (Pro)
- Add an **external payout bank account** (NG, US, UK, GH) so clients can also pay by bank transfer
  - Auto-verified for Nigerian and Ghanaian accounts via Paystack `/bank/resolve`
  - Modulus-checked for UK accounts via GoCardless when configured
  - Bank details appear on every public invoice and payment link, with one-tap copy buttons
- **Mark-as-paid** dialog captures the payment method (bank transfer, crypto, cash, or other) plus a reference, so off-platform payments stay in revenue tracking

### Stay on top of your money
- **Earnings dashboard** with real-time revenue tracking, conversion rates, and payment history
- **Per-client lifetime earnings, outstanding balances, last activity, and engagement segment** (new / active / lapsing / dormant) — kept consistent by a Postgres trigger that recomputes whenever a document changes, so cached and live values never drift
- **Tax summaries** — monthly and yearly breakdowns ready for your accountant (Pro)
- Convert crypto earnings to local currency (NGN, GHS) via integrated offramp

### Manage your workspace
- Organize **clients, projects, and milestones** in one place
- Get an **AI assistant** with explicit intent routing: it knows when to draft an invoice, when to create a payment link, when to surface an overdue reminder, and when to stage a calendar event
- Assistant always resolves clients via the live database — never from chat history or uploaded attachments — eliminating the wrong-client problem
- **Calendar sync** — invoice due dates and reminders appear in Google Calendar or Apple Calendar

### Email and calendar intelligence (new)
- Connect **Gmail** to automatically match incoming emails to your clients, projects, and invoices
- Sync **Google Calendar** to see upcoming meetings alongside your project milestones
- Attach **Slack** to receive payment and invoice notifications directly in your workspace
- AI summarizes email threads so you know which ones need action
- External invoices and contracts sent to you as email attachments are automatically recognized and stored

---

## Tech stack

| Layer | Tech |
|---|---|
| Mobile | Expo (React Native), Expo Router |
| Web dashboard | Next.js 16, React 19, Tailwind CSS |
| Backend API | Express (Node.js), TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Privy (embedded wallets + social login) |
| AI | Google Gemini (assistant, summarization, nudges) |
| File storage | Cloudflare R2 (documents, email attachments) |
| Payments | Polar (web subscriptions), RevenueCat (mobile subscriptions) |
| Notifications | OneSignal (push), Resend (email) |
| Chains | Base, Solana, Celo, Stacks (Bitcoin L2) |

---

## Project structure

```
hedwig-app/
├── app/                          # Expo Router mobile screens
│   ├── _layout.tsx               # Root layout with Privy + nav providers
│   ├── (tabs)/                   # Bottom tab screens
│   └── ...
├── hedwig-backend/
│   ├── src/                      # Express API
│   │   ├── routes/               # REST endpoint handlers
│   │   ├── services/             # Business logic (AI, email sync, scheduler, etc.)
│   │   ├── lib/                  # Shared utilities (R2, Redis, Privy, Supabase)
│   │   └── middleware/           # Auth, error handling, rate limiting
│   ├── supabase/migrations/      # PostgreSQL schema migrations (001–027)
│   └── web-app/                  # Next.js web dashboard
│       ├── app/                  # App Router pages + API routes
│       ├── components/           # Shared UI components
│       └── lib/                  # Auth helpers, API client, feature gates
└── assets/                       # Shared images and icons
```

---

## Getting started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Privy](https://privy.io) app (for auth + wallets)

### Mobile (Expo)

```bash
npm install
cp .env.example .env
# Fill in EXPO_PUBLIC_PRIVY_APP_ID and EXPO_PUBLIC_API_URL
npm start
```

Open Expo Go on your phone and scan the QR code.

### Backend API

```bash
cd hedwig-backend
npm install
cp .env.example .env.local
# Fill in required vars (see .env.example comments)
npm run dev          # starts on port 8080
```

### Web dashboard

```bash
cd hedwig-backend/web-app
npm install
cp .env.example .env.local
# Fill in NEXT_PUBLIC_PRIVY_APP_ID, NEXT_PUBLIC_API_URL, POLAR_ACCESS_TOKEN, etc.
npm run dev          # starts on port 3001
```

---

## Key environment variables

### Backend (`hedwig-backend/.env`)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Database access |
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | Auth token verification |
| `GEMINI_API_KEY` | AI assistant + email summarization |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Gmail + Google Calendar OAuth |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | Slack workspace OAuth |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare R2 file storage |
| `R2_BUCKET_NAME` | R2 bucket for documents and attachments |
| `ONESIGNAL_APP_ID` / `ONESIGNAL_REST_API_KEY` | Push notifications |
| `POLAR_WEBHOOK_SECRET` | Polar billing webhook verification |
| `REVENUECAT_WEBHOOK_AUTH` | RevenueCat billing webhook auth |
| `PAYSTACK_SECRET_KEY` | NG / GH bank list + auto-verify (`/bank` and `/bank/resolve`) |
| `GOCARDLESS_TOKEN` | UK modulus check (optional; UK accounts save unverified without it) |

### Web app (`hedwig-backend/web-app/.env.local`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy client-side auth |
| `NEXT_PUBLIC_API_URL` | Backend API base URL |
| `NEXT_PUBLIC_WEB_URL` | Web app origin (used for OAuth redirect URIs) |
| `POLAR_ACCESS_TOKEN` | Polar server-side billing API |
| `POLAR_PRODUCT_ID_MONTHLY` / `POLAR_PRODUCT_ID_ANNUAL` | Polar plan product IDs |

---

## Integrations setup

### Gmail / Google Calendar

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URIs:
   - `https://hedwigbot.xyz/api/integrations/callback/google`
   - `http://localhost:3001/api/integrations/callback/google` (dev)
4. Enable **Gmail API** and **Google Calendar API** in the API Library
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in backend `.env`

### Slack

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App
2. Under OAuth & Permissions, add redirect URL:
   - `https://hedwigbot.xyz/api/integrations/callback/slack`
3. Add Bot Token Scopes: `channels:read`, `chat:write`, `users:read`
4. Set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` in backend `.env`

### Cloudflare R2

1. Go to Cloudflare dashboard → R2 → Create bucket (e.g. `hedwig-documents`)
2. Create API token with **Object Read & Write** on the bucket
3. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
4. Optionally set `R2_PUBLIC_URL` if you've enabled public access or a custom domain

---

## Plans

| Feature | Free | Pro |
|---|---|---|
| Invoices, payment links, contracts | ✓ | ✓ |
| Clients, projects, milestones | ✓ | ✓ |
| Earnings dashboard + AI assistant | ✓ | ✓ |
| Recurring invoice automation | — | ✓ |
| Tax summary reports | — | ✓ |
| Subscription sync (web + mobile) | — | ✓ |

Subscriptions are managed via [Polar](https://polar.sh) (web) and RevenueCat (mobile), sharing a unified entitlement status in the database.

---

**Current status:** Production — serving active freelancers across West Africa.
