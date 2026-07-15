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

## Content boundaries

{/* Define what should and shouldn't be documented */}
{/* Example: Don't document internal admin features */}
