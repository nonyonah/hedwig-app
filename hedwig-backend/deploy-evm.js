/**
 * Deploy HedwigPayment contract to Base Sepolia
 * 
 * Usage:
 *   PRIVATE_KEY=0x... node deploy-evm.js
 * 
 * Prerequisites:
 *   npm install ethers solc @openzeppelin/contracts
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base Sepolia configuration
const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
const CHAIN_ID = 84532;

// Platform wallet that receives 0.5% fees
const PLATFORM_WALLET = '0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc';

// Contract bytecode and ABI (compiled)
// This will be replaced with actual compiled output
const CONTRACT_ABI = [
    "constructor(address _platformWallet)",
    "function pay(address token, uint256 amount, address freelancer, string calldata invoiceId) external",
    "function setPlatformWallet(address newWallet) external",
    "function calculateFeeSplit(uint256 amount) external pure returns (uint256 freelancerAmount, uint256 platformFee)",
    "function platformWallet() external view returns (address)",
    "function paymentCount() external view returns (uint256)",
    "function PLATFORM_FEE_BPS() external view returns (uint256)",
    "event PaymentProcessed(uint256 indexed paymentId, address indexed payer, address indexed freelancer, address token, uint256 totalAmount, uint256 freelancerAmount, uint256 platformFee, string invoiceId)",
    "event PlatformWalletUpdated(address indexed oldWallet, address indexed newWallet)"
];

async function main() {
    // Check for private key
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        console.error('❌ Error: PRIVATE_KEY environment variable not set');
        console.log('Usage: PRIVATE_KEY=0x... node deploy-evm.js');
        process.exit(1);
    }

    console.log('🚀 Deploying HedwigPayment to Base Sepolia...\n');

    // Connect to Base Sepolia
    const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC, CHAIN_ID);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`📍 Deployer address: ${wallet.address}`);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
        console.error('❌ Error: Wallet has no ETH for gas. Get testnet ETH from: https://www.alchemy.com/faucets/base-sepolia');
        process.exit(1);
    }

    // Read compiled bytecode
    const bytecodeFile = path.join(__dirname, 'contracts', 'HedwigPayment.bytecode');

    if (!fs.existsSync(bytecodeFile)) {
        console.log('\n📦 Bytecode not found. Please compile the contract first:');
        console.log('   npx hardhat compile');
        console.log('   OR use Remix IDE to compile and get bytecode');
        console.log('\n   Alternative: Use Foundry or Hardhat for deployment');
        process.exit(1);
    }

    const bytecode = fs.readFileSync(bytecodeFile, 'utf8').trim();

    // Create contract factory
    const factory = new ethers.ContractFactory(CONTRACT_ABI, bytecode, wallet);

    // Deploy with platform wallet as constructor argument
    console.log(`\n🔧 Platform wallet: ${PLATFORM_WALLET}`);
    console.log('📝 Deploying contract...');

    const contract = await factory.deploy(PLATFORM_WALLET);

    console.log(`📤 Transaction hash: ${contract.deploymentTransaction()?.hash}`);
    console.log('⏳ Waiting for confirmation...');

    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

    console.log('\n✅ Contract deployed successfully!');
    console.log(`📍 Contract address: ${contractAddress}`);
    console.log(`🔗 View on BaseScan: https://sepolia.basescan.org/address/${contractAddress}`);

    // Save deployment info
    const deploymentInfo = {
        network: 'base-sepolia',
        chainId: CHAIN_ID,
        contractAddress,
        platformWallet: PLATFORM_WALLET,
        deployedAt: new Date().toISOString(),
        deployer: wallet.address,
        txHash: contract.deploymentTransaction()?.hash
    };

    const deploymentsDir = path.join(__dirname, 'deployments');
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    fs.writeFileSync(
        path.join(deploymentsDir, 'base-sepolia.json'),
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log('\n📁 Deployment info saved to deployments/base-sepolia.json');
    console.log('\n📋 Next steps:');
    console.log(`   1. Update HEDWIG_CONTRACTS.baseSepolia in web-client/src/lib/appkit.ts`);
    console.log(`   2. Verify contract: npx hardhat verify --network baseSepolia ${contractAddress} "${PLATFORM_WALLET}"`);
}

main().catch(console.error);
