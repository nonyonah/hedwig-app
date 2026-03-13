# Hedwig Web App Scaffold

## Positioning
Hedwig Web is a freelancer operating system. It combines clients, active work, deadlines, money movement, and AI-assisted billing in one surface. It is not a generic PM tool, not a standalone wallet, and not a chatbot shell.

## Architecture
- `app/`: Next.js App Router pages and layouts
- `components/app-shell/`: protected shell, sidebar, topbar
- `components/ai/`: prompt composer and invoice/payment-link draft flow
- `components/data/`: reusable business UI blocks
- `components/ui/`: shadcn-style primitives
- `lib/models/`: typed domain entities for shared backend assumptions
- `lib/mock/`: realistic mock data for scaffold rendering
- `lib/api/`: backend-aware adapter layer with controlled mock fallback
- `lib/auth/`: Privy-oriented auth wiring, session shape, and backend assumptions

## Folder Structure
- `app/(auth)/sign-in`: Privy-backed sign-in entry
- `app/(app)/dashboard`: work + money overview
- `app/(app)/clients`: client list
- `app/(app)/clients/[id]`: client workspace view
- `app/(app)/projects`: project list
- `app/(app)/projects/[id]`: project detail with milestones
- `app/(app)/payments`: invoices, payment links, AI creation
- `app/(app)/contracts`: contract workspace
- `app/(app)/wallet`: wallet assets and activity
- `app/(app)/accounts`: USD accounts and account activity
- `app/(app)/offramp`: withdrawal workflow scaffold
- `app/(app)/calendar`: timeline and deadlines
- `app/(app)/settings`: account, workspace, notifications

## Shared Backend Assumptions
- Privy remains the identity layer
- Hedwig backend verifies Privy access tokens
- Supabase remains the data layer behind the backend
- This scaffold does not duplicate business logic; it consumes the same Hedwig backend contracts used by mobile

## Env Notes
- `NEXT_PUBLIC_API_URL`: Hedwig backend base URL
- `NEXT_PUBLIC_PRIVY_APP_ID`: Privy app id
- `NEXT_PUBLIC_PRIVY_CLIENT_ID`: Privy client id
- `NEXT_PUBLIC_HEDWIG_USE_MOCK_AUTH=true|false`: keep mock shell identity during scaffold stage
- `NEXT_PUBLIC_HEDWIG_USE_MOCK_DATA=true|false`: force scaffold data even when backend auth is available

## Current Integration Status
- Real backend adapters now exist for `auth/me`, `notifications`, `clients`, `projects`, `transactions`, `usd-accounts`, and `offramp/orders`
- Payments, contracts, calendar, and AI draft generation still use scaffold data until matching backend list/draft endpoints are formalized
- Server-side Privy token persistence is intentionally left as a thin structure; the scaffold expects a future cookie/session bridge rather than inventing a second auth system
