# Hedwig RevenueCat Rollout Plan

This document maps RevenueCat to Hedwig across web + iOS + Android so we can monetize on web immediately while keeping access in sync everywhere.

## Goals

- Start paid conversions on web now.
- Keep entitlements synchronized across web, iOS, and Android.
- Keep beta builds (TestFlight/Play testing tracks) fully testable.
- Gate enforcement with flags so rollout is reversible.

## Canonical Identity

- Use a single RevenueCat `app_user_id` across all platforms.
- Hedwig canonical value: `users.id` from backend.
- Pass this same value to:
  - Web checkout session creation
  - iOS Purchases SDK login
  - Android Purchases SDK login

This ensures one entitlement state follows the user everywhere.

## Product + Entitlement Model

Primary entitlement:

- `pro`

Recommended products:

- iOS:
  - `hedwig.pro.monthly`
  - `hedwig.pro.annual`
- Android:
  - `hedwig_pro_monthly`
  - `hedwig_pro_annual`
- Web (RevenueCat Web Billing / Stripe via RevenueCat):
  - `hedwig-pro-monthly`
  - `hedwig-pro-annual`

Offerings:

- Default offering: `default`
- Packages:
  - `$rc_monthly` -> monthly product per platform
  - `$rc_annual` -> annual product per platform

## Backend Source of Truth

Backend persists normalized billing state from RevenueCat webhooks:

- `billing_subscription_states`
- `billing_revenuecat_events`

Webhook endpoint:

- `POST /api/webhooks/revenuecat`

App/web status endpoint:

- `GET /api/billing/status`

## Rollout Flags

Configured in backend env:

- `BILLING_WEB_CHECKOUT_ENABLED` (default `true`)
- `BILLING_MOBILE_PAYWALL_ENABLED` (default `false`)
- `BILLING_ENFORCEMENT_ENABLED` (default `false`)

Suggested staged rollout:

1. Web checkout ON, mobile paywall OFF, enforcement OFF.
2. Mobile paywall ON for beta cohorts, enforcement OFF.
3. Enforcement ON for premium features once conversion + support flow is stable.

## Webhook Event Handling (RevenueCat -> Hedwig)

We ingest and persist all webhook events, with idempotency via `event_id`.

Important events:

- Activation-related:
  - `INITIAL_PURCHASE`
  - `RENEWAL`
  - `PRODUCT_CHANGE`
  - `UNCANCELLATION`
  - `NON_RENEWING_PURCHASE`
  - `SUBSCRIPTION_EXTENDED`
- Deactivation-related:
  - `EXPIRATION`
  - `SUBSCRIPTION_PAUSED`
- Risk signals:
  - `BILLING_ISSUE`

The backend normalizes these into a stable entitlement state for frontends.

## Web First Monetization

Immediate path:

1. Web user starts checkout via RevenueCat web flow.
2. RevenueCat webhook updates Hedwig backend state.
3. `/api/billing/status` returns active entitlement.
4. Mobile app reads same entitlement state after login and unlocks features.

## Existing User Backfill / Recovery

If we need to reconcile historical users:

- Ensure `app_user_id` in RevenueCat is aligned with Hedwig `users.id`.
- Trigger client-side restore/sync flows.
- Backend already links state rows using `id`, `email`, and `privy_id` candidates.

## Operational Checklist

1. Configure RevenueCat webhook auth and entitlement env:
   - `REVENUECAT_WEBHOOK_AUTH`
   - `REVENUECAT_PRIMARY_ENTITLEMENT_ID=pro`
2. Configure mobile RevenueCat SDK keys in Expo env:
   - `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`
   - `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`
3. Set rollout flags as desired.
4. Configure products + offerings in RevenueCat dashboard.
5. Wire web checkout entry point to RevenueCat web billing.
6. Add paywall UI gates using `/api/billing/status`.
7. Enable enforcement only after QA and support playbook are ready.
