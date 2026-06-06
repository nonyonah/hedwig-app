import crypto from 'crypto';
import { Hex, isAddress, maxUint64, pad, parseUnits, zeroAddress } from 'viem';

export type GatewayChainKey =
    | 'sepolia'
    | 'avalancheFuji'
    | 'arbitrumSepolia'
    | 'baseSepolia'
    | 'polygonAmoy'
    | 'optimismSepolia'
    | 'sonicTestnet'
    | 'worldChainSepolia'
    | 'seiAtlantic'
    | 'hyperEvmTestnet'
    | 'arcTestnet'
    | 'base'
    | 'arbitrum'
    | 'polygon'
    | 'optimism';

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
const GATEWAY_EVM_MAINNET_WALLET = '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE' as const;
const GATEWAY_EVM_MAINNET_MINTER = '0x2222222d7164433c4C09B0b0D809a9b52C04C205' as const;
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
    arbitrumSepolia: {
        key: 'arbitrumSepolia',
        label: 'Arbitrum Sepolia',
        domain: 3,
        chainId: 421614,
        chainIdHex: '0x66eee',
        rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
        blockExplorerUrl: 'https://sepolia.arbiscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_TESTNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_TESTNET_MINTER,
        usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    },
    polygonAmoy: {
        key: 'polygonAmoy',
        label: 'Polygon Amoy',
        domain: 7,
        chainId: 80002,
        chainIdHex: '0x13882',
        rpcUrl: 'https://rpc-amoy.polygon.technology',
        blockExplorerUrl: 'https://amoy.polygonscan.com',
        nativeCurrency: { name: 'Polygon', symbol: 'POL', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_TESTNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_TESTNET_MINTER,
        usdcAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    },
    optimismSepolia: {
        key: 'optimismSepolia',
        label: 'OP Sepolia',
        domain: 2,
        chainId: 11155420,
        chainIdHex: '0xaa37dc',
        rpcUrl: 'https://sepolia.optimism.io',
        blockExplorerUrl: 'https://sepolia-optimism.etherscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_TESTNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_TESTNET_MINTER,
        usdcAddress: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
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
    base: {
        key: 'base',
        label: 'Base',
        domain: 6,
        chainId: 8453,
        chainIdHex: '0x2105',
        rpcUrl: 'https://mainnet.base.org',
        blockExplorerUrl: 'https://basescan.org',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_MAINNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_MAINNET_MINTER,
        usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
    arbitrum: {
        key: 'arbitrum',
        label: 'Arbitrum',
        domain: 3,
        chainId: 42161,
        chainIdHex: '0xa4b1',
        rpcUrl: 'https://arb1.arbitrum.io/rpc',
        blockExplorerUrl: 'https://arbiscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_MAINNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_MAINNET_MINTER,
        usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    },
    polygon: {
        key: 'polygon',
        label: 'Polygon',
        domain: 7,
        chainId: 137,
        chainIdHex: '0x89',
        rpcUrl: 'https://polygon-rpc.com',
        blockExplorerUrl: 'https://polygonscan.com',
        nativeCurrency: { name: 'Polygon', symbol: 'POL', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_MAINNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_MAINNET_MINTER,
        usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    },
    optimism: {
        key: 'optimism',
        label: 'Optimism',
        domain: 2,
        chainId: 10,
        chainIdHex: '0xa',
        rpcUrl: 'https://mainnet.optimism.io',
        blockExplorerUrl: 'https://optimistic.etherscan.io',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        gatewayWalletAddress: GATEWAY_EVM_MAINNET_WALLET,
        gatewayMinterAddress: GATEWAY_EVM_MAINNET_MINTER,
        usdcAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
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
    const isSolanaDepositor = !depositorAddress.startsWith('0x');
    if (isSolanaDepositor) {
        return [{ domain: 5, depositor: depositorAddress }];
    }

    if (!isAddress(depositorAddress)) {
        throw new Error('Invalid depositor address');
    }

    const normalizedDepositor = depositorAddress as Hex;
    const filteredChainKeys = chainKeys?.filter((key) => key !== 'solana');
    return listGatewayChains(filteredChainKeys).map((chain) => ({
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

export function gatewayBalanceToMicros(balance: string | number | null | undefined): bigint {
    const raw = String(balance ?? '0').trim();
    if (!raw) return 0n;

    const negative = raw.startsWith('-');
    if (negative) return 0n;

    const [wholeRaw, fractionalRaw = ''] = raw.split('.');
    const whole = wholeRaw.replace(/\D/g, '') || '0';
    const fractional = fractionalRaw.replace(/\D/g, '').padEnd(6, '0').slice(0, 6);
    return BigInt(whole) * 1_000_000n + BigInt(fractional || '0');
}

export function normalizeGatewayBalanceEntry<T extends { balance?: string | number | null }>(entry: T) {
    return {
        ...entry,
        rawBalance: entry.balance ?? '0',
        balance: gatewayBalanceToMicros(entry.balance).toString(),
    };
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

export async function submitForwardedTransfer(requests: GatewayTransferRequest[]): Promise<{ transferId: string }> {
    const response = await fetch(`${getGatewayApiBaseUrl()}/transfer?enableForwarder=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requests),
    });

    if (!response.ok) {
        const payload = await response.text();
        throw new Error(`Gateway forwarded transfer failed (${response.status}): ${payload}`);
    }

    const json = await response.json();
    const transferId = json?.transfer?.id || json?.transferId || json?.id || json?.[0]?.transfer?.id || json?.[0]?.id;
    if (!transferId) throw new Error('Gateway did not return a transfer ID');
    return { transferId: String(transferId) };
}

export async function pollGatewayTransfer(transferId: string): Promise<{ status: string; txHash?: string; error?: string }> {
    const response = await fetch(`${getGatewayApiBaseUrl()}/transfer/${encodeURIComponent(transferId)}`);

    if (!response.ok) {
        const payload = await response.text();
        throw new Error(`Gateway transfer poll failed (${response.status}): ${payload}`);
    }

    const record = await response.json();
    const status = record?.status || 'pending';
    const txHash = record?.destination?.txHash || record?.destinationTxHash || record?.txHash;
    const error = record?.error?.message;

    return { status: String(status).toLowerCase(), txHash: txHash ? String(txHash) : undefined, error };
}
