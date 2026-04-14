import crypto from 'crypto';
import { Hex, isAddress, maxUint64, pad, parseUnits, zeroAddress } from 'viem';

export type GatewayChainKey =
    | 'sepolia'
    | 'avalancheFuji'
    | 'baseSepolia'
    | 'sonicTestnet'
    | 'worldChainSepolia'
    | 'seiAtlantic'
    | 'hyperEvmTestnet'
    | 'arcTestnet';

export interface GatewayChainConfig {
    key: GatewayChainKey;
    label: string;
    domain: number;
    chainId: number;
    chainIdHex: `0x${string}`;
    rpcUrl: string;
    blockExplorerUrl: string;
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
    gatewayWalletAddress: Hex;
    gatewayMinterAddress: Hex;
    usdcAddress: Hex;
}

export interface GatewayTransferSpec {
    version: number;
    sourceDomain: number;
    destinationDomain: number;
    sourceContract: Hex;
    destinationContract: Hex;
    sourceToken: Hex;
    destinationToken: Hex;
    sourceDepositor: Hex;
    destinationRecipient: Hex;
    sourceSigner: Hex;
    destinationCaller: Hex;
    value: string;
    salt: Hex;
    hookData: Hex;
}

export interface GatewayBurnIntent {
    maxBlockHeight: string;
    maxFee: string;
    spec: GatewayTransferSpec;
}

export interface GatewayTransferRequest {
    burnIntent: GatewayBurnIntent;
    signature: Hex;
}

export interface GatewayAttestationResponse {
    attestation: Hex;
    signature: Hex;
}

const GATEWAY_EVM_TESTNET_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const;
const GATEWAY_EVM_TESTNET_MINTER = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B' as const;
const DEFAULT_MAX_FEE_MICRO_USDC = '2010000';

export const GATEWAY_EIP712_DOMAIN = {
    name: 'GatewayWallet',
    version: '1',
} as const;

export const GATEWAY_EIP712_TYPES = {
    EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
    ],
    TransferSpec: [
        { name: 'version', type: 'uint32' },
        { name: 'sourceDomain', type: 'uint32' },
        { name: 'destinationDomain', type: 'uint32' },
        { name: 'sourceContract', type: 'bytes32' },
        { name: 'destinationContract', type: 'bytes32' },
        { name: 'sourceToken', type: 'bytes32' },
        { name: 'destinationToken', type: 'bytes32' },
        { name: 'sourceDepositor', type: 'bytes32' },
        { name: 'destinationRecipient', type: 'bytes32' },
        { name: 'sourceSigner', type: 'bytes32' },
        { name: 'destinationCaller', type: 'bytes32' },
        { name: 'value', type: 'uint256' },
        { name: 'salt', type: 'bytes32' },
        { name: 'hookData', type: 'bytes' },
    ],
    BurnIntent: [
        { name: 'maxBlockHeight', type: 'uint256' },
        { name: 'maxFee', type: 'uint256' },
        { name: 'spec', type: 'TransferSpec' },
    ],
} as const;

const gatewayChains: Record<GatewayChainKey, GatewayChainConfig> = {
    sepolia: {
        key: 'sepolia',
        label: 'Ethereum Sepolia',
        domain: 0,
        chainId: 11155111,
        chainIdHex: '0xaa36a7',
        rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
        blockExplorerUrl: 'https://sepolia.etherscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_TESTNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_TESTNET_MINTER,
        usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    },
    avalancheFuji: {
        key: 'avalancheFuji',
        label: 'Avalanche Fuji',
        domain: 1,
        chainId: 43113,
        chainIdHex: '0xa869',
        rpcUrl: 'https://avalanche-fuji-c-chain-rpc.publicnode.com',
        blockExplorerUrl: 'https://testnet.snowtrace.io',
        nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_TESTNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_TESTNET_MINTER,
        usdcAddress: '0x5425890298aed601595a70AB815c96711a31Bc65',
    },
    baseSepolia: {
        key: 'baseSepolia',
        label: 'Base Sepolia',
        domain: 6,
        chainId: 84532,
        chainIdHex: '0x14a34',
        rpcUrl: 'https://base-sepolia-rpc.publicnode.com',
        blockExplorerUrl: 'https://sepolia.basescan.org',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_TESTNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_TESTNET_MINTER,
        usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    },
    sonicTestnet: {
        key: 'sonicTestnet',
        label: 'Sonic Testnet',
        domain: 13,
        chainId: 64165,
        chainIdHex: '0xfaa5',
        rpcUrl: 'https://rpc.testnet.soniclabs.com',
        blockExplorerUrl: 'https://testnet.sonicscan.org',
        nativeCurrency: { name: 'Sonic', symbol: 'S', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_TESTNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_TESTNET_MINTER,
        usdcAddress: '0x0BA304580ee7c9a980CF72e55f5Ed2E9fd30Bc51',
    },
    worldChainSepolia: {
        key: 'worldChainSepolia',
        label: 'World Chain Sepolia',
        domain: 14,
        chainId: 4801,
        chainIdHex: '0x12c1',
        rpcUrl: 'https://worldchain-sepolia.g.alchemy.com/public',
        blockExplorerUrl: 'https://worldchain-sepolia.explorer.alchemy.com',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_TESTNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_TESTNET_MINTER,
        usdcAddress: '0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88',
    },
    seiAtlantic: {
        key: 'seiAtlantic',
        label: 'Sei Atlantic',
        domain: 16,
        chainId: 1328,
        chainIdHex: '0x530',
        rpcUrl: 'https://evm-rpc-testnet.sei-apis.com',
        blockExplorerUrl: 'https://seitrace.com',
        nativeCurrency: { name: 'Sei', symbol: 'SEI', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_TESTNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_TESTNET_MINTER,
        usdcAddress: '0x4fCF1784B31630811181f670Aea7A7bEF803eaED',
    },
    hyperEvmTestnet: {
        key: 'hyperEvmTestnet',
        label: 'HyperEVM Testnet',
        domain: 19,
        chainId: 998,
        chainIdHex: '0x3e6',
        rpcUrl: 'https://rpc.hyperliquid-testnet.xyz/evm',
        blockExplorerUrl: 'https://app.hyperliquid-testnet.xyz/explorer',
        nativeCurrency: { name: 'Hyperliquid', symbol: 'HYPE', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_TESTNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_TESTNET_MINTER,
        usdcAddress: '0x2B3370eE501B4a559b57D449569354196457D8Ab',
    },
    arcTestnet: {
        key: 'arcTestnet',
        label: 'Arc Testnet',
        domain: 26,
        chainId: 5042002,
        chainIdHex: '0x4ce912',
        rpcUrl: 'https://rpc.testnet.arc.network',
        blockExplorerUrl: 'https://explorer.testnet.arc.network',
        nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
        gatewayWalletAddress: GATEWAY_EVM_TESTNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_TESTNET_MINTER,
        usdcAddress: '0x3600000000000000000000000000000000000000',
    },
};

function isGatewayChainKey(value: string): value is GatewayChainKey {
    return Object.prototype.hasOwnProperty.call(gatewayChains, value);
}

function asChainKeyList(values: string[] | undefined): GatewayChainKey[] {
    if (!values || values.length === 0) {
        return Object.keys(gatewayChains) as GatewayChainKey[];
    }
    return values.filter(isGatewayChainKey);
}

function toBytes32Address(address: string): Hex {
    return pad(address.toLowerCase() as Hex, { size: 32 });
}

export function getGatewayNetwork(): 'testnet' | 'mainnet' {
    return process.env.GATEWAY_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
}

export function getGatewayApiBaseUrl(): string {
    const configured = String(process.env.GATEWAY_API_BASE_URL || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    return getGatewayNetwork() === 'mainnet'
        ? 'https://gateway-api.circle.com/v1'
        : 'https://gateway-api-testnet.circle.com/v1';
}

export function listGatewayChains(chainKeys?: string[]): GatewayChainConfig[] {
    return asChainKeyList(chainKeys).map((key) => gatewayChains[key]);
}

export function getGatewayChainConfig(key: string): GatewayChainConfig | null {
    if (!isGatewayChainKey(key)) return null;
    return gatewayChains[key];
}

export function createGatewayBalanceSources(depositorAddress: string, chainKeys?: string[]) {
    if (!isAddress(depositorAddress)) {
        throw new Error('Invalid depositor address');
    }

    const normalizedDepositor = depositorAddress as Hex;
    return listGatewayChains(chainKeys).map((chain) => ({
        domain: chain.domain,
        depositor: normalizedDepositor,
    }));
}

export async function fetchGatewayBalances(
    depositorAddress: string,
    chainKeys?: string[]
): Promise<{ token: 'USDC'; balances: Array<{ domain: number; depositor: string; balance: string }> }> {
    const response = await fetch(`${getGatewayApiBaseUrl()}/balances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: 'USDC',
            sources: createGatewayBalanceSources(depositorAddress, chainKeys),
        }),
    });

    if (!response.ok) {
        const payload = await response.text();
        throw new Error(`Gateway balances request failed (${response.status}): ${payload}`);
    }

    return response.json();
}

export function buildEvmBurnIntent(input: {
    sourceChainKey: string;
    destinationChainKey: string;
    amountUsdc: string;
    depositorAddress: string;
    destinationRecipient: string;
    maxFeeMicrousdc?: string;
}) {
    const sourceChain = getGatewayChainConfig(input.sourceChainKey);
    const destinationChain = getGatewayChainConfig(input.destinationChainKey);

    if (!sourceChain) throw new Error('Unsupported source chain');
    if (!destinationChain) throw new Error('Unsupported destination chain');
    if (sourceChain.key === destinationChain.key) {
        throw new Error('Source and destination chains must be different');
    }
    if (!isAddress(input.depositorAddress)) throw new Error('Invalid depositor address');
    if (!isAddress(input.destinationRecipient)) throw new Error('Invalid destination recipient');

    const parsedAmount = parseUnits(input.amountUsdc, 6);
    if (parsedAmount <= 0n) {
        throw new Error('Amount must be greater than zero');
    }

    const burnIntent: GatewayBurnIntent = {
        maxBlockHeight: maxUint64.toString(),
        maxFee: String(input.maxFeeMicrousdc || DEFAULT_MAX_FEE_MICRO_USDC),
        spec: {
            version: 1,
            sourceDomain: sourceChain.domain,
            destinationDomain: destinationChain.domain,
            sourceContract: toBytes32Address(sourceChain.gatewayWalletAddress),
            destinationContract: toBytes32Address(destinationChain.gatewayMinterAddress),
            sourceToken: toBytes32Address(sourceChain.usdcAddress),
            destinationToken: toBytes32Address(destinationChain.usdcAddress),
            sourceDepositor: toBytes32Address(input.depositorAddress),
            destinationRecipient: toBytes32Address(input.destinationRecipient),
            sourceSigner: toBytes32Address(input.depositorAddress),
            destinationCaller: toBytes32Address(zeroAddress),
            value: parsedAmount.toString(),
            salt: `0x${crypto.randomBytes(32).toString('hex')}`,
            hookData: '0x',
        },
    };

    return {
        burnIntent,
        typedData: {
            types: GATEWAY_EIP712_TYPES,
            primaryType: 'BurnIntent' as const,
            domain: GATEWAY_EIP712_DOMAIN,
            message: burnIntent,
        },
        sourceChain,
        destinationChain,
    };
}

export async function requestGatewayAttestation(requests: GatewayTransferRequest[]): Promise<GatewayAttestationResponse> {
    const response = await fetch(`${getGatewayApiBaseUrl()}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requests),
    });

    if (!response.ok) {
        const payload = await response.text();
        throw new Error(`Gateway transfer request failed (${response.status}): ${payload}`);
    }

    return response.json();
}
