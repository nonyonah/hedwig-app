
import dotenv from 'dotenv';
import BlockradarService from './src/services/blockradar';

dotenv.config();

async function main() {
    try {
        console.log('Fetching assets for master wallet...');
        const assets = await BlockradarService.getAssets();
        
        console.log('\nAvailable Assets:');
        assets.forEach(asset => {
            console.log(`- ${asset.name} (${asset.symbol})`);
            console.log(`  ID: ${asset.id}`);
            console.log(`  Network: ${asset.network} / ${asset.blockchain?.name}`);
            console.log('---');
        });

    } catch (error: any) {
        console.error('Error:', error.response?.data || error.message);
    }
}

main();
