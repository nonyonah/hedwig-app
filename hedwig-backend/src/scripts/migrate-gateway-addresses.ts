/**
 * One-time migration: registers ALL existing user wallet addresses (EVM + Solana)
 * with the Circle Gateway permissionless webhook subscription.
 *
 * Run: npx ts-node src/scripts/migrate-gateway-addresses.ts
 */
import { createLogger } from '../utils/logger';
import { supabase } from '../lib/supabase';
import { registerGatewayWebhookAddresses } from '../services/circleGatewayWebhooks';

const logger = createLogger('MigrateGatewayAddresses');

async function main() {
  logger.info('Starting migration: register all existing wallet addresses with Circle Gateway');

  const { data: users, error } = await supabase
    .from('users')
    .select('ethereum_wallet_address, solana_wallet_address')
    .or('ethereum_wallet_address.is.not.null,solana_wallet_address.is.not.null');

  if (error) {
    logger.error('Failed to fetch users', { error: error.message });
    process.exit(1);
  }

  if (!users || users.length === 0) {
    logger.info('No users with wallet addresses found');
    process.exit(0);
  }

  logger.info(`Found ${users.length} users with wallet addresses`);

  let registered = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await registerGatewayWebhookAddresses({
        ethereum: user.ethereum_wallet_address,
        solana: user.solana_wallet_address,
      });
      registered++;
      if (registered % 100 === 0) {
        logger.info(`Progress: ${registered}/${users.length} users processed`);
      }
    } catch (err) {
      failed++;
      logger.warn('Failed to register address for user', {
        ethereum: user.ethereum_wallet_address?.slice(0, 10),
        solana: user.solana_wallet_address?.slice(0, 10),
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  logger.info(`Migration complete: ${registered} users registered, ${failed} failed`);
  process.exit(0);
}

main();
