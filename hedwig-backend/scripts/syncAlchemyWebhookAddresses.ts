import 'dotenv/config';
import AlchemyAddressService from '../src/services/alchemyAddress';

async function main() {
    const chunkSize = Math.max(1, Number(process.env.ALCHEMY_SYNC_CHUNK_SIZE || 100));

    console.log('Starting Alchemy webhook address sync...');
    console.log(`Using chunk size: ${chunkSize}`);

    const summary = await AlchemyAddressService.syncAllExistingWalletAddresses({ chunkSize });

    console.log('Alchemy webhook address sync complete.');
    console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
    console.error('Alchemy webhook address sync failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});

