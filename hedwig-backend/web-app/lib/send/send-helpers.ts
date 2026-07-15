'use client';

import { encodeFunctionData, parseUnits } from 'viem';
import { PublicKey, Transaction } from '@solana/web3.js';
import { createTransferCheckedInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  EVM_TOKENS,
  resolvePaymentChain,
  getExplorerUrl as getEvmExplorer,
  getSolanaExplorerUrl,
  getSolanaCluster,
  type EvmPaymentChain,
} from '@/lib/payments/public-constants';
import {
  GATEWAY_EVM_CHAINS,
  GATEWAY_DOMAINS,
  GATEWAY_FORWARDER_FEE_USDC,
  GATEWAY_SOLANA_GAS_FEE_USDC,
  GATEWAY_TRANSFER_FEE_DEN,
  GATEWAY_TRANSFER_FEE_NUM,
  type GatewayChainKey,
  type GatewayEvmChainKey,
} from '@/lib/gateway/constants';
import {
  buildBurnIntent,
  signEvmBurnIntent,
} from '@/lib/gateway/burn-intent-evm';
import {
  buildSolanaBurnIntent,
  signSolanaBurnIntent,
} from '@/lib/gateway/burn-intent-solana';
import { buildDestinationFields } from '@/lib/gateway/recipients';

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

const USDC_SOL_MAINNET = new PublicKey('EPjFWdd5Au7B7WqSqqxS7ZkFvCPScoqB9Ko6z8bn8js');
const USDC_SOL_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

const EVM_NETWORKS: Record<string, {
  chainId: number; chainIdHex: string; chainName: string; rpcUrls: string[];
  blockExplorerUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number };
}> = {
  base: { chainId: 8453, chainIdHex: '0x2105', chainName: 'Base', rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'], nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 } },
  baseSepolia: { chainId: 84532, chainIdHex: '0x14a34', chainName: 'Base Sepolia', rpcUrls: ['https://sepolia.base.org'], blockExplorerUrls: ['https://sepolia.basescan.org'], nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 } },
  arbitrum: { chainId: 42161, chainIdHex: '0xa4b1', chainName: 'Arbitrum One', rpcUrls: ['https://arb1.arbitrum.io/rpc'], blockExplorerUrls: ['https://arbiscan.io'], nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 } },
  arbitrumSepolia: { chainId: 421614, chainIdHex: '0x66eee', chainName: 'Arbitrum Sepolia', rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'], blockExplorerUrls: ['https://sepolia.arbiscan.io'], nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 } },
  polygon: { chainId: 137, chainIdHex: '0x89', chainName: 'Polygon', rpcUrls: ['https://polygon-rpc.com'], blockExplorerUrls: ['https://polygonscan.com'], nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 } },
  polygonAmoy: { chainId: 80002, chainIdHex: '0x13882', chainName: 'Polygon Amoy', rpcUrls: ['https://rpc-amoy.polygon.technology'], blockExplorerUrls: ['https://amoy.polygonscan.com'], nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 } },
  optimism: { chainId: 10, chainIdHex: '0xa', chainName: 'OP Mainnet', rpcUrls: ['https://mainnet.optimism.io'], blockExplorerUrls: ['https://optimistic.etherscan.io'], nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 } },
  optimismSepolia: { chainId: 11155420, chainIdHex: '0xaa37dc', chainName: 'OP Sepolia', rpcUrls: ['https://sepolia.optimism.io'], blockExplorerUrls: ['https://sepolia-optimism.etherscan.io'], nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 } },
};

export type SendChain = 'solana' | 'base' | 'arbitrum' | 'polygon' | 'optimism' | 'stellar';

// ── Private helpers ──────────────────────────────────────────────────────────

async function switchEvmChain(provider: Eip1193, chainKey: EvmPaymentChain) {
  const net = EVM_NETWORKS[chainKey];
  if (!net) throw new Error(`Unsupported EVM chain: ${chainKey}`);
  const rawChainId = await provider.request({ method: 'eth_chainId' });
  const currentChainId = typeof rawChainId === 'string' ? parseInt(rawChainId, 16) : Number(rawChainId);
  if (currentChainId === net.chainId) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: net.chainIdHex }] });
  } catch (switchErr: unknown) {
    const code = typeof switchErr === 'object' && switchErr !== null && 'code' in switchErr ? (switchErr as any).code : undefined;
    if (code === 4902) {
      await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: net.chainIdHex, chainName: net.chainName, nativeCurrency: net.nativeCurrency, rpcUrls: net.rpcUrls, blockExplorerUrls: net.blockExplorerUrls }] });
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: net.chainIdHex }] });
    } else { throw switchErr; }
  }
}

// ── Direct send (no Gateway) ─────────────────────────────────────────────────

export async function sendSolanaUsdc({
  solanaWallet, recipient, amountUsdc,
}: { solanaWallet: any; recipient: string; amountUsdc: number }): Promise<string> {
  if (!solanaWallet) throw new Error('No Solana wallet connected.');
  const { Connection } = await import('@solana/web3.js');
  const { getSolanaRpcUrl } = await import('./solana-rpc');
  const isDevnet = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet';
  const cluster = isDevnet ? 'devnet' : 'mainnet-beta';
  const usdcMint = isDevnet ? USDC_SOL_DEVNET : USDC_SOL_MAINNET;
  const connection = new Connection(getSolanaRpcUrl());
  const senderPk = new PublicKey(solanaWallet.address);
  const recipientPk = new PublicKey(recipient);
  const tx = new Transaction();
  const senderAta = await getAssociatedTokenAddress(usdcMint, senderPk);
  const recipientAta = await getAssociatedTokenAddress(usdcMint, recipientPk);
  tx.add(createTransferCheckedInstruction(senderAta, usdcMint, recipientAta, senderPk, Math.round(amountUsdc * 1e6), 6, [], TOKEN_PROGRAM_ID));
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = senderPk;
  const serialized = tx.serialize({ requireAllSignatures: false });
  const { signedTransaction } = await solanaWallet.signTransaction({ transaction: serialized });
  return await connection.sendRawTransaction(signedTransaction);
}

export async function sendEvmUsdc({
  evmWallet, recipient, amountUsdc, chain,
}: { evmWallet: any; recipient: string; amountUsdc: number; chain: SendChain }): Promise<string> {
  if (!evmWallet) throw new Error('No EVM wallet connected.');
  if (chain === 'solana') throw new Error('Use sendSolanaUsdc for Solana.');
  const provider = await evmWallet.getEthereumProvider() as Eip1193;
  const evmChainKey = resolvePaymentChain(chain) as EvmPaymentChain;
  await switchEvmChain(provider, evmChainKey);
  const usdcAddress = EVM_TOKENS[evmChainKey]?.USDC;
  if (!usdcAddress) throw new Error(`USDC not configured for ${chain}`);
  const data = encodeFunctionData({
    abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
    functionName: 'transfer',
    args: [recipient as `0x${string}`, parseUnits(amountUsdc.toFixed(6), 6)],
  });
  const net = EVM_NETWORKS[evmChainKey];
  const hash = await provider.request({
    method: 'eth_sendTransaction',
    sponsor: true,
    params: [{ from: evmWallet.address, to: usdcAddress, data, chainId: net.chainIdHex }],
  } as any);
  return String(hash);
}

// ── Gateway send (Circle burn intent + Forwarder) ────────────────────────────

interface GatewayPerDomainBalance {
  domain: number;
  balance: string;
  pending?: string;
  depositor?: string;
}

function pickSourceChain(
  amountUsdcSubunits: bigint,
  perDomain: GatewayPerDomainBalance[],
): GatewayChainKey | null {
  const liquidity = new Map<number, bigint>();
  for (const entry of perDomain) {
    const existing = liquidity.get(entry.domain) ?? 0n;
    liquidity.set(entry.domain, existing + BigInt(entry.balance ?? '0'));
  }
  const preferenceOrder: GatewayChainKey[] = ['base', 'arbitrum', 'polygon', 'optimism', 'solana'];
  for (const key of preferenceOrder) {
    const domain = GATEWAY_DOMAINS[key];
    const balance = liquidity.get(domain) ?? 0n;
    if (balance >= amountUsdcSubunits) return key;
  }
  return null;
}

const backendApiBase = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || window.location.origin)
  : '';

function jsonStringify(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
}

async function submitViaBackend(
  entry: { burnIntent: any; signature: any; recipientSetupOptions?: any },
  token: string | null
): Promise<string> {
  const res = await fetch(`${backendApiBase}/api/gateway/transfer/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: jsonStringify({ burnIntent: entry.burnIntent, signature: entry.signature }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.error?.message || 'Gateway submit failed');
  return json.data?.transferId;
}

async function pollViaBackend(transferId: string, token: string | null): Promise<{ status: string; txHash?: string; error?: string }> {
  const res = await fetch(`${backendApiBase}/api/gateway/transfer/${encodeURIComponent(transferId)}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json?.error?.message || 'Gateway poll failed');
  return json.data;
}

export function formatGatewayUsdc(subunits: bigint): string {
  const whole = Number(subunits) / 1_000_000;
  if (!Number.isFinite(whole)) return '0';
  if (whole < 0.01) return whole.toFixed(4);
  return whole.toFixed(2);
}

export interface GatewaySendParams {
  evmWallets: any[];
  solanaWallets: any[];
  amountUsdc: number;
  recipientAddress: string;
  destChain: SendChain;
  perDomainBalances: GatewayPerDomainBalance[];
  accessToken?: string | null;
  onStatus?: (msg: string) => void;
}

export async function sendUsdcViaGateway({
  evmWallets, solanaWallets, amountUsdc, recipientAddress,
  destChain, perDomainBalances, accessToken, onStatus,
}: GatewaySendParams): Promise<string> {
  const valueSubunits = BigInt(Math.round(amountUsdc * 1e6));
  const destChainKey: GatewayChainKey = destChain === 'solana' ? 'solana' : (destChain as GatewayEvmChainKey);

  // 1. Pick source chain
  const sourceChainKey = pickSourceChain(valueSubunits, perDomainBalances);
  if (!sourceChainKey) {
    const totalGateway = perDomainBalances.reduce((s, d) => s + BigInt(d.balance ?? '0'), 0n);
    throw new Error(`Unified balance has ${formatGatewayUsdc(totalGateway)} USDC but no single chain has enough.`);
  }

  // 2. Build destination fields
  const dest = buildDestinationFields(destChainKey, recipientAddress);

  let signed;
  let sourceGasFeeUsdc: bigint;

  if (sourceChainKey === 'solana') {
    if (!solanaWallets?.length) throw new Error('No Solana wallet available.');
    const sWallet = solanaWallets[0];
    const sProvider = await sWallet.getProvider();
    if (!sProvider) throw new Error('Solana wallet provider not ready.');

    const { Connection } = await import('@solana/web3.js');
    const { getSolanaRpcUrl } = await import('./solana-rpc');
    const connection = new Connection(getSolanaRpcUrl());
    const slot = BigInt(await connection.getSlot('confirmed'));

    onStatus?.('Signing burn intent on Solana…');
    const burnIntent = buildSolanaBurnIntent({
      destChainKey, amountUsdc: amountUsdc.toFixed(6), sourceDepositor: sWallet.address,
      destinationRecipient: dest.destinationRecipient,
      destinationToken: dest.destinationToken,
      destinationContract: dest.destinationContract,
      currentSlot: slot, useForwarder: true,
    });

    const bs58Module = await import('bs58');
    signed = await signSolanaBurnIntent({
      burnIntent,
      bs58Module,
      signMessage: async (payload: Uint8Array) => {
        const messageB58 = bs58Module.default.encode(payload);
        const result = await sProvider.request({ method: 'signMessage', params: { message: messageB58 } });
        return (result as any).signature as string;
      },
    });
    sourceGasFeeUsdc = GATEWAY_SOLANA_GAS_FEE_USDC;
  } else {
    if (!evmWallets?.length) throw new Error('No EVM wallet available.');
    const wallet = evmWallets.find((w: any) => w.walletClientType === 'privy') ?? evmWallets[0];
    const provider = await wallet.getEthereumProvider();
    if (!provider) throw new Error('EVM wallet provider not ready.');

    const sourceConfig = GATEWAY_EVM_CHAINS[sourceChainKey];
    sourceGasFeeUsdc = sourceConfig.gasFeeUsdc;

    onStatus?.(`Signing burn intent on ${sourceConfig.name}…`);

    // Get block number via JSON-RPC instead of ethers
    const blockRes = await fetch(sourceConfig.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
    });
    const blockJson = await blockRes.json();
    const currentSourceBlock = BigInt(parseInt(blockJson.result, 16));

    const fromAddress = (wallet?.address as `0x${string}`) ??
      (((await provider.request({ method: 'eth_accounts' })) as string[])[0] as `0x${string}`);
    if (!fromAddress) throw new Error('No wallet address found');

    const burnIntent = buildBurnIntent({
      sourceChainKey, destChainKey, amountUsdc: amountUsdc.toFixed(6),
      sourceDepositor: fromAddress,
      destinationRecipient: dest.destinationRecipient,
      destinationToken: dest.destinationToken,
      destinationContract: dest.destinationContract,
      currentSourceBlock, useForwarder: true,
    });

    signed = await signEvmBurnIntent({ burnIntent, sourceChainKey, provider, account: fromAddress });
  }

  // 3. Fee preview
  const totalFee = sourceGasFeeUsdc +
    (sourceChainKey !== destChainKey ? (valueSubunits * GATEWAY_TRANSFER_FEE_NUM) / GATEWAY_TRANSFER_FEE_DEN : 0n) +
    GATEWAY_FORWARDER_FEE_USDC;

  onStatus?.(`Gateway fee: ~$${formatGatewayUsdc(totalFee)} USDC`);

  // 4. Submit via backend proxy
  onStatus?.('Submitting to Circle Gateway…');
  const recipientSetupOptions = dest.recipientOwnerAddressBytes32
    ? { includeRecipientSetup: true, recipientOwnerAddress: dest.recipientOwnerAddressBytes32 }
    : undefined;

  const transferId = await submitViaBackend(
    { ...signed, ...(recipientSetupOptions ? { recipientSetupOptions } : {}) },
    accessToken ?? null
  );

  // 5. Poll via backend proxy
  onStatus?.('Waiting for destination chain confirmation…');
  const deadline = Date.now() + 45_000;
  const terminal = new Set(['success', 'completed', 'failed', 'cancelled', 'expired']);
  while (Date.now() < deadline) {
    const pollResult = await pollViaBackend(transferId, accessToken ?? null);
    if (pollResult.status && terminal.has(pollResult.status)) {
      if (pollResult.status === 'failed' || pollResult.status === 'expired') {
        throw new Error(`Gateway transfer failed: ${pollResult.error || pollResult.status}`);
      }
      return pollResult.txHash || transferId;
    }
    await new Promise(r => setTimeout(r, 4_000));
  }

  // Timeout — return transfer ID as tx hash
  return transferId;
}

// ── Explorer URLs ────────────────────────────────────────────────────────────

export function getExplorerUrl(chainType: 'evm' | 'solana', hash: string, chainKey?: string): string {
  if (chainType === 'solana') {
    const cluster = getSolanaCluster();
    return getSolanaExplorerUrl(cluster, hash);
  }
  const evmKey = (chainKey ? resolvePaymentChain(chainKey as any) : resolvePaymentChain('base')) as EvmPaymentChain;
  return getEvmExplorer(evmKey, hash);
}

export const CHAIN_LABELS: Record<string, string> = {
  solana: 'Solana', base: 'Base', arbitrum: 'Arbitrum',
  polygon: 'Polygon', optimism: 'Optimism', stellar: 'Stellar',
};
