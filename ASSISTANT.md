---
title: "Hedwig AI assistant — quick reference"
description: "Single-page reference covering every AI capability in Hedwig: chat, daily brief, suggestions, Creation Box, document import, and notification controls."
icon: "sparkles"
---

# Hedwig AI assistant

This page is a single source of truth for the AI assistant: what it can do, where to find each surface, and how to control it. For step-by-step walkthroughs see [AI overview](/ai/overview) and [Email intelligence](/ai/email-intelligence).

The assistant requires the **Pro plan**. Existing users created before the AI plan launch keep free access during the grandfather window — no action needed.

## Surfaces

| Surface | Where | What it does |
|---|---|---|
| Daily brief | Dashboard, top of page | Morning summary of overdue invoices, due milestones, pending payment links, and outstanding cash |
| Chat | Right-side panel on web, **Chats** tab on mobile | Natural-language Q&A with full read access to your live workspace data |
| Creation Box | Sidebar on web, **+** button on mobile | Type a sentence; Hedwig drafts an invoice, payment link, or recurring invoice |
| Document import | Drag a file into the Chat panel | OCR + classify uploaded invoices, contracts, and bank statements; pre-fills records for approval |
| Suggestions | Inline on Payments / Projects / Calendar pages, plus the assistant panel | Rule-based prompts to send a reminder, log an expense, schedule a meeting, or close out a milestone |
| Insights | Insights screen | AI-generated narrative alongside earnings charts |
| Weekly summary | Email + dashboard once per week | Recap of paid revenue, top client, and changes in payment rate |

## Decision tree the agent uses

The chat agent always picks exactly one tool per request. Useful when phrasing follow-ups:

- One-off bill for a specific client with a due date → drafts an **invoice**
- Reusable shareable link or no specific client → drafts a **payment link**
- "Record" / "deposit" / "money came in" → stages a **revenue credit**
- "Is anything overdue?" / "What's unpaid?" → reads invoice list (no email is drafted; reminders run on a separate schedule)
- A date, deadline, or meeting is mentioned → reads calendar context, optionally stages a **calendar event**
- "What should I bill for?" / "Suggest items" → returns suggested line items in plain text without staging anything

Every write tool **stages** an action — nothing leaves your workspace until you approve it.

## Client matching

The assistant resolves clients only through the live database. It never infers a client identity from previously uploaded documents or chat history. If you mention a client by first name, Hedwig matches against `clients` by name (case-insensitive) and email; ambiguous matches prompt a confirmation.

## Privacy and limits

| Topic | Detail |
|---|---|
| Data scope | Your workspace records only: clients, invoices, payment links, contracts, projects, milestones, transactions, calendar events, and notifications |
| External integrations | The assistant only reads your Gmail / Calendar / Drive / Docs if you explicitly connect them under **Settings → Integrations**. Disconnecting revokes access immediately |
| Attachments | Up to 6 files, 15 MB each. Stored on Cloudflare R2 with private ACL; deleted when you delete the chat |
| Auto-execution | Never. Every write surface stages a draft; an action only runs after explicit approval |
| Offline | Not supported. Chat and Creation Box require a network connection |

## Plan and feature gates

The following AI features are Pro-only:

- Chat (multi-turn agent + tool use)
- Document import (OCR + classification)
- Creation Box (natural-language to invoice/payment link)
- Daily brief and weekly summary emails
- Suggestions engine
- AI-generated reminder email copy

Free plan still includes:

- Manual invoice / payment link / contract creation (with monthly limits)
- Mark-as-paid with payment method + reference capture
- One external payout bank account
- Crypto checkout on Base, Solana, Celo, Polygon, Arbitrum
- Calendar (in-app only; Google Calendar sync is Pro)

See [Plans](/account/plans) for full pricing.

## Common prompts

```
What did I earn this month?
Which invoices are overdue?
List my top 3 clients by lifetime earnings.
Create an invoice for Tunde, $1500, due next Friday.
Payment link for Amara, $200 for logo design.
Schedule a kickoff meeting with Chidi on Tuesday at 10am.
Mark INV-2026-031 as paid via bank transfer with reference WT-998.
```

## Controlling notifications

Open **Settings → Assistant** to toggle:

- Invoice alerts
- Deadline alerts
- Daily brief email
- Weekly summary email
- Client reminder permissions

You can revoke individual external integrations from **Settings → Integrations** at any time.

## Troubleshooting

| Symptom | Likely fix |
|---|---|
| Chat answers stale data | The assistant always reads the database — refresh the page if the latest invoice was created in the same session and not yet shown |
| Creation Box returns "Upgrade to Pro" | The AI features now require a Pro subscription; upgrade from **Settings → Billing** |
| Bank details missing on a public invoice | Confirm the saved bank in Settings has `Show on invoices` enabled, and that you saved the account number |
| Suggestion never appears for an overdue invoice | The rule looks for invoices with `SENT` or `VIEWED` status and a `due_date` ≤ 2 days away. Drafts and cancelled invoices are skipped |
| Wrong client matched | Open the client detail page; if the row was auto-created from a document, edit or merge it. The agent always reads from this canonical record |

## Related pages

- [AI overview](/ai/overview) — feature walkthrough with examples
- [Email intelligence](/ai/email-intelligence) — Gmail / Calendar tie-in
- [Bank payouts](/payments/bank-payouts) — receive bank transfers in addition to crypto
- [Mark as paid](/payments/mark-as-paid) — log off-platform payments so revenue tracking stays accurate
- [Plans](/account/plans) — what each tier includes
