# STELLAR_RESEARCH.md

## Phase 0 Research — Stellar Integration for Hedwig

**Date:** 2026-06-24
**Status:** Reviewed. Option A (server-side custody) selected for Stellar wallets.

---

## Key Findings Summary

| # | Finding | Impact |
|---|---|---|
| 1 | **CCTP supports Stellar** | USDC can bridge natively Base/Solana → Stellar. No wrapping. |
| 2 | **Privy doesn't support Stellar** | Need separate wallet creation. Option A: server-side keypair generation during sign-in. |
| 3 | **SDP runs as a Docker service** (Go-based) | We integrate via its REST API, not as a code dependency. |
| 4 | **SDP ships Embedded Wallets** (passkey/WebAuthn) | Not used for initial wallet creation (requires user interaction). Can be added later as opt-in. |
| 5 | **African anchors exist for NGN, KES** | Cowrie (NGN via NGNC token), Kotani Pay (KES). TZS/MWK via Paycrest fallback. |

---

## Architecture Decision: Wallet Creation Flow

### Option A (Selected): Server-side Stellar keypair generation during sign-in

```
User signs in with Privy OAuth
  ↓
Backend syncs/creates user (existing getOrCreateUser)
  ↓
Privy creates EVM wallet     → users.ethereum_wallet_address  (existing)
Privy creates Solana wallet  → users.solana_wallet_address    (existing)
Backend creates Stellar pair → users.stellar_public_key       (NEW)
                               users.stellar_encrypted_seed   (NEW)
  ↓
Backend funds Stellar account with min XLM + sets USDC trustline
  ↓
User sees all three wallets (nothing changes in UX)
```

**Why**: Same custodial pattern as today. Invisible to user. Backend controls everything. No passkey/WebAuthn prompt needed.

---

## Implementation Plan

### Phase 1: Stellar Wallet Generation During Sign-In

**What**: Every new Hedwig user gets a Stellar keypair alongside their existing EVM and Solana wallets.

**Backend changes**:

| File | What |
|---|---|
| `src/utils/userHelper.ts` (or new file) | After creating Privy EVM + Solana wallets, generate `Keypair.random()`, encrypt seed with `STELLAR_ENCRYPTION_KEY`, store in `users` |
| `src/services/stellarAccount.ts` | New service — create Stellar account on network (fund via Friendbot on testnet, via distribution account on mainnet), set USDC trustline |
| `supabase/migrations/075_stellar_wallets.sql` | `ALTER TABLE users ADD COLUMN stellar_public_key TEXT; ADD COLUMN stellar_encrypted_seed TEXT;` |

**Env vars**:

```bash
STELLAR_NETWORK=testnet                    # testnet | pubnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_ENCRYPTION_KEY=<32-byte-hex>      # AES-256-GCM key for seed encryption
STELLAR_DISTRIBUTION_SEED=S...             # Fund new accounts (mainnet)
STELLAR_USDC_ISSUER=GBBD47IF6LWK7P7M...   # USDC asset issuer on Stellar
```

**Install**:

```bash
yarn add @stellar/stellar-sdk
```

**Complexity**: Simple (~1 day)

---

### Phase 2: SDP Deployment (Docker + Config)

**What**: Run Stellar Disbursement Platform as a companion service alongside Hedwig backend.

**Steps**:

```bash
git clone https://github.com/stellar/stellar-disbursement-platform-backend.git
cd stellar-disbursement-platform-backend
make setup  # Single-tenant, testnet, generate accounts
```

**What this creates**:

| Component | Port | Purpose |
|---|---|---|
| SDP Core API | 8000 | REST API for disbursements, receivers, payments |
| SDP Dashboard | 3000 | Admin UI (internal use) |
| TSS | — | Background transaction submission to Stellar |
| PostgreSQL | 5432 | SDP's own database |

**Configuration**:

- `SINGLE_TENANT_MODE=true` — Hedwig IS the single organization
- Distribution account funded with test XLM + USDC
- SEP-10 signing key configured
- Embedded wallets disabled (we use our own G-addresses)
- Dashboard accessible only internally

**Env vars for Hedwig backend**:

```bash
SDP_API_URL=http://localhost:8000
SDP_ADMIN_ACCOUNT=admin
SDP_ADMIN_API_KEY=<generated>
```

**Complexity**: Simple (~2 days, mostly Docker and config)

---

### Phase 3: Hedwig ↔ SDP Integration

**What**: Hedwig backend translates payroll data into SDP disbursements and syncs payment status back.

**Backend changes**:

| File | What |
|---|---|
| `src/services/sdp.ts` | API client — create disbursement, upload CSV, start disbursement, poll status, list payments |
| `src/services/hedwigPayrollSdpAdapter.ts` | Convert Hedwig payout items → SDP CSV format (phone/email, amount, asset, verification field) |
| `src/routes/sdp.ts` | Proxy endpoints: `POST /api/sdp/disbursement` (trigger payroll), `GET /api/sdp/disbursement/:id` (status) |
| `src/services/scheduler.ts` | New cron job: poll SDP payment status every 60s, sync to `workspace_payout_items` |

**SDP API calls used**:

| Call | When |
|---|---|
| `POST /disbursements` | Create a draft disbursement |
| `POST /disbursements/:id/instructions` | Upload CSV of receivers (our members) |
| `PATCH /disbursements/:id/status` | Move `draft` → `ready` (start sending) |
| `GET /disbursements/:id` | Track progress (total, success, failed, pending) |
| `GET /disbursements/:id/receivers` | Per-member payment status |
| `GET /payments?disbursement_id=X` | Detailed payment status per item |

**Data flow**:

```
Hedwig payroll panel → PayoutReviewDialog
  ↓
POST /api/workspaces/:id/treasury/payout (existing)
  ↓
TreasuryService.initiatePayout() stores payout items
  ↓
IF chain === 'stellar':
  Adapter converts payout items → SDP CSV
  SDP API: create disbursement → upload CSV → start
  Store sdp_disbursement_id on workspace_payouts
  ↓
Scheduler polls SDP every 60s
  On payment success → mark workspace_payout_item.status = 'completed'
  On payment failure → mark as 'failed' with reason
```

**Complexity**: Medium (~4-5 days)

---

### Phase 4: CCTP Bridge — Fund Distribution Account

**What**: Move USDC from Hedwig's Base/Solana treasury to SDP's Stellar distribution account via Circle CCTP.

**Why**: The SDP distribution account needs USDC on Stellar to disburse payroll. Hedwig's treasury USDC is currently on Base (primary) and Solana (alternate).

**Backend changes**:

| File | What |
|---|---|
| `src/services/cctpStellar.ts` | Burn USDC on Base/Solana → get Circle attestation → mint on Stellar to distribution account |
| `src/routes/treasury.ts` | Add `POST /api/workspaces/:id/treasury/fund-stellar` — triggers CCTP bridge |

**Flow**:

```
Workspace owner: "Fund Stellar payroll"
  ↓
Treasury has USDC on Base → approve CCTP burn
  ↓
Circle attests burn → mint native USDC on Stellar
  ↓
USDC lands in SDP distribution account
  ↓
Ready for disbursement
```

**Alternatively**: Use Bridge.xyz (already integrated) to fund the distribution account, since SDP has native `ENABLE_BRIDGE_INTEGRATION` config.

**Complexity**: Medium (~3-4 days)

---

### Phase 5: Payout Panel — Add Stellar Option

**What**: Workspace owners can choose Stellar as a payout chain alongside Base and Solana.

**Frontend changes**:

| File | What |
|---|---|
| `lib/send/send-helpers.ts` | Add `stellar` to `SendChain`, add `sendStellarDisbursement()` that calls `/api/sdp/disbursement` |
| `components/workspace/payout-panel.tsx` | Add `stellar` to `SUPPORTED_CHAINS`, add Stellar chain icon |
| `components/workspace/payout-review-dialog.tsx` | Handle Stellar chain — calls SDP backend proxy instead of direct send |

**Payout flow**:

1. Workspace owner adds members, selects amount
2. For each member, chain selector now shows: Base / Solana / **Stellar**
3. If Stellar selected: member must have `stellar_public_key` (all members do, created at sign-in)
4. On "Sign & send" → `POST /api/workspaces/:id/treasury/payout` with `destination_chain: 'stellar'`
5. Backend collects all Stellar items → creates SDP disbursement → starts it
6. SDP sends USDC to each member's Stellar G-address

**Complexity**: Medium (~3-4 days)

---

### Phase 6: Wallet Page — Show Stellar Balance

**What**: Users can see their Stellar USDC balance alongside their Base/Solana balances.

**Frontend changes**:

| File | What |
|---|---|
| `components/wallet/wallet-assets-table.tsx` | Add Stellar as a chain row — query Horizon for USDC balance |
| `lib/api/client.ts` | Add `fetchStellarBalance(publicKey)` — calls backend proxy |
| `routes/wallet.ts` | Add `GET /api/wallet/stellar-balance` — queries Horizon |

**Display**: Stellar appears as a row in the wallet assets table showing:
- Chain icon (Stellar)
- USDC balance (from Horizon)
- USD value (same as USDC)

**Complexity**: Simple (~2 days)

---

### Phase 7: Mobile — Stellar Receive Address

**What**: Mobile receive screen shows Stellar address alongside Base/Solana.

**Mobile changes**:

| Screen | What |
|---|---|
| Receive screen | Add Stellar tab/option showing `stellar_public_key` with QR code |
| `GET /api/users/profile` | Already returns wallet addresses — add `stellarPublicKey` to response |

**Complexity**: Simple (~2 days)

---

### Phase 8: Anchor Integration — NGN/KES Off-Ramp

**What**: Members with Stellar USDC can off-ramp to Nigerian or Kenyan bank accounts via Stellar anchors.

**Backend changes**:

| File | What |
|---|---|
| `src/services/stellarAnchor.ts` | SEP-10 auth, SEP-12 KYC, SEP-24 deposit (Cowrie for NGN, Kotani Pay for KES) |
| `@stellar/typescript-wallet-sdk` | Used for anchor interaction (SEP-10 auth, SEP-24 flows) |

**Flow**:

```
Member has USDC on Stellar
  ↓
Member wants NGN → selects Cowrie anchor
  ↓
Backend: SEP-10 authenticate with Cowrie (signs with member's decrypted seed)
  ↓
Backend: SEP-12 submit KYC data (from Didit, already collected)
  ↓
Backend: SEP-24 initiate USDC → NGNC deposit
  ↓
Cowrie sends NGN to member's Nigerian bank account
```

**Install**:

```bash
yarn add @stellar/typescript-wallet-sdk
```

**Complexity**: Complex (~7-10 days)

---

## Complete Dependency Map

```
Phase 1 (Wallet creation)  ── independent, blocks nothing
         ↓
Phase 2 (SDP deployment)   ── independent, can start in parallel
         ↓
Phase 3 (SDP integration)  ── depends on Phase 2
         ↓
Phase 4 (CCTP bridge)      ── can start in parallel with Phase 3
         ↓
Phase 5 (Payout panel)     ── depends on Phase 3
         ↓
Phase 6 (Wallet page)      ── depends on Phase 1
         ↓
Phase 7 (Mobile receive)   ── depends on Phase 1
         ↓
Phase 8 (Anchor off-ramp)  ── depends on Phase 1, Phase 6
```

## Estimated Timeline

| Phase | Complexity | Est. Days | Can parallelize |
|---|---|---|---|
| 1. Wallet creation | Simple | 1 | ✅ With Phase 2 |
| 2. SDP deployment | Simple | 2 | ✅ With Phase 1 |
| 3. SDP integration | Medium | 5 | — |
| 4. CCTP bridge | Medium | 4 | ✅ With Phase 3 |
| 5. Payout panel | Medium | 4 | — |
| 6. Wallet page | Simple | 2 | ✅ With Phase 5 |
| 7. Mobile receive | Simple | 2 | ✅ With Phase 5/6 |
| 8. Anchor off-ramp | Complex | 10 | — |
| **Total (sequential)** | | **30 days** | |
| **Total (parallelized)** | | **~22 days** | |

## Files Summary

### New files to create

```
src/services/stellarAccount.ts           # Phase 1
src/services/sdp.ts                      # Phase 3
src/services/hedwigPayrollSdpAdapter.ts  # Phase 3
src/services/cctpStellar.ts             # Phase 4
src/services/stellarAnchor.ts           # Phase 8
src/routes/sdp.ts                       # Phase 3
supabase/migrations/075_stellar_wallets.sql  # Phase 1
```

### Files to modify

```
src/utils/userHelper.ts          # Phase 1 — add Stellar keypair generation
src/index.ts                     # Phase 3 — register SDP routes
src/services/scheduler.ts        # Phase 3 — poll SDP status
src/routes/wallet.ts             # Phase 6 — Stellar balance endpoint
src/routes/user.ts               # Phase 7 — return stellarPublicKey
lib/send/send-helpers.ts         # Phase 5 — add Stellar chain
components/workspace/payout-panel.tsx     # Phase 5
components/workspace/payout-review-dialog.tsx  # Phase 5
```

### New packages

```bash
yarn add @stellar/stellar-sdk                  # Phase 1
yarn add @stellar/typescript-wallet-sdk        # Phase 8
```

### New env vars

```bash
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_ENCRYPTION_KEY=<32-byte-hex>
STELLAR_DISTRIBUTION_SEED=S...
STELLAR_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
SDP_API_URL=http://localhost:8000
SDP_ADMIN_ACCOUNT=admin
SDP_ADMIN_API_KEY=<generated>
```

---

**Status**: Awaiting founder review. Can begin Phase 1 immediately — it's independent and blocks nothing else.
