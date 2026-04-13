const hre = require("hardhat");

async function main() {
  const address = process.env.CELO_PROOF_REGISTRY_ADDRESS;
  const initialOwner = process.env.CELO_PROOF_REGISTRY_OWNER;
  const initialWriter = process.env.CELO_PROOF_REGISTRY_WRITER;

  if (!address) {
    throw new Error("Missing CELO_PROOF_REGISTRY_ADDRESS in environment.");
  }
  if (!initialOwner) {
    throw new Error("Missing CELO_PROOF_REGISTRY_OWNER in environment.");
  }
  if (!initialWriter) {
    throw new Error("Missing CELO_PROOF_REGISTRY_WRITER in environment.");
  }

  console.log(`Verifying HedwigProofRegistry at ${address} on ${hre.network.name}...`);
  await hre.run("verify:verify", {
    address,
    constructorArguments: [initialOwner, initialWriter],
  });
  console.log("Verification successful.");
}

main().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});
