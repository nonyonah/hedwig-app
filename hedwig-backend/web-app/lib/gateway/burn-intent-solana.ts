import { PublicKey } from '@solana/web3.js';
import {
  GATEWAY_DOMAINS,
  GATEWAY_EVM_CHAINS,
  GATEWAY_FORWARDER_FEE_USDC,
  GATEWAY_MINTER_EVM,
  GATEWAY_SOLANA_GAS_FEE_USDC,
  GATEWAY_SOLANA_PROGRAMS,
  GATEWAY_SOLANA_USDC_MINT_FOR_MODE,
  GATEWAY_TRANSFER_FEE_DEN,
  GATEWAY_TRANSFER_FEE_NUM,
  type GatewayChainKey,
  type GatewayEvmChainKey,
} from './constants';
import { addressToBytes32 } from './burn-intent-evm';
import type { BurnIntent, SignedBurnIntent, TransferSpec } from './types';
import type { Hex } from 'viem';

const BURN_INTENT_MAGIC = 0x070afbc2;
const TRANSFER_SPEC_MAGIC = 0xca85def7;
const SOLANA_SIGNATURE_PREFIX = new Uint8Array(16);
SOLANA_SIGNATURE_PREFIX[0] = 0xff;
const ZERO_BYTES32: Hex = `0x${'00'.repeat(32)}` as Hex;

const writeU32Be = (buf: Uint8Array, offset: number, value: number): number => {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
  return offset + 4;
};

const writeU256Be = (buf: Uint8Array, offset: number, value: bigint): number => {
  let remaining = value;
  for (let i = 31; i >= 0; i--) { buf[offset + i] = Number(remaining & 0xffn); remaining >>= 8n; }
  return offset + 32;
};

const writeBytes32 = (buf: Uint8Array, offset: number, raw: Uint8Array): number => {
  buf.set(raw, offset);
  return offset + 32;
};

const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return out;
};

const bytesToHex = (bytes: Uint8Array): Hex => {
  let hex = '0x';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex as Hex;
};

const pubkeyToBytes32 = (pubkey: string): Uint8Array => new PublicKey(pubkey).toBytes();
const hexBytes32 = (value: Hex): Uint8Array => { const b = hexToBytes(value); if (b.length !== 32) throw new Error('expected bytes32'); return b; };

export function calculateSolanaMaxFee({
  destChainKey, valueUsdc, useForwarder,
  bufferNumerator = 120n, bufferDenominator = 100n,
}: {
  destChainKey: GatewayChainKey; valueUsdc: bigint; useForwarder: boolean;
  bufferNumerator?: bigint; bufferDenominator?: bigint;
}): bigint {
  const isSameChain = destChainKey === 'solana';
  const transferFee = isSameChain ? 0n : (valueUsdc * GATEWAY_TRANSFER_FEE_NUM) / GATEWAY_TRANSFER_FEE_DEN;
  const forwarderFee = useForwarder ? GATEWAY_FORWARDER_FEE_USDC : 0n;
  const baseFee = GATEWAY_SOLANA_GAS_FEE_USDC + transferFee + forwarderFee;
  return (baseFee * bufferNumerator) / bufferDenominator;
}

const parsePosUsdc = (amount: string): bigint => {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`Invalid USDC amount: ${amount}`);
  const [intPart, fracPart = ''] = trimmed.split('.');
  const padded = (fracPart + '000000').slice(0, 6);
  return BigInt(intPart) * 1_000_000n + BigInt(padded);
};

export function buildSolanaBurnIntent({
  destChainKey, amountUsdc, sourceDepositor, destinationRecipient,
  destinationToken, destinationContract, currentSlot, useForwarder,
  slotTtl = 10_000_000n, sourceSignerPubkey, destinationCaller,
}: {
  destChainKey: GatewayChainKey;
  amountUsdc: string; sourceDepositor: string;
  destinationRecipient: Hex; destinationToken: Hex; destinationContract: Hex;
  currentSlot: bigint; useForwarder: boolean; slotTtl?: bigint;
  sourceSignerPubkey?: string; destinationCaller?: Hex;
}): BurnIntent {
  const value = parsePosUsdc(amountUsdc);
  const maxFee = calculateSolanaMaxFee({ destChainKey, valueUsdc: value, useForwarder });

  const saltBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) saltBytes[i] = Math.floor(Math.random() * 256);

  const spec: TransferSpec = {
    version: 1,
    sourceDomain: GATEWAY_DOMAINS.solana,
    destinationDomain: GATEWAY_DOMAINS[destChainKey],
    sourceContract: bytesToHex(pubkeyToBytes32(GATEWAY_SOLANA_PROGRAMS.walletProgram)),
    destinationContract,
    sourceToken: bytesToHex(pubkeyToBytes32(GATEWAY_SOLANA_USDC_MINT_FOR_MODE)),
    destinationToken,
    sourceDepositor: bytesToHex(pubkeyToBytes32(sourceDepositor)),
    destinationRecipient,
    sourceSigner: bytesToHex(pubkeyToBytes32(sourceSignerPubkey ?? sourceDepositor)),
    destinationCaller: destinationCaller ?? ZERO_BYTES32,
    value, salt: bytesToHex(saltBytes), hookData: '0x',
  };

  return { maxBlockHeight: currentSlot + slotTtl, maxFee, spec };
}

export function buildSolanaToEvmBurnIntent(args: Omit<{
  destChainKey: GatewayChainKey;
  amountUsdc: string; sourceDepositor: string;
  destinationRecipient: Hex; destinationToken: Hex; destinationContract: Hex;
  currentSlot: bigint; useForwarder: boolean; slotTtl?: bigint;
  sourceSignerPubkey?: string; destinationCaller?: Hex;
}, 'destinationToken' | 'destinationContract'> & { destChainKey: GatewayEvmChainKey }): BurnIntent {
  const destConfig = GATEWAY_EVM_CHAINS[args.destChainKey];
  return buildSolanaBurnIntent({
    ...args,
    destinationToken: addressToBytes32(destConfig.usdc),
    destinationContract: addressToBytes32(GATEWAY_MINTER_EVM),
  });
}

export function encodeSolanaBurnIntent(intent: BurnIntent): Uint8Array {
  const spec = intent.spec;
  const hookData = hexToBytes(spec.hookData);
  const SPEC_FIXED_LEN = 4 + 4 + 4 + 4 + 32 * 8 + 32 + 32 + 4;
  const specLen = SPEC_FIXED_LEN + hookData.length;
  const totalLen = 4 + 32 + 32 + 4 + specLen;

  const buf = new Uint8Array(totalLen);
  let o = 0;
  o = writeU32Be(buf, o, BURN_INTENT_MAGIC);
  o = writeU256Be(buf, o, intent.maxBlockHeight);
  o = writeU256Be(buf, o, intent.maxFee);
  o = writeU32Be(buf, o, specLen);
  o = writeU32Be(buf, o, TRANSFER_SPEC_MAGIC);
  o = writeU32Be(buf, o, spec.version);
  o = writeU32Be(buf, o, spec.sourceDomain);
  o = writeU32Be(buf, o, spec.destinationDomain);
  o = writeBytes32(buf, o, hexBytes32(spec.sourceContract));
  o = writeBytes32(buf, o, hexBytes32(spec.destinationContract));
  o = writeBytes32(buf, o, hexBytes32(spec.sourceToken));
  o = writeBytes32(buf, o, hexBytes32(spec.destinationToken));
  o = writeBytes32(buf, o, hexBytes32(spec.sourceDepositor));
  o = writeBytes32(buf, o, hexBytes32(spec.destinationRecipient));
  o = writeBytes32(buf, o, hexBytes32(spec.sourceSigner));
  o = writeBytes32(buf, o, hexBytes32(spec.destinationCaller));
  o = writeU256Be(buf, o, spec.value);
  o = writeBytes32(buf, o, hexBytes32(spec.salt));
  o = writeU32Be(buf, o, hookData.length);
  if (hookData.length > 0) { buf.set(hookData, o); o += hookData.length; }
  return buf;
}

export function solanaSignatureToHex(signature: Uint8Array | string, bs58Module?: any): Hex {
  if (typeof signature === 'string') {
    if (signature.startsWith('0x')) return signature as Hex;
    if (!bs58Module) throw new Error('bs58 not available for Solana signature decoding');
    const bytes = bs58Module.decode(signature);
    return bytesToHex(bytes);
  }
  return bytesToHex(signature);
}

export async function signSolanaBurnIntent({
  burnIntent, signMessage, bs58Module,
}: {
  burnIntent: BurnIntent;
  signMessage: (message: Uint8Array) => Promise<Uint8Array | string>;
  bs58Module?: any;
}): Promise<SignedBurnIntent> {
  const encoded = encodeSolanaBurnIntent(burnIntent);
  const prefixed = new Uint8Array(SOLANA_SIGNATURE_PREFIX.length + encoded.length);
  prefixed.set(SOLANA_SIGNATURE_PREFIX, 0);
  prefixed.set(encoded, SOLANA_SIGNATURE_PREFIX.length);
  const signature = await signMessage(prefixed);
  return { burnIntent, signature: solanaSignatureToHex(signature, bs58Module) };
}
