const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying HedwigPayment to Base Sepolia...\n");

  // Platform wallet that receives 0.5% fees
  const PLATFORM_WALLET = "0x2f4c8b05d3F4784B0c2C74dbe5FDE142EE431EAc";

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer address:", deployer.address);

  // Check balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Balance:", ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    console.error("❌ Error: Wallet has no ETH for gas.");
    console.log("   Get testnet ETH from: https://www.alchemy.com/faucets/base-sepolia");
    process.exit(1);
  }

  // Deploy contract
  console.log("📝 Deploying HedwigPayment contract...");
  console.log("   Platform wallet:", PLATFORM_WALLET);

  const HedwigPayment = await ethers.getContractFactory("HedwigPayment");
  const contract = await HedwigPayment.deploy(PLATFORM_WALLET);

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("\n✅ Contract deployed successfully!");
  console.log("📍 Contract address:", contractAddress);
  console.log("🔗 View on BaseScan: https://sepolia.basescan.org/address/" + contractAddress);

  // Verify deployment
  const platformWallet = await contract.platformWallet();
  const feeBps = await contract.PLATFORM_FEE_BPS();

  console.log("\n📋 Contract Configuration:");
  console.log("   Platform Wallet:", platformWallet);
  console.log("   Fee (BPS):", feeBps.toString(), "(0.5%)");

  console.log("\n📁 Next steps:");
  console.log("   1. Update HEDWIG_CONTRACTS.baseSepolia in web-client/src/lib/appkit.ts");
  console.log("   2. Verify contract: npx hardhat verify --network baseSepolia", contractAddress, '"' + PLATFORM_WALLET + '"');

  return contractAddress;
}

main()
  .then((address) => {
    console.log("\n🎉 Deployment complete! Contract:", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
