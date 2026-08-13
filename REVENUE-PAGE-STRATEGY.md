# Hedwig Revenue Page — Evolution Strategy

**Author:** Head of Product / Principal Product Designer
**Date:** Aug 12, 2026
**Scope:** `web-app/app/(app)/revenue/` (Overview page) + supporting systems (ledger, AI assistant, notifications, email). Informed by the mobile app's Timeline work, which already ships many of the patterns proposed here.
**Design system:** HeroUI v3 (`@heroui/react` 3.1.0) + the Linear-style grouped-box language codified in `web-app/AGENTS.md`. Reuse existing components wherever possible.

> **Method.** This document is the output of Phase 1 (research), Phase 2 (critique) and Phase 3 (proposal). It deliberately does **not** assume "revenue page should become a timeline." The timeline is adopted *because* the research supports it — but only as one layer, and with the forward-looking layer that prevents the page from going quiet.

---

## Part 1 — Research findings

### 1.1 How modern financial operating systems structure their home screen

Research covered: **Ramp, Brex, Mercury, Rho, Airbase, Spendesk, Mesh, Relay, Wise Business, Navan, BILL, Expensify** + personal-finance timelines (**Copilot Money, Monarch, Rocket Money, Curve**) and bookkeeping (**QuickBooks, Xero, FreshBooks, Wave, Dext**).

**The convergence (what the best products agree on):**

| Concern | Leading pattern | Evidence |
|---|---|---|
| Home hierarchy | "Money movement + attention" — a strip of in/out/net, a few cash metrics, then an activity feed | Mercury transactions feed + money-in top-5 accounts; Ramp "everything" feed; Wise home = activity list; Curve spine = timeline |
| What fills the page when quiet | **Forward content**: runway, expected payments/obligations, thresholds | Ramp runway calculator; Mercury burn + base/best/worst scenarios; BILL 13-month forecasts + GL drill-down; Rocket Money "Upcoming" 2-week calendar; QuickBooks Cash Flow Planner (planned vs actual) |
| Overview vs records | Separate the "read the room" surface from the ledger | Mercury (hub) vs report builder; Ramp (spend intelligence) vs ERP sync |
| AI | A layer over everything, not a chat feature | Ramp Intelligence (receipt capture, receipt-chasing, invoice transcription, anomaly flags, policy agent); QuickBooks Intuit AI (auto-categorize/reconcile/tax suggestions); Xero JAX + Claude; Finito/CoFina founder-AI (burn, runway, anomalies, subscription audit, monthly digest) |
| Notifications | **Event→channel matrix**; invoice-class touch sequences; batched digests with escape hatches | Linear (real-time inbox + urgency-delayed email digest, only if unread in inbox); GitHub (entity-scoped grouping + different rendering per channel); banking push (fraud/low-balance high-intent, one action per push) |
| Empty/low-activity states | Never a bare zero-state; give a job: tax, obligations, capture-queue, recap | QuickBooks Self-Employed ≈ a tax-reminder engine; Dext "Costs Inbox" (catch-up queue with progress); Copilot monthly recap ("spoon-feeds you the recap"); FreshBooks separates **Overdue vs Outstanding** ("you have $X of work invoiced that hasn't landed") |

### 1.2 Irregular income & why a revenue page dies in dry months

- Online gig work is an estimated **4.4–12.5% of the global labor force** (World Bank Short Note, Nov 2023, building on ILO 2021). Africa is the **fastest-growing freelancing region** (Payoneer Global Gig Economy Index).
- Freelancers with lumpy income "fail by design" on tools built for fixed paychecks — overspend in fat months, hit cash crises in lean ones (ERN/YNAB irregular-income guidance; 64M US freelancers 2023, Upwork).
- Finance apps get deleted within their first month when the "setup tax" is high and the feedback loop is only negative (Irrational Labs: most users barely check budgets; 84% exceed limits — *the app exists to tell you you failed*).
- Africa-specific: volatile gig earnings, no benefits, and tax authorities actively targeting online workers/freelancers (African Business, Mar 2023) — making **tax readiness** a high-value, data-light feature.
- **Implication:** a pure revenue chart is most likely empty at the exact moment users are most anxious. The design must hand them something useful in precisely that state.

### 1.3 Event-driven timelines in finance

- Plaid's `SYNC_UPDATES_AVAILABLE` fires on *any* transaction change → the whole bathroom-sink "what happened" list is the norm in modern money products.
- Wise tracks a transfer lifecycle (`processing → received → sent → delivered`) as a timeline; its Activity API enumerates deposits/withdrawals/conversions/fees.
- Invoice payment events (`invoice.paid`, `invoice.overdue` — Stripe vocabulary; Plaid webhooks) are the backbone of AR products. Hedwig's `financial_events` journal already mirrors this shape and is production-verified (1,539 canonical events, fingerprint-idempotent, CQRS projection).
- **Timeline vs table vs inbox** (UX-patterns.dev): choose layout for the task. A *feed* is for scanning "what changed"; a *table* is for reconciliation; an *inbox* is for "deal with me." A financial home page wants the feed first and the ledger as a secondary surface.

### 1.4 Proactive AI: what's valuable vs noise

- **What the strongest products surface** (Ramp, QuickBooks Insight, Finito, CoFina, Attio, Linear AI): *insight sentences tied to a number and a trend* ("Your burn increased 22% this month — $8,400 more than last month, driven by a new contractor and higher AWS"), *one actionable next step*, and *proactive alerts on thresholds* (burn spike, runway drop, vendor overcharge, overdue invoices) — not chat.
- **What users actually use**: categorization assistance (learns from corrections; near-zero manual after 2–3 weeks per Copilot reviews), received-money summaries, and cash questions. **What they dismiss/mistrust**: free-form "you earned X", upsell-y recommendations, and anything that looks like it might change the books without approval ("treat AI as drafts" — consistently advised for QBO/Xero tax-sensitive actions).
- **Design rule:** proactive AI = *brief + suggestions + one-click action with explicit approval*. Never auto-act on money/category/tax decisions. (Hedwig's existing suggestion pipeline and `ApprovalModal` already encode "approving records intent — no action taken automatically.")

### 1.5 Notification & email best practices

- **Fatigue is real and expensive:** Reuters Institute (2025): **43% of users disable alerts** they find excessive/irrelevant. Banking/fintech guides converge on: notify on *high-intent, high-relevance* moments (payment received, low balance/fraud, KYC stalled), one action per notification, and **keep financial details out of push text** (put them behind auth).
- **Batching/digests** (SuprSend; Linear; GitHub): batch-on-write for event-driven grouping (GitHub "3 new reviews on your PR"), batch-on-read for scheduled digests; **hierarchy in the digest** (priority first — Linear), **batch-item limits** ("+2 more" — Figma), **critical-alert bypass** (never batch payment failures/security), and **user-selectable cadence per category**.
- **Linear model that prevents duplication:** inbox is the source of truth; email digests are *urgency-delayed and only sent if the item is still unread in the inbox*.
- **Invoice dunning** (RecVue, Rex, PaymentRescue, IdarB): staged escalation — e.g. **pre-due −3d → due → first overdue (within a week, assume oversight) → escalation (15–30d, firmer, offer payment plan) → final (45–60d)**; 4–6 touches max; **pause on dispute or payment promise and route to a human**; every message names the invoice, amount, and puts a payment link in front; dunning emails reach **50–70% open rates** (vs marketing) — the single highest-open email class in fintech.
- **Money-summary digests** (Monzo monthly review, Rocket Money recap, Copilot recap, Curve Insights) are the most-opened fintech emails and the top reason users re-open apps. Monzo runs event-triggered lifecycle comms with **frequency caps and a preference center** (email+push open rates 30–45%, push CTR 8–12%).
- **Why this matters for Hedwig:** the notification/email machinery already exists (Expo push + in-app `notifications` table + notification bell; Resend with 30+ templates; assistant daily/weekly brief emails via scheduler). What's missing is a **coherent event→channel matrix** — today each system fires independently and nothing dedupes across timeline, bell, push, and email.

---

## Part 2 — Honest critique of the current Revenue page

### What the page is today (verified from code)

`revenue/view.tsx` (1,580 lines, server-component SSR + local `useState`, no react-query):

1. Header + Import dropdown (unified document/statement import dialog — good).
2. `ContextualSuggestions` ("Expense review", limit 1) — inline AI alert.
3. Range pills (7D/30D/90D/1Y).
4. **`AttachedStatGrid` with NINE stat cards** (Total revenue, Paid, Pending, Overdue, Expenses, Net revenue, Profit margin, Monthly burn, Runway).
5. Two-column: **Invoice status** (Unpaid/Overdue/Recently paid, top 3 each) + **Revenue breakdown** (by client / by project + a hand-rolled **rainbow HSL donut** for expenses).
6. **Expenses card** (HeroUI `Table`, CRUD, "view all N").
7. **Recent activity** (300px scrollable, legacy feed of `invoice_paid/payment_received/payment_link_paid/invoice_sent/invoice_created/payment_link_active/invoice_overdue/expense_added`) + **Payment sources** (source/amount/%/count + net-revenue callout).

Supporting surfaces: `reports` page (P&L / Cash Flow [placeholder] / **Ledger** = full `LedgerPanel` with kind pills, search, ranges, drill-down into `FinancialEventDetailDialog`, XLSX/Sheets export). The **financial-event journal + projection + LedgerPanel are fully built and production-verified** but live only in Reports→Ledger.

### What works well

- **The Import button + unified import dialog** — the single best primary action; document AI analysis + bank-statement parse are genuinely good, differentiated features.
- **The underlying data engine.** `financial_events` (idempotent fingerprinting, frozen USD at event time, CQRS `ledger_entries` projection, shadow-diffed against legacy) is a modern, trustworthy core. Runway/burn metrics exist and are (mostly) correct.
- **Expense CRUD** and **invoice status** as entities. The drill-down UX in `FinancialEventDetail` (frozen-FX note, copyable hashes, event-history timeline) is the most "*financial OS*" moment in the product — it's just hidden.
- **LedgerPanel** — kind pills, debounced search, ranges, export. This is the reconciliation surface, and it's good.
- **The design language** (Linear grouped boxes, HeroUI v3, blue accent) is coherent and professional.

### What feels disconnected / wrong

1. **Nine flat stat cards is a wall of numbers.** That is a traditional accounting dashboard ("the P&L brain"). It shows *state* but not *meaning*: nothing tells you which number to care about, what changed, or what to do. It reads like bookkeeping software — precisely what a "financial OS" should hide.
2. **The page is revenue-forward and goes dead.** When there are no gigs: Total/Pending/Overdue are zeros, profit margin is "No revenue yet", the pie is empty, the activity feed is a ghost. The most-likely-to-be-empty state is exactly when the user needs the page most (see 1.2).
3. **No forward content.** Nothing shows *expected* payments from active invoices/contracts, upcoming tax deadlines, or subscriptions to review. Every leading cash-flow tool's answer to a quiet dashboard is forward content (1.1, 1.2).
4. **The best modern element is buried.** "Recent activity" is the liveliest card but it's at the bottom, 300px tall, from a *separate legacy feed* (fewer event types than `financial_events`), with no drill-down and no filters. Meanwhile the superior unified feed (`/ledger/events/feed` + `LedgerPanel`) lives in Reports.
5. **The rainbow donut.** HSL index-based colors clash with the gray/blue system, look generic/AI-generated, and add no decision value. (Same critique applies to Revenue-broken-out-by-client % bars using accent — those are fine; the multi-hue donut is not.)
6. **AI is scattered.** On this page: one "Expense review" alert. Full AssistantPanel is only on the Dashboard. Narrative is only on Reports. The Revenue page has no holistic brief and no on-page suggestions beyond expense review. The user experience of "my AI" is fragmented.
7. **Not connected to the rest of the money story.** Deposits, off-ramps, withdrawals/refunds, yield, payroll, treasury, imports — none appear in "Recent activity". The page tells only the invoicing half of the story.
8. **Engineering debt:** 9-way SSR `Promise.all` + hand-rolled local state, no react-query, refuses gracefully but prop-drills `accessToken` everywhere. The mobile app already consumes the shared ledger feed with better practices; the web page lags it.

### What a user would stop opening this page

- They come to see "did I get paid / is anyone owing me" → the feed is thin and bottom-of-page.
- All they find is nine numbers and a pie → no reason to come back daily.
- During dry spells everything says 0 → the page confirms anxiety instead of helping; they open the wallet or just leave.

---

## Part 3 — The proposal (evolution, not redesign)

### 3.1 Design principles (decided from research)

1. **A financial home should say "what's happening" then "what's next"** — a small set of meaning-bearing numbers, a money-movement strip, a forward "upcoming/obligations" layer, and a unified **Financial Timeline** as the spine.
2. **Keep the books sacred.** The ledger, reports, export, and frozen-USD accounting stay intact and reachable. The timeline is a *read* over the same `financial_events` — it never threatens the CQRS projection (timeline events that don't affect money are kept **out** of the ledger).
3. **Forward content is the dry-month strategy.** Expected payments, obligations (tax), and a catch-up queue keep the page alive when revenue is 0.
4. **AI is a brief + suggestions with one-click approval**, never a chatbot on this page, never auto-acting on money decisions.
5. **One event, one channel.** The timeline is the record; the bell, push, and email are derived, deduped layers (Linear model). No double-shipping the same event.
6. **Reuse, don't rebuild.** Every component proposed below either exists or is a thin composition of existing HeroUI v3 + existing Hedwig components.

### 3.2 What stays exactly as it is

- **The Import button + unified `ImportDialog`** (document AI → expense/credit; statement parse → transactions).
- **Expense CRUD** (dialog, table, delete-confirm) — keep the mechanics, reposition it.
- **`LedgerPanel` + `FinancialEventDetailDialog`** — the crown jewel; promoted from Reports into the main page experience. (Ledger tab remains; the panel becomes a reusable component there and here.)
- **Reports → P&L / Ledger / Export (XLSX + Google Sheets via Composio)** — unchanged; Reports stays the "accounting hub."
- **Payment sources breakdown logic** (it's good, Mercury-style) — keep, restyle into the strip.
- **Business-model metrics** Runway + Monthly burn — keep the *metrics*, change how they're shown (see 3.3).
- **Range pills, search, filters** — keep the interaction models already proven in `LedgerPanel`.
- **The design language** — Linear grouped boxes, `rounded-xl border`, HeroUI v3, blue accent. No new design system.
- **Sub-routes** (`Transactions`, `Reports`, `Settings`) — unchanged navigation.

### 3.3 What gets removed

| Remove | Why |
|---|---|
| The **9-card stat wall** | Flat numbers ≠ meaning; the same metrics return as a compact strip + brief. |
| The **rainbow donut** (`ExpensePieChart`) | Generic, clashes with system, no decision value. Replaced by a clean category list (HeroUI `Table`/`Chip`) or a single-hue accent donut, or moved to Reports entirely. |
| The **legacy "Recent activity" feed** on this page | Superseded by the unified **Financial Timeline** (richer types, drill-down, filters). The legacy activity endpoint can be deprecated and its rows migrated to `financial_events`/holder events. |
| The **scattered sidebar AI** on this surface | "Expense review, limit 1" collapsed into the unified Suggestions block; narrative moved up into the Financial Brief card. |
| **Fragile SSR fetch + manual state** | Rebuilt on react-query (already installed) — cache, refetch, optimistic updates, fewer round-trips. |

### 3.4 What gets added

1. **Financial Brief (AI)** — a narrative card with one headline + a few threshold-driven insight bullets and 0–1 CTA (details §3.7).
2. **Money-movement strip** — Mercury-style In / Out / Net + top accounts (port the mobile `MoneyStrip` pattern to web; backend summary already exists on `/ledger`).
3. **Compact stat cluster** — 4 elements instead of 9: **Cash in this period, Outstanding (invoiced, not due), Overdue, Runway** (+ fire when overdue/runway are critical). Each links to the right deep view.
4. **Upcoming & Obligations** — expected payments from active invoices/contracts (Rocket Money "Upcoming" model), tax set-aside/deadline, detected subscriptions (Rocket Money "Inactive" model). *This is the dry-month salvation.*
5. **Financial Timeline** — the unified, filterable, searchable, clickable event feed as the page's main body.
6. **Quiet-state treatment** — when the range is empty: "Nothing this week" is **not** the zero-state. Show last month summary + upcoming + obligations + catch-up queue + recap.
7. **Deeper event vocabulary** (see 3.6).
8. **Notification → channel matrix + digests + dunning** (see 3.8, 3.9).
9. **react-query migration + an export menu** relocated to header overflow.

### 3.5 Proposed information architecture

```
Revenue (Overview)                          [nav group: Overview · Transactions · Reports · Settings — UNCHANGED]
│
├─ Header          Title · Import (primary) · ⋯ export/refresh menu
├─ A  Financial Brief  (AI) — headline + insight bullets + one CTA   [collapsible/dismissible]
├─ B  Money strip      — In / Out / Net + top accounts               (Mercury)
├─ C  Quick metrics    — Cash this period · Outstanding · Overdue · Runway   (compact, clickable)
│
├─ D  Upcoming & Obligations
│      · Expected payments (dated: invoices due, contract milestones)
│      · Overdue / to chase (count + total, "follow up" CTA)
│      · Tax · Subscriptions (review)
│
├─ E  Financial Timeline   [MAIN BODY]
│      filter pills: All · Income · Expenses · Withdrawals · Deposits · Refunds · Imported
│      + search + range + export
│      rows → FinancialEventDetailDialog (existing)
│
└─ F  Right rail (compact)
       · Invoice status (Unpaid/Overdue/Recently paid)
       · Repeating expenses / subscriptions
       · Client concentration (top-3 + %  — repeat-client indicator)
       · Expense categories (clean list)
    G  Expenses management (CRUD) — retains its home at the bottom / or as its own tab
```

**Reading order argument:** A gives meaning, B+C give the 5-second read, D gives what's next and keeps the page alive when quiet, E is the story, F is the at-a-glance detail. This is the Linear grouped-box pattern with a Mercury money-strip and a Rocket-Money forward tab — all patterns active products converged on (1.1).

**Layout implementation:** single scrollable page on `xl`, two-column grid (E spans 2/3, F rail 1/3) with the rail wrapping below on smaller widths. Reuses existing `AttachedStatGrid` (restyled, fewer items), `LedgerPanel` (refactored to accept an embedded/no-header variant), `FinancialEventDetailDialog`, `ContextualSuggestions` (rebranded as the Suggestions dock), `RowActionsMenu`, `DeleteDialog`, HeroUI v3 `Card/Table/Tabs/Alert/Chip/Skeleton/Dialog/Dropdown/Popover/Separator/Spinner/Avatar`.

### 3.6 Financial Timeline strategy (+ the event vocabulary)

**Verification of the user's proposed events** — most hold up; a few need revision:

**Adopt (money events — already or easily in `financial_events`):** Invoice created · Invoice paid · Payment received · Payment Request created · Payment Request paid · Receipt imported · Receipt categorized · Expense detected/categorized · Bank statement imported · Off-ramp completed · Treasury transfer · Yield earned · Payroll completed · Refund received · Deposit received.

**Adopt (non-money events — new, `timeline` only, NEVER into `ledger_entries`):** Invoice sent · Invoice viewed · Invoice overdue (transition) · Contract signed · Proposal accepted · AI categorization applied · Reminder sent (dunning touch fired) · Workspace activity (invite/member).

**Drop / de-prioritize (noise):** "Subscription detected" is genuinely useful (monthly auto review) but should be **derived**, not a raw event — a recurring-expense rollup. "Workspace activity" and generic "AI categorization" per-line events would flood the feed (see anti-noise below) — show them as silent metadata, not feed rows, unless the user is in a workspace with team members.

**Critical engineering constraint (challenging the "everything is an event" instinct):** `financial_events` is deliberately **money-only** (its authors noted timeline-only events like `invoice.sent` were "intentionally deferred") because it feeds the `ledger_entries` CQRS projection with REPLACE semantics. Do **not** dilute it. Add a lightweight `timeline_events` journal for non-money events: `{id, user_id, workspace_id, kind, entity_type, entity_id, verb, title, context jsonb, occurred_at}` — idempotent, fingerprint-deduped like the money journal, unioned client-side (or via one feed endpoint) with `financial_events`. The ledger projection is untouched; the feed reads both. This preserves the accounting system-of-record while enabling a rich, unified timeline.

**Feed behavior rules (anti-noise):**
- **Group by entity**, not by raw event: "Invoice INV-104 — created → sent → viewed → paid" is one timeline group with a status, not four rows. This is GitHub/Linear entity-scoped batching applied to money.
- **Dedupe mirror events:** a `document.paid` from the invoice rail and a `wallet.deposit.received` from the wallet webhook can be two sides of the same money — surface once ("Paid via USDC wallet · $X"), keep both records in the ledger.
- **Collapse "AI categorized"** into the importing row's resolved state (Sk/Skipped/Matched chips — already in `FinancialEventDetail`).
- **Day/time grouping** with relative labels (Today / Yesterday / date) — proven on the mobile feed.
- **Filters** = the LedgerPanel kind pills (All/Income/Expenses/Withdrawals/Deposits/Refunds/Imported) + search.
- **Default range 30d**, latest first; keyset pagination (feed tail endpoint already implements this: `since` + opaque `cursor`).

### 3.7 Financial Brief strategy

**Form:** one card at the top. Structure, in order:
1. **Headline** (≤1 sentence): the thing that matters this period — e.g. "You collected **$4,200** this month (+18% vs last), from **3 clients**."
2. **Insight bullets (2–4, threshold-gated):** revenue trend (period vs prior), expense trend (and top driver), **runway** ("≈2.1 months at current burn"), **client concentration** (risk callout if top client >50%), **repeat-client rate** ("4 of 6 clients this month were repeats"), monthly comparison, savings/subscription opportunity.
3. **0–1 CTA** ("Follow up on 2 unpaid invoices", "Set aside ≈$310 for tax this quarter" → deep link).
4. Deterministic fallback when AI is unavailable (same pattern as existing narrative fallback — never an empty box).

**Anti-"you made $2,000" rules (from 1.2/1.4):**
- Only render a brief when it's *meaningful*: ≥ threshold event volume in range, or a crossing threshold (runway <6mo, overdue >$0, concentration >50%, expense spike >20% MoM). Otherwise show a compact single-line strip instead.
- Every bullet must be traceable (drill to the ledger query behind it). Ramp/QuickBooks "AI as drafts, explainable, humans review" — show the number, let the user verify.
- **Cadence:** the on-page brief reflects the selected range. A *different, shorter* format ships in the weekly email digest (§3.9). No push for a brief.

**Which insights users actually care about (ranked by evidence):** runway & cash → taxes owed/set-aside → client concentration + repeat clients (freelancer dependency anxiety) → spending anomalies/subscriptions → monthly comparison → "what can I afford".

### 3.8 AI Suggestions strategy

**Model:** proactive suggestion cards with one-click action → existing `ApprovalModal`. Suggestion types already exist (`invoice_reminder | import_match | expense_categorization | calendar_event | project_action | tax_review`) — curate, extend, and gate them.

**Value grading (this is the important curation):**

| Tier | Suggestion | Rationale |
|---|---|---|
| **Ship first (high value, low noise)** | **Follow up on unpaid invoices** (auto-draft dunning message per stage) | Dunning is the highest-open/highest-converting fintech email; freelancers hate chasing; the sequence can be automated with pause-on-reply. |
| | **Categorize imported expenses / clear the queue** | Dext "Costs Inbox" model — a to-do with progress that's useful in dry months. |
| | **Cash runway alert** (<3mo; <6mo with reason) | Top-ranked curiosity; matches Ramp/CoFina "runway risk" alerts. |
| | **Tax set-aside & deadline reminders** | Data-light, obligation-driven, high dry-month value; tax authorities now target freelancers in Africa; QuickBooks SE is "a tax-reminder engine." |
| | **Duplicate payment detection** | Neutral trigger: same amount/payer to same invoice in a short window. |
| | **Missing receipt / unmatchable import** | Completeness drives trust in books. |
| **Second wave** | **Subscription review** (detect recurring charges, flag duplicates + "paying but not using") | Rocket Money/Copilot pattern; needs the recurring-detection work first. |
| | **Spending anomaly** (category or vendor >20% MoM) | Finito/CoFina alert; needs threshold tuning to avoid noise. |
| | **Client follow-up cadence** (no new work from a repeat client in N weeks) | Differentiated for freelancers; phrase as supporting, not nagging. |
| **Gate hard / mostly don't build** | Generic "you made $X" | Pure noise (Copilot-style monthly recap lives in the Brief/email, not as a suggestion). |
| | Calendar events, project actions, treasury/payroll promo nudges on this page | Contextual where they belong (calendar/workspace pages), out of place on the money surface; treasury/yield advice looks like selling. |

**Anti-noise rules:**
- **Limit to ≤2 stacked suggestion cards** on the page at once (current code already uses `limit`), ranked by tier + recency + amount.
- **Dedupe** a suggestion that's already represented in the timeline (e.g. don't suggest "follow up" if a reminder was already sent 2 days ago — coordinating 3.8 with the dunning engine).
- **Confidence thresholds:** rule-based triggers where possible; LLM only to *phrase* and *select*, never to invent facts.
- **Dismiss = learn:** PATCH `suggestions/:id` exists; use dismissal + approval signals to tune per-user frequency.
- **Every suggestion records intent, never auto-acts** (existing approval contract).

### 3.9 Notification strategy (one event → one channel)

**Guiding model (Linear + banking-push research):** the **Timeline is the record**. The bell, push, and email are *derived, deduped layers* — a single event is delivered over exactly one real-time channel, and copies are batched into digests that only fire if the item is still unhandled.

**Event → channel matrix:**

| Event class | Timeline | Bell (in-app) | Push (mobile) | Email | Notes |
|---|---|---|---|---|---|
| Payment received | ✓ | ✓ | **✓** | ✓ (receipt) | THE high-intent moment; push copy has no amount, just "You received a payment" |
| Invoice paid / Payment request paid | ✓ | ✓ | — | ✓ | payment receipt email |
| Invoice sent / created | ✓ | — | — | — | record only |
| Invoice viewed | ✓ | —* | — | — | *bell only if overdue is approaching; else silent |
| Invoice overdue (transition) | ✓ | ✓ | — | ✓ (dunning #1) | email = first dunning touch |
| Dunning escalation (15/30/45d) | ✓ (Reminder sent) | ✓ | ✓ (only at final) | ✓ | pause-on-reply per dunning engine |
| Receipt imported / categorized | ✓ | (one "imports ready" only) | — | — | batch imports into one bell item |
| Expense detected / unmatched | ✓ | ✓ | — | ✓ (optional weekly batch) | |
| Subscription detected | ✓ | ✓ | — | — | merged into Monthly bill review email |
| Bank statement imported | ✓ | ✓ (on conflicts only) | — | — | |
| Off-ramp / withdrawal completed | ✓ | ✓ | ✓ | ✓ | money movement, high intent |
| Deposit received (wallet) | ✓ | ✓ | ✓ | — | |
| Refund received | ✓ | — | — | — | |
| Treasury transfer / yield earned | ✓ | — | — | monthly digest | becomes "money is working" story |
| Payroll completed / paid | ✓ | ✓ | — | ✓ | transactional |
| Contract signed / proposal accepted | ✓ | ✓ | — | — | |
| AI categorization applied | collapsible metadata | — | — | — | silent |
| Duplicate payment / anomaly | ✓ | **✓** (critical) | ✓ (critical) | ✓ (immediate) | **critical-alert bypass** — never batched |
| Tax deadline (quarterly) | ✓ (obligation) | ✓ | — | ✓ (2 touch: −21d, −7d) | high dry-month value |

**Hard rules:**
1. **No double delivery.** If an event fires instant email, it is skipped from the weekly digest for that user; if read in the bell, the digest omits it (Linear "only if unread in inbox").
2. **Critical bypass:** payment failure/duplicate/fraud-class events skip batching entirely (SuprSend pattern).
3. **Frequency caps:** non-critical push ≤ 2–3/month; suggestions ≤ 2 visible; bell auto-groups ("3 new payments").
4. **Preference center** (per-category cadence: real-time / daily / weekly / off) — reuses `assistant/preferences` shape; exposed as a row in Revenue Settings and a bell-menu item.
5. **Privacy in push text:** never show amounts in push body.

### 3.10 Email strategy

- **Transactional (event-driven, immediate):** payment received, invoice paid, off-ramp/withdrawal completed, payroll paid, deposit received. These already exist in `email.ts` (`sendPaymentReceivedEmail`, `sendPayrollCompleteEmail`, etc.) — keep, and wire them through the channel matrix so they stop duplicating into digests.
- **Invoice dunning (the money recovery engine):** staged sequence per invoice — **pre-due (−3d) → due date → first overdue (+3–5d, "things slip through") → escalation (+15–30d, payment plan) → final (+45–60d, consequence)**; **pause on reply/dispute/promise and route the relationship back to the freelancer**; every touch names invoice+amount+payment link (RecVue/Rex/IdarB playbooks). Hedwig partially has `sendSmartReminder` — extend to a full state machine keyed off invoice status transitions; **cancel the sequence the instant `document.paid` emits** (webhook-driven, like `invoice.payment_succeeded` cancels Stripe dunning).
- **Digests (batch-on-read, user-selectable daily/weekly):**
  - **Weekly Financial Brief** — the highest-open class: 1 headline + 3–5 insights + 1 CTA + links; different (shorter, scannable) format than the on-page brief; **only the unread/actionable items**. This is the Monzo/Copilot monthly-review model (recap "spoon-feeds" → re-open the app).
  - **Monthly state-of-your-business** — P&L-ish narrative, subscription audit, tax set-aside progress, client concentration, "next month looks like…" — a soft reset of the dry-month reframe.
- **Reactivation (dry-month, ≤ monthly):** "You have 3 unpaid invoices and 2 receipts to categorize — here's a 5-minute plan" (Dext catch-up queue as email). Frequency-capped; respect silence (reduce to monthly after 2 no-responses — Plotline guidance).
- **Onboarding/nudge emails already exist** — keep, untouched.
- **Economics:** dunning emails hit 50–70% open rates and each recovered invoice is directly monetizable; that's the ROI that funds the whole strategy. Gate digest emails behind plan tiers (already metered as `emails_sent`, and paywalled `assistant` use) to avoid unbounded spend.

### 3.11 Why users keep opening this page in dry months

1. **Forward content:** "2 invoices due this month (~$1,800) + contract milestone next week" — the page predicts money rather than only reporting it (Rocket Money/QuickBooks Cash Flow pattern).
2. **Obligations they can't ignore:** quarterly tax set-aside and deadlines (zero data dependency, high value — QuickBooks SE model).
3. **A catch-up queue that gives progress:** "3 receipts to categorize, 1 statement to review, 2 invoices to chase" — a to-do list with a completion path (Dext Costs Inbox model).
4. **The reframe from revenue to money movement:** deposits, off-ramps, expenses, refunds, and yield still show up as events, so the timeline is never truly empty (Curve/Wise model).
5. **Runway and scenario honesty:** "≈2 months at current burn; if you land the pending proposal, ≈3.5" — the page is a decision surface, not a report card (Pulse/Ramp/Mercury scenarios; reduces anxiety instead of confirming failure — the healthy opposite of the "punishment loop" app, 1.2).
6. **Recap & learning:** the weekly/monthly brief and email reward opening the app (Copilot "godsend — spoon-feeds you the recap").
7. **Stakes:** an overdue invoice they forgot gets chased automatically; a duplicate payment gets caught. The page becomes something that *does things for them*, not a dashboard that judges them.

---

## Part 4 — Engineering considerations & complexity

**What already exists (the head start):**
- `financial_events` journal + `ledger_entries` CQRS projection + `LEDGER_USE_PROJECTION` flag pattern + fingerprint idempotency → safe, verified core.
- `/ledger` (kind/q/range/paging), `/ledger/events/:referenceId`, `/ledger/events/feed` (keyset cursor + since), `/ledger/export` (XLSX + Sheets).
- `assistant` backend: `/brief`, `/weekly`, `/suggestions` (+generate, PATCH, preferences), `/chat`, narrative; agent runtime + 20 tools; deterministic fallbacks throughout.
- Notifications: in-app `notifications` + bell + Expo push; email: Resend, 30+ templates; scheduler w/ daily/weekly brief emission.
- Mobile app already implements the Timeline / MoneyStrip / AiBriefCard / EventDetailSheet / feed consumption — reference implementations to port to web.

**New backend work (small → large):**
1. **`timeline_events` journal** (non-money events: invoice sent/viewed/overdue-transition, contract signed, proposal accepted, reminder sent, statement imported, ai-categorized) + a merged feed endpoint (timeline_events ∪ financial_events, entity-grouped client-side or via `GROUP BY entity`). *Medium. The trickiest part is entity-collapsing and mirror-dedupe — do this in the endpoint/service, not the UI.*
2. **Upcoming & obligations endpoint**: expected payments (invoices not due, contract milestones) + quarterly tax schedule (jurisdiction already stored in Settings) + recurring-charge rollup for subscriptions. *Medium.*
3. **Dunning state machine**: per-invoice sequence keyed on status transitions, pause-on-reply, webhook cancel on `document.paid`. *Medium — reuse email.ts + scheduler; the sequence logic is the new part.*
4. **Repeat-clients & concentration metrics**: from existing `documents`/`clients` data. *Small (mostly SQL).*
5. **Duplicate-payment & anomaly detection**: deterministic rules + LLM phrasing, emit as suggestions not ledger events. *Medium; must be auditable.*
6. **Channel-matrix + digest builder**: a delivery service that consults read-state and preference center before sending; weekly Financial Brief email (can build on existing `sendAssistantBriefEmail`). *Medium.*

**Frontend (web) work:**
- Migrate Revenue page to **react-query** (already installed) — removes the 9-way SSR + manual state fragility. *Medium, low risk, flag-free.*
- Compose the new IA: Brief card, MoneyStrip (port from mobile), compact stats (restyle `AttachedStatGrid`), Upcoming & Obligations card, Timeline (refactor `LedgerPanel` to an embeddable variant + keep it in Reports), Right rail (invoice status / subscriptions / concentration / categories — reuse existing subcomponents), Suggestions dock (reuse `ContextualSuggestions`), expenses CRUD repositioned.
- Empty/quiet states per surface (the "nothing this week" treatment).
- HeroUI v3 usage throughout (`Card`, `Table`, `Tabs`, `Alert`, `Chip`, `Skeleton`, `Dialog`, `Dropdown`, `Popover`, `Separator`, `Spinner`, `Avatar`, `Pagination`) — e.g. the timeline filters reuse the LedgerPanel pill pattern; the brief uses `Alert`/`Card`; the dunning status shows as `Chip`s.

**Risk controls:** every new data surface ships behind a flag (follow the `LEDGER_USE_PROJECTION` precedent); feature-flag the timeline on Overview until parity with LedgerPanel is proven; keep legacy fallbacks until telemetry (PostHog) shows adoption; never write to `financial_events` from UI; timeline-only events never enter `ledger_entries`.

**Do NOT do:** injecting non-money events into `financial_events` (corrupts the projection); building a chat on this page; auto-acting on AI suggestions; rainbow charts; a second notification stack; per-line "AI categorized" feed rows.

---

## Part 5 — Phased rollout (risk-minimized)

| Phase | Scope | Exit criteria | Risk |
|---|---|---|---|
| **0 — Data convergence** | Revenue page → react-query; read via shared `ledger`/`feed` APIs; deprecate legacy activity feed; keep visuals identical | Feature-parity with current page, no visible regression; tsc green | Low |
| **1 — IA rework** | New layout: header/import, compact stats (9→4 + strip), Timeline embedded on Overview (LedgerPanel refactor), right rail, quiet-state treatment; remove rainbow donut | Users can find "did I get paid / whats owed" above the fold; PostHog: timeline interaction > old feed | Low–Med |
| **2 — Forward layer** | `timeline_events` journal + merged feed w/ entity grouping + mirror dedupe; Upcoming & Obligations; subscriptions rollup | Dry-month retention lift; feed grouping read-rate; no ledger drift (shadow-diff still 0) | Med |
| **3 — AI layer** | Financial Brief card (threshold-gated) + curated Suggestions (dunning assist, queue, runway, tax) + approval flow; preference center | Brief open/expand rate; suggestion approval rate; dismiss rate < threshold | Med |
| **4 — Notifications & email** | Channel matrix + digest builder + weekly Financial Brief email + dunning state machine + tax deadline emails; caps + privacy-safe push | Dunning recovery rate, digest open rate (target 30-45%), no double-delivery reports | Med |
| **5 — Advanced signals** | Duplicate/anomaly detection, client-concentration risk, runway scenarios, monthly state-of-business email | Alert precision; retention in 30-60 day no-income cohort | Med–High |

**Suggested first increment (Phase 0+1 together):** this is the page the user actually sees and is safe to ship incrementally — the timeline already has all the data, and the mobile app proves the pattern. It maximizes perceived progress for the least risk, and everything after layers on top.

---

## Sources (short list)

- World Bank, *Online gig work* (Nov 2023); ILO WESO 2021; Payoneer Global Gig Economy Index
- African Business (Mar 2023), *Can workers win in Africa's gig economy?*
- Irrational Labs / Winnie app *finance app retention*; YNAB *Irregular Income* guide; Upwork Freelance Forward
- Ramp Intelligence (ramp.com/intelligence); BILL *Cash Flow Forecasting*; Mercury *cash-flow forecasting* blog; QuickBooks *AI-powered report insights*, *Cash Flow Planner*; Xero *business performance* + Xerocon London (JAX/Ultra); FreshBooks dashboard docs; Wave; Dext *Costs Inbox*; Copilot (dollarscout/Katie review); Rocket Money *Recurring/Upcoming* docs; Curve *Timeline/Insights*
- Finito (usefinito.com), CoFina (cofina.ai) — founder AI-CFO brief/alerts/runway patterns
- Reuters Institute Digital News Report 2025 (43% disable alerts); Plotline *Fintech Push Notifications*; Pushwoosh *fintech push*; Latinia *fatigue in banking*; SashiDo *push playbooks*
- RecVue *dunning*; Rex *dunning email sequence*; PaymentRescue *dunning benchmarks*; IdarB *past-due invoice reminder sequence*; ChurnShield *3-email sequence*
- SuprSend *notification batching & digests*; Linear *Notifications/Inbox* docs; GitHub *subscriptions & notifications*; Universal Inbox *Linear actions*
- Plaid Transactions webhooks; Wise *transfer status* + Activity API; Stripe invoice events vocabulary
- Monzo *marketing/communication strategy* (Latterly), Monzo service stats; Appbot *banking reviews 2026* ("clarity reduces decision anxiety")
- UX-patterns.dev, *data display: timeline*

*Author note: the two research subagents covering Ramp/Brex/Mercury deep-profiles and the Linear/GitHub notification deep-dive were cancelled mid-run in this session; the above folds their remit into the retained reports and direct searches. Where a product-specific claim is load-bearing (dunning cadence, fatigue stats, digest batching), it is sourced above to primary or reputable-secondary material.*
