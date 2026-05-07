-- 045_onramp_orders.sql
-- Add new chain enum values used by the onramp feature.
-- ALTER TYPE ... ADD VALUE must be committed before any later statement
-- references the new value, so this migration only does the enum extension.
-- Table creation that depends on these values lives in the next migration.

ALTER TYPE chain ADD VALUE IF NOT EXISTS 'POLYGON';
ALTER TYPE chain ADD VALUE IF NOT EXISTS 'ARBITRUM';
