// Submit a Gateway Wallet deposit (approve + deposit) on a given EVM chain.
// Used both by the manual top-up screen and the post-onramp auto-deposit
// hook so the on-chain dance lives in one place.

import { ethers } from 'ethers';
import { GATEWAY_EVM_CHAINS, GATEWAY_WALLET_EVM, type GatewayEvmChainKey } from './constants';

const ERC20_APPROVE_ABI = [
    {
        type: 'function',
        name: 'approve',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
] as const;

const GATEWAY_WALLET_DEPOSIT_ABI = [
    {
        type: 'function',
        name: 'deposit',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [],
    },
] as const;

const APPROVE_GAS_FALLBACK = 90_000n;
const DEPOSIT_GAS_FALLBACK = 220_000n;
const GAS_BUFFER_NUMERATOR = 125n;
const GAS_BUFFER_DENOMINATOR = 100n;
const FEE_BUFFER_NUMERATOR = 115n;
const FEE_BUFFER_DENOMINATOR = 100n;
const POLYGON_PRIORITY_FEE_FLOOR_WEI = 30_000_000_000n;
const depositLocks = new Map<string, Promise<DepositResult>>();

export interface DepositToGatewayArgs {
    chainKey: GatewayEvmChainKey;
    /** The Privy embedded EOA's EIP-1193 provider. */
    eip1193Provider: any;
    /** USDC subunits (6 decimals). */
    amountSubunits: bigint;
    onStatus?: (label: string) => void;
}

export interface DepositResult {
    approveTxHash: string;
    depositTxHash: string;
}

type RpcTx = {
    from: string;
    to: string;
    data: string;
    value: string;
    chainId: string;
};

const toHex = (value: bigint): string => `0x${value.toString(16)}`;

const withBuffer = (value: bigint, numerator: bigint, denominator: bigint): bigint =>
    (value * numerator) / denominator;

const getGasLimit = async (
    rpc: ethers.JsonRpcProvider,
    provider: any,
    tx: RpcTx,
    fallback: bigint,
): Promise<bigint> => {
    try {
        const estimate = await provider.request({
            method: 'eth_estimateGas',
            params: [tx],
        });
        const gas = withBuffer(BigInt(estimate), GAS_BUFFER_NUMERATOR, GAS_BUFFER_DENOMINATOR);
        return gas > fallback ? gas : fallback;
    } catch {
        try {
            const estimate = await rpc.estimateGas({
                from: tx.from,
                to: tx.to,
                data: tx.data,
                value: 0n,
            });
            const gas = withBuffer(estimate, GAS_BUFFER_NUMERATOR, GAS_BUFFER_DENOMINATOR);
            return gas > fallback ? gas : fallback;
        } catch {
            return fallback;
        }
    }
};

const getFeeParams = async (
    rpc: ethers.JsonRpcProvider,
    chainKey: GatewayEvmChainKey,
): Promise<Record<string, string>> => {
    const feeData = await rpc.getFeeData();
    const feeBuffer = (value: bigint) => withBuffer(value, FEE_BUFFER_NUMERATOR, FEE_BUFFER_DENOMINATOR);

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        const maxPriorityFeePerGas = chainKey === 'polygon' && feeData.maxPriorityFeePerGas < POLYGON_PRIORITY_FEE_FLOOR_WEI
            ? POLYGON_PRIORITY_FEE_FLOOR_WEI
            : feeData.maxPriorityFeePerGas;
        const maxFeePerGas = feeData.maxFeePerGas < maxPriorityFeePerGas
            ? maxPriorityFeePerGas * 2n
            : feeData.maxFeePerGas;

        return {
            maxFeePerGas: toHex(feeBuffer(maxFeePerGas)),
            maxPriorityFeePerGas: toHex(feeBuffer(maxPriorityFeePerGas)),
        };
    }

    if (feeData.gasPrice) {
        return { gasPrice: toHex(feeBuffer(feeData.gasPrice)) };
    }

    return {};
};

const sendTransaction = async (
    provider: any,
    tx: RpcTx,
    gas: bigint,
    _feeParams: Record<string, string>,
    nonce?: number,
): Promise<string> => {
    // Use standard EIP-1193 `eth_sendTransaction`; do not sign and broadcast
    // raw transactions from app code. Also omit `type` because Privy's
    // transaction schema only accepts numeric literal types and rejects string
    // aliases. Do not pass explicit fee fields here; on L2s a conservative
    // maxFeePerGas can make the wallet reserve much more ETH than the tx will
    // actually spend. Privy's converter expects camel-case gas fields.
    return await provider.request({
        method: 'eth_sendTransaction',
        params: [{
            ...tx,
            gasLimit: toHex(gas),
            ...(typeof nonce === 'number' ? { nonce: toHex(BigInt(nonce)) } : {}),
        }],
    }) as string;
};

const getErrorMessage = (err: unknown): string => {
    if (!err) return '';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message;
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
};

const isAlreadyKnownError = (err: unknown): boolean =>
    getErrorMessage(err).toLowerCase().includes('already known');

const isNonceTooLowError = (err: unknown): boolean => {
    const m = getErrorMessage(err).toLowerCase();
    return m.includes('nonce too low') || m.includes('nonce_too_low');
};

const extractNextNonce = (err: unknown): number | null => {
    const m = getErrorMessage(err);
    const match = m.match(/next\s*nonce[:\s]+(\d+)/i);
    return match ? Number(match[1]) : null;
};

const sendWithNonceRetry = async (
    provider: any,
    tx: RpcTx,
    gas: bigint,
    feeParams: Record<string, string>,
    rpc: ethers.JsonRpcProvider,
    account: string,
): Promise<string> => {
    let nonce = await rpc.getTransactionCount(account, 'pending');
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await sendTransaction(provider, tx, gas, feeParams, nonce);
        } catch (err) {
            if (isAlreadyKnownError(err)) throw new GatewayDepositPendingError();
            if (!isNonceTooLowError(err)) throw err;
            const hinted = extractNextNonce(err);
            const fresh = await rpc.getTransactionCount(account, 'pending');
            nonce = Math.max(hinted ?? 0, fresh, nonce + 1);
        }
    }
    throw new Error('Gateway deposit: nonce retries exhausted');
};

class GatewayDepositPendingError extends Error {
    constructor() {
        super('A Gateway deposit transaction is already pending. Please wait a moment for the wallet to finish broadcasting it, then refresh your balance.');
        this.name = 'GatewayDepositPendingError';
    }
}

/**
 * Approve the Gateway Wallet to spend USDC and then call deposit. Returns
 * both transaction hashes. Throws if the EOA lacks native gas — the caller
 * is expected to surface a friendly message in that case.
 */
export async function depositToGateway({
    chainKey,
    eip1193Provider,
    amountSubunits,
    onStatus,
}: DepositToGatewayArgs): Promise<DepositResult> {
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
                nativeCurrency: {
                    name: config.nativeSymbol,
                    symbol: config.nativeSymbol,
                    decimals: config.nativeDecimals,
                },
                rpcUrls: [config.rpcUrl],
                blockExplorerUrls: [config.explorerUrl.replace(/\/tx\/?$/, '')],
            }],
        });
        await eip1193Provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: config.chainIdHex }],
        });
    }

    const accounts = await eip1193Provider.request({ method: 'eth_accounts' }) as string[];
    const account = (accounts[0] || '').toLowerCase();
    if (!account) throw new Error('No wallet account found');

    const lockKey = `${config.chainIdHex}:${account}:${amountSubunits.toString()}`;
    const existingDeposit = depositLocks.get(lockKey);
    if (existingDeposit) {
        onStatus?.('Gateway deposit already pending...');
        return existingDeposit;
    }

    const depositPromise = runGatewayDeposit({
        chainKey,
        eip1193Provider,
        amountSubunits,
        account,
        onStatus,
    }).finally(() => {
        depositLocks.delete(lockKey);
    });

    depositLocks.set(lockKey, depositPromise);
    return depositPromise;
}

class InsufficientNativeGasError extends Error {
    constructor(chainName: string, nativeSymbol: string) {
        super(`Not enough ${nativeSymbol} on ${chainName} to deposit USDC into the unified balance. Make sure you have a small amount of ${nativeSymbol} on ${chainName}, then try again.`);
        this.name = 'InsufficientNativeGasError';
    }
}

const maxFeePerGasFromParams = (feeParams: Record<string, string>): bigint | null => {
    const raw = feeParams.maxFeePerGas || feeParams.gasPrice;
    if (!raw) return null;
    try {
        return BigInt(raw);
    } catch {
        return null;
    }
};

const assertSufficientNativeGas = async (
    rpc: ethers.JsonRpcProvider,
    account: string,
    config: (typeof GATEWAY_EVM_CHAINS)[GatewayEvmChainKey],
    approveGas: bigint,
    approveFeeParams: Record<string, string>,
    depositGas: bigint,
    depositFeeParams: Record<string, string>,
) => {
    const approveFee = maxFeePerGasFromParams(approveFeeParams);
    const depositFee = maxFeePerGasFromParams(depositFeeParams);
    if (approveFee === null || depositFee === null) return;

    const required = approveGas * approveFee + depositGas * depositFee;
    const nativeBalance = await rpc.getBalance(account);
    if (nativeBalance < required) {
        throw new InsufficientNativeGasError(config.name, config.nativeSymbol);
    }
};

async function runGatewayDeposit({
    chainKey,
    eip1193Provider,
    amountSubunits,
    account,
    onStatus,
}: DepositToGatewayArgs & { account: string }): Promise<DepositResult> {
    const config = GATEWAY_EVM_CHAINS[chainKey];
    const rpc = new ethers.JsonRpcProvider(config.rpcUrl);
    const erc20 = new ethers.Interface(ERC20_APPROVE_ABI as any);
    const gatewayWallet = new ethers.Interface(GATEWAY_WALLET_DEPOSIT_ABI as any);

    onStatus?.('Approving Gateway Wallet...');
    const approveTx: RpcTx = {
        from: account,
        to: config.usdc,
        data: erc20.encodeFunctionData('approve', [GATEWAY_WALLET_EVM, amountSubunits]),
        value: '0x0',
        chainId: config.chainIdHex,
    };
    const approveGas = await getGasLimit(rpc, eip1193Provider, approveTx, APPROVE_GAS_FALLBACK);
    const approveFeeParams = await getFeeParams(rpc, chainKey);

    const depositTx: RpcTx = {
        from: account,
        to: GATEWAY_WALLET_EVM,
        data: gatewayWallet.encodeFunctionData('deposit', [config.usdc, amountSubunits]),
        value: '0x0',
        chainId: config.chainIdHex,
    };
    const depositGas = await getGasLimit(rpc, eip1193Provider, depositTx, DEPOSIT_GAS_FALLBACK);
    const depositFeeParams = await getFeeParams(rpc, chainKey);

    // Do not hard-block on our own gas check. Embedded-wallet providers can
    // report conservative max-fee requirements, while L2 deposits often settle
    // for cents. Let `eth_sendTransaction` perform the authoritative wallet/RPC
    // validation so users with enough native gas are not incorrectly blocked.
    assertSufficientNativeGas(
        rpc,
        account,
        config,
        approveGas,
        approveFeeParams,
        depositGas,
        depositFeeParams
    ).catch((err: any) => {
        if (err instanceof InsufficientNativeGasError) {
            console.log('[GatewayDeposit] Native gas precheck warning:', err.message);
            return;
        }
        console.log('[GatewayDeposit] Native gas precheck skipped:', getErrorMessage(err));
    });

    const approveTxHash = await sendWithNonceRetry(eip1193Provider, approveTx, approveGas, approveFeeParams, rpc, account);
    await rpc.waitForTransaction(approveTxHash);

    onStatus?.('Depositing into Gateway...');
    const depositTxHash = await sendWithNonceRetry(eip1193Provider, depositTx, depositGas, depositFeeParams, rpc, account);
    await rpc.waitForTransaction(depositTxHash);

    return { approveTxHash, depositTxHash };
}
