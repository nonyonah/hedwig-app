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

export function addressToBytes32(address: Address): Hex {
  return pad(address as Hex, { size: 32 });
}

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

interface MaxFeeArgs {
  sourceChainKey: GatewayEvmChainKey;
  destChainKey: GatewayChainKey;
  valueUsdc: bigint;
  useForwarder: boolean;
  bufferNumerator?: bigint;
  bufferDenominator?: bigint;
}

export function calculateMaxFee({
  sourceChainKey, destChainKey, valueUsdc, useForwarder,
  bufferNumerator = 120n, bufferDenominator = 100n,
}: MaxFeeArgs): bigint {
  const sourceConfig = GATEWAY_EVM_CHAINS[sourceChainKey];
  if (!sourceConfig) throw new Error(`Unsupported source chain: ${sourceChainKey}`);
  const isSameChain = sourceChainKey === destChainKey;
  const transferFee = isSameChain ? 0n : (valueUsdc * GATEWAY_TRANSFER_FEE_NUM) / GATEWAY_TRANSFER_FEE_DEN;
  const forwarderFee = useForwarder ? GATEWAY_FORWARDER_FEE_USDC : 0n;
  const baseFee = sourceConfig.gasFeeUsdc + transferFee + forwarderFee;
  return (baseFee * bufferNumerator) / bufferDenominator;
}

interface BuildBurnIntentArgs {
  sourceChainKey: GatewayEvmChainKey;
  destChainKey: GatewayChainKey;
  amountUsdc: string;
  sourceDepositor: Address;
  destinationRecipient: Hex;
  destinationToken: Hex;
  destinationContract: Hex;
  currentSourceBlock: bigint;
  useForwarder: boolean;
  blockTtl?: bigint;
  sourceSigner?: Address;
  destinationCaller?: Hex;
}

export function buildBurnIntent({
  sourceChainKey, destChainKey, amountUsdc, sourceDepositor,
  destinationRecipient, destinationToken, destinationContract,
  currentSourceBlock, useForwarder, blockTtl = 5_000_000n,
  sourceSigner, destinationCaller,
}: BuildBurnIntentArgs): BurnIntent {
  const sourceConfig = GATEWAY_EVM_CHAINS[sourceChainKey];
  if (!sourceConfig) throw new Error(`Unsupported source chain: ${sourceChainKey}`);

  const value = parseUnits(amountUsdc, 6);
  const maxFee = calculateMaxFee({ sourceChainKey, destChainKey, valueUsdc: value, useForwarder });

  const salt = keccak256(
    encodePacked(['address', 'uint256', 'uint256'], [
      sourceDepositor, BigInt(Date.now()), BigInt(Math.floor(Math.random() * 2 ** 32)),
    ])
  );

  const spec: TransferSpec = {
    version: 1,
    sourceDomain: sourceConfig.domain,
    destinationDomain: destChainKey === 'solana' ? 5 : (GATEWAY_EVM_CHAINS as any)[destChainKey]?.domain ?? sourceConfig.domain,
    sourceContract: addressToBytes32(GATEWAY_WALLET_EVM),
    destinationContract,
    sourceToken: addressToBytes32(sourceConfig.usdc),
    destinationToken,
    sourceDepositor: addressToBytes32(sourceDepositor),
    destinationRecipient,
    sourceSigner: addressToBytes32(sourceSigner ?? sourceDepositor),
    destinationCaller: destinationCaller ?? ZERO_BYTES32,
    value, salt, hookData: '0x',
  };

  return { maxBlockHeight: currentSourceBlock + blockTtl, maxFee, spec };
}

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

const normaliseEcdsaSignature = (raw: string): Hex => {
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (hex.length !== 130) return (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  const vByte = parseInt(hex.slice(128, 130), 16);
  const fixedV = vByte < 27 ? vByte + 27 : vByte;
  return `0x${hex.slice(0, 128)}${fixedV.toString(16).padStart(2, '0')}` as Hex;
};

export async function signEvmBurnIntent({
  burnIntent, sourceChainKey, provider, account,
}: {
  burnIntent: BurnIntent;
  sourceChainKey: GatewayEvmChainKey;
  provider: any;
  account: Address;
}): Promise<SignedBurnIntent> {
  if (!GATEWAY_EVM_CHAINS[sourceChainKey]) throw new Error(`Unsupported source chain: ${sourceChainKey}`);

  const typedData = {
    types: EIP712_TYPES,
    domain: { name: 'GatewayWallet', version: '1' },
    primaryType: 'BurnIntent' as const,
    message: burnIntent,
  };

  const payload = JSON.stringify(normaliseForJson(typedData));
  const rawSignature = (await provider.request({
    method: 'eth_signTypedData_v4',
    params: [account, payload],
  })) as Hex;

  return { burnIntent, signature: normaliseEcdsaSignature(rawSignature) };
}

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
          nativeCurrency: { name: sourceConfig.nativeSymbol, symbol: sourceConfig.nativeSymbol, decimals: sourceConfig.nativeDecimals },
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
      nativeCurrency: { name: sourceConfig.nativeSymbol, symbol: sourceConfig.nativeSymbol, decimals: sourceConfig.nativeDecimals },
      rpcUrls: { default: { http: [sourceConfig.rpcUrl] } },
    } as any,
    transport: custom(eip1193Provider),
  });
}
