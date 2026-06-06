# Hedwig Landing Page Redesign — Copy & Layout Structure

**Goal:** Fix the four drop-off causes by explaining the wallet, reframing the mobile app as a wallet, surfacing global reach, and showing the end-to-end payment flow.

**Design Constraint:** Do not change the visual design system. Preserve the current typography, color palette, spacing, component styles, and layout patterns. This should feel like a natural evolution, not a rebrand.

---

## Section Hierarchy (New Order)

1. **Navigation** — minimal copy tweak only
2. **Hero** — lead with invoicing + wallet + conversion
3. **App Mockup** — preserve existing dashboard browser chrome
4. **Trust Bar** — stats + testimonials (NEW)
5. **Payment Flow Visual** — 4-step end-to-end flow (NEW)
6. **Wallet Section** — replaces the current "Mobile app" block
7. **USDC Explainer** — one-line demystifier (NEW)
8. **Features Showcase** — updated feature copy (same timeline interaction)
9. **How It Works** — rewritten 3 steps, concrete & time-bound
10. **Bottom CTA** — closes the full journey
11. **Footer** — unchanged

---

## 1. Navigation

**Layout:** Keep the existing sticky nav exactly as-is.

**Copy change only:**
- Primary CTA label: change from `Try it for free` → `Try it free`
- All other links and styling stay identical.

---

## 2. Hero

**Layout pattern:** Centered text block inside the existing `bg-[#fafbff]` hero section. Keep the radial glow, pill eyebrow, large headline, subheadline, dual CTAs, microcopy line, Product Hunt badge, and the browser-mockup dashboard image below.

**Copy:**

- **Eyebrow pill:**
  `Freelance invoicing and payments, built for Africa and beyond`

- **Headline (H1):**
  `Invoice your clients. Get paid into your wallet. Convert when you need to.`

- **Subheadline:**
  `Hedwig is the financial workspace for freelancers in Nigeria, Ghana, and everywhere else. Create invoices, collect USDC payments, and withdraw to your local bank — all in one place.`

- **Geographic signal (new line, below subheadline):**
  `Used by freelancers across Africa, Europe, and the Americas.`
  *Style: `text-[13px] font-medium text-[#667085]`*

- **Primary CTA:**
  `Try it free` (keep existing blue button with arrow)

- **Secondary CTA (new, placed beside primary):**
  `See how it works`
  *Style: use existing subtle button pattern — `inline-flex h-11 items-center gap-2 rounded-full border border-[#d5d7da] bg-white px-8 text-[14px] font-semibold text-[#181d27] transition-all hover:bg-[#f8f9fb]``*

- **Microcopy:**
  `No card required. First invoice in under 2 minutes.`

- **Product Hunt badge:** Keep exactly as-is.

---

## 3. App Mockup

**Layout:** Preserve the existing browser-chrome dashboard mockup entirely. This is critical visual proof.

**No copy changes** inside the UI mock itself (the fake dashboard data can stay).

---

## 4. Trust Bar (NEW)

**Placement:** Immediately after the App Mockup section, before the Payment Flow.

**Layout pattern:** A centered `py-20` section on `bg-white`.
- Top row: 3 stats in a horizontal row (centered, large numbers).
- Bottom row: 3 testimonial cards in a `md:grid-cols-3` grid. Use the same card shell as the "How it works" cards (`rounded-[28px] border border-[#e9eaeb] bg-white px-8 py-10`).

**Copy:**

- **Eyebrow:** `Trusted by freelancers worldwide`

**Stats row:**
1. `12,000+` / `Active freelancers`
2. `$4.2M+` / `Invoices sent`
3. `30+` / `Countries`

*Style: numbers `text-[36px] font-bold tracking-[-0.03em] text-[#181d27]`, labels `text-[13px] text-[#667085]`*

**Testimonials:**

1. **Chinedu O., Lagos**
   > "I used to explain international bank transfers to clients in London. Now I send a Hedwig invoice, they pay in USDC, and I convert to naira the same day."

2. **Ama K., Accra**
   > "The wallet changed everything. My money lives in one place — not scattered across apps, exchanges, and spreadsheets."

3. **Marco B., Lisbon**
   > "I hire designers in Nigeria and Kenya. Hedwig makes it feel local for them and dead simple for me."

*Style: name `text-[14px] font-semibold text-[#181d27]`, city `text-[13px] text-[#a4a7ae]`, quote `text-[15px] leading-7 text-[#667085]`*

---

## 5. Payment Flow Visual (NEW)

**Placement:** After Trust Bar.

**Layout pattern:** Reuse the exact "How it works" container style:
- Section: `border-t border-[#f1f2f4] bg-[#f8f9fb] px-8 py-24`
- Centered eyebrow + headline
- Grid: `grid gap-px overflow-hidden rounded-[28px] border border-[#e9eaeb] bg-[#e9eaeb]` with `md:grid-cols-4` (instead of 3)
- Each step card: `bg-white px-8 py-10`, step number in a colored pill, H3, description.

**Copy:**

- **Eyebrow:** `How you get paid`
- **Headline:** `From invoice sent to money in your bank.`

**Steps:**

1. **Step badge:** `01` (`bg-[#eff4ff] text-[#717680]`)
   **Label:** `Send the invoice`
   **Desc:** `Create a professional invoice with a built-in payment link. Your client gets a clean, branded bill they can pay in seconds.`

2. **Step badge:** `02` (`bg-[#ecfdf3] text-[#717680]`)
   **Label:** `Client pays`
   **Desc:** `They pay in USDC from any wallet, anywhere in the world. No routing numbers, no currency confusion.`

3. **Step badge:** `03` (`bg-[#fffaeb] text-[#717680]`)
   **Label:** `Funds land`
   **Desc:** `Money hits your Hedwig wallet in minutes. Not days. No middlemen holding your cash.`

4. **Step badge:** `04` (`bg-[#f4f3ff] text-[#717680]`)
   **Label:** `You decide`
   **Desc:** `Convert to naira, cedis, or your local currency. Or hold USDC and spend it later. You control the timing.`

---

## 6. Wallet Section

**Placement:** Replaces the current "Mobile app" / `id="download"` section.

**Layout pattern:** Preserve the existing two-column split layout exactly:
- Outer section: `border-t border-[#f1f2f4] bg-white px-8 py-24`
- Inner card: `rounded-[32px] border border-[#e9eaeb] bg-[#f8f9fb]`
- Grid: `md:grid-cols-2`
- Left: text content with eyebrow, H2, body copy, feature bullets, and the two app-store buttons.
- Right: phone screenshot on gradient background (`bg-[linear-gradient(145deg,#eff6ff,#f8fbff)]` with radial glow).

**Copy:**

- **Eyebrow:** `Your wallet`
- **Headline:** `Your payments don't just arrive — they land in your wallet.`
- **Body:** `No more checking five apps to see if you got paid. Your Hedwig wallet holds your USDC balance, tracks your earnings, and moves money to your bank when you're ready.`

**Feature bullets (stacked on the left):**

1. **Your balance, visible**
   `See exactly what you've earned, what's pending, and what's available to withdraw. In USDC and your local currency.`

2. **Convert on your terms**
   `Swap USDC to naira, cedis, or another currency when the rate works for you. Not when a platform decides.`

3. **Withdraw to your bank**
   `Cash out straight to your local bank account. No hidden routing, no third-party forms.`

- **CTAs:** Keep `AppStoreButton` and `GooglePlayButton` exactly as-is.

**Image:**
- Replace `src="/mobile-preview-20260319c.png"` with a new wallet-focused phone mockup showing:
  - USDC balance
  - Local currency equivalent
  - "Convert" and "Withdraw" buttons
- Keep the same `width={460} height={948}` sizing and `drop-shadow-2xl`.

---

## 7. USDC Explainer (NEW)

**Placement:** Immediately after the Wallet section, before Features Showcase.

**Layout pattern:** A narrow, centered band. Use a light tinted container to make it feel like a tooltip, not a full section.
- Section: `bg-white px-8 pb-16` (no top border; sits flush under Wallet)
- Container: `mx-auto max-w-2xl rounded-[20px] bg-[#eff4ff] px-8 py-6 text-center`

**Copy:**

> **USDC is a digital dollar.** It lands in your wallet. You convert it to naira, cedis, or whatever you need.

*Style: `text-[17px] font-medium text-[#181d27]`. Keep it to one or two lines maximum.*

---

## 8. Features Showcase

**Placement:** After the USDC explainer.

**Layout:** Keep the exact same `FeaturesShowcase` component structure (left timeline with auto-rotating dots, right browser-chrome preview panel). Only update the `ITEMS` array copy.

**Updated ITEMS:**

1. **Title:** `Invoices that clients actually pay`
   **Desc:** `Send branded invoices with clear USDC payment links. Your client sees the amount, due date, and a one-tap way to pay. No confusion, no chasing.`
   *Preview: keep existing `<PaymentsPanel />`*

2. **Title:** `Every client detail in one place`
   **Desc:** `Keep contacts, projects, payment history, and outstanding balances together before follow-up gets messy.`
   *Preview: keep existing `<ClientsPanel />`*

3. **Title:** `Projects that turn into invoices`
   **Desc:** `Structure work into milestones and budgets so billing is tied to delivery, not memory.`
   *Preview: keep existing `<ProjectsPanel />`*

4. **Title:** `Clear follow-up, no awkwardness`
   **Desc:** `See what has been paid, what is pending, and what needs a reminder. Hedwig tells you who to follow up with and when.`
   *Preview: keep existing `<ContractPanel />`*

5. **Title:** `Your money lives here`
   **Desc:** `Your Hedwig wallet is where payments land. Check your balance, convert currency, and withdraw to your bank — on web or mobile.`
   *Preview: keep existing `<SubscriptionPanel />` (or swap for a wallet-panel preview if one exists).*

---

## 9. How It Works

**Placement:** After Features Showcase.

**Layout:** Preserve the existing 3-column grid exactly (`md:grid-cols-3`, `rounded-[28px]`, `gap-px`, colored step badges).

**Copy:**

- **Eyebrow:** `How it works`
- **Headline:** `From agreement to payout, without the mess.` *(Keep existing headline — it still fits.)*

**Steps:**

1. **Step badge:** `01` (`bg-[#eff4ff] text-[#717680]`)
   **Label:** `Set up in 2 minutes`
   **Desc:** `Create your account, connect your bank details, and you are ready to bill. No paperwork, no waiting period.`

2. **Step badge:** `02` (`bg-[#ecfdf3] text-[#717680]`)
   **Label:** `Send an invoice, get paid in hours`
   **Desc:** `Build an invoice with your branding, send it to any client anywhere, and receive USDC directly into your Hedwig wallet — usually within minutes.`

3. **Step badge:** `03` (`bg-[#fffaeb] text-[#717680]`)
   **Label:** `Convert or cash out same-day`
   **Desc:** `Withdraw to your local bank account or hold USDC in your wallet. You control the timing, and most withdrawals settle same day.`

---

## 10. Bottom CTA

**Placement:** Before Footer.

**Layout:** Preserve the dark `rounded-[32px]` card (`bg-[#181d27]`, radial gradients, centered text, white button).

**Copy:**

- **Eyebrow:** `Try it now`
- **Headline:** `Send your first invoice. Watch the money land.`
- **Subheadline:** `Join freelancers who have stopped chasing payments and started getting paid. Free to start. No card needed.`
- **CTA:** `Try it free` (white button, keep existing arrow icon)

---

## 11. Footer

**Layout & copy:** Keep exactly as-is. No changes.

---

## Summary of Key Shifts

| Problem | Fix in this redesign |
|---|---|
| Wallet is not explained | New **Wallet Section** with balance, conversion, and withdrawal as explicit features. |
| Mobile app framed as notification tool | Wallet section reframes the mobile app as **"where your money lives"** while keeping the download buttons. |
| Global scope is invisible | Geographic signal in Hero ("Africa and beyond"), stat row showing 30+ countries, and testimonials from Lagos, Accra, and Lisbon. |
| Payment flow never shown end-to-end | New **4-step Payment Flow Visual** connecting invoice → payment → wallet → bank. |
| No concrete timing | Steps are now time-bound: "under 2 minutes," "in hours," "same-day." |
| Missing USDC context | One-line **USDC Explainer** demystifies the currency without getting technical. |
