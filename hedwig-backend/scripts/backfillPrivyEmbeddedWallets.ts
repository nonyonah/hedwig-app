import 'dotenv/config';
import { supabase } from '../src/lib/supabase';
import AlchemyAddressService from '../src/services/alchemyAddress';
import { ensurePrivyEmbeddedWallets } from '../src/services/privyWallets';

type UserRow = {
    id: string;
    privy_id: string | null;
    ethereum_wallet_address: string | null;
    solana_wallet_address: string | null;
};

async function main() {
    const chunkSize = Math.max(1, Math.min(500, Number(process.env.PRIVY_WALLET_BACKFILL_CHUNK_SIZE || 100)));
    const summary = {
        scanned: 0,
        skippedNoPrivyId: 0,
        updated: 0,
        registeredWithAlchemy: 0,
        failed: 0,
    };

    console.log('Starting Privy embedded wallet backfill...');
    console.log(`Using chunk size: ${chunkSize}`);

    let lastId = '';
    while (true) {
        let query = supabase
            .from('users')
            .select('id, privy_id, ethereum_wallet_address, solana_wallet_address')
            .or('ethereum_wallet_address.is.null,solana_wallet_address.is.null')
            .order('id', { ascending: true })
            .limit(chunkSize);

        if (lastId) {
            query = query.gt('id', lastId);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);

        const users = (data || []) as UserRow[];
        if (users.length === 0) break;

        for (const user of users) {
            summary.scanned += 1;

            if (!user.privy_id) {
                summary.skippedNoPrivyId += 1;
                continue;
            }

            try {
                const wallets = await ensurePrivyEmbeddedWallets(user.privy_id, {
                    ethereum: !user.ethereum_wallet_address,
                    solana: !user.solana_wallet_address,
                });

                const updatePayload: Record<string, string> = {};
                if (!user.ethereum_wallet_address && wallets.ethereum) {
                    updatePayload.ethereum_wallet_address = wallets.ethereum;
                }
                if (!user.solana_wallet_address && wallets.solana) {
                    updatePayload.solana_wallet_address = wallets.solana;
                }

                if (Object.keys(updatePayload).length > 0) {
                    const { error: updateError } = await supabase
                        .from('users')
                        .update(updatePayload)
                        .eq('id', user.id);

                    if (updateError) throw new Error(updateError.message);
                    summary.updated += 1;
                }

                const ethereum = updatePayload.ethereum_wallet_address || user.ethereum_wallet_address;
                const solana = updatePayload.solana_wallet_address || user.solana_wallet_address;
                if (
                    process.env.ALCHEMY_WEBHOOK_REGISTRATION_ENABLED !== 'false' &&
                    (ethereum || solana)
                ) {
                    await AlchemyAddressService.registerUserWallets({ ethereum, solana });
                    summary.registeredWithAlchemy += 1;
                }
            } catch (error) {
                summary.failed += 1;
                console.warn(`Failed to backfill wallets for ${user.id}:`, error instanceof Error ? error.message : error);
            }
        }

        lastId = users[users.length - 1].id;
        if (users.length < chunkSize) break;
    }

    console.log('Privy embedded wallet backfill complete.');
    console.log(JSON.stringify(summary, null, 2));

    if (summary.failed > 0) {
        console.warn('Some users could not be backfilled. Review the warnings above.');
    }
}

main().catch((error) => {
    console.error('Privy embedded wallet backfill failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
