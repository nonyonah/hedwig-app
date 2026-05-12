-- 048_transaction_chain_arbitrum_polygon.sql
-- Privy wallet webhooks can report USDC activity on Arbitrum and Polygon
-- while we test Privy as a temporary replacement for Alchemy address webhooks.

ALTER TYPE chain ADD VALUE IF NOT EXISTS 'ARBITRUM';
ALTER TYPE chain ADD VALUE IF NOT EXISTS 'POLYGON';
