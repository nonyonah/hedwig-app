# Conductor handoff: replace Agents with Intelligence

## User request

Replace the existing web app Agents page with an Intelligence hub. The hub should be the central place where the user communicates with Hedwig’s financial operator. Use the project’s shadcn-style message component pattern for rendering chat messages; if no Message component exists, add a focused `components/ui/message.tsx` rather than inventing message markup inside the page.

The user previously asked to compare Hedwig’s agent model with Mercury. The key product decision is:

> Do not continue treating agents as separate named spend profiles. Build one central financial operator, then let domain workflows, capabilities, policies, funding boundaries, and approvals sit around it.

The Intelligence page should be additive and production-minded. Do not delete backend agent tables/routes or break existing API contracts unless explicitly necessary.

## Product direction

Mercury’s model is:

- One general financial operator (`Command`) rather than separate invoice/payroll/subscription personas.
- Natural-language conversation as the primary surface.
- Structured action previews before execution.
- Explicit human approval for material actions.
- Strong deterministic permission and spending boundaries.
- Domain capabilities selected by intent: payments, invoices, transfers, cards, payroll, categorization, treasury, etc.
- External agent capabilities are isolated and human-controlled.

Hedwig currently has three overlapping concepts:

1. Configured `agents` + `spend_policies`, which are mostly policy profiles.
2. A broad assistant chat runtime with workspace tools and staged suggestions.
3. Generic approval requests and assistant suggestion executors.

The Intelligence page should unify the user experience around the second concept while surfacing the third clearly. Do not present the old policy-profile list as the primary product anymore.

## Existing relevant code

### Web app

- `hedwig-backend/web-app/app/(app)/agents/page.tsx`
  - Server page currently fetches `hedwigApi.agents()` and renders `AgentsClient`.
- `hedwig-backend/web-app/app/(app)/agents/view.tsx`
  - Current Agents table, filters, stats, status controls, and create-agent dialog.
- `hedwig-backend/web-app/app/(app)/agents/create-dialog.tsx`
  - Current policy-profile creation flow. It generates instructions but is not the new Intelligence experience.
- `hedwig-backend/web-app/components/ai/hedwig-chat-bubble.tsx`
  - Older floating chat using `/api/creation-box/parse` and directly creating invoices/payment links. Do not duplicate this behavior on Intelligence.
- `hedwig-backend/web-app/components/ui/`
  - Existing shadcn-style components include `button.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`, `textarea.tsx`, `command.tsx`, etc.
  - There is no existing `message.tsx` found at handoff time.
- `hedwig-backend/web-app/lib/api/client.ts`
  - Contains API client methods. Reuse existing assistant/chat methods if available; inspect before adding anything.

### Backend

- `hedwig-backend/src/services/agent/assistant-runtime.ts`
  - `runAgentChat()` is the current newer conversational runtime.
  - It uses workspace analysis tools, Hedwig native tools, Composio tools, and commercial tools.
  - Write tools stage suggestions for approval; do not assume they execute immediately.
  - `AgentChatResult` returns `reply`, `stagedSuggestionIds`, and `toolsCalled`.
- `hedwig-backend/src/routes/assistant.ts`
  - Existing assistant endpoints, including the chat endpoint. Inspect exact request/response shape before changing frontend code.
- `hedwig-backend/src/services/agent/orchestrator.ts`
  - Tool orchestration layer.
- `hedwig-backend/src/services/assistantSuggestions.ts`
  - Suggestion generation/status lifecycle.
- `hedwig-backend/src/services/agent/assistant-approval-executor.ts`
  - Approval execution logic.
- `hedwig-backend/src/routes/approvals.ts`
  - Approval request/list/approve/decline routes.
- `hedwig-backend/src/routes/agents.ts`
  - Existing agent profile CRUD. Leave intact unless a compatibility-safe change is needed.
- `hedwig-backend/src/services/spendPolicy.ts`
  - Deterministic policy engine. Keep policy enforcement deterministic.

## Required implementation outcome

1. Rename the route/page experience from Agents to Intelligence in the web app.
2. Make the page a central conversational hub for Hedwig.
3. Use the existing `/api/assistant/chat` runtime and its actual API contract.
4. Render user/assistant messages using a reusable shadcn-style `Message` component.
5. Show staged actions and approval affordances in the conversation, not as opaque generic rows.
6. Include useful starting prompts/actions for domains such as:
   - Upcoming subscriptions and renewals
   - Payroll readiness/funding
   - Purchases and vendor payments
   - Invoice collection
   - Bookkeeping and categorization
   - Cash position / runway
7. Keep suggestions grounded in the workspace and show loading, empty, error, and retry states.
8. Preserve accessibility:
   - real buttons and form controls
   - visible focus rings
   - keyboard submit with Shift+Enter for newline
   - aria labels
   - minimum 40px hit targets
9. Preserve the project’s existing warm cream / Mercury-inspired visual language and token usage. Do not introduce a new palette or a generic dark AI chat UI.
10. Keep the old backend agent CRUD usable for now, but it should no longer be the primary Agents page experience.

## Preferred Intelligence layout

Use a focused operator layout rather than a dashboard full of unrelated cards:

- Page header: `Intelligence`, with concise copy explaining that Hedwig can help operate the business.
- Main conversation panel: large, comfortable reading width, message history, composer anchored at bottom.
- Empty state: Hedwig identity, concise explanation, and prompt chips/cards for high-value workflows.
- Message rendering:
  - user messages aligned distinctly
  - assistant messages with Hedwig identity
  - markdown/basic rich text safely rendered according to existing project conventions
  - tool/action progress when available
  - structured action preview when `stagedSuggestionIds` are returned
- Side or lower context rail at desktop widths only:
  - “What I can help with” capability groups
  - pending approvals count/list if an existing API is available
  - recent suggestions/actions if an existing API is available
- On mobile/tablet, collapse the context rail below the conversation.

Avoid:

- A table of agent personas as the first thing users see.
- Fake autonomous claims when the backend only stages an approval.
- Calling `/api/creation-box/parse` from the new page.
- Inventing a new backend chat endpoint if `/api/assistant/chat` already works.
- Adding a heavy dependency for message rendering without checking package.json.
- Replacing system-wide navigation or unrelated assistant UI in this task.

## Engineering constraints

- Read the relevant files before editing.
- Follow the project’s `AGENTS.md` rules.
- Match existing Next.js App Router and Tailwind/shadcn conventions.
- Use existing `hedwigApi` client helpers and session/workspace utilities.
- Do not hardcode secrets or API URLs.
- Do not commit changes.
- Do not remove old agent backend functionality.
- Update navigation labels/links only if necessary to make the page clearly appear as Intelligence; preserve backward compatibility for `/agents` if practical.
- If the `/agents` route is retained, it may redirect to `/intelligence`, but do not break existing deep links without a compatibility path.

## Validation

Run targeted validation after implementation:

- `npx tsc --noEmit` from `hedwig-backend/web-app`
- Search for stale primary-page copy such as `Agents`, `New agent`, `Can spend`, and ensure it is not the main Intelligence experience.
- Confirm `/api/assistant/chat` request/response wiring matches backend.
- Confirm no new `transition-all`, hardcoded black, or inaccessible clickable divs.
- Check responsive behavior at approximately 375px, 768px, and 1280px widths if browser tooling is available.

## If context is running out

Do not start a second redesign. Finish the current smallest coherent slice, record changed files and remaining gaps, and hand off with:

- What was implemented
- Exact files changed
- API contract used
- Typecheck result
- Remaining UI or backend work
- Any known mismatch between staged suggestions and actual approval execution
