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
