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
        // 1. Try to fetch from DB first by privy_id (fast path)
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('privy_id', privyId)
            .single();

        if (user && !error) {
            return user;
        }

        // 2. If not found by privy_id, fetch user details from Privy
        logger.debug('User not found by privy_id, fetching from Privy');
        const privyUser = await privy.getUser(privyId);

        if (!privyUser) {
            throw new Error(`Privy user not found for ID: ${privyId}`);
        }

        // 3. Extract email from Privy user
        const email = privyUser.email?.address || 
            privyUser.google?.email || 
            privyUser.apple?.email ||
            (privyUser.linkedAccounts.find((a: any) => a.type === 'email') as any)?.address;

        if (!email) {
            logger.warn('No email found for Privy user, cannot sync');
            throw new Error('No email found for Privy user');
        }

        // 4. Check if user exists by email (handles privy_id changes)
        logger.debug('Checking if user exists by email', { email });
        const { data: existingUser, error: emailError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (existingUser && !emailError) {
            // User exists with different privy_id - update it
            logger.info('Found existing user by email, updating privy_id', { 
                email, 
                oldPrivyId: existingUser.privy_id, 
                newPrivyId: privyId 
            });
            
            const { data: updatedUser, error: updateError } = await supabase
                .from('users')
                .update({ 
                    privy_id: privyId, 
                    last_login: new Date().toISOString() 
                })
                .eq('id', existingUser.id)
                .select()
                .single();

            if (updateError) {
                logger.error('Failed to update privy_id for existing user', { error: updateError.message });
                throw updateError;
            }

            logger.info('Successfully updated privy_id for existing user');
            return updatedUser;
        }

        // 5. User doesn't exist - create new user
        logger.debug('User not found by email, creating new user');
        
        let ethAddress = privyUser.wallet?.address;
        let solAddress: string | undefined = undefined;

        // Check linked accounts for wallets
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

        const userData = {
            privy_id: privyId,
            email: email,
            first_name: '',
            last_name: '',
            ethereum_wallet_address: ethAddress,
            solana_wallet_address: solAddress,
            last_login: new Date().toISOString()
        };

        const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert(userData)
            .select()
            .single();

        if (createError) {
            logger.error('Failed to create user', { error: createError.message });
            throw createError;
        }

        logger.info('Successfully created new user');
        return newUser;

    } catch (error) {
        logger.error('Error in user sync', { error: error instanceof Error ? error.message : 'Unknown' });
        throw error;
    }
}

