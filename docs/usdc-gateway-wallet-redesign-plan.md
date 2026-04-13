# USDC-Only + Circle Gateway + Wallet Redesign Plan

## Objective

Move Hedwig to a strict USDC-only payment and wallet model across web + mobile, remove legacy non-USDC paths, and adopt Circle Gateway to unify balances across supported chains.

## Product Decisions

- Supported asset: `USDC` only.
- Supported settlement chains (initial): Base, Arbitrum, Polygon, Celo, Solana.
- Removed from product surface: USDT, native-token send flows (ETH/SOL), and Lisk network support.
- Wallet UX direction: one unified USDC balance with chain detail as secondary context.

## Gateway Architecture (Target State)

Based on Circle Gateway docs (`https://developers.circle.com/gateway`):

- User-facing model:
  - Primary balance = unified USDC balance.
  - Chain cards show distribution and last sync per chain.
- Core flows:
  - Deposit flow (permissionless): user deposits USDC into Gateway deposit path from supported chain.
  - Cross-chain move: burn on source + mint on destination via Gateway intent flow.
  - Balance query: backend aggregates Gateway balances and exposes normalized wallet state.
- Backend source of truth:
  - Hedwig backend stores normalized unified balance + per-chain snapshots.
  - Frontends render from backend wallet API (not direct chain reads for primary balances).

## Delivery Phases

### Phase 1: Complete USDC-Only Enforcement (Done / stabilization)

- Remove token/network selectors for unsupported assets.
- Keep only USDC token options in payment links, invoices, send flows, wallet tables.
- Add guards in API/domain models so unsupported symbols/chains are rejected.

### Phase 2: Gateway Backend Foundation

- Add `gateway` service module in backend:
  - `getUnifiedBalance(userId)`
  - `getChainBreakdown(userId)`
  - `createDepositIntent(...)`
  - `createTransferIntent(...)`
  - `syncGatewayState(userId)`
- Add persistence tables:
  - `gateway_balances`
  - `gateway_transfers`
  - `gateway_sync_runs`
- Add webhook handlers (if used in selected Gateway integration path) for finality and status updates.

### Phase 3: Wallet API Contract

- Introduce versioned response shape used by both web and mobile:
  - `unifiedBalanceUsdc`
  - `chains[]` with `chain`, `balanceUsdc`, `lastSyncedAt`
  - `pendingTransfers[]`
- Add fail-safe fallback when Gateway sync is delayed (show last known snapshot + stale badge).

### Phase 4: Web Wallet Redesign

- New wallet hierarchy:
  - Hero: Unified USDC balance.
  - Secondary: Chain distribution tiles.
  - Activity: Gateway transfer timeline + payment/offramp events.
- Replace chain-first token table with USDC-first ledger.
- Update send/deposit/bridge CTAs to Gateway-native flows.

### Phase 5: Mobile Wallet Redesign

- Mirror web IA with native UX:
  - Top summary card for unified USDC.
  - Chain chips as filters/details, not primary balances.
  - Simplified transfer modal (USDC only, destination + chain).
- Keep paywall-aware gating on wallet premium actions if required.

### Phase 6: Cutover + Cleanup

- Remove deprecated bridge/offramp pathways that bypass Gateway.
- Delete dead token assets/routes/constants for unsupported symbols.
- Run migration script to normalize historic non-USDC display records.

## API + Data Contract Changes

- Enforce `asset = USDC` in create/update endpoints for:
  - Invoices
  - Payment links
  - Wallet send flow
  - Offramp requests
- Enforce allowed chain enum at backend boundary.
- Reject unknown symbols/chains with explicit 4xx errors.

## QA Plan

- Web + mobile parity tests:
  - Unified balance consistency after refresh.
  - Chain transfer status transitions (`pending -> confirmed/failed`).
  - Invoice/payment-link checkout still USDC-only.
- Regression tests:
  - No user-facing USDT/ETH/SOL/Lisk options.
  - Legacy deep links to unsupported tokens return safe errors.

## Risks and Mitigations

- Risk: stale Gateway state in UI.
  - Mitigation: show `lastSyncedAt`, optimistic pending rows, periodic refresh.
- Risk: partial chain outages.
  - Mitigation: isolate chain status and keep unified balance from last confirmed snapshot.
- Risk: rollout complexity across web and mobile.
  - Mitigation: ship backend contract first, then web, then mobile behind feature flag.

## Execution Order (Recommended)

1. Finalize backend Gateway schema + service wrappers.
2. Release API contract with feature flag.
3. Ship web wallet redesign on new API.
4. Ship mobile wallet redesign on same API.
5. Enable Gateway flow for internal users, then staged rollout.
