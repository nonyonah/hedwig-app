-- Add receive_address and memo columns to offramp_orders table
ALTER TABLE offramp_orders
ADD COLUMN receive_address TEXT,
ADD COLUMN memo TEXT;

-- Create index for receive_address lookup if needed
CREATE INDEX idx_offramp_orders_receive_address ON offramp_orders(receive_address);
