const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function resolveConstructorArgs(deployerAddress) {
  const initialOwner = process.env.CELO_PROOF_REGISTRY_OWNER || deployerAddress;
  const initialWriter = process.env.CELO_PROOF_REGISTRY_WRITER || deployerAddress;
  return { initialOwner, initialWriter };
}

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  const { initialOwner, initialWriter } = resolveConstructorArgs(deployer.address);

  console.log(`Deploying HedwigProofRegistry to ${network.name}...`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Initial owner: ${initialOwner}`);
  console.log(`Initial writer: ${initialWriter}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer balance: ${ethers.formatEther(balance)} native`);

  const Factory = await ethers.getContractFactory("HedwigProofRegistry");
  const contract = await Factory.deploy(initialOwner, initialWriter);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log(`HedwigProofRegistry deployed at: ${contractAddress}`);

  const output = {
    contract: "HedwigProofRegistry",
    address: contractAddress,
    network: network.name,
    chainId: Number(network.config.chainId || 0),
    constructorArgs: {
      initialOwner,
      initialWriter,
    },
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const deploymentsDir = path.resolve(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const outPath = path.join(deploymentsDir, `hedwig-proof-registry.${network.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`Deployment record saved to: ${outPath}`);
  console.log("");
  console.log("Verification command:");
  console.log(
    `npx hardhat verify --config hedwig-backend/hardhat.config.cjs --network ${network.name} ${contractAddress} ${initialOwner} ${initialWriter}`
  );
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});
