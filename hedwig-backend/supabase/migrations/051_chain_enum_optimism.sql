-- Add OPTIMISM to the chain enum so Privy/Gateway webhooks on OP Mainnet and
-- OP Sepolia (chainIds 10 / 11155420) can persist transaction rows.

ALTER TYPE chain ADD VALUE IF NOT EXISTS 'OPTIMISM';
