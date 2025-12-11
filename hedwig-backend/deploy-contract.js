/**
 * Deploy Clarity Smart Contract to Stacks Testnet
 * 
 * Usage: node deploy-contract.js
 * 
 * Requires: STACKS_MNEMONIC environment variable or settings/Testnet.toml
 */

const fs = require('fs');
const path = require('path');

async function main() {
    // Dynamic imports for ES modules
    const { makeContractDeploy, broadcastTransaction, AnchorMode } = await import('@stacks/transactions');
    const { STACKS_TESTNET } = await import('@stacks/network');
    const { generateWallet, getStxAddress } = await import('@stacks/wallet-sdk');

    // Read mnemonic from environment or settings file
    let mnemonic = process.env.STACKS_MNEMONIC;

    if (!mnemonic) {
        // Try to read from Testnet.toml
        const tomlPath = path.join(__dirname, 'settings', 'Testnet.toml');
        if (fs.existsSync(tomlPath)) {
            const content = fs.readFileSync(tomlPath, 'utf8');
            const match = content.match(/mnemonic\s*=\s*"([^"]+)"/);
            if (match) {
                mnemonic = match[1];
            }
        }
    }

    if (!mnemonic) {
        console.error('Error: STACKS_MNEMONIC not found in environment or settings/Testnet.toml');
        process.exit(1);
    }

    console.log('Generating wallet from mnemonic...');

    // Generate wallet and get private key
    const wallet = await generateWallet({
        secretKey: mnemonic,
        password: '',
    });

    const account = wallet.accounts[0];
    const senderAddress = getStxAddress(account, 'testnet');

    console.log('Deployer address:', senderAddress);

    // Read contract source
    const contractPath = path.join(__dirname, 'contracts', 'hedwig-payment.clar');
    if (!fs.existsSync(contractPath)) {
        console.error('Error: Contract file not found at', contractPath);
        process.exit(1);
    }

    const contractSource = fs.readFileSync(contractPath, 'utf8');
    console.log('Contract loaded:', contractSource.length, 'characters');

    // Setup network - use STACKS_TESTNET constant (v7 API)
    const network = STACKS_TESTNET;

    // Get account nonce
    console.log('Fetching account nonce...');
    const nonceResponse = await fetch(`https://api.testnet.hiro.so/extended/v1/address/${senderAddress}/nonces`);
    const nonceData = await nonceResponse.json();
    const nonce = nonceData.possible_next_nonce;
    console.log('Using nonce:', nonce);

    // Check balance
    const balanceResponse = await fetch(`https://api.testnet.hiro.so/extended/v1/address/${senderAddress}/balances`);
    const balanceData = await balanceResponse.json();
    const balance = BigInt(balanceData.stx?.balance || '0');
    console.log('Current balance:', Number(balance) / 1000000, 'STX');

    if (balance < 100000n) {
        console.error('Error: Not enough STX balance. Need at least 0.1 STX for deployment fee.');
        console.error('Get testnet STX from: https://explorer.hiro.so/sandbox/faucet?chain=testnet');
        process.exit(1);
    }

    // Create contract deploy transaction
    console.log('Creating contract deploy transaction...');
    const txOptions = {
        contractName: 'hedwig-payment',
        codeBody: contractSource,
        senderKey: account.stxPrivateKey,
        network,
        anchorMode: AnchorMode.Any,
        fee: 100000n, // 0.1 STX fee
        nonce: BigInt(nonce),
    };

    const transaction = await makeContractDeploy(txOptions);

    console.log('Broadcasting transaction...');
    const broadcastResponse = await broadcastTransaction({ transaction, network });

    if (broadcastResponse.error) {
        console.error('Broadcast failed:', broadcastResponse.error);
        console.error('Reason:', broadcastResponse.reason);
        if (broadcastResponse.reason_data) {
            console.error('Details:', broadcastResponse.reason_data);
        }
        process.exit(1);
    }

    console.log('✅ Transaction broadcast successful!');
    console.log('Transaction ID:', broadcastResponse.txid);
    console.log('View on explorer: https://explorer.hiro.so/txid/' + broadcastResponse.txid + '?chain=testnet');
    console.log('\nContract will be deployed at:');
    console.log(`${senderAddress}.hedwig-payment`);
}

main().catch(err => {
    console.error('Deployment failed:', err);
    process.exit(1);
});
