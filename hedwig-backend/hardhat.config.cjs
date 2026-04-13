require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const deployerPrivateKey = process.env.CELO_DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";
const deployerAccounts = deployerPrivateKey ? [deployerPrivateKey] : [];
const celoChainId = Number(process.env.CELO_CHAIN_ID || 42220);
const celoRpcUrl = process.env.CELO_RPC_URL || "https://forno.celo.org";
const celoSepoliaChainId = Number(process.env.CELO_SEPOLIA_CHAIN_ID || 11142220);
const celoSepoliaRpcUrl = process.env.CELO_SEPOLIA_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.28",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        hardhat: {},
        celo: {
            url: celoRpcUrl,
            chainId: celoChainId,
            accounts: deployerAccounts,
        },
        celoSepolia: {
            url: celoSepoliaRpcUrl,
            chainId: celoSepoliaChainId,
            accounts: deployerAccounts,
        },
        celoAlfajores: {
            url: process.env.CELO_ALFAJORES_RPC_URL || "https://alfajores-forno.celo-testnet.org",
            chainId: 44787,
            accounts: deployerAccounts,
        },
    },
    etherscan: {
        apiKey: {
            celo: process.env.CELO_EXPLORER_API_KEY || process.env.CELOSCAN_API_KEY || "blockscout",
            celoSepolia: process.env.CELO_SEPOLIA_EXPLORER_API_KEY || process.env.CELO_EXPLORER_API_KEY || process.env.CELOSCAN_API_KEY || "blockscout",
            celoAlfajores: process.env.CELOSCAN_ALFAJORES_API_KEY || process.env.CELOSCAN_API_KEY || "",
        },
        customChains: [
            {
                network: "celo",
                chainId: 42220,
                urls: {
                    apiURL: "https://celo.blockscout.com/api",
                    browserURL: "https://celo.blockscout.com",
                },
            },
            {
                network: "celoSepolia",
                chainId: 11142220,
                urls: {
                    apiURL: "https://celo-sepolia.blockscout.com/api",
                    browserURL: "https://celo-sepolia.blockscout.com",
                },
            },
            {
                network: "celoAlfajores",
                chainId: 44787,
                urls: {
                    apiURL: "https://api-alfajores.celoscan.io/api",
                    browserURL: "https://alfajores.celoscan.io",
                },
            },
        ],
    },
    paths: {
        artifacts: "./artifacts",
    }
};
