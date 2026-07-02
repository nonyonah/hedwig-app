import { supabase } from '../lib/supabase';
import { createLogger } from './logger';
import { getPrivyAuthClient } from '../middleware/auth';
import AlchemyAddressService from '../services/alchemyAddress';
import { ensurePrivyEmbeddedWallets } from '../services/privyWallets';
import { registerGatewayWebhookAddresses } from '../services/circleGatewayWebhooks';
import { generateStellarKeypair, fundAndSetupTrustline } from '../services/stellarAccount';

const logger = createLogger('UserSync');

async function ensureStellarWallet(userId: string, existingPublicKey?: string, existingEncryptedSeed?: string): Promise<{ stellarPublicKey: string; stellarEncryptedSeed: string } | null> {
  try {
    // Already has a Stellar wallet
    if (existingPublicKey && existingEncryptedSeed) {
      return { stellarPublicKey: existingPublicKey, stellarEncryptedSeed: existingEncryptedSeed };
    }

    const { publicKey, encryptedSeed } = generateStellarKeypair();

    const { error: updateErr } = await supabase.from('users')
      .update({
        stellar_public_key: publicKey,
        stellar_encrypted_seed: encryptedSeed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateErr) {
      logger.warn('Failed to persist Stellar wallet — migration may not be applied', {
        userId,
        error: updateErr.message,
      });
      return null;
    }

    logger.info('Stellar wallet created for user', { userId, publicKey });

    // Fire-and-forget: fund account + set up USDC trustline (testnet only)
    fundAndSetupTrustline(publicKey, encryptedSeed).catch((err) =>
      logger.warn('Background Stellar setup failed', { userId, error: err.message })
    );

    return { stellarPublicKey: publicKey, stellarEncryptedSeed: encryptedSeed };
  } catch (error: any) {
    logger.warn('Failed to ensure Stellar wallet', { userId, error: error.message });
    return null;
  }
}

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
            if (user.ethereum_wallet_address || user.solana_wallet_address) {
                void registerGatewayWebhookAddresses({
                    ethereum: user.ethereum_wallet_address,
                    solana: user.solana_wallet_address,
                }).catch((gatewayError: any) => {
                    logger.warn('Failed to register existing user wallets with Circle Gateway', {
                        userId: user.id,
                        error: gatewayError?.message || 'Unknown error',
                    });
                });
            }

            // Lazy-migrate: generate Stellar keypair for existing users who don't have one
            if (!user.stellar_public_key) {
                const stellar = await ensureStellarWallet(user.id).catch(() => null);
                if (stellar) {
                    user.stellar_public_key = stellar.stellarPublicKey;
                    user.stellar_encrypted_seed = stellar.stellarEncryptedSeed;
                }
            }

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
            if (!existingUser.stellar_public_key) {
                const stellarPair = generateStellarKeypair();
                updatePayload.stellar_public_key = stellarPair.publicKey;
                updatePayload.stellar_encrypted_seed = stellarPair.encryptedSeed;
                // Fire-and-forget funding
                fundAndSetupTrustline(stellarPair.publicKey, stellarPair.encryptedSeed).catch(() => {});
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
        
        const stellarPair = generateStellarKeypair();

        const userData = {
            privy_id: privyId,
            email: email,
            first_name: '',
            last_name: '',
            ethereum_wallet_address: ethAddress,
            solana_wallet_address: solAddress,
            stellar_public_key: stellarPair.publicKey,
            stellar_encrypted_seed: stellarPair.encryptedSeed,
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

        // Fire-and-forget: fund Stellar account + set up USDC trustline (testnet only)
        fundAndSetupTrustline(stellarPair.publicKey, stellarPair.encryptedSeed).catch(() => {});

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
