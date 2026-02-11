# PostHog Dashboard Setup Guide

## Changes Made to Fix DAU/WAU/Retention

### 1. Added Session Tracking
- Sessions now automatically created and tracked
- 30-minute timeout for session expiry
- `$session_id` added to all events

### 2. Dual Event Tracking for Screen Views
- Now tracks both `$pageview` AND `$screen` events
- `$pageview` is what PostHog uses for web-style analytics (DAU/WAU/Retention)
- `$screen` is for mobile-specific analytics
- Includes proper URL structure: `app://hedwig/screen-name`

### 3. Enhanced Event Properties
- Added `$app_build` for better version tracking
- Added `$session_id` for session-based analytics
- Added `$current_url` and `$pathname` for page tracking

## How to Set Up Dashboards

### Dashboard 1: User Activity & Engagement

#### Daily Active Users (DAU)
1. Create new Insight → Trends
2. Event: `$pageview` (or any event)
3. Aggregation: "Unique users"
4. Date range: Last 30 days
5. Interval: Day

#### Weekly Active Users (WAU)
1. Create new Insight → Trends
2. Event: `$pageview`
3. Aggregation: "Unique users"
4. Date range: Last 12 weeks
5. Interval: Week

#### Monthly Active Users (MAU)
1. Create new Insight → Trends
2. Event: `$pageview`
3. Aggregation: "Unique users"
4. Date range: Last 12 months
5. Interval: Month

#### User Retention
1. Create new Insight → Retention
2. Cohort defining event: `app_opened` or `$pageview`
3. Return event: `$pageview` (any activity)
4. Retention type: "Recurring" (users who come back)
5. Date range: Last 8 weeks

#### Growth Accounting (Stickiness)
1. Create new Insight → Lifecycle
2. Event: `$pageview`
3. Shows: New, Returning, Resurrecting, Dormant users
4. Date range: Last 12 weeks

---

### Dashboard 2: Most Used Pages/Screens

#### Top Screens by Views
1. Create new Insight → Trends
2. Event: `$pageview`
3. Breakdown by: `$screen_name`
4. Show top: 10 values
5. Date range: Last 30 days

#### Screen Views Over Time
1. Create new Insight → Trends
2. Event: `$pageview`
3. Breakdown by: `$screen_name`
4. Visualization: Stacked area chart
5. Date range: Last 30 days

#### Unique Users Per Screen
1. Create new Insight → Trends
2. Event: `$pageview`
3. Aggregation: "Unique users"
4. Breakdown by: `$screen_name`
5. Show top: 10 values
6. Date range: Last 30 days

#### Screen Engagement (Time Spent)
1. Create new Insight → Trends
2. Event: `$pageview`
3. Aggregation: "Total count"
4. Breakdown by: `$screen_name`
5. Formula: Average events per user
6. Date range: Last 30 days

---

### Dashboard 3: Feature Usage

#### Invoice Activity
1. Create new Insight → Trends
2. Events: 
   - `invoice_created`
   - `invoice_sent`
   - `invoice_paid`
3. Date range: Last 30 days

#### Payment Activity
1. Create new Insight → Trends
2. Events:
   - `payment_received`
   - `payment_link_created`
   - `payment_link_paid`
3. Date range: Last 30 days

#### Client & Project Management
1. Create new Insight → Trends
2. Events:
   - `client_created`
   - `project_created`
   - `milestone_created`
3. Date range: Last 30 days

#### AI Assistant Usage
1. Create new Insight → Trends
2. Events:
   - `ai_message_sent`
   - `ai_response_success`
   - `ai_function_triggered`
3. Date range: Last 30 days

#### Offramp & Withdrawal Activity
1. Create new Insight → Trends
2. Events:
   - `offramp_initiated`
   - `withdrawal_completed`
   - `offramp_blocked_kyc`
3. Date range: Last 30 days

---

### Dashboard 4: Revenue & Transactions

#### Platform Fees Collected
1. Create new Insight → Trends
2. Event: `platform_fee_collected`
3. Aggregation: "Sum" of property `fee_amount`
4. Breakdown by: `fee_currency`
5. Date range: Last 30 days

#### Transaction Volume
1. Create new Insight → Trends
2. Event: `payment_received`
3. Aggregation: "Sum" of property `amount`
4. Breakdown by: `currency`
5. Date range: Last 30 days

#### Average Transaction Value
1. Create new Insight → Trends
2. Event: `payment_received`
3. Aggregation: "Average" of property `amount`
4. Breakdown by: `currency`
5. Date range: Last 30 days

---

### Dashboard 5: User Journey & Conversion

#### Onboarding Funnel
1. Create new Insight → Funnel
2. Steps:
   - `signup_completed`
   - `onboarding_completed`
   - `client_created` OR `invoice_created`
3. Date range: Last 30 days

#### Invoice to Payment Funnel
1. Create new Insight → Funnel
2. Steps:
   - `invoice_created`
   - `invoice_sent`
   - `payment_received`
3. Date range: Last 30 days

#### KYC Completion Funnel
1. Create new Insight → Funnel
2. Steps:
   - `kyc_started`
   - `kyc_completed`
   - `kyc_approved`
3. Date range: Last 30 days

---

## Troubleshooting

### If DAU/WAU Still Don't Show Data:

1. **Check Event Names**
   - Go to Activity tab
   - Verify you see `$pageview` events (not just `$screen`)
   - Event names are case-sensitive!

2. **Check User Identification**
   - Events should have `distinct_id` set to user ID
   - Check if users are being identified correctly
   - Look for `$identify` events in Activity tab

3. **Check Date Range**
   - Make sure dashboard date range includes recent activity
   - Try "Last 24 hours" to see immediate results

4. **Check Filters**
   - Remove any property filters that might exclude events
   - Check if there are any "where" clauses

5. **Verify Session Tracking**
   - Look for `$session_id` in event properties
   - Each session should have a unique ID

### Common Issues:

- **"No data"** → Check if events are reaching PostHog (Activity tab)
- **"Stale data"** → Click refresh button on dashboard
- **"Wrong numbers"** → Check if event names match exactly
- **"Missing users"** → Verify user identification is working

---

## Current Tracked Screens

Your app currently tracks these screens (will appear in "Most Used Pages"):

- Home
- Invoices
- Payment Links
- Transactions
- Clients
- Projects
- Proposals
- Chats
- Notifications
- More
- Create Invoice
- Biometrics Setup

Each screen view now generates:
1. A `$pageview` event (for DAU/WAU/Retention)
2. A `$screen` event (for mobile-specific analytics)

---

## Next Steps

1. **Restart your app** to load the new analytics code
2. **Use the app** for a few minutes (navigate between screens)
3. **Check PostHog Activity tab** - you should see `$pageview` events
4. **Create the dashboards** using the guides above
5. **Wait 5-10 minutes** for data to populate

The DAU/WAU/Retention metrics should now work correctly!
