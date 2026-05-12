import { Router, Request, Response } from 'express';
import { authenticate, getPrivyAuthClient } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { supabase } from '../lib/supabase';
import BlockradarService from '../services/blockradar';
import { createLogger } from '../utils/logger';
import { PrivyClient } from '@privy-io/node';
import { createPublicClient, http, formatUnits, type Address } from 'viem';
import {
    base,
    baseSepolia,
    arbitrum,
    arbitrumSepolia,
    polygon,
    polygonAmoy,
    optimism,
    optimismSepolia,
} from 'viem/chains';

const logger = createLogger('Wallet');

const router = Router();

let privyNodeClient: PrivyClient | null = null;

function getPrivyNodeClient(): PrivyClient {
    if (privyNodeClient) {
        return privyNodeClient;
    }

    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    if (!appId || !appSecret) {
        throw new AppError('Privy is not configured on the backend (missing PRIVY_APP_ID/PRIVY_APP_SECRET)', 500);
    }

    privyNodeClient = new PrivyClient({
        appId,
        appSecret
    });

    return privyNodeClient;
}

// Privy enum identifiers per (mainnet/testnet) network mode. EVM balance
// lookups now use direct viem RPC reads against the smart wallet address, so
// only the Solana entries from these tables are still consumed by the
// handler. The EVM rows are kept for documentation / future Privy-based
// fallbacks but tagged with eslint-friendly underscores would be churn — the
// `_` prefix below tells TypeScript these are intentionally unused.
type PrivyChain =
    | 'base' | 'arbitrum' | 'polygon' | 'solana'
    | 'base_sepolia' | 'arbitrum_sepolia' | 'polygon_amoy' | 'solana_devnet';
type PrivyAsset = 'eth' | 'pol' | 'sol' | 'usdc';

interface ChainSpec {
    walletType: 'evm' | 'solana';
    privyChain: PrivyChain;
    assets: PrivyAsset[];
}

const SOLANA_CHAIN_MAINNET: PrivyChain = 'solana';
const SOLANA_CHAIN_TESTNET: PrivyChain = 'solana_devnet';

const _MAINNET_CHAINS: ChainSpec[] = [
    { walletType: 'evm',    privyChain: 'base',     assets: ['eth', 'usdc'] },
    { walletType: 'evm',    privyChain: 'arbitrum', assets: ['eth', 'usdc'] },
    { walletType: 'evm',    privyChain: 'polygon',  assets: ['pol', 'usdc'] },
    { walletType: 'solana', privyChain: SOLANA_CHAIN_MAINNET, assets: ['sol', 'usdc'] },
];

const _TESTNET_CHAINS: ChainSpec[] = [
    { walletType: 'evm',    privyChain: 'base_sepolia',     assets: ['eth', 'usdc'] },
    { walletType: 'evm',    privyChain: 'arbitrum_sepolia', assets: ['eth', 'usdc'] },
    { walletType: 'evm',    privyChain: 'polygon_amoy',     assets: ['pol', 'usdc'] },
    { walletType: 'solana', privyChain: SOLANA_CHAIN_TESTNET, assets: ['sol', 'usdc'] },
];

void _MAINNET_CHAINS;
void _TESTNET_CHAINS;

const CHAIN_TESTNET_TO_MAINNET: Record<string, string> = {
    base_sepolia: 'base',
    arbitrum_sepolia: 'arbitrum',
    polygon_amoy: 'polygon',
    solana_devnet: 'solana',
    solana_testnet: 'solana',
    sepolia: 'base',
};

const isTestnetMode = () => {
    const raw = (process.env.NETWORK_MODE || process.env.EXPO_PUBLIC_NETWORK_MODE || 'mainnet').toLowerCase();
    return raw === 'testnet';
};

const normalizeChain = (chain: string): string => {
    const lower = String(chain || '').toLowerCase();
    return CHAIN_TESTNET_TO_MAINNET[lower] ?? lower;
};

// EVM RPC + USDC config for direct on-chain balance reads. Used when the user
// has a Privy smart wallet — the smart wallet is a contract account whose
// address differs from the embedded EOA, so Privy's wallet_id-based balance
// API cannot resolve it. We read balanceOf(usdc) and getBalance(native)
// directly via viem.
interface EvmReadConfig {
    chainKey: string; // mainnet alias the mobile UI keys off
    nativeAsset: 'eth' | 'pol';
    nativeDecimals: number;
    nativeSymbol: string;
    usdcAddress: Address;
    usdcDecimals: number;
    chain: any;
    rpcUrl: string;
}

const ALCHEMY_API_KEY = String(process.env.ALCHEMY_API_KEY || process.env.EXPO_PUBLIC_ALCHEMY_API_KEY || '').trim();
const alchemyRpc = (network: string, fallback: string): string =>
    ALCHEMY_API_KEY ? `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : fallback;

const EVM_READ_MAINNET: EvmReadConfig[] = [
    {
        chainKey: 'base',
        nativeAsset: 'eth',
        nativeDecimals: 18,
        nativeSymbol: 'ETH',
        usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        usdcDecimals: 6,
        chain: base,
        rpcUrl: process.env.BASE_RPC_URL_MAINNET || alchemyRpc('base-mainnet', 'https://mainnet.base.org'),
    },
    {
        chainKey: 'arbitrum',
        nativeAsset: 'eth',
        nativeDecimals: 18,
        nativeSymbol: 'ETH',
        usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        usdcDecimals: 6,
        chain: arbitrum,
        rpcUrl: process.env.ARBITRUM_RPC_URL_MAINNET || alchemyRpc('arb-mainnet', 'https://arb1.arbitrum.io/rpc'),
    },
    {
        chainKey: 'polygon',
        nativeAsset: 'pol',
        nativeDecimals: 18,
        nativeSymbol: 'POL',
        usdcAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        usdcDecimals: 6,
        chain: polygon,
        rpcUrl: process.env.POLYGON_RPC_URL_MAINNET || alchemyRpc('polygon-mainnet', 'https://polygon-rpc.com'),
    },
    {
        chainKey: 'optimism',
        nativeAsset: 'eth',
        nativeDecimals: 18,
        nativeSymbol: 'ETH',
        usdcAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        usdcDecimals: 6,
        chain: optimism,
        rpcUrl: process.env.OPTIMISM_RPC_URL_MAINNET || alchemyRpc('opt-mainnet', 'https://mainnet.optimism.io'),
    },
];

const EVM_READ_TESTNET: EvmReadConfig[] = [
    {
        chainKey: 'base',
        nativeAsset: 'eth',
        nativeDecimals: 18,
        nativeSymbol: 'ETH',
        usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        usdcDecimals: 6,
        chain: baseSepolia,
        rpcUrl: process.env.BASE_RPC_URL || alchemyRpc('base-sepolia', 'https://sepolia.base.org'),
    },
    {
        chainKey: 'arbitrum',
        nativeAsset: 'eth',
        nativeDecimals: 18,
        nativeSymbol: 'ETH',
        usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
        usdcDecimals: 6,
        chain: arbitrumSepolia,
        rpcUrl: process.env.ARBITRUM_RPC_URL || alchemyRpc('arb-sepolia', 'https://sepolia-rollup.arbitrum.io/rpc'),
    },
    {
        chainKey: 'polygon',
        nativeAsset: 'pol',
        nativeDecimals: 18,
        nativeSymbol: 'POL',
        usdcAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
        usdcDecimals: 6,
        chain: polygonAmoy,
        rpcUrl: process.env.POLYGON_RPC_URL || alchemyRpc('polygon-amoy', 'https://rpc-amoy.polygon.technology'),
    },
    {
        chainKey: 'optimism',
        nativeAsset: 'eth',
        nativeDecimals: 18,
        nativeSymbol: 'ETH',
        usdcAddress: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
        usdcDecimals: 6,
        chain: optimismSepolia,
        rpcUrl: process.env.OPTIMISM_RPC_URL || alchemyRpc('opt-sepolia', 'https://sepolia.optimism.io'),
    },
];

const ERC20_BALANCE_OF_ABI = [
    {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ name: 'owner', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
    },
] as const;

const fetchEvmAddressBalances = async (address: Address, testnet: boolean) => {
    const configs = testnet ? EVM_READ_TESTNET : EVM_READ_MAINNET;
    const results = await Promise.all(configs.map(async (cfg) => {
        try {
            const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpcUrl) });
            const [nativeBalance, usdcBalance] = await Promise.all([
                client.getBalance({ address }),
                client.readContract({
                    address: cfg.usdcAddress,
                    abi: ERC20_BALANCE_OF_ABI,
                    functionName: 'balanceOf',
                    args: [address],
                }) as Promise<bigint>,
            ]);
            return [
                {
                    chain: cfg.chainKey,
                    asset: cfg.nativeAsset,
                    raw_value: nativeBalance.toString(),
                    display_values: {
                        token: formatUnits(nativeBalance, cfg.nativeDecimals),
                        usd: '0',
                    },
                },
                {
                    chain: cfg.chainKey,
                    asset: 'usdc',
                    raw_value: usdcBalance.toString(),
                    display_values: {
                        token: formatUnits(usdcBalance, cfg.usdcDecimals),
                        usd: formatUnits(usdcBalance, cfg.usdcDecimals),
                    },
                },
            ];
        } catch (error: any) {
            logger.warn('viem balance fetch failed', {
                chain: cfg.chainKey,
                rpcUrl: cfg.rpcUrl,
                error: error?.message?.slice(0, 200),
            });
            return [];
        }
    }));
    return results.flat();
};

/**
 * GET /api/wallet/balance
 * Fetch balances for the user from Privy (embedded wallet)
 */
router.get('/balance', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;
        const testnet = isTestnetMode();
        logger.debug('Fetching balances', { userId, testnet });

        // 1. Get User from Privy to find wallet addresses and IDs
        const user = await getPrivyAuthClient().getUser(userId);
        
        // Extract wallets with both id and address
        // The balance API requires wallet_id, not address
        interface WalletInfo {
            id: string | null;
            address: string;
            type: 'evm' | 'solana';
        }
        
        const wallets: WalletInfo[] = [];

        // Smart wallets are no longer used. The app routes USDC payments
        // through Circle Gateway directly from the embedded EOA via burn
        // intents — see lib/gateway/* and routes/gateway.ts.

        // Check for EVM embedded wallet in linkedAccounts
        const evmEmbeddedWallets = user.linkedAccounts.filter((a: any) =>
            a.type === 'wallet' &&
            a.walletClientType === 'privy' &&
            a.chainType === 'ethereum'
        );

        evmEmbeddedWallets.forEach((w: any) => {
            wallets.push({
                id: w.id || null,
                address: w.address,
                type: 'evm'
            });
        });

        // Check for Solana embedded wallet in linkedAccounts
        const solanaWallets = user.linkedAccounts.filter((a: any) =>
            a.type === 'wallet' &&
            a.walletClientType === 'privy' &&
            a.chainType === 'solana'
        );

        solanaWallets.forEach((w: any) => {
            wallets.push({
                id: w.id || null,
                address: w.address,
                type: 'solana'
            });
        });

        // Fallback: if user.wallet exists and we didn't find EVM wallet above
        if (user.wallet && !wallets.find(w => w.type === 'evm')) {
            wallets.push({
                id: (user.wallet as any).id || null,
                address: user.wallet.address,
                type: 'evm'
            });
        }

        logger.debug('Found wallets', {
            wallets: wallets.map(w => ({ type: w.type, hasId: !!w.id, address: w.address?.slice(0,10) })),
        });

        if (wallets.length === 0) {
            logger.debug('User has no embedded wallets', { userId });
            return res.json({
                success: true,
                data: {
                    balances: [{
                        chain: 'base',
                        asset: 'usdc',
                        raw_value: '0',
                        display_values: { token: '0', usd: '0' }
                    }],
                    address: null,
                    solanaAddress: null
                }
            });
        }

        // 2. Fetch balances. EVM reads use the embedded EOA; Solana stays via
        //    Privy's wallet_id API.
        const evmAddressForBalance: Address | null =
            (wallets.find(w => w.type === 'evm')?.address as Address | undefined) ||
            null;

        const evmBalancesPromise: Promise<any[]> = evmAddressForBalance
            ? fetchEvmAddressBalances(evmAddressForBalance, testnet)
            : Promise.resolve([]);

        const solanaPrivyChain = testnet ? SOLANA_CHAIN_TESTNET : SOLANA_CHAIN_MAINNET;
        const solanaWallet = wallets.find(w => w.type === 'solana');
        const solanaBalancePromises: Promise<any[]>[] = [];
        if (solanaWallet?.id) {
            for (const asset of ['sol', 'usdc'] as const) {
                solanaBalancePromises.push((async () => {
                    try {
                        const response = await getPrivyNodeClient().wallets().balance.get(solanaWallet.id!, {
                            chain: solanaPrivyChain as any,
                            asset: asset as any,
                            include_currency: 'usd',
                        });
                        if (response && response.balances) {
                            return response.balances.map((bal: any) => ({
                                chain: normalizeChain(bal.chain || solanaPrivyChain),
                                asset: bal.asset,
                                raw_value: bal.raw_value,
                                display_values: {
                                    token: bal.display_values?.token || '0',
                                    usd: bal.display_values?.usd || '0',
                                },
                            }));
                        }
                        return [];
                    } catch (apiError: any) {
                        logger.error('Privy Solana balance fetch failed', {
                            walletId: solanaWallet.id,
                            chain: solanaPrivyChain,
                            asset,
                            error: apiError.message?.slice(0, 200),
                        });
                        return [];
                    }
                })());
            }
        }

        const [evmBalances, ...solanaBalanceResults] = await Promise.all([
            evmBalancesPromise,
            ...solanaBalancePromises,
        ]);
        const allBalances = [...evmBalances, ...solanaBalanceResults.flat()];

        const eoaAddress = wallets.find(w => w.type === 'evm')?.address;
        const primaryAddress = eoaAddress || wallets[0]?.address;
        const solanaAddress = wallets.find(w => w.type === 'solana')?.address;

        return res.json({
            success: true,
            data: {
                balances: allBalances,
                address: primaryAddress,
                solanaAddress: solanaAddress,
                eoaAddress,
            }
        });

    } catch (error: any) {
        logger.error('Balance fetch error', { error: error.message });
        return next(new AppError('Failed to fetch wallet balance', 500));
    }
});

/**
 * POST /api/wallet/create-address
 * Create a Blockradar deposit address for the user
 * Called after user registration or on first wallet access
 */
router.post('/create-address', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;
        logger.info('Creating Blockradar address', { userId });

        // Get user from database
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, blockradar_address_id, first_name, last_name')
            .or(`supabase_id.eq.${userId},privy_id.eq.${userId}`)
            .single();

        if (userError || !userData) {
            throw new AppError('User not found', 404);
        }

        // Check if user already has an address
        if (userData.blockradar_address_id) {
            const existingAddress = await BlockradarService.getAddress(userData.blockradar_address_id);
            return res.json({
                success: true,
                data: {
                    address: existingAddress.address,
                    addressId: existingAddress.id,
                    isNew: false
                }
            });
        }

        // Create new Blockradar address
        const userName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || undefined;
        const newAddress = await BlockradarService.createAddress(userData.id, userName);

        // Save to database
        const { error: updateError } = await supabase
            .from('users')
            .update({
                blockradar_address_id: newAddress.id,
                blockradar_address: newAddress.address
            })
            .eq('id', userData.id);

        if (updateError) {
            logger.error('Failed to save Blockradar address to DB', { error: updateError });
            // Don't throw - address was created, just log the error
        }

        logger.info('Blockradar address created', { 
            userId: userData.id, 
            address: newAddress.address 
        });

        return res.json({
            success: true,
            data: {
                address: newAddress.address,
                addressId: newAddress.id,
                isNew: true
            }
        });

    } catch (error: any) {
        logger.error('Create address error', { error: error.message });
        return next(new AppError('Failed to create wallet address', 500));
    }
});

/**
 * GET /api/wallet/address
 * Get user's deposit address (creates one if doesn't exist)
 */
router.get('/address', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;

        // Get user from database
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, blockradar_address_id, blockradar_address, first_name, last_name')
            .or(`supabase_id.eq.${userId},privy_id.eq.${userId}`)
            .single();

        if (userError || !userData) {
            throw new AppError('User not found', 404);
        }

        // Return existing address
        if (userData.blockradar_address) {
            return res.json({
                success: true,
                data: {
                    address: userData.blockradar_address,
                    addressId: userData.blockradar_address_id,
                    chain: 'base'
                }
            });
        }

        // Create new address if none exists
        const userName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || undefined;
        const newAddress = await BlockradarService.createAddress(userData.id, userName);

        // Save to database
        await supabase
            .from('users')
            .update({
                blockradar_address_id: newAddress.id,
                blockradar_address: newAddress.address
            })
            .eq('id', userData.id);

        return res.json({
            success: true,
            data: {
                address: newAddress.address,
                addressId: newAddress.id,
                chain: 'base'
            }
        });

    } catch (error: any) {
        logger.error('Get address error', { error: error.message });
        return next(new AppError('Failed to get wallet address', 500));
    }
});

/**
 * GET /api/wallet/transactions
 * Get transaction history for user's address
 */
router.get('/transactions', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.id;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;

        // Get user from database
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('blockradar_address_id')
            .or(`supabase_id.eq.${userId},privy_id.eq.${userId}`)
            .single();

        if (userError || !userData?.blockradar_address_id) {
            return res.json({
                success: true,
                data: { transactions: [] }
            });
        }

        // Get transactions from Blockradar
        const transactions = await BlockradarService.getAddressTransactions(
            userData.blockradar_address_id,
            page,
            limit
        );

        return res.json({
            success: true,
            data: { transactions }
        });

    } catch (error: any) {
        logger.error('Get transactions error', { error: error.message });
        return next(new AppError('Failed to get transactions', 500));
    }
});

/**
 * GET /api/wallet/blockradar-assets
 * Get available assets in Blockradar wallet (for debugging)
 */
router.get('/blockradar-assets', authenticate, async (_req: Request, res: Response, next) => {
    try {
        logger.info('Fetching Blockradar wallet assets');

        const assets = await BlockradarService.getAssets();
        const balance = await BlockradarService.getMasterWalletBalance();

        logger.info('Blockradar assets fetched', { 
            assetCount: assets.length,
            balanceCount: balance.length,
            rawAssets: assets // Log full structure
        });

        return res.json({
            success: true,
            data: {
                assets: assets.map(a => ({
                    id: a.id,
                    symbol: a.symbol || a.asset?.symbol,
                    name: a.name || a.asset?.name,
                    decimals: a.decimals || a.asset?.decimals,
                    blockchain: a.blockchain || a.asset?.blockchain,
                    raw: a // Include full object for debugging
                })),
                balances: balance.map(b => ({
                    assetId: b.assetId,
                    symbol: b.asset.symbol,
                    balance: b.balanceFormatted,
                    rawBalance: b.balance
                }))
            }
        });

    } catch (error: any) {
        logger.error('Get Blockradar assets error', { error: error.message });
        return next(new AppError('Failed to get Blockradar assets', 500));
    }
});

export default router;
