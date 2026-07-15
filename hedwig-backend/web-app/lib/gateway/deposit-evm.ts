'use client';

import { encodeFunctionData, type Address } from 'viem';
import { GATEWAY_EVM_CHAINS, GATEWAY_WALLET_EVM, type GatewayEvmChainKey } from './constants';

const ERC20_APPROVE_ABI = [
  {
    type: 'function' as const,
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' as const },
      { name: 'amount', type: 'uint256' as const },
    ],
    outputs: [{ type: 'bool' as const }],
  },
];

const GATEWAY_DEPOSIT_ABI = [
  {
    type: 'function' as const,
    name: 'deposit',
    inputs: [
      { name: 'token', type: 'address' as const },
      { name: 'amount', type: 'uint256' as const },
    ],
    outputs: [],
  },
];

type RpcTx = {
  from: string;
  to: Address;
  data: `0x${string}`;
  value: string;
  chainId: string;
};

export interface DepositResult {
  approveTxHash: string;
  depositTxHash: string;
}

function toHex(value: bigint): `0x${string}` {
  return `0x${value.toString(16)}`;
}

async function waitForTx(
  provider: any,
  hash: string,
  retries = 30,
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    const receipt = await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [hash],
    });
    if (receipt?.blockNumber) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export async function depositToGateway({
  chainKey,
  eip1193Provider,
  amountSubunits,
  onStatus,
}: {
  chainKey: GatewayEvmChainKey;
  eip1193Provider: any;
  amountSubunits: bigint;
  onStatus?: (label: string) => void;
}): Promise<DepositResult> {
  const config = GATEWAY_EVM_CHAINS[chainKey];
  if (!config) throw new Error(`Unsupported chain: ${chainKey}`);

  onStatus?.(`Switching to ${config.name}...`);
  try {
    await eip1193Provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: config.chainIdHex }],
    });
  } catch (err: any) {
    if (err?.code !== 4902) throw err;
    await eip1193Provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: config.chainIdHex,
        chainName: config.name,
        rpcUrls: [config.rpcUrl],
        nativeCurrency: { name: config.nativeSymbol, symbol: config.nativeSymbol, decimals: 18 },
        blockExplorerUrls: [config.explorerUrl.replace(/\/tx\/?$/, '')],
      }],
    });
    await eip1193Provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: config.chainIdHex }],
    });
  }

  const accounts: string[] = await eip1193Provider.request({ method: 'eth_accounts' });
  const account = (accounts[0] || '').toLowerCase();
  if (!account) throw new Error('No wallet account found');

  const baseTx: RpcTx = {
    from: account,
    to: config.usdc as Address,
    data: '0x',
    value: '0x0',
    chainId: config.chainIdHex,
  };

  onStatus?.('Approving Gateway Wallet...');
  const approveData = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [GATEWAY_WALLET_EVM, amountSubunits],
  });

  const approveHash: string = await eip1193Provider.request({
    method: 'eth_sendTransaction',
    sponsor: true,
    params: [{ ...baseTx, to: config.usdc, data: approveData }],
  } as any);
  await waitForTx(eip1193Provider, approveHash);

  onStatus?.('Depositing into Gateway...');
  const depositData = encodeFunctionData({
    abi: GATEWAY_DEPOSIT_ABI,
    functionName: 'deposit',
    args: [config.usdc, amountSubunits],
  });

  const depositHash: string = await eip1193Provider.request({
    method: 'eth_sendTransaction',
    sponsor: true,
    params: [{ ...baseTx, to: GATEWAY_WALLET_EVM, data: depositData }],
  } as any);
  await waitForTx(eip1193Provider, depositHash);

  return { approveTxHash: approveHash, depositTxHash: depositHash };
}
