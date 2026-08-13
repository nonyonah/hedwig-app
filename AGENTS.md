> **First-time setup**: Customize this file for your project. Prompt the user to customize this file for their project.
> For Mintlify product knowledge (components, configuration, writing standards),
> install the Mintlify skill: `npx skills add https://mintlify.com/docs`

# Documentation project instructions

## About this project

- This is a documentation site built on [Mintlify](https://mintlify.com)
- Pages are MDX files with YAML frontmatter
- Configuration lives in `docs.json`
- Run `mint dev` to preview locally
- Run `mint broken-links` to check links

## Terminology

{/* Add product-specific terms and preferred usage */}
{/* Example: Use "workspace" not "project", "member" not "user" */}

## Style preferences

{/* Add any project-specific style rules below */}

- Use active voice and second person ("you")
- Keep sentences concise — one idea per sentence
- Use sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references

## UI tooling (Aug 6, 2026)

- HeroUI Native (`heroui-native`) is available for building mobile UI components — skill installed at `~/.config/opencode/skill/heroui-native`, MCP server `heroui-native` registered in `~/.config/opencode/opencode.jsonc` (restart agent to load it). Always fetch Native docs before implementing (`npx @heroui/native-mcp` or the skill's scripts).
- **Hybrid UI rule**: keep the existing Expo-native UI for system chrome — bottom sheets (`TrueSheet`), context menus, dialogs/modals, and the nav bar/tab bar. Use HeroUI Native for content-level components (buttons, cards, text fields, lists) where it improves craft. Do NOT mass-replace existing Expo UI with HeroUI — the current app looks "too AI generated"; preserve the warm cream palette, existing components, and interaction patterns.

## HeroUI Native toolchain (Aug 6, 2026) — INSTALLED + VERIFIED

- **Packages**: `heroui-native ^1.0.8`, `uniwind ^1.10.1`, `tailwind-merge`, `tailwind-variants` (peer deps reanimated/gesture-handler/worklets/safe-area/svg/gorhom already present). **Install with `--legacy-peer-deps`** — pre-existing unrelated conflict: `@coinbase/cdp-core` peers an old `expo-secure-store@^15` vs project's `~55.x`.
- **`global.css`** (project root): `@import 'tailwindcss' / 'uniwind' / 'heroui-native/styles'` + a `@layer theme :root { @variant light/dark }` block mapping HeroUI semantic vars (oklch) to the warm cream palette (light) and near-black dark palette — mirrors `theme/colors.ts`; accent = #2563EB. Also has **`@source not "./hedwig-backend/**"` (etc.) exclusions** — the repo root contains backend/native/secret trees; without them Tailwind scans everything and the CSS compile takes 10+ min (or appears to hang).
- **`metro.config.js`**: `withUniwindConfig(config, { cssEntryFile: './global.css', dtsFile: './types/uniwind.d.ts' })` — **must be the OUTERMOST wrapper** (wraps `getSentryExpoConfig` result). `types/uniwind.d.ts` auto-generated (types/ is in tsconfig typeRoots).
- **`app/_layout.tsx`**: `import '../global.css'` — note the **`../`** (file is at root, layout is in app/). `HeroUINativeProvider` imported granularly from `'heroui-native/provider'` and wraps `NativeLayout` only (web branch stays bare — HeroUI Native isn't web-supported). Reuses the existing `GestureHandlerRootView` — do NOT nest a second one.
- **Verified**: full iOS dev bundle HTTP 200 (5,686 modules, ~75s warm), `tsc --noEmit` 274 pre-existing errors unchanged, uniwind CLI works standalone: `node node_modules/uniwind/dist/cli/index.mjs generate-artifacts --css ./global.css --dts ./types/uniwind.d.ts`.
- **Gotchas**: `CI=1 npx expo start` disables file watching (new files 404 until restart); first bundle is slow under high system load (load avg spiked >200 on this machine with Docker+Spotlight — bundle "hangs" are usually load starvation, not deadlock); stale/corrupted metro caches produce misleading "Unable to resolve react-native" errors — restart with `-c`.

## Phase 3 (cont): Unified day detail dialog

- **`components/calendar/types.ts`** — new shared type file extracting `PlannerItem` and `FilterValue`
- **`components/calendar/day-detail-dialog.tsx`** — new unified dialog showing all items for a selected day with left/right arrow navigation through each item, inline detail for all item kinds (reminder/milestone/invoice/project/time_entry), reminder editing inline
- **Deleted** `components/calendar/time-detail-dialog.tsx` — replaced by unified `DayDetailDialog`
- **Removed** `components/time-summary-cards.tsx` — dead after Phase 3 cleanup
- **`app/(app)/calendar/view.tsx`**:
  - Replaced `activeItem: PlannerItem | null` with `dialogState: { items: PlannerItem[]; index: number } | null`
  - Added `handleSelectItem` — on click, finds all items for that date and opens dialog at clicked index
  - Removed old `ItemDetailDialog` (300+ lines) and `TimeDetailDialog` import
  - Removed unused imports (`ArrowRight`, `ArrowSquareOut`, `Play`, `Square`, `openPaymentDetail`)
  - `DayDetailDialog` renders with arrow navigation, editing support for reminders, and time entry details

## Phase 3: Clean up old /time page and components

- **Deleted** `app/(app)/time/view.tsx` — old standalone time page replaced by calendar
- **Replaced** `app/(app)/time/page.tsx` with `redirect('/calendar')`
- **Removed** `Time` nav item from `lib/utils/navigation.ts` — Calendar covers time tracking
- **Cleaned up** unused `ClockCountdown` import from navigation
- **Deleted** 5 dead component files: `time-tracker.tsx`, `time-entry-form.tsx`, `time-entries-list.tsx`, `time-summary-cards.tsx`, `invoice-from-time-dialog.tsx`
- **Kept** `components/time/types.ts` — still used by calendar components (`TimeEntry`, `TimeSummary` interfaces)
- `/time/*` redirects to `/calendar` (server-side redirect, no flash)

## Session Summary (Jul 15, 2026)

### Phase 2: Calendar time tracking hub
- **`components/time/types.ts`** — added `assignedTo` field to `TimeEntry` interface
- **`lib/api/client.ts`** — added `timeEntryActiveAll()` method calling `GET /api/time-entries/active-all`
- **`components/calendar/calendar-time-table.tsx`** — new component showing per-project time rows with play/stop buttons, live elapsed timer, client name, duration, billable amount, and actions menu (new)
- **`components/calendar/time-entry-dialog.tsx`** — new dialog for creating/editing time entries from the calendar (reuses project list, date/duration pickers)
- **`components/calendar/time-detail-dialog.tsx`** — new detail dialog with left/right arrow navigation through date items
- **`app/(app)/calendar/view.tsx`** — major update:
  - Added `time_entry` to `PlannerItem['kind']` and `FilterValue` types
  - Added `assignedTo` to `PlannerItem`
  - Added time entry state, client-side fetching, live elapsed timer for all active timers
  - Added handlers: `handleTimeStart`, `handleTimeStop`, `handleTimeCreate`, `handleTimeUpdate`, `handleTimeDelete`
  - Added time entries + active timers to `allItems` (shows as dots on calendar cells)
  - Added `CalendarTimeTable` below the calendar grid (per-project timer rows)
  - Added `TimeEntryDialog` and `TimeDetailDialog` for CRUD operations
  - `ItemDetailDialog` delegates `time_entry` kind to `TimeDetailDialog`
  - Added `useWorkspaceContext` for `isPersonal` check (time tracking only in personal workspaces)

## Session Summary (Jul 2, 2026)

### 1. Fixed "Transaction is immutable" Stellar SDK error
- **File**: `hedwig-backend/src/services/cctpStellar.ts:150-164`
- The `sendViaCctp` helper was calling `builder.build()` on an undefined variable (should have been `tx.build()`, then `tx.toEnvelope()`). Fixed by using `new Transaction(tx.toEnvelope().toXDR('base64'), networkPassphrase)` to produce a mutable Transaction object.
- Also fixed redundant `.build()` call by removing the intermediate `envelope` variable.

### 2. Disabled Stellar integration across the app
All Stellar code paths are disabled until funding arrives. Service files (`cctpStellar.ts`, `stellarAccount.ts`, `stellarAnchor.ts`) are kept intact.

**Backend:**
- `hedwig-backend/src/routes/bridge.ts` — commented out `stellar-bridge-and-offramp` and `stellar-confirm-deposit` routes + `pollAndMint` function; removed unused imports
- `hedwig-backend/src/services/cctpStellar.ts` — the Transaction build fix above

**Frontend:**
- `offramp-modal.tsx` — removed Stellar from `ALL_CHAINS`, `shownChains`, and `CHAIN_CONFIG`; set `isStellar = false`
- `payout-panel.tsx` — removed `stellar` from `SUPPORTED_CHAINS` and `CHAIN_ICONS`
- `payout-review-dialog.tsx` — removed Stellar items processing step and the `chain === 'stellar'` conditional
- `payroll-dashboard.tsx` — removed Stellar payment rail button and balance display
- `treasury-dashboard.tsx` — removed Stellar tab and balance display
- `share-wallet-dialog.tsx` — removed Stellar chain option
- `wallet-assets-table.tsx` — removed Stellar from chain/token icon maps
- `wallet/view.tsx` — removed `stellarAddress` prop and Stellar from chain/token icon maps + asset list
- `wallet/page.tsx` — removed `stellarAddress` prop passing

### Re-activation
To re-enable Stellar: git revert `hedwig-backend/src/routes/bridge.ts` and the frontend components listed above. The `cctpStellar.ts`, `stellarAccount.ts`, and `stellarAnchor.ts` service files were left untouched.

## Session Summary (Jul 27, 2026) — PDF/image bank statement import

- **`hedwig-backend/src/routes/revenue.ts`** (statement parse endpoint, ~1287-1316): Added AI-powered branch for PDF/image files — when a PDF/PNG/JPG/WebP is uploaded to `/import-statement/parse`, the endpoint now uses Gemini to extract all transactions from the document (instead of `file.buffer.toString('utf-8')` which only works for text). Maps AI response to `ParseResult` format and passes through existing persist/confirm flow.
- **`hedwig-backend/src/services/statement-parser.ts`**: Exported `ParseResult` interface so it can be re-used in the revenue route.
- **`web-app/app/(app)/revenue/import-dialog.tsx`**: Added `'choose-type'` step for PDF/image files — after file selection, user picks "Receipt or Invoice" (routes to document/AI analysis) or "Bank Statement" (routes to statement parse & transaction table). Changed doc file size limit from 10MB to 20MB to match statements.

## Session Summary (Aug 2, 2026) — Financial Event Engine (Phases 0–5)

Architecture: append-only `financial_events` journal is the system of record; `ledger_entries` is a CQRS projection of it. USD is a **frozen presentation reference** captured at event time (`amount_usd`, `fx_rate_usd`, `fx_source`) — the legacy read path converts FX at read time, causing historical P&L drift. This fixes that and adds on-rail coverage the legacy path never saw.

- **`hedwig-backend/supabase/migrations/089_financial_events.sql`** — `financial_events` (fingerprint `sha256(event_type|entity_type|entity_id|version)` UNIQUE → idempotent emission; `occurred_at` effective vs `recorded_at`; `direction in/out/none`; denormalized money columns) + `ledger_entries` (projection; `event_id UNIQUE` checkpoint; mirrors the `/ledger` entry contract; types `revenue|expense|credit|transfer`).
- **`hedwig-backend/supabase/migrations/090_ledger_projection_state.sql`** — per (user, workspace) checkpoint row; absence → full replay.
- **`hedwig-backend/src/services/financial-events.ts`** — `emitFinancialEvent()` helper (never throws, dedupes on fingerprint, freezes FX from the deterministic rate snapshot).
- **Instrumented rails** (all fire-and-forget, idempotent): `document.ts` pay/status → `document.paid`; `webhook.ts` (Privy, Alchemy EVM + Solana) → `document.paid` (version = tx hash) + `wallet.deposit.received` (unmatched USDC only); `blockradarWebhook.ts` both; `bridgeUsdWebhook.ts` settled inbound; `paycrestWebhook.ts` COMPLETED → `offramp.settled`, FAILED+`refunded` tail → `offramp.refunded`; `revenue.ts` expenses create/update/delete + import match/confirm/bulk-confirm (bookkeeping credit docs now get `paid_at` in content); `statement-job-processor.ts` → `imported_transaction.created`.
- **`hedwig-backend/src/services/ledger.ts`** — legacy read path extracted verbatim (`buildLegacyLedgerEntries` + helpers) for shadow diffing; byte-compatible entry contract.
- **`hedwig-backend/src/services/ledger-projection.ts`** — `ensureProjection` (incremental by recorded_at since checkpoint) / `rebuildProjection` (full replay in occurred_at order). REPLACE semantics per entity: update/delete events reconcile to latest state (expense.updated replaces, expense.deleted removes, imported_transaction.updated with expensed/skipped removes the transfer entry). Personal workspaces also pull NULL-workspace events (deposits).
- **`hedwig-backend/src/services/ledger-shadow.ts`** — `runLedgerShadowDiff`: legacy vs projection; `missingFromProjection` = bug, `extraInProjection` = new coverage (Withdrawals, Other Income, Refunds), amount deltas = frozen vs live FX. Wired as weekly cron + `POST /internal/scheduler/ledger-shadow-diffs`.
- **`hedwig-backend/src/routes/revenue.ts`** — `/ledger` route: `LEDGER_USE_PROJECTION=true` env flag switches to projection read; response shape unchanged.
- **`hedwig-backend/scripts/backfillFinancialEvents.ts`** (`npm run backfill:financial-events`) — idempotent backfill: PAID docs, expenses, imported txns (+terminal states), COMPLETED offramps, USDC deposits without documents.
- `tsc` build passes; `npm run lint` is pre-broken (ESLint 9, no `eslint.config.js` in repo).
- **Order matters**: run the backfill BEFORE enabling `LEDGER_USE_PROJECTION` or the ledger shows only new events. `/ledger/export` was not flipped (still legacy aggregation).

## Session Summary (Aug 2, 2026) — Phase 6: Projection verification & personal-scope fixes

- Migration 091 applied by user; 1539 canonical events verified (fingerprint parity 0 mismatches). Committed as `68d21a5` + pushed.
- **`ledger-projection.ts`** — fixed personal (null-workspace) scope handling:
  - `ProjectionScope.workspaceId: string | null`; `isPersonal(null)` = true
  - Personal events project under canonical `ws_personal_<user>` (null-workspace events like deposits/exps were unreadable from the workspace-scoped read)
  - `eventQuery`/`getWorkspaceMaxRecordedAt` scope personal queries to `workspace_id IS NULL OR ws_personal_<user>` (was user-only → pulled other workspaces' events → duplicate `event_id` crash)
  - state rows + entry filters use canonical scope key; `rebuildProjection` clears both null + canonical rows; `readProjectionEntries` paginated (PostgREST 1000-row cap was silently truncating the diff)
- **`scheduler.ts:223`** — `String(scope.workspace_id)` was turning null into literal `'null'` workspace for personal scopes.
- **Verification result (live prod data)**: personal scope `missing: 0`, `extra: 42` (25 offramps + 17 deposits = expected new coverage), 34 amount mismatches = **FX fetch artifact** (Frankfurter unreachable in local env → legacy leaves raw NGN vs frozen USD; in prod legacy converts at read time). demo + morgan scopes fully consistent. Shared workspace `ws_2cfedc91…`: legacy 1091 vs projection 1 — legacy's expenses/imported queries filter `user_id` only (no workspace filter) so it leaks personal expenses into shared-workspace ledgers; projection is workspace-scoped by design (that leak is a legacy bug).
- Committed as `7819057` + pushed (Render auto-deploy).
- **Remaining**: spot-check `/api/revenue/ledger` pre-flip → set `LEDGER_USE_PROJECTION=true` in Render env → spot-check post-flip (shape identical + new entry types) → optionally flip `/ledger/export` + `/ledger/narrative`.

## Session Summary (Aug 3, 2026) — Phase 7: Ledger experience + Financial Event Detail

Shipped as `553b3f9` (UI + list API) then `cc118c1` (export flip + tab rename); pushed, Render deploy verified green.

- **`routes/revenue.ts` `/ledger`** — added `kind` (all/income/expenses/withdrawals/deposits/refunds/imported) + `q` (description/account search) filters; enriches each entry with `event_type` + reconciliation `status` from `financial_events` (chunked 300-ref batch, ordered by recorded_at desc, display-only never fails the read); summary now includes `moneyIn`/`moneyOut`/`net` + `movement {in,out}` top-5 accounts computed **from the filtered set** (Mercury-style: strip follows filters). P&L fields unchanged. Legacy `type` param still maps onto `kind`.
- **New `GET /ledger/events/:referenceId`** — full event history (occurred_at asc) with payload, frozen `amount_usd`/`fx_rate_usd`/`fx_source`, direction, source rail, correlation_id; scope-checked per user (null-workspace) or workspace.
- **`/ledger/export`** — now reads the projection when `LEDGER_USE_PROJECTION=true` (same coverage as the Ledger screen); P&L + General Ledger + Expense Categories sheets rebuilt from normalized ledger entries; legacy path kept behind the flag. `/ledger/narrative` still legacy.
- **NEW `web-app/components/ledger/`** — reusable `financial-event-detail.tsx` (type-adaptive drill-down: invoice payment, expense, bank import w/ reconciliation chip, withdrawal w/ bank+fiat, deposit w/ chain+addresses, refund; frozen-USD FX note, copyable hashes/addresses, event-history timeline), `financial-event-detail-dialog.tsx` (fetching shell, reusable by Timeline/Copilot/search/notifications), `ledger-panel.tsx` (Ledger experience: AI narrative alert w/ Sparkle, money movement strip + by-account bars, kind pills, debounced search, 7d–YTD range dropdown, enriched table w/ status chips + row drill-down + loading/empty/error states, range-aware XLSX/Sheets export).
- **Reports page** — Journal tab renamed **Ledger** (`ReportType 'journal'` → `'ledger'`); `hedwigApi.ledger()` accepts `kind`/`q`; added `hedwigApi.ledgerEvents()`; `LedgerEntry`/`LedgerSummary`/`LedgerFinancialEvent` types in `lib/types/revenue.ts`.
- Verify: `tsc --noEmit` green in `hedwig-backend` + `web-app`. Prod routes live (`/ledger`, `/ledger/events/:id`, `/ledger/export` → 401 auth-gated, not 404).

## Session Summary (Aug 5, 2026) — Phase 1a: Capture FAB + Timeline + Documents tabs

- **`components/capture/CaptureActionButton.tsx` (new)** — global FAB floating over the native tab bar (all 4 tabs), opens a `TrueSheet` with the unified "add money" entry points: Scan receipt (`/capture`), Type it instead (`/capture?manual=1`), Request money (`/invoice/create`), Add expense (`/capture?mode=expense`). Named export — mounted in `(drawer)/(tabs)/_layout.tsx`.
- **`app/capture.tsx` (new route)** — Phase 1d stub with a real, usable v0: camera scan reuses `components/OCRScanner.tsx` (`POST /api/integrations/extract-payment-details` → raw text → best-effort amount regex prefill), preview card + amount/category/note form → `POST /api/revenue/expenses` (VALID categories subset). Toggle between camera and manual. Registered as top-level `Stack.Screen name="capture"`.
- **`app/(drawer)/(tabs)/documents.tsx` (new)** — Documents tab that was registered in the tab layout but missing (would crash on tap). Aggregates `/api/documents?type=INVOICE|CONTRACT|PAYMENT_LINK`, All/Invoices/Links/Contracts filter chips with counts, status chips, pull to refresh, deep-links into existing `/invoices`, `/payment-links`, `/contracts`.
- **`hooks/useLedgerFeed.ts` (new)** — mobile client for `GET /api/revenue/ledger?range=&kind=all&pageSize=100` (uses `joinApiUrl`); mirrors the web ledger data contract 1:1 (`entries` + `summary`: moneyIn/moneyOut/net + movement).
- **`components/timeline/EventRow.tsx` + `components/timeline/MoneyStrip.tsx` (new)** — ledger-entry row (event-kind icon mapping, `AmountText` signed in/out tone, account subtitle, time) and Mercury-style In/Out/Net strip + top accounts by movement.
- **`app/(drawer)/(tabs)/index.tsx`** — Timeline tab rebuilt from scratch. Removed the stale `router.replace('/wallet')` redirect + old "Your activity" dashboard (sections + UniversalCreationBox). Now: greeting + avatar + bell, `MoneyStrip`, day-grouped `EventRow`s (Today/Yesterday/date labels), pull-to-refresh, loading/error/empty states. Rows show an Alert summary placeholder until the L2 financial-event detail sheet lands.
- Verified `tsc --noEmit` green for all new/changed files (project-wide tsc has pre-existing unrelated errors: AppIcon/@hugeicons typing, MaterialCreationBox android_ripple, OCRScanner `mute`, etc.).

**Phase 1b continuation (same session): L2 detail sheet + AI Brief gate**
- **`components/timeline/EventDetailSheet.tsx` (new)** — L2 drill-down replacing the Timeline row Alert placeholder. Forward-ref `present()` handle; fetches `GET /api/revenue/ledger/events/:referenceId` on open. Renders: hero `AmountText` (signed, in/out tone), frozen-USD FX note (`fx_rate_usd` + `fx_source`), event-history timeline (event-type label + icon + tone by `direction`), Details rows (surfacePayload — common copyable keys: tx hash/addresses/bank/invoice, `expo-clipboard` copy w/ inline "Copied"), correlation ID row. Wired in `(drawer)/(tabs)/index.tsx` — `setSelectedEntry` + `present()` in rAF; `onDidDismiss` clears.
- **`components/timeline/AiBriefCard.tsx` (new)** — event-gated AI Brief (rendered only at `entries.length >= 5`), fetches `/api/revenue/ledger/narrative?range=30d` (silent fail), Sparkle header + dismiss X, 4 follow-up question chips → `/insights`. Gated + dismissible via `briefDismissed` state in Timeline.
- `tsc --noEmit` still green for all new/changed files (pre-existing project errors unchanged).

**Phase 1d continuation (same session): CaptureAI analyze→confirm shipped in `app/capture.tsx`**
- Camera path now runs through the AI document analyzer instead of raw OCR: `components/OCRScanner.tsx` accepts `useAiAnalysis` + `onAnalyzed` and uploads to `POST /api/revenue/import-document/analyze` (Structured `ImportAnalysis` returned). On success `capture.tsx`'s `handleAnalyzed` pre-fills amount/currency/category/note from the analysis; preview card shows a classification chip (Receipt/Invoice/Bank statement/Contract/Document) + confidence + date instead of raw OCR text; raw-text path kept as fallback (only fires in non-AI mode).
- **`app/capture.tsx`** — evaluate flow now routes through `POST /api/revenue/import-document/confirm` when an `analysis` exists (`entryType` = expense|credit from `suggestedEntryType`, `classification`, `suggestedTitle`, `issuer`, `issuerEmail`, `date`, `currency` passed through → expense gets `source_type: 'attachment_import'` server-side); manual/fallback path still `POST /api/revenue/expenses` with `sourceType: 'manual'`. `ExpenseForm` gained a `currency` prop (symbol prefix `$`/`€`/`£`/`₦`); `retryScan` resets analysis + currency. `ImportAnalysis` exported from OCRScanner.
- `tsc --noEmit` clean for all changed files (only remaining OCRScanner error is the pre-existing `mute` typing).

**Money tab split (same session): module layer extracted from `app/(drawer)/(tabs)/wallet.tsx`**
- **`components/money/walletTypes.ts` (new)** — `Transaction`, `OfframpOrder`, `ActivityItem`, `ActivityFilter`, `NetworkFilter` (re-exports `OnrampOrder`, `CoinbasePayActivitySession`, `UsdTransfer` types).
- **`components/money/walletData.tsx` (new)** — settlement chains, chain/activity icon maps, `WITHDRAWAL_STATUS_CONFIG`, filter options, all parse/filter/normalize/group helpers (`toNumber`, `normalizeOfframpStatus`, `normalizeUsdTransferStatus`, `isUnusualInboundActivity`, `getActivityUsdValue`, `groupByDate`, …).
- **`components/money/WithdrawalProgress.tsx` (new)** — `ProgressSteps` stepper (default export, aliased as `ProgressSteps` at import site).
- **`app/(drawer)/(tabs)/wallet.tsx`** — 2604 → 2228 lines: extracted block replaced with imports; removed `isToday`/`isYesterday` from date-fns import and `Clock`/`RotateCcw`/`CheckCircle`/`TriangleAlert` from AppIcon import (now only in walletData). Render, sheets, and styles untouched — behavior-neutral split.
- `tsc --noEmit` clean for wallet.tsx + components/money.

**Phase 1b completion (same session): feed tail endpoint shipped in `hedwig-backend/src/routes/revenue.ts`**
- **New `GET /api/revenue/ledger/events/feed?limit=&cursor=&since=`** (registered before `/ledger/events/:referenceId` so `feed` is never captured by the param route). Returns the raw `financial_events` journal newest-first (occurred_at desc, id tiebreak) for the user's scope — personal (null-workspace + `ws_personal_<user>`) or workspace, mirroring the events/:id scope check.
  - Pull-to-refresh via `since` (ISO, filters `recorded_at.gt`), infinite scroll via opaque keyset `cursor` = `base64url(occurred_at|id)` with a `or(occurred_at.lt, and(occurred_at.eq,id.lt))` PostgREST predicate.
  - `limit` clamped 1–100; fetches limit+1 to compute `hasMore`; response `data.events[]` (same item shape as `/ledger/events/:referenceId` + `title` + `account` display fields) + `pagination {limit, hasMore, nextCursor}`.
  - Display labels server-side via `feedEventTitle`/`feedEventAccount` (mirror ledger-projection account mapping: Revenue/Other Income/category accounts/Imported Credit/Deposits/Withdrawals/Refunds) so mobile Timeline rows stay dumb.
- `tsc --noEmit` clean in hedwig-backend.

**Phase 1b backlog: closed.** Split Money tab ✅ · CaptureAI analyze→confirm ✅ · feed tail endpoint ✅. Remaining work is the mobile UI changes (user-run) and the user's bug list.

## Session Summary (Aug 5/6, 2026) — Timeline HTML-parse bugfix + API fetch hardening

Root cause of "JSON Parse error: Unexpected character: <" on the Timeline: `.env.local` still held a **May 2026 ngrok tunnel URL** (`https://7672-197-210-55-245.ngrok-free.app`) which Expo loads at **higher precedence than `.env`** — the dead tunnel served ngrok's HTML 404 (`<!DOCTYPE html>`) for `/api/revenue/ledger`, so `response.json()` threw the cryptic char-parse error. The real backend (`http://192.168.0.229:3000`, verified live + returns JSON even for 401s) was being shadowed.

- **`.env.local`** — replaced the dead tunnel with `EXPO_PUBLIC_API_URL=http://192.168.0.229:3000` (matches the file's own "use your LAN IP" comment). Restart Metro (`npx expo start`) and the device must be on the same Wi-Fi.
- **`utils/apiBaseUrl.ts`** — new `fetchApiJson(path, init?)` + `ApiFetchError` helper: checks `content-type` before `.json()`, and on non-JSON/HTML throws an actionable message naming the exact URL + EXPO_PUBLIC_API_URL hint (no more bare "Unexpected character: <").
- **Migrated the 3 timeline fetch paths to `fetchApiJson`**: `hooks/useLedgerFeed.ts`, `components/timeline/EventDetailSheet.tsx`, `app/(drawer)/(tabs)/index.tsx` (profile fetch). `AiBriefCard` left as-is (already silent-fails).
- `tsc --noEmit`: no errors in changed files (project-wide 274 remaining are all pre-existing: AppIcon typing, stellar sep24frontend submodule, MaterialCreationBox android_ripple, etc.).
- **Still open (needs the user's real URL)**: both prod hosts embedded in builds are dead — `eas.json` uses `https://pay.riftlabs.xyz` (NXDOMAIN, DNS doesn't resolve) and `PRODUCTION_API_BASE_URL` hardcoded to `https://hedwig-app-wuqvha-production.up.railway.app` (Railway "Application not found"). Any `eas build --profile preview|production` will fail all API calls. Ask the user for the live production API host to update eas.json + apiBaseUrl.ts.

## CRASH FIX (same session) — "No suitable image URL loader found for emoji:🚀"

RCTImageLoader crashed because the user's stored avatar is a **raw emoji (`🚀`)** and several screens shoved it straight into `<Image source={{ uri }}>`. The `catch` fallbacks in the old avatar-parsing blocks set `imageUri: userData.avatar` even when the avatar is an emoji (or an unparsable string).

- **`utils/avatar.ts` (new)** — `parseAvatar(avatar)` + `resolveProfileIcon({avatar, profileEmoji, profileColorIndex})`. Only `data:`/`http(s)`/`file:`/`blob:` strings become `imageUri`; JSON blobs (`{imageUri}`, `{emoji}`, `{colorIndex}`) are validated per-field; any bare emoji string (Extended_Pictographic regex) becomes `{ emoji }`; anything else → `{}` (callers fall back to gradient initials). Never produces an emoji in `imageUri`.
- **Wired the same 7 read paths through `parseAvatar`**: `app/(drawer)/(tabs)/index.tsx` (Timeline — also now renders emoji avatars in the gradient circle), `app/(drawer)/(tabs)/wallet.tsx`, `app/settings/index.tsx`, `app/invoices/index.tsx`, `app/payment-links/index.tsx`, `app/contracts/index.tsx`, `app/chats/index.tsx`, `app/auth/profile.tsx`. `transactions/index.tsx` no longer fetches avatars (already removed).
- `tsc --noEmit`: 274 errors, all pre-existing (AppIcon @hugeicons typing + stellar submodule + MaterialCreationBox); zero in changed files.
- Consequence: emoji avatars now display on Timeline (emoji Text inside the gradient), and other screens fall back to gradient initials instead of crashing. Write path (`app/auth/profile.tsx`) still only saves images as `avatar`, so new emoji choices aren't persisted to `avatar` — revisit if the user wants emoji written server-side.

## CRASH FIX (Aug 5/6, 2026) — `RangeError: Invalid time value` on Money tab

`groupByDate` in `components/money/walletData.tsx` called `format(date, 'MMM d')` on `new Date(malformedString)` → invalid Date → date-fns throws `Invalid time value`, crashing the Money tab on render (some activity item has a bad `date`/`createdAt`).

- **`components/money/walletData.tsx`** — `groupByDate` now skips items whose `getDate()` result fails `isValid` (imported from date-fns). Added `safeFormatDate(value, fmt)` helper returning `''` for empty/invalid values.
- **`app/(drawer)/(tabs)/wallet.tsx`** — replaced all 5 detail-sheet `format(new Date(...))` calls (USD transfer / tx / offramp / onramp createdAt + validUntil) with `safeFormatDate`, so the same malformed row can't crash when tapped.
- Note: `app/transactions/index.tsx` + `app/offramp-history/index.tsx` still use bare `format(new Date(...))` at their detail sheets (same latent risk) — left unchanged, not part of the reported crash.
- `tsc --noEmit`: 274 errors, all pre-existing; zero in changed files.

## Visual Restyle (Aug 6, 2026) — Warm cream palette

Restyled the Hedwig mobile app to match a Ramp/Mercury-inspired warm cream palette. Blue accent color (`#2563EB`) untouched. No new screens, no logic changes, no tab bar changes.

### Theme foundation
- **`theme/colors.ts`** — `LightColors.background` → `#F3F0E6` (cream), `surface` → `#FFFFFF` (white cards), `surfaceHighlight` → `#F8F6F0` (warm nested), `textPrimary` → `#1C1A14` (warm near-black), `textSecondary` → `#8B8878` (warm gray), `textTertiary` → `#ADA99B`, `border` → warm-toned `rgba(28,26,20,0.07)`, added `cardShadow: 'rgba(30,28,20,0.08)'`. Dark mode unchanged.
- **`theme/elevation.ts`** — shadow color changed from `#000000` to `#1E1C14` (warm), resting tier: offset {0,2}, opacity 0.05, radius 8; sheet tier: offset {0,-4}, opacity 0.10, radius 24; modal tier: offset {0,10}, opacity 0.14, radius 30.

### Timeline (`app/(drawer)/(tabs)/index.tsx`)
- Section labels ("Today"): `fontSize: 13`, `fontWeight: '600'`, uppercase, warm gray color. `marginBottom: 10`.
- Day group spacing: `marginBottom: 22` between groups.

### EventRow (`components/timeline/EventRow.tsx`)
- Icon circle: 38px (was 40), `surfaceHighlight` background (was `surface`).
- Title: `fontSize: 14.5`, `fontWeight: '600'`.
- Subtitle: `fontSize: 12.5`, shows `dayLabel · status` as plain gray text (no colored badges).
- Row padding: `paddingVertical: 15` (was 12).
- Removed chevron icon (cleaner look).
- Removed time subtitle (metadata now in secondary line).

### MoneyStrip (`components/timeline/MoneyStrip.tsx`)
- Card: `borderRadius: 24` (was 20), soft warm shadow (offset {0,2}, opacity 0.06, radius 12).

### Wallet (`app/(drawer)/(tabs)/wallet.tsx`)
- Balance amount: `fontSize: 34`, `fontWeight: '700'` (was 44/600).
- Section labels: `fontSize: 13`, uppercase, warm gray.
- Activity rows: `paddingVertical: 15`, `borderRadius: StyleSheet.hairlineWidth`, 38px icons (was 44px).
- Token items: `borderRadius: 20`, `paddingHorizontal: 14`.
- Chain badge: white surface background, warm shadow.
- Action buttons: flex row with gap 12, `borderRadius: 16`, `paddingVertical: 14`.

### FAB (`components/capture/CaptureActionButton.tsx`)
- Shadow color: `#2563EB` (accent blue, was `#000000`), opacity 0.45, radius 24, offset {0,10}.

### Component backgrounds updated (hardcoded → theme tokens)
- `app/settings/index.tsx` — 6 edits
- `app/invoices/index.tsx` — 7 edits
- `app/transactions/index.tsx` — 3 edits
- `app/offramp-history/index.tsx` — 4 edits
- `app/payment-links/index.tsx` — 6 edits
- `components/ui/ModalStyles.tsx` — 3 edits
- `components/ProfileModal.tsx` — 6 edits
- `components/LinkPreviewCard.tsx` — card bg + shadow
- `components/Sidebar.tsx` — container bg + shadow + search input bg
- `app/(drawer)/(tabs)/wallet.tsx` — chain badge overlay

- `tsc --noEmit`: 274 errors, all pre-existing; zero in changed files.

## Session Summary (Aug 6, 2026) — Activity feed card + Activity page

- **`app/(drawer)/(tabs)/index.tsx`** — Timeline feed now renders as a single white card (`feedCard`, radius 24, warm shadow) showing only the **top 5 activities** (`ACTIVITY_PREVIEW_LIMIT = 5`, sliced across day groups via `previewGroups` memo). "Activity" section label above the card. "View all (N)" row (top hairline + chevron) navigates to `/activity` when `entries.length > 5`. Day-group headers removed — each row's secondary line already shows "Day · Status" (per restyle CHANGE 4), so headers were redundant. Removed now-unused `renderDayGroup` + `dayHeaderRow`/`dayLabel`/`dayCount` styles.
- **`app/activity/index.tsx`** — full Activity page (registered as `activity/index` in `app/_layout.tsx` stack): back header, MoneyStrip, single white card with all 30d entries (rows-only, no day headers), EventDetailSheet drill-down, pull-to-refresh, loading/error/empty states. Shares `buildDayGroups` + EventRow/MoneyStrip/EventDetailSheet with the Timeline — no new data logic.
- **`components/timeline/EventRow.tsx`** — new `last?: boolean` prop: suppresses the bottom hairline on the final row inside a card (uses `rowLast` style).
- `tsc --noEmit`: 274 errors, all pre-existing; zero in changed files.

## Session Summary (Aug 6, 2026) — First HeroUI Native surface swap (Timeline/Activity)

First content-level surfaces converted to HeroUI Native per the hybrid rule (system chrome stays Expo). Warm shadow tokens added to `global.css` so HeroUI cards inherit the app's shadow language.

- **`global.css`** — added `--surface-shadow`/`--overlay-shadow`/`--field-shadow` overrides in BOTH light (`rgba(30,28,20,…)`) and dark (`rgba(0,0,0,…)`) `@variant` blocks. Card/Surface/Field now pick up the warm shadow automatically.
- **`components/timeline/MoneyStrip.tsx`** — Expo `View` card → HeroUI `Card` (`className="p-[18px] gap-[14px]"`); removed `card` style + Platform shadow block (Card provides radius-3xl, surface bg, warm shadow).
- **`app/(drawer)/(tabs)/index.tsx`** — Timeline feed container → HeroUI `Card` (`p-0`); "View all" row → HeroUI `Button variant="ghost" size="md"` (`className="w-full h-[52px] justify-between px-3 rounded-none border-t"`, `style={{ borderTopColor: themeColors.border }}` hairline, `Button.Label` text, chevron child). Deleted `feedCard`/`viewAllRow`/`viewAllText` styles.
- **`app/activity/index.tsx`** — feed container → HeroUI `Card` (`p-0 mt-4`); deleted `feedCard` style.
- **HeroUI gotchas learned**: granular imports `heroui-native/card`, `heroui-native/button` are virtual subpaths (real files under `lib/`); `Button.Label` is a valid compound (`button.d.ts`); custom-named utility classes like `border-separator` do NOT generate (Tailwind v4 named-color detection doesn't see vars nested inside `@variant` blocks) — use inline `style` for theme-color borders; arbitrary-value utilities (`p-[18px]`, `h-[52px]`, `text-[14px]`) work fine.
- Verified: `tsc --noEmit` 274 baseline, zero new; full iOS dev bundle HTTP 200, 5,694 modules (was 5,686 — +8 = HeroUI button/card tree), 47s warm.

## Session Summary (Aug 6, 2026) — Skeleton loading states + Activity card geometry

- **`components/timeline/FeedSkeleton.tsx` (new)** — three exports: `MoneyStripSkeleton` (3-column card w/ chip bars), `ActivityListSkeleton` (60px rows: 38px round icon, title/subtitle bars, amount bar), and `FeedSkeleton` (combined, for Activity page). Uses HeroUI `Skeleton` (`heroui-native/skeleton`, default shimmer) + `Card`; hairlines hardcoded warm `rgba(28,26,20,0.07)`.
- **`app/(drawer)/(tabs)/index.tsx`** — loading state: `ActivityIndicator` center box → `MoneyStripSkeleton` in the strip's slot + `ActivityListSkeleton` (5 rows) under the "Activity" label. List card → `rounded-[20px]` (reference radius 20, replaces HeroUI radius-3xl 24).
- **`app/activity/index.tsx`** — same swap (`FeedSkeleton`), list card → `rounded-[20px]`.
- **`components/timeline/EventRow.tsx`** — row resized to the design reference: fixed `height: 60`, `paddingHorizontal: 14` (was `paddingVertical: 15`/`paddingHorizontal: 2`) → 60px rows with the 38px icon (info block ≈ 280×38).
- Verified: `tsc --noEmit` 274 baseline, zero new; fresh dev bundle HTTP 200 containing all new skeleton symbols (grepped output) — no stale server.
- Design reference dims (from user): card ≈ 376×677 radius 20 bg #FFF; item rows 346×60; info block 280×38.

## Content boundaries

{/* Define what should and shouldn't be documented */}
{/* Example: Don't document internal admin features */}

## Session Summary (Aug 13, 2026) — Phase 2: Forward layer (timeline journal + upcoming obligations)

Follow-up to the REVENUE-PAGE-STRATEGY.md phased rollout (repo root). The Phase 0+1 IA rework was reverted by the user (see web-app AGENTS.md); this session shipped **Phase 2 as ADDITIVE changes** on top of the legacy Revenue page. Existing session work (094 migration, `timeline-events.ts`, document.ts emitters) was verified in place; the remaining Phase 2 items were implemented.

### Backend (`hedwig-backend/src`)
- **`services/scheduler.ts`** — `processDocumentReminder` now emits `invoice.reminded` timeline event after a successful reminder send (`kind=REMINDER`, `entityType` invoice|payment_link by doc.type, `version = new Date().toISOString()` so every dunning touch is a distinct idempotent event; context: title/amount/currency/type/days_since_creation).
- **`routes/revenue.ts`**:
  - `receipt.imported` emitted at end of POST /import-document/confirm (both expense and credit paths, mirroring the effectiveWsId/user context).
  - `statement.imported` emitted at end of POST /import-statement/confirm (context: statement_id, counts, totals, status).
  - **NEW `GET /api/revenue/timeline`** — merged feed of `timeline_events` ∪ `financial_events`, newest first, keyset cursor + `since` contract identical to `/ledger/events/feed` (the same predicate is applied per table, then merged/sorted/sliced; nextCursor = `base64url(occurred_at|id)`). Rows: `{id, source:'timeline'|'financial', eventType, verb, entityType, entityId, title, account, occurredAt, recordedAt, direction, amount, currency, amountUsd, fxRateUsd, fxSource, sourceRail, payload, context}`. Financial rows reuse `feedEventTitle`/`feedEventAccount`; timeline rows get account `'Activities'` and their stored title + context.
  - **NEW `GET /api/revenue/upcoming`** — `upcoming` (open DRAFT/SENT/VIEWED invoices + ACTIVE payment links, due_date >= today, `{id,title,amountUsd,dueDate,daysLeft,type}`, amount converted via `toUsdAmount`), `overdue` (same, < today, DRAFT excluded), `tax` (`estimatedSetAside = max(0, net income last 90d from financial_events amount_usd × 0.25)`, next quarterly deadline Mar 31/Jun 30/Sep 30/Dec 31 + daysUntil), `subscriptions` (expenses with same normalized note + rounded amount in ≥2 distinct months of last 6, capped 5, + monthlyTotal).
  - `/activity` now also unions recent `timeline_events` rows mapped to the ActivityEvent shape — new types: `invoice_viewed`, `contract_sent`, `contract_signed`, `statement_imported`, `receipt_imported`, `reminder_sent` (amount only when context carries one).
- **`routes/document.ts`** — fixed pre-existing TDZ bug in POST /approve/:id: `milestones.length` was referenced before the `const milestones` declaration (would crash contract approval) → `contract.content?.milestones?.length ?? 0`. Also added `workspace_id` to the /:id/viewed select so the viewed-emitter can scope events.
- **Migration note**: `094_timeline_events.sql` is still NOT applied to the DB — run it (or via Supabase) before testing any timeline/upcoming feature.

### Frontend (`hedwig-backend/web-app`)
- **`lib/types/revenue.ts`** — `ActivityEvent` union extended with the 6 new types; new `UpcomingObligations`/`UpcomingObligation`/`TaxSetAside`/`SubscriptionItem` types + `TimelineFeedEvent`/`TimelineFeedPagination`/`TimelineFeedResponse`.
- **`lib/api/client.ts`** — `hedwigApi.upcoming()` (withFallback empty object) and `hedwigApi.timeline({limit,cursor,since})`.
- **`components/revenue/upcoming-obligations.tsx` (new)** — self-contained client card (fetches /upcoming on mount): header + "Expected payments" dated rows w/ amounts, Overdue strip (danger tint, count + total, Follow up → /payments), Tax set-aside row (deadline countdown, hidden when $0), Subscriptions list (label, months badge, amount, /mo total). Loading (Loader), error + retry, and empty ("You're all caught up") states. Matches page design language (`rounded-2xl bg-[var(--color-surface)] shadow-xs`, `text-[15px] font-semibold` header, `text-[11px] font-semibold text-muted` section labels, blue accent).
- **`app/(app)/revenue/view.tsx`** — `<UpcomingObligations accessToken={accessToken} />` inserted full-width between `AttachedStatGrid` and the Invoice Status/Revenue Breakdown two-col section; `ACTIVITY_COLORS` extended with the 6 new activity types (viewed/sent/imported → accent, signed → success, reminder → warning).

### Verification
- `npx tsc --noEmit`: **green in both `hedwig-backend/` and `hedwig-backend/web-app/`** (web-app currently 0 errors total — the historical 274 pre-existing baseline has since been cleared).
- Uncommitted (base: `17c037f`); commit per phase only when the user asks.

### Next phases (per REVENUE-PAGE-STRATEGY.md)
- **Phase 3 (AI layer)**: Financial Brief card + curated Suggestions dock + preference center — reuses `/ledger/narrative` + existing `ContextualSuggestions`.
- **Phase 4**: event→channel matrix, dunning state machine (migration 095/096), weekly Financial Brief email.

## Session Summary (Aug 13, 2026) — Phase 3+4: AI brief, curated suggestions, preference center, dunning engine, channel matrix, monthly digest

Phase 3 (AI layer) + Phase 4 (notifications & email) per REVENUE-PAGE-STRATEGY.md, additive on the legacy Revenue page (same policy as Phase 2 — no IA rework).

### Migration `095_financial_brief_dunning.sql` (NOT yet applied — run before testing)
- `users`: `asst_revenue_brief` TEXT default `'weekly'` (off|daily|weekly), `asst_dunning_emails` BOOL default true, `notif_preferences` JSONB default `'{}'` (channel-matrix overrides `{"<eventClass>":{"email":"immediate|weekly|off","push":"immediate|digest|off"}}`).
- `dunning_state` table: unique `document_id` FK, user/workspace, `current_stage`, `send_count`, `last_email_sent_at`, `paused`/`pause_reason`/`promised_payment_date`/`cancelled_reason`, indexes + RLS (user-scoped).

### Dunning state machine
- **`services/dunning.ts` (new)** — `DunningEngine`: stage ladder `pre_due (−3..−1d) → due (0..2d) → overdue (3..14d) → escalation (15..44d) → final (45d+)`; one email per stage + escalation/final reinforcement after 14/21d + 7d global cooldown; `run()` sweeps SENT/VIEWED docs (batch 200), joins users for email + `asst_dunning_emails` gate; `processOne()` handles PAID→cancel, pause flags, promised date; `sendStageEmail()` via `DeepSeekService.generatePaymentReminder` + deterministic fallback; emits `reminder.reminded` timeline events (stage in context); sets `content.dunning_active`/`dunning_stage`/`last_reminder_sent_at` (suppresses legacy 7-day remind path); `markCompleted()` called fire-and-forget from `financial-events.ts` on DOCUMENT_PAID; `setPaused()` syncs with `PATCH /api/documents/:id/dunning` (routes/document.ts).
- **`services/scheduler.ts`** — `runDunningEngine()` job + `POST /internal/scheduler/dunning-engine` route (index.ts); `processDocumentReminder` skips `dunning_active` docs (non-manual).

### Financial Brief (web card + API)
- **`GET /api/revenue/brief?range=`** (routes/revenue.ts) — headline (AI ≤14 words via `llmService.generateText`, deterministic fallback), threshold-gated bullets (overdue>0, runway<6mo [danger<3], top-client >50%, expense spike >20% MoM), 0–1 CTA (overdue → /payments, runway<3 → /payments), `display` gate: `(revenue>0||expenses>0||overdue>0) && bullets>=1`, plus facts (totalRevenue/Expenses/Net, revenueDeltaPct, overdueCount/AmountUsd, runwayMonths).
- **`components/revenue/financial-brief.tsx` (new)** — HeroUI `Card` + `Skeleton` loading, tone-colored bullet dots, range badge, `next/link` CTA (HeroUI v3 Button has no `as="a"`/`endContent` — plain RAC Button). Wired into `app/(app)/revenue/view.tsx` above ImportDialog; `hedwigApi.revenueBrief(range)` in lib/api/client.ts + `FinancialBrief*` types in lib/types/revenue.ts.
- **Narrative enrichment** — `/ledger/narrative` now injects dunning-state facts (overdueCount/AmountUsd/maxDaysOverdue/dueSoonCount) into prompt + both AI and fallback responses.

### Curated Suggestions (Phase 3 §3.8)
- **`services/assistantSuggestions.ts`** — new types `runway_alert` (90d paid revenue vs 90d burn; <3mo high 0.85 / <6mo medium 0.72; `runway-alert:critical|watch:N`) + `duplicate_payment` (same entity paid twice within 14d, same amount → high 0.88 inline / medium 0.74; action `review_payments`); `fetchContext` returns `remindedEntityIds` (timeline reminders ≤7d — dedupes follow-up suggestions) + `recentPaidEvents` (14d); cooldowns 168h/24h.
- Web: `lib/types/assistant.ts` SuggestionType union, `components/assistant/suggestion-meta.tsx` (ChartBar/Copy icons + tones), `contextual-suggestions.tsx` typeToStatus.
- **`app/(app)/revenue/view.tsx`** — dock retitled "Suggested next steps" (was "Expense review"), query types `['invoice_reminder','expense_categorization','tax_review','runway_alert','duplicate_payment']`, limit 2.

### Preference center
- **`routes/assistant.ts`** — `/preferences` GET now returns `revenueBriefCadence` (asst_revenue_brief) + `dunningEmails`; PATCH validates cadence `['off','daily','weekly']`.
- **`app/(app)/revenue/settings/view.tsx`** — new "Briefs & notifications" section: cadence Dropdown (Off/Daily/Weekly), dunning emails / weekly summary / daily brief Switches; optimistic PATCH to `/api/assistant/preferences` with rollback + toast.

### Channel matrix (Phase 4 §3.9)
- **`services/channel-matrix.ts` (new)** — single routing decision point: `EVENT_CLASSES` (22 classes), default matrix (e.g. payment_received/offramp_completed → email+push immediate; invoice_paid/payroll_completed/tax_deadline → email immediate; invoice_sent/viewed/refund/ai_categorization → record only; expense_detected/subscription_detected/treasury_transfer → weekly email), `resolveChannelPlan(eventClass, notif_preferences)` merges user overrides, `isCriticalEvent()` (duplicate_payment never batched), `shouldSkipFromDigest()` (no double delivery — immediate-email events omitted from digests), `pushBudgetExceeded()` (cap 3/month via notifications `metadata->>push_sent=true` since month start).
- Wired into scheduler daily brief + weekly summary jobs: `notif_preferences` fetched per user, email skipped on `off`, push gated by plan + monthly cap; `push_sent` written to metadata when a push fires.

### Monthly state-of-business (Phase 4 §3.10)
- **`services/agent/workspace-tools.ts`** — `MonthlyStateSnapshot` interface + `buildMonthlyStateSnapshot(userId)` (month vs prior month: revenue/expenses/net, overdue, expected incoming, top clients + concentration %, subscriptions via same note+rounded-amount ≥2-month heuristic as /upcoming, estimated tax set-aside = max(0, net 90d × 25%) + next quarterly deadline, runway = 90d revenue / monthly burn) + `createMonthlyStateTool()` + `monthlyStateResponseSchema`.
- **`services/agent/assistant-runtime.ts`** — `generateMonthlyStateOfBusiness(userId)` (AI summary + 4 highlights via orchestrator, deterministic fallback `fallbackMonthlyStateNarrative`), returns full snapshot + narrative.
- **`services/scheduler.ts`** — `sendMonthlyStateOfBusiness()` job (users with `asst_revenue_brief != 'off'`, dedupe via notification period_key `YYYY-MM`, email via `sendAssistantBriefEmail` stats Revenue/Expenses/Net/Overdue, bell notification, no push); cron `0 8 1 * *` + `POST /internal/scheduler/monthly-state-of-business` route.

### Verification
- `npx tsc --noEmit` green in `hedwig-backend/` (fixed prevExpensesUsd row typing) — web-app untouched this part (0 errors baseline).
- Uncommitted (base: `17c037f`); commit per phase only when the user asks.
- **Still open (Phase 5)**: advanced signals (anomaly detection beyond duplicate-payment, client-concentration risk, runway scenarios UI).

## Session Summary (Aug 13, 2026) — Phase 5: Advanced signals (spending anomaly, client concentration, runway scenarios)

Completed Phase 5 of REVENUE-PAGE-STRATEGY.md — duplicate-payment detection, monthly state-of-business email (shipped with Phase 3+4), and now the remaining advanced signals. Backend + web typecheck green (`tsc --noEmit` in both trees). Committed + pushed.

- **`hedwig-backend/src/services/assistantSuggestions.ts`**:
  - `AssistantSuggestionType` += `spending_anomaly`, `client_concentration`; cooldown 168h each.
  - `buildSpendingAnomalyCandidates` — category spend last 30d vs prior 30d; fires only when absolute increase ≥ $50 AND MoM spike >20%; ≥50% spike → high priority + inline surface (0.86) else medium/assistant_panel (0.78); action `review_finances` (falls through to `queueManualReview` in the approval executor — safe); `related_entities`: category, current/prior amount usd, spike_pct.
  - `buildClientConcentrationCandidates` — top client share of PAID invoices last 90d; >50% threshold, ≥75% → high + inline (0.85) else medium (0.76); action `review_clients`; `related_entities`: client_id, concentration_pct, revenue_90d_usd, months_covered. Both wired into `buildCandidates` (spike+concentration capped: anomaly top-2, concentration top-1).
- **`hedwig-backend/src/routes/revenue.ts`** `/brief` — new `facts.runwayScenarios {base,best,worst}` (months): base = 90d revenue / burn, best = (revenue90d + expected incoming from open SENT/VIEWED invoices) / burn, worst = 0.7× run-rate / burn; `null` when burn = 0. Single response path (no early-return to update).
- **Web**:
  - `lib/types/revenue.ts` — `FinancialBrief.facts` += `runwayScenarios`.
  - `lib/api/client.ts` — fallback facts include `runwayScenarios` nulls (fixed the TS2741).
  - `lib/types/assistant.ts` — `SuggestionType` += both types; `relatedEntities` += category/current_amount_usd/prior_amount_usd/spike_pct/concentration_pct/revenue_90d_usd/months_covered.
  - `components/assistant/suggestion-meta.tsx` — `SUGGESTION_META` += `spending_anomaly` (ArrowUpRight, warning tone), `client_concentration` (UsersThree, danger tone).
  - `components/assistant/contextual-suggestions.tsx` — `typeToStatus`: anomaly → warning, concentration → danger.
  - `app/(app)/revenue/view.tsx` — dock query types += both new types.
  - `components/revenue/financial-brief.tsx` — RUNWAY strip (Base/Best/Worst months, Mercury-style 3-col divide-x, success/danger tones) rendered under the CTA when `facts.runwayScenarios.base !== null`.
- Verification: `npx tsc --noEmit` green in `hedwig-backend/` + `web-app/` (web-app 0 errors baseline). Migration 095 still needs applying by the user before dunning/brief-prefs features are live.
