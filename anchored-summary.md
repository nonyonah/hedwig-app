# Anchored Summary

## Goal
Build comprehensive bookkeeping features across in-page sub-nav tabs (Overview | Transactions | Reports | Settings).

## Constraints & Preferences
- Revenue section uses in-page sub-nav tabs rather than sidebar expansion
- All changes must compile with zero TypeScript errors
- RLS policies use `auth.uid()::text` cast (user_id columns are text, not uuid)
- Category taxonomy: `software`, `contractors`, `marketing`, `travel`, `meals`, `office`, `operations`, `taxes`, `subscriptions`, `other`
- Server components fetch data; client components receive accessToken as prop

## Progress
### Done
- **Complete audit & research** — audited existing bookkeeping schema (imported_transactions, statement_imports, expenses, documents), import pipeline (parse + confirm routes), FX conversion infrastructure, email forwarding infra, AI categorization flows, invoice matching, and project tracking. Produced recommendation doc for all 10 features with dependencies, complexity, tradeoffs, and build order.
- **Migration 083** (`supabase/migrations/083_bookkeeping_fixes.sql`): adds `converted_amount_usd`, `fx_rate`, `fx_source` to `imported_transactions`; adds `updated_at` to `statement_imports`; enables RLS on `expenses`, `imported_transactions`, `statement_imports` with `auth.uid()::text` casts; adds category CHECK constraint on `expenses`.
- **Parse route fixed**: persists `statement_imports` + `imported_transactions` to DB (with USD conversion at parse time). Returns real `statementId`.
- **Confirm route fixed**: uses real DB statement ID; creates expenses with `workspace_id`; creates PAID `bookkeeping_only` invoices for credits.
- **Expense `workspace_id` populated** on all write paths (POST expense, confirm import, statement confirm).
- **Category validation** on PATCH/POST expense routes + DB CHECK constraint.
- **Migration 084** (`supabase/migrations/084_categorization_rules.sql`): new `categorization_rules` table with RLS, workspace scoping, priority ordering.
- **Backend endpoints**: `GET /api/revenue/statement-imports`, `GET /api/revenue/statement-imports/:id`, `PATCH /api/revenue/imported-transactions/:id/match`, `GET/POST /api/revenue/categorization-rules`, `DELETE /api/revenue/categorization-rules/:id`.
- **Frontend API client**: 6 new methods (`statementImports`, `statementImportDetail`, `matchImportedTransaction`, `categorizationRules`, `createCategorizationRule`, `deleteCategorizationRule`).
- **Frontend types** (`lib/types/revenue.ts`): `ImportedTransaction`, `StatementImport`, `ImportedTransactionStatus`, `StatementImportStatus`, `EXPENSE_CATEGORIES` constant.
- **Category taxonomy normalized**: `equipment→office`, `contractor→contractors` across `view.tsx`, `tax/view.tsx`, `insights/view.tsx`, `lib/revenue-analytics.ts`, `lib/tax-workspace.ts`, `lib/mock/revenue.ts`, `import-dialog.tsx`.
- **Import dialog** uses real `statementId` + transaction IDs from DB.
- **Sub-nav layout**: `RevenueSubNav` pill-style tab bar; layout wrapper in `app/(app)/revenue/layout.tsx`.
- **Transactions page** (`app/(app)/revenue/transactions/`): import history list with expandable rows, transaction table with date/description/amount/status, search/filter bar.
- **Reports page** (`app/(app)/revenue/reports/`): P&L tab with metric cards (revenue, expenses, net income), Cash Flow tab stub, Journal tab stub, XLSX export button.
- **Settings page** (`app/(app)/revenue/settings/`): auto-categorization rules CRUD, tax jurisdiction selector (US/UK/EU/SG/UAE), receipt forwarding email address display.
- **Backend compiles clean** — zero TS errors.
- **Frontend compiles clean** — zero TS errors.

### In Progress
- Phase 2: unified P&L ledger query, XLSX export with COA mapping, monthly AI narrative
- Phase 3: Resend inbound receipt forwarding, jurisdiction-aware deductible rules, stablecoin price feed

### Blocked
- (none)

## Key Decisions
- Sub-nav in-page tabs chosen over sidebar expansion for Revenue section
- Phase 0 must ship first because broken import pipeline makes all downstream features inaccurate
- Category taxonomy re-chosen: meals and taxes are distinct categories, equipment→office, contractor→contractors (plural)
- Cash flow forecasting deferred until 3+ months of data

## Next Steps
1. Apply migration 083 + 084 in Supabase
2. Set `AI_GATEWAY_API_KEY` env var for auto-categorization
3. Build Phase 2: unified P&L ledger endpoint, XLSX export dialog, monthly AI narrative
4. Build Phase 3: Resend inbound receipt forwarding, multi-currency price feed, tax jurisdiction deductibility rules
5. User testing pass before git push

## Relevant Files
- `hedwig-backend/supabase/migrations/083_bookkeeping_fixes.sql` — RLS, columns, category constraint
- `hedwig-backend/supabase/migrations/084_categorization_rules.sql` — categorization rules table + RLS
- `hedwig-backend/src/routes/revenue.ts` — parse/confirm fixed, 7 new endpoints, workspace_id, category validation, FX
- `web-app/lib/api/client.ts` — 6 new bookkeeping API methods
- `web-app/lib/types/revenue.ts` — ImportedTransaction, StatementImport, EXPENSE_CATEGORIES
- `web-app/app/(app)/revenue/layout.tsx` — sub-nav layout wrapper
- `web-app/components/revenue/revenue-sub-nav.tsx` — pill-style tab bar
- `web-app/app/(app)/revenue/view.tsx` — category labels/colors updated
- `web-app/app/(app)/revenue/import-dialog.tsx` — uses real DB IDs
- `web-app/app/(app)/revenue/transactions/view.tsx` — import history + transaction detail
- `web-app/app/(app)/revenue/reports/view.tsx` — P&L/cash flow/journal tabs
- `web-app/app/(app)/revenue/settings/view.tsx` — categorization rules CRUD + tax + receipt forwarding
