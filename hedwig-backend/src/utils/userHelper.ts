import { supabase } from '../lib/supabase';
import { createLogger } from './logger';
import { getPrivyAuthClient } from '../middleware/auth';
import AlchemyAddressService from '../services/alchemyAddress';
import { ensurePrivyEmbeddedWallets } from '../services/privyWallets';
import { registerGatewayWebhookAddresses } from '../services/circleGatewayWebhooks';

const logger = createLogger('UserSync');

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
        logger.debug('User not found by privy_id, fetching from Privy', { privyId });
        const privyUser = await getPrivyAuthClient().getUser(privyId);

        if (!privyUser) {
            throw new Error(`Privy user not found for ID: ${privyId}`);
        }

        // 3. Extract email from Privy user
        const linkedAccounts = Array.isArray(privyUser.linkedAccounts) ? privyUser.linkedAccounts : [];
        const email = privyUser.email?.address || 
            privyUser.google?.email || 
            privyUser.apple?.email ||
            (linkedAccounts.find((a: any) => a.type === 'email') as any)?.address;

        if (!email) {
            logger.warn('No email found for Privy user, cannot sync');
            throw new Error('No email found for Privy user');
        }

        let ethAddress: string | undefined = undefined;
        let solAddress: string | undefined = undefined;

        // Check linked accounts for wallets
        linkedAccounts.forEach((account: any) => {
            if (account.type === 'smart_wallet') return;
            if (account.type === 'wallet' || account.type === 'ethereum' || account.type === 'solana') {
                if ((account.chainType === 'ethereum' || account.type === 'ethereum') && !ethAddress) {
                    ethAddress = account.address;
                }
                if ((account.chainType === 'solana' || account.type === 'solana') && !solAddress) {
                    solAddress = account.address;
                }
            }
        });

        if (!ethAddress && /^0x[a-fA-F0-9]{40}$/.test(String(privyUser.wallet?.address || '').trim())) {
            ethAddress = String(privyUser.wallet?.address).trim();
        }

        if (!ethAddress || !solAddress) {
            try {
                const ensuredWallets = await ensurePrivyEmbeddedWallets(privyId, {
                    ethereum: !ethAddress,
                    solana: !solAddress,
                });
                ethAddress = ethAddress || ensuredWallets.ethereum || undefined;
                solAddress = solAddress || ensuredWallets.solana || undefined;
            } catch (walletError: any) {
                logger.warn('Could not ensure Privy embedded wallets while syncing user', {
                    privyId,
                    error: walletError?.message || 'Unknown error',
                });
            }
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

            const updatePayload: Record<string, string> = {
                privy_id: privyId,
                last_login: new Date().toISOString(),
                subscription_status: existingUser.subscription_status || 'inactive',
            };
            if (!existingUser.ethereum_wallet_address && ethAddress) {
                updatePayload.ethereum_wallet_address = ethAddress;
            }
            if (!existingUser.solana_wallet_address && solAddress) {
                updatePayload.solana_wallet_address = solAddress;
            }
            
            const { data: updatedUser, error: updateError } = await supabase
                .from('users')
                .update(updatePayload)
                .eq('id', existingUser.id)
                .select()
                .single();

            if (updateError) {
                logger.error('Failed to update privy_id for existing user', { error: updateError.message });
                throw updateError;
            }

            logger.info('Successfully updated privy_id for existing user');
            if (
                process.env.ALCHEMY_WEBHOOK_REGISTRATION_ENABLED !== 'false' &&
                (updatedUser.ethereum_wallet_address || updatedUser.solana_wallet_address)
            ) {
                void AlchemyAddressService.registerUserWallets({
                    ethereum: updatedUser.ethereum_wallet_address,
                    solana: updatedUser.solana_wallet_address,
                }).catch((error: any) => {
                    logger.warn('Failed to register synced wallets with Alchemy', {
                        userId: updatedUser.id,
                        error: error?.message || 'Unknown error',
                    });
                });
            }
            void registerGatewayWebhookAddresses({
                ethereum: updatedUser.ethereum_wallet_address,
                solana: updatedUser.solana_wallet_address,
            }).catch((error: any) => {
                logger.warn('Failed to register synced wallets with Circle Gateway', {
                    userId: updatedUser.id,
                    error: error?.message || 'Unknown error',
                });
            });
            return updatedUser;
        }

        // 5. User doesn't exist - create new user
        logger.debug('User not found by email, creating new user');
        
        const userData = {
            privy_id: privyId,
            email: email,
            first_name: '',
            last_name: '',
            ethereum_wallet_address: ethAddress,
            solana_wallet_address: solAddress,
            last_login: new Date().toISOString(),
            subscription_status: 'inactive',
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
        if (
            process.env.ALCHEMY_WEBHOOK_REGISTRATION_ENABLED !== 'false' &&
            (newUser.ethereum_wallet_address || newUser.solana_wallet_address)
        ) {
            void AlchemyAddressService.registerUserWallets({
                ethereum: newUser.ethereum_wallet_address,
                solana: newUser.solana_wallet_address,
            }).catch((error: any) => {
                logger.warn('Failed to register new user wallets with Alchemy', {
                    userId: newUser.id,
                    error: error?.message || 'Unknown error',
                });
            });
        }
        void registerGatewayWebhookAddresses({
            ethereum: newUser.ethereum_wallet_address,
            solana: newUser.solana_wallet_address,
        }).catch((error: any) => {
            logger.warn('Failed to register new user wallets with Circle Gateway', {
                userId: newUser.id,
                error: error?.message || 'Unknown error',
            });
        });
        return newUser;

    } catch (error) {
        logger.error('Error in user sync', { error: error instanceof Error ? error.message : 'Unknown' });
        throw error;
    }
}
