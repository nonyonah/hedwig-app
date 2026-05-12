// Build + sign EVM burn intents for Circle Gateway.
//
// Privy's Expo SDK does not expose `useSignTypedData` directly, so we wrap
// the embedded wallet's EIP-1193 provider in a viem WalletClient and call
// `signTypedData` against the Gateway Wallet contract on the source chain.

import {
    createWalletClient,
    custom,
    encodePacked,
    keccak256,
    pad,
    parseUnits,
    type Address,
    type Hex,
    type WalletClient,
} from 'viem';
import {
    GATEWAY_EVM_CHAINS,
    GATEWAY_FORWARDER_FEE_USDC,
    GATEWAY_MINTER_EVM,
    GATEWAY_TRANSFER_FEE_DEN,
    GATEWAY_TRANSFER_FEE_NUM,
    GATEWAY_WALLET_EVM,
    type GatewayChainKey,
    type GatewayEvmChainKey,
} from './constants';
import type { BurnIntent, SignedBurnIntent, TransferSpec } from './types';

const ZERO_BYTES32: Hex = `0x${'00'.repeat(32)}` as Hex;

// Domain + struct types EXACTLY as Circle's GatewayWallet contract encodes
// them. Reference:
//   https://github.com/circlefin/evm-gateway-contracts/blob/master/src/lib/EIP712Domain.sol
//   https://github.com/circlefin/evm-gateway-contracts/blob/master/src/lib/BurnIntents.sol
//
// CRITICAL:
//   1. Domain is `EIP712Domain(string name,string version)` — NO chainId
//      and NO verifyingContract. Circle deliberately omits them so a single
//      burn intent signature is portable across deployments.
//   2. Domain `name` is "GatewayWallet" (not "Gateway").
//   3. `BurnIntent.maxBlockHeight` is `uint256` (we previously sent uint64).
const EIP712_TYPES = {
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

export function addressToBytes32(address: Address): Hex {
    return pad(address as Hex, { size: 32 });
}

interface MaxFeeArgs {
    sourceChainKey: GatewayEvmChainKey;
    destChainKey: GatewayChainKey;
    valueUsdc: bigint;
    useForwarder: boolean;
    /** Multiplier applied as `numerator / denominator`. Default 120 / 100 = +20%. */
    bufferNumerator?: bigint;
    bufferDenominator?: bigint;
}

/**
 * maxFee must cover gas + transfer fee + (optional) forwarding fee. We add
 * a 20% buffer so a small price spike between intent creation and execution
 * does not invalidate the signature.
 */
export function calculateMaxFee({
    sourceChainKey,
    destChainKey,
    valueUsdc,
    useForwarder,
    bufferNumerator = 120n,
    bufferDenominator = 100n,
}: MaxFeeArgs): bigint {
    const sourceConfig = GATEWAY_EVM_CHAINS[sourceChainKey];
    if (!sourceConfig) throw new Error(`Unsupported source chain: ${sourceChainKey}`);

    const isSameChain = sourceChainKey === destChainKey;
    const transferFee = isSameChain
        ? 0n
        : (valueUsdc * GATEWAY_TRANSFER_FEE_NUM) / GATEWAY_TRANSFER_FEE_DEN;
    const forwarderFee = useForwarder ? GATEWAY_FORWARDER_FEE_USDC : 0n;
    const baseFee = sourceConfig.gasFeeUsdc + transferFee + forwarderFee;

    return (baseFee * bufferNumerator) / bufferDenominator;
}

interface BuildBurnIntentArgs {
    sourceChainKey: GatewayEvmChainKey;
    destChainKey: GatewayChainKey;
    /** USDC amount in human-readable form, e.g. "10.5". */
    amountUsdc: string;
    sourceDepositor: Address;
    destinationRecipient: Hex;     // bytes32-formatted address
    destinationToken: Hex;         // bytes32-formatted address
    destinationContract: Hex;      // bytes32-formatted Gateway Minter
    /** Block number on the SOURCE chain at sign time. */
    currentSourceBlock: bigint;
    useForwarder: boolean;
    /**
     * Number of source-chain blocks the burn intent stays valid for.
     * Defaults to 5,000,000 — enough that even a heavily-lagging RPC read
     * still produces a future-dated expiry on fast L2s like OP Sepolia
     * (≈2s/block ⇒ ~115 days of headroom). Burn intents are single-use so
     * a long ttl is safe.
     */
    blockTtl?: bigint;
    /** Defaults to the signer (sourceDepositor). */
    sourceSigner?: Address;
    /** When set, only this address may submit the mint on destination. */
    destinationCaller?: Hex;
}

export function buildBurnIntent({
    sourceChainKey,
    destChainKey,
    amountUsdc,
    sourceDepositor,
    destinationRecipient,
    destinationToken,
    destinationContract,
    currentSourceBlock,
    useForwarder,
    blockTtl = 5_000_000n,
    sourceSigner,
    destinationCaller,
}: BuildBurnIntentArgs): BurnIntent {
    const sourceConfig = GATEWAY_EVM_CHAINS[sourceChainKey];
    if (!sourceConfig) throw new Error(`Unsupported source chain: ${sourceChainKey}`);

    const value = parseUnits(amountUsdc, 6);
    const maxFee = calculateMaxFee({
        sourceChainKey,
        destChainKey,
        valueUsdc: value,
        useForwarder,
    });

    const salt = keccak256(
        encodePacked(['address', 'uint256', 'uint256'], [
            sourceDepositor,
            BigInt(Date.now()),
            BigInt(Math.floor(Math.random() * 2 ** 32)),
        ])
    );

    const spec: TransferSpec = {
        version: 1,
        sourceDomain: sourceConfig.domain,
        destinationDomain:
            destChainKey === 'solana'
                ? 5
                : (GATEWAY_EVM_CHAINS as any)[destChainKey]?.domain ?? sourceConfig.domain,
        sourceContract: addressToBytes32(GATEWAY_WALLET_EVM),
        destinationContract,
        sourceToken: addressToBytes32(sourceConfig.usdc),
        destinationToken,
        sourceDepositor: addressToBytes32(sourceDepositor),
        destinationRecipient,
        sourceSigner: addressToBytes32(sourceSigner ?? sourceDepositor),
        destinationCaller: destinationCaller ?? ZERO_BYTES32,
        value,
        salt,
        hookData: '0x',
    };

    return {
        maxBlockHeight: currentSourceBlock + blockTtl,
        maxFee,
        spec,
    };
}

/**
 * EVM-only convenience that builds a burn intent for a destination on
 * another EVM Gateway chain (sets destinationContract to the canonical EVM
 * Gateway Minter and bytes32-pads the destination USDC address).
 */
export function buildEvmToEvmBurnIntent(args: Omit<BuildBurnIntentArgs, 'destinationToken' | 'destinationContract'> & {
    destChainKey: GatewayEvmChainKey;
}): BurnIntent {
    const destConfig = GATEWAY_EVM_CHAINS[args.destChainKey];
    if (!destConfig) throw new Error(`Unsupported destination chain: ${args.destChainKey}`);

    return buildBurnIntent({
        ...args,
        destinationToken: addressToBytes32(destConfig.usdc),
        destinationContract: addressToBytes32(GATEWAY_MINTER_EVM),
    });
}

interface SignArgs {
    burnIntent: BurnIntent;
    sourceChainKey: GatewayEvmChainKey;
    /** Privy embedded wallet's EIP-1193 provider — we sign through it
     *  directly to avoid viem's account-matching path and to control the
     *  exact JSON shape sent to Privy's iframe. */
    provider: any;
    /** Wallet's canonical (checksum) address from `wallets[0].address`. */
    account: Address;
}

/**
 * Serialize bigints/booleans/Date to JSON-friendly primitives so the typed
 * data payload survives JSON.stringify and Privy's iframe parsing.
 * - bigint     -> base-10 string (EIP-712 spec allows uintN as numeric string)
 * - undefined  -> stripped (JSON drops them anyway, but be explicit)
 */
const normaliseForJson = (input: any): any => {
    if (typeof input === 'bigint') return input.toString();
    if (Array.isArray(input)) return input.map(normaliseForJson);
    if (input && typeof input === 'object') {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(input)) {
            if (v === undefined) continue;
            out[k] = normaliseForJson(v);
        }
        return out;
    }
    return input;
};

export async function signEvmBurnIntent({
    burnIntent,
    sourceChainKey,
    provider,
    account,
}: SignArgs): Promise<SignedBurnIntent> {
    const sourceConfig = GATEWAY_EVM_CHAINS[sourceChainKey];
    if (!sourceConfig) throw new Error(`Unsupported source chain: ${sourceChainKey}`);

    const typedData = {
        types: EIP712_TYPES,
        domain: {
            // Circle's GatewayWallet contract uses a stripped EIP-712 domain
            // (name + version only) so the same signature is valid across
            // every deployment / chain id.
            name: 'GatewayWallet',
            version: '1',
        },
        primaryType: 'BurnIntent',
        message: burnIntent,
    };

    const payload = JSON.stringify(normaliseForJson(typedData));

    const rawSignature = (await provider.request({
        method: 'eth_signTypedData_v4',
        params: [account, payload],
    })) as Hex;

    // Normalize Privy's signature to the canonical { r | s | v∈{27,28} }
    // 65-byte shape Circle's verifier (OpenZeppelin ECDSA) expects. Some
    // wallets return v∈{0,1} or strip 0x — handle both.
    const signature = normaliseEcdsaSignature(rawSignature);

    return { burnIntent, signature };
}

const normaliseEcdsaSignature = (raw: string): Hex => {
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    if (hex.length !== 130) {
        // Already canonical-ish or unknown layout — return as-is.
        return (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
    }
    const vByte = parseInt(hex.slice(128, 130), 16);
    const fixedV = vByte < 27 ? vByte + 27 : vByte;
    return `0x${hex.slice(0, 128)}${fixedV.toString(16).padStart(2, '0')}` as Hex;
};

/**
 * Wrap a Privy embedded EOA's EIP-1193 provider in a viem WalletClient bound
 * to the configured chain. Switches the wallet to the target chain first so
 * `signTypedData` carries the correct chainId in the EIP-712 domain.
 */
export async function getEvmWalletClient(
    sourceChainKey: GatewayEvmChainKey,
    eip1193Provider: any
): Promise<WalletClient> {
    const sourceConfig = GATEWAY_EVM_CHAINS[sourceChainKey];
    try {
        await eip1193Provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: sourceConfig.chainIdHex }],
        });
    } catch (err: any) {
        // Privy throws code 4902 OR a generic "Unsupported chainId" message
        // for chains not in its allowlist — both need add-then-retry.
        const code = err?.code;
        const message: string = err?.message || '';
        const isMissing = code === 4902 || /unsupported chain/i.test(message);
        if (!isMissing) throw err;
        try {
            await eip1193Provider.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: sourceConfig.chainIdHex,
                    chainName: sourceConfig.name,
                    nativeCurrency: {
                        name: sourceConfig.nativeSymbol,
                        symbol: sourceConfig.nativeSymbol,
                        decimals: sourceConfig.nativeDecimals,
                    },
                    rpcUrls: [sourceConfig.rpcUrl],
                    blockExplorerUrls: [sourceConfig.explorerUrl.replace(/\/tx\/?$/, '')],
                }],
            });
        } catch (addErr: any) {
            if (!/already added|exists/i.test(addErr?.message || '')) throw addErr;
        }
        await eip1193Provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: sourceConfig.chainIdHex }],
        });
    }

    return createWalletClient({
        chain: {
            id: sourceConfig.chainIdDecimal,
            name: sourceConfig.name,
            nativeCurrency: {
                name: sourceConfig.nativeSymbol,
                symbol: sourceConfig.nativeSymbol,
                decimals: sourceConfig.nativeDecimals,
            },
            rpcUrls: { default: { http: [sourceConfig.rpcUrl] } },
        } as any,
        transport: custom(eip1193Provider),
    });
}
