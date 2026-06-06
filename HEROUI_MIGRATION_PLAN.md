# HeroUI React Migration Plan — Hedwig Web App

## Executive Summary

**Scope:** Migrate only the `hedwig-backend/web-app` (Next.js) to HeroUI React. The React Native mobile app stays untouched.

**Goal:** Achieve a more premium, polished UI by replacing custom shadcn/ui-style components with HeroUI's professionally designed, accessible, animation-rich components — while keeping all existing page layouts, data flows, and navigation structure intact.

**Prerequisite:** HeroUI v3 requires **Tailwind CSS v4**. The web app currently runs Tailwind v3. This is the biggest infrastructure change.

---

## Current State Analysis

### Tech Stack
- **Framework:** Next.js 16 (App Router)
- **Styling:** Tailwind CSS v3 + `tailwindcss-animate`
- **UI Primitives:** Radix UI (dialog, avatar, scroll-area, separator, tabs, toast)
- **Component Patterns:** shadcn/ui style — CVA + `cn()` utility + custom CSS variables
- **Design System:** "Untitled UI" inspired — specific hex colors, `rounded-full` pills, `shadow-xs`, ring borders
- **CSS Config:** `tailwind.config.cjs` + `globals.css` with HSL variables

### Current Custom UI Components (`components/ui/`)
| Component | Built With | Usage |
|-----------|-----------|-------|
| `Button` | CVA + Radix Slot | Everywhere — pills, primary/secondary/ghost/destructive |
| `Card` | Plain div + Tailwind | Dashboard stats, content panels |
| `Input` | Plain input + Tailwind | Forms, search, filters |
| `Badge` | CVA | Status indicators, counts |
| `Avatar` | Radix Avatar | User profiles, team members |
| `Dialog` | Radix Dialog | Modals, confirmations, create flows |
| `Tabs` | Radix Tabs | Dashboard sections, detail panels |
| `Separator` | Radix Separator | Dividers |
| `TextArea` | Plain textarea | Forms |

### Key Screens to Migrate (by visibility)
1. **Dashboard** (`app/(app)/dashboard/view.tsx`) — highest user exposure
2. **Wallet** (`app/(app)/wallet/`) — core feature, tables, cards
3. **Payments / Invoices / Projects** — tables, forms, dialogs
4. **Settings / Auth** — forms, inputs, buttons
5. **Public pages** — checkout, invoice view, payment links

---

## What HeroUI React Provides

HeroUI v3 is a **living library** (not copy-paste) built on:
- **React Aria Components** — battle-tested accessibility, focus management, keyboard nav
- **Tailwind CSS v4** — modern utility-first styling
- **Smooth animations** — built-in press/hover/focus states, scale effects, transitions
- **Compound component API** — `Card.Header`, `Card.Title`, `Modal.Backdrop`, etc.

### Components Available (relevant to Hedwig)

#### Buttons & Inputs
- `Button` — 7 variants (primary, secondary, tertiary, outline, ghost, danger, danger-soft), 3 sizes, loading states, icon support, ripple/scale animations
- `Input` — primary/secondary variants, focus rings, validation states
- `TextField` — composition wrapper with Label, validation, error messages
- `TextArea` — multiline input
- `Checkbox`, `Radio`, `Switch`, `Select`

#### Data Display
- `Card` — transparent/default/secondary/tertiary variants, Header/Title/Description/Content/Footer
- `Badge` — dot, text, icon, placement, colors (accent/success/warning/danger)
- `Chip` — tags, filters, status pills
- `Avatar` — image, fallback, sizes, status rings
- `Table` — sorting, selection, column resizing, virtualization, pagination, empty states
- `EmptyState` — illustrated empty views

#### Navigation
- `Tabs` — primary/secondary variants, vertical/horizontal, animated indicator
- `Breadcrumbs`
- `Pagination`

#### Overlays
- `Modal` — 6 sizes, 3 backdrop variants, scroll behaviors, form-friendly, controlled/uncontrolled
- `Popover` — contextual menus, dropdowns
- `Tooltip`

#### Feedback
- `Spinner` — loading states
- `Progress`, `Skeleton`

#### Layout
- `Surface` — background containers
- `Separator`, `Divider`

---

## Component Mapping: Current → HeroUI

| Current (Custom) | HeroUI Replacement | Visual Upgrade |
|-------------------|-------------------|----------------|
| `Button` (pill, CVA) | `Button` | ✅ Scale/ripple animations, better disabled/loading states, cleaner focus rings |
| `Card` (white + shadow-xs) | `Card` | ✅ Semantic variants (transparent/default/secondary/tertiary), cleaner spacing, better borders |
| `Input` (rounded-lg) | `Input` / `TextField` | ✅ Better focus animations, validation UI, label integration |
| `Badge` (pill) | `Badge` / `Chip` | ✅ Dot indicators, placement options, softer soft variants |
| `Avatar` (Radix) | `Avatar` | ✅ Status rings, better fallback styling |
| `Dialog` (Radix + custom) | `Modal` | ✅ Animated backdrops (opaque/blur/transparent), better scroll handling, icon headers |
| `Tabs` (Radix) | `Tabs` | ✅ Animated sliding indicator, secondary underline variant |
| `Table` (custom) | `Table` | ✅ Sorting, selection, resizing, virtualization, pagination — major upgrade |
| Custom status pills | `Chip` | ✅ Color variants, soft/outline styles, dismissible |
| Custom dropdowns | `Popover` + `Button` | ✅ Better positioning, animations, accessibility |
| Loading spinners | `Spinner` | ✅ Consistent sizing, color variants |
| Custom empty states | `EmptyState` | ✅ Better visual hierarchy |

---

## Migration Phases

### Phase 0: Infrastructure — Tailwind v3 → v4 (Required)
**Effort:** Medium | **Risk:** Medium | **Duration:** 1–2 days

HeroUI v3 **requires** Tailwind CSS v4. This is non-negotiable.

| Task | Details |
|------|---------|
| Upgrade `tailwindcss` to v4 | `npm install tailwindcss@latest` |
| Update PostCSS config | Tailwind v4 uses `@tailwindcss/postcss` — need to update `postcss.config.js` |
| Remove `tailwind.config.cjs` | v4 uses CSS-based configuration in `globals.css` |
| Migrate theme to CSS | Convert HSL variables and custom tokens to v4 `@theme` directive |
| Update custom utilities | `@layer base`, `@layer components`, `@layer utilities` may need adjustment |
| Test build | Verify `next dev` and `next build` work with Turbopack |

**Tailwind v4 Benefits:**
- Faster builds (especially with Turbopack)
- CSS-first configuration (no JS config file)
- Better performance
- Required for HeroUI's design tokens

---

### Phase 1: Foundation — Install HeroUI + Theme Bridge
**Effort:** Low | **Risk:** Low | **Duration:** 0.5 day

| Task | Details |
|------|---------|
| Install HeroUI | `npm install @heroui/react` |
| Add HeroUI Provider | Wrap app in `HeroUIProvider` in `app/layout.tsx` |
| Map brand colors | Bridge Hedwig's blue (`#2563eb`) to HeroUI's `primary` token |
| Verify font | Ensure Google Sans Flex carries through (HeroUI uses system font stack by default) |
| Test in one page | Create a test page with all HeroUI components to verify theme |

**Theme Decisions Needed:**
- Keep Hedwig's exact blue (`#2563eb`) as primary, or adopt HeroUI's default blue?
- Keep the light gray background (`#fafafa`) or adopt HeroUI's surface tokens?
- Maintain current shadow scale or use HeroUI's defaults?

---

### Phase 2: Atomic Components — Replace `components/ui/`
**Effort:** Medium | **Risk:** Low | **Duration:** 2–3 days

Replace each file in `components/ui/` with HeroUI equivalents.

**Priority order:**
1. `Button` → `@heroui/react` Button
2. `Card` → `@heroui/react` Card
3. `Input` → `@heroui/react` Input / TextField
4. `Badge` → `@heroui/react` Badge / Chip
5. `Avatar` → `@heroui/react` Avatar
6. `Dialog` → `@heroui/react` Modal
7. `Tabs` → `@heroui/react` Tabs
8. `Table` → `@heroui/react` Table
9. `Separator` → `@heroui/react` Separator

**Approach for each:**
- Update imports in `components/ui/[component].tsx`
- Map current props to HeroUI props
- Add any missing styling via `className`
- Update all consumers (pages/components that import from `components/ui/`)
- Test visually

**Key API Differences to Handle:**
- HeroUI Button uses `onPress` instead of `onClick` (React Aria pattern)
- HeroUI Modal uses compound API (`Modal.Backdrop`, `Modal.Dialog`, etc.)
- HeroUI Table uses `Table.Content`, `Table.Header`, `Table.Column`, `Table.Body`, `Table.Row`, `Table.Cell`
- HeroUI Tabs uses `Tabs.ListContainer`, `Tabs.List`, `Tabs.Tab`, `Tabs.Panel`

---

### Phase 3: Page-by-Page Migration
**Effort:** High | **Risk:** Low-Medium | **Duration:** 5–7 days

Migrate screens in order of user visibility. For each page:
1. Replace custom markup with HeroUI components
2. Keep all data fetching and business logic untouched
3. Preserve layout structure (flex/grid, spacing, responsive)
4. Polish: add loading states, empty states, better transitions

**Priority Queue:**

| Priority | Page | Why |
|----------|------|-----|
| P0 | Dashboard (`dashboard/view.tsx`) | Most visited, highest impact |
| P0 | Wallet (`wallet/`) | Core feature, complex UI |
| P1 | Auth (`sign-in/page.tsx`) | First impression for new users |
| P1 | Payments (`payments/`) | Tables, dialogs, forms |
| P1 | Invoices / Projects / Contracts | Data-heavy, tables |
| P2 | Settings (`settings/page.tsx`) | Forms, inputs |
| P2 | Public checkout pages | Client-facing, needs polish |
| P3 | Onboarding, feedback, misc | Lower traffic |

---

### Phase 4: Premium Polish
**Effort:** Medium | **Risk:** Low | **Duration:** 2–3 days

- **Loading states:** Replace basic spinners with HeroUI `Spinner` + `Skeleton`
- **Empty states:** Replace custom empty views with HeroUI `EmptyState`
- **Form validation:** Use HeroUI `TextField` with built-in error states
- **Micro-interactions:** Leverage HeroUI's built-in press/hover animations
- **Modals:** Upgrade all dialogs to HeroUI Modal with proper backdrops and sizes
- **Tables:** Add sorting, selection, pagination where applicable
- **Tooltips:** Add `Tooltip` for icon buttons and abbreviations

---

## Visual Improvements Expected

| Element | Before (Custom) | After (HeroUI) |
|---------|----------------|----------------|
| **Buttons** | Static pills, basic hover | Scale-on-press, smooth color transitions, proper focus rings, loading spinners |
| **Cards** | White box + shadow-xs | Semantic surface variants, better border radius, consistent padding |
| **Inputs** | Basic rounded border | Animated focus rings, validation states, better placeholder styling |
| **Tables** | Plain HTML table | Sortable headers, selectable rows, sticky headers, pagination, column resize |
| **Modals** | Radix dialog + custom CSS | Animated backdrops (blur/opaque), scroll handling, icon headers, proper sizes |
| **Badges/Chips** | Solid color pills | Soft variants, dot indicators, better text contrast |
| **Tabs** | Underline style | Animated sliding indicator, pill variant option |
| **Avatars** | Square image or fallback | Rounded with status rings, better fallback initials |
| **Empty States** | Plain text | Icon + title + description + action pattern |

---

## Risks & Mitigations

| Risk | Level | Mitigation |
|------|-------|------------|
| **Tailwind v4 upgrade breaks build** | High | Do Phase 0 in isolation on a branch. Test `next dev` and `next build` thoroughly before any component changes. |
| **HeroUI theme doesn't match brand** | Medium | Phase 1 includes explicit theme mapping. We can override CSS variables to keep Hedwig's exact colors. |
| **onPress vs onClick incompatibility** | Medium | HeroUI uses React Aria's `onPress`. We'll create a wrapper or update event handlers. This is predictable. |
| **Breaking form validation** | Medium | HeroUI `TextField` handles validation differently. Test all forms (auth, settings, create flows). |
| **Table API is very different** | Medium | HeroUI Table is powerful but has a learning curve. Migrate one table at a time. |
| **Bundle size increase** | Low | HeroUI is tree-shakeable. Only imported components are bundled. |
| **Mobile web experience** | Low | HeroUI is responsive by default. Test on mobile viewport. |

---

## Decisions Needed from You

Before we start, I need your input on:

1. **Tailwind v4 upgrade:** Are you comfortable upgrading the web app's Tailwind from v3 to v4? It's required for HeroUI and brings build speed benefits, but it's infrastructure work.

2. **Color palette:** Do you want to keep Hedwig's exact colors (`#2563eb` blue, `#fafafa` background, etc.) or are you open to HeroUI's default palette which is slightly different?

3. **Scope of Phase 2:** Should I replace ALL `components/ui/` files at once, or start with Button + Card + Input only and see how it feels?

4. **Priority page:** Which page should we migrate first as the "showcase"? I recommend the Dashboard, but Wallet is also high-impact.

5. **Dark mode:** HeroUI has excellent dark mode support. Do you want to add a dark mode toggle as part of this migration, or keep light-only for now?

---

## Recommended Approach

Given the scope, I recommend:

**Option A: Full Migration (Recommended)**
- Phase 0: Tailwind v4 upgrade
- Phase 1: Install HeroUI, theme bridge
- Phase 2: Replace all `components/ui/` 
- Phase 3: Migrate Dashboard → Wallet → Auth → rest
- Phase 4: Polish

**Option B: Incremental (Lower Risk)**
- Keep Tailwind v3 for now
- Manually upgrade component styles to look more "HeroUI-like" without using the library
- This gives 70% of the visual improvement with 30% of the effort
- Migrate to actual HeroUI later when Tailwind v4 is adopted

**My recommendation: Option A.** The Tailwind v4 upgrade is inevitable (v3 will eventually be deprecated), HeroUI's components are genuinely better than what we can build manually, and the migration is straightforward since we're only changing UI layer — no business logic.

---

## Next Steps

If you approve the plan, I can start immediately with:

1. **Phase 0:** Upgrade Tailwind v3 → v4 on a feature branch
2. **Phase 1:** Install HeroUI + create theme bridge
3. **Phase 2:** Replace `Button`, `Card`, `Input` as proof-of-concept
4. Show you the Dashboard with HeroUI components before continuing

**Shall I proceed?**