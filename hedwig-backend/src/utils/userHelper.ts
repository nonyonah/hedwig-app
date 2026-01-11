import { PrivyClient } from '@privy-io/server-auth';
import { supabase } from '../lib/supabase';
import { createLogger } from './logger';

const logger = createLogger('UserSync');

// Initialize Privy client
const privy = new PrivyClient(
    process.env.PRIVY_APP_ID!,
    process.env.PRIVY_APP_SECRET!
);

/**
 * Get internal user from Supabase, or create/sync from Privy if missing
 */
export async function getOrCreateUser(privyId: string) {
    try {
        // 1. Try to fetch from DB first (fast path)
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('privy_id', privyId)
            .single();

        if (user && !error) {
            return user;
        }

        // 2. If not found, fetch from Privy
        logger.debug('User not found in DB, syncing from Privy');
        const privyUser = await privy.getUser(privyId);

        if (!privyUser) {
            throw new Error(`Privy user not found for ID: ${privyId}`);
        }

        // 3. Extract data
        const email = privyUser.email?.address || (privyUser.linkedAccounts.find((a: any) => a.type === 'email') as any)?.address;

        let ethAddress = privyUser.wallet?.address;
        let solAddress: string | undefined = undefined;

        // Check linked accounts for wallets if main wallet is missing or specific chain needed
        privyUser.linkedAccounts.forEach((account: any) => {
            if (account.type === 'wallet') {
                if (account.chainType === 'ethereum' && !ethAddress) {
                    ethAddress = account.address;
                }
                if (account.chainType === 'solana' && !solAddress) {
                    solAddress = account.address;
                }
            }
        });

        if (!email) {
            // Can't create user without email/PK (assuming email is PK or required unique)
            logger.warn('No email found for Privy user, cannot sync');
            // We return null and let caller handle it, or throw
            // If schema allows null email, we can proceed. But user usually authenticates via email in this app.
        }

        // 4. Create/Upsert user in DB
        // Using upsert to handle race conditions
        const userData = {
            privy_id: privyId,
            email: email || '', // Provide empty string if missing? Better to have it.
            first_name: '', // We don't have names from Privy usually
            last_name: '',
            ethereum_wallet_address: ethAddress,
            solana_wallet_address: solAddress,
            last_login: new Date().toISOString()
        };

        // Check if user exists by email if we have one (to avoid duplicates if privy_id changed? unlikely)
        // But primary key might be email or ID. Let's assume ID is auto-gen and privy_id is unique key.

        const { data: newUser, error: createError } = await supabase
            .from('users')
            .upsert(userData, { onConflict: 'privy_id' })
            .select()
            .single();

        if (createError) {
            logger.error('Failed to create user');
            throw createError;
        }

        logger.info('Successfully synced user');
        return newUser;

    } catch (error) {
        logger.error('Error in user sync');
        throw error;
    }
}
