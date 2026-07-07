-- 078_chain_enum_stellar.sql
-- Add STELLAR to the chain enum and STELLAR_PENDING to offramp_status
-- for Stellar bridge off-ramp orders.

ALTER TYPE chain ADD VALUE IF NOT EXISTS 'STELLAR';
ALTER TYPE offramp_status ADD VALUE IF NOT EXISTS 'STELLAR_PENDING';
