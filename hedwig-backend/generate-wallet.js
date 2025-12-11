
async function main() {
    try {
        const walletSDK = await import('@stacks/wallet-sdk');
        // generateSecretKey returns a 24-word mnemonic by default
        const mnemonic = walletSDK.generateSecretKey();
        console.log('MNEMONIC: ' + mnemonic);

        // Verify address derivation
        const wallet = await walletSDK.generateWallet({ secretKey: mnemonic, password: '' });
        const address = walletSDK.getStxAddress(wallet.accounts[0], 'testnet');
        console.log('ADDRESS: ' + address);
    } catch (e) {
        console.error('Error:', e);
    }
}
main();
