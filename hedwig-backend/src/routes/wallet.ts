import { Router, Request, Response } from 'express';
import { authenticate, getPrivyAuthClient } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { supabase } from '../lib/supabase';
import BlockradarService from '../services/blockradar';
import { readStellarUsdcBalance } from '../services/treasury';
import {
    initiateAnchorOfframp,
    checkAnchorOfframpStatus,
    listAnchorOfframps,
    ANCHORS,
} from '../services/stellarAnchor';
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

interface PriceMap {
    eth: number;
    sol: number;
    pol: number;
    usdc: number;
}

let cachedPrices: { value: PriceMap; expiresAt: number } | null = null;

const fetchNativePrices = async (): Promise<PriceMap> => {
    const now = Date.now();
    if (cachedPrices && cachedPrices.expiresAt > now) return cachedPrices.value;
    try {
        const res = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana,polygon-ecosystem-token,usd-coin&vs_currencies=usd',
            { signal: AbortSignal.timeout(4_000) }
        );
        const data: any = await res.json();
        const map: PriceMap = {
            eth: Number(data?.ethereum?.usd) || 0,
            sol: Number(data?.solana?.usd) || 0,
            pol: Number(data?.['polygon-ecosystem-token']?.usd) || 0,
            usdc: Number(data?.['usd-coin']?.usd) || 1,
        };
        cachedPrices = { value: map, expiresAt: now + 60_000 };
        return map;
    } catch (err: any) {
        logger.warn('CoinGecko price fetch failed', { error: err?.message });
        return cachedPrices?.value ?? { eth: 0, sol: 0, pol: 0, usdc: 1 };
    }
};

const fetchEvmAddressBalances = async (address: Address, testnet: boolean, prices: PriceMap) => {
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
            const nativeTokenStr = formatUnits(nativeBalance, cfg.nativeDecimals);
            const usdcTokenStr = formatUnits(usdcBalance, cfg.usdcDecimals);
            const nativeTokenNum = Number(nativeTokenStr) || 0;
            const usdcTokenNum = Number(usdcTokenStr) || 0;
            const nativePrice = cfg.nativeAsset === 'pol' ? prices.pol : prices.eth;
            const usdcPrice = prices.usdc || 1;
            // Hard fallback: if price fetch returned 0 (rate-limit / network),
            // assume mainnet rough defaults so the wallet UI never shows $0
            // for non-zero token balances. These are last-resort numbers and
            // only kick in when CoinGecko + cache are both unavailable.
            const safeNativePrice = nativePrice > 0
                ? nativePrice
                : cfg.nativeAsset === 'pol' ? 0.4 : 3500;
            const safeUsdcPrice = usdcPrice > 0 ? usdcPrice : 1;
            const nativeUsd = nativeTokenNum * safeNativePrice;
            const usdcUsd = usdcTokenNum * safeUsdcPrice;
            return [
                {
                    chain: cfg.chainKey,
                    asset: cfg.nativeAsset,
                    raw_value: nativeBalance.toString(),
                    display_values: {
                        token: nativeTokenStr,
                        usd: nativeUsd.toFixed(2),
                    },
                },
                {
                    chain: cfg.chainKey,
                    asset: 'usdc',
                    raw_value: usdcBalance.toString(),
                    display_values: {
                        token: usdcTokenStr,
                        usd: usdcUsd.toFixed(2),
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

        const prices = await fetchNativePrices();

        // Privy returns display_values.usd directly. Prefer it for the EVM
        // path; if Privy can't resolve a balance for a (chain, asset) pair,
        // fall back to viem RPC reads + CoinGecko-derived USD.
        const evmWallet = wallets.find(w => w.type === 'evm');
        const evmPrivyChains = testnet
            ? (['base_sepolia', 'arbitrum_sepolia', 'polygon_amoy', 'optimism_sepolia'] as const)
            : (['base', 'arbitrum', 'polygon', 'optimism'] as const);
        const privyEvmBalancesPromise: Promise<any[]> = (async () => {
            if (!evmWallet?.id) return [];
            const out: any[] = [];
            await Promise.all(evmPrivyChains.map(async (privyChain) => {
                const nativeAsset = privyChain.startsWith('polygon') ? 'pol' : 'eth';
                for (const asset of [nativeAsset, 'usdc'] as const) {
                    try {
                        const response = await getPrivyNodeClient().wallets().balance.get(evmWallet.id!, {
                            chain: privyChain as any,
                            asset: asset as any,
                            include_currency: 'usd',
                        });
                        if (!response?.balances) continue;
                        for (const bal of response.balances) {
                            const tokenStr = bal.display_values?.token || '0';
                            const privyUsd = Number(bal.display_values?.usd);
                            const tokenNum = Number(tokenStr) || 0;
                            let usdStr: string;
                            if (Number.isFinite(privyUsd) && privyUsd >= 0 && (privyUsd > 0 || tokenNum === 0)) {
                                usdStr = privyUsd.toFixed(2);
                            } else {
                                const fallbackPrice = bal.asset === 'usdc'
                                    ? (prices.usdc || 1)
                                    : bal.asset === 'pol'
                                        ? (prices.pol || 0.4)
                                        : (prices.eth || 3500);
                                usdStr = (tokenNum * fallbackPrice).toFixed(2);
                            }
                            out.push({
                                chain: normalizeChain(bal.chain || privyChain),
                                asset: bal.asset,
                                raw_value: bal.raw_value,
                                display_values: { token: tokenStr, usd: usdStr },
                            });
                        }
                    } catch (err: any) {
                        logger.debug('Privy EVM balance fetch failed', {
                            walletId: evmWallet.id,
                            chain: privyChain,
                            asset,
                            error: err?.message?.slice(0, 200),
                        });
                    }
                }
            }));
            return out;
        })();

        const viemEvmBalancesPromise: Promise<any[]> = evmAddressForBalance
            ? fetchEvmAddressBalances(evmAddressForBalance, testnet, prices)
            : Promise.resolve([]);

        // Merge: Privy wins when present (already has USD); viem fills any
        // (chain, asset) combinations Privy didn't return so we never lose
        // visibility for chains Privy hasn't indexed yet.
        const evmBalancesPromise: Promise<any[]> = (async () => {
            const [privyRows, viemRows] = await Promise.all([
                privyEvmBalancesPromise,
                viemEvmBalancesPromise,
            ]);
            const key = (b: any) => `${b.chain}:${b.asset}`;
            const map = new Map<string, any>();
            for (const row of viemRows) map.set(key(row), row);
            for (const row of privyRows) map.set(key(row), row);
            return Array.from(map.values());
        })();

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
                            return response.balances.map((bal: any) => {
                                const tokenStr = bal.display_values?.token || '0';
                                const tokenNum = Number(tokenStr) || 0;
                                const privyUsd = Number(bal.display_values?.usd);
                                let usdStr: string;
                                if (Number.isFinite(privyUsd) && privyUsd > 0) {
                                    usdStr = privyUsd.toFixed(2);
                                } else {
                                    const fallbackPrice = bal.asset === 'sol' ? prices.sol : (prices.usdc || 1);
                                    usdStr = (tokenNum * fallbackPrice).toFixed(2);
                                }
                                return {
                                    chain: normalizeChain(bal.chain || solanaPrivyChain),
                                    asset: bal.asset,
                                    raw_value: bal.raw_value,
                                    display_values: { token: tokenStr, usd: usdStr },
                                };
                            });
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

        // Fetch or lazily create Stellar public key, then fetch USDC balance
        let stellarAddress: string | null = null;
        try {
            const { data: userData } = await supabase
                .from('users')
                .select('id, stellar_public_key, stellar_encrypted_seed')
                .or(`supabase_id.eq.${userId},privy_id.eq.${userId}`)
                .maybeSingle();
            if (userData?.stellar_public_key) {
                stellarAddress = userData.stellar_public_key;
            } else if (userData?.id) {
                // Lazily generate Stellar keypair for users who signed up before Phase 1
                const { generateStellarKeypair } = await import('../services/stellarAccount');
                const stellar = generateStellarKeypair();
                const { error: updateErr } = await supabase
                    .from('users')
                    .update({
                        stellar_public_key: stellar.publicKey,
                        stellar_encrypted_seed: stellar.encryptedSeed,
                    })
                    .eq('id', userData.id);
                if (!updateErr) {
                    stellarAddress = stellar.publicKey;
                    const { fundAndSetupTrustline } = await import('../services/stellarAccount');
                    fundAndSetupTrustline(stellar.publicKey, stellar.encryptedSeed).catch(() => {});
                }
            }
            if (stellarAddress) {
                const stellarBalance = await readStellarUsdcBalance(stellarAddress);
                allBalances.push({
                    chain: 'stellar',
                    asset: 'usdc',
                    raw_value: String(Math.round(stellarBalance * 1e6)),
                    display_values: {
                        token: stellarBalance.toFixed(6),
                        usd: (stellarBalance * 1).toFixed(2),
                    },
                });
            }
        } catch (e: any) {
            logger.warn('Stellar balance fetch failed', { error: e?.message?.slice(0, 200) });
        }

        const eoaAddress = wallets.find(w => w.type === 'evm')?.address;
        const primaryAddress = eoaAddress || wallets[0]?.address;
        const solanaAddress = wallets.find(w => w.type === 'solana')?.address;

        return res.json({
            success: true,
            data: {
                balances: allBalances,
                address: primaryAddress,
                solanaAddress: solanaAddress,
                stellarAddress,
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

// ─── Stellar Anchor Off-Ramp Routes ─────────────────────────────────

/**
 * GET /api/wallet/offramp/stellar/anchors
 * List available Stellar anchors for off-ramp
 */
router.get('/offramp/stellar/anchors', authenticate, async (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: Object.entries(ANCHORS).map(([id, config]) => ({
            id,
            name: config.name,
            currencies: config.currencies,
        })),
    });
});

/**
 * POST /api/wallet/offramp/stellar/initiate
 * Initiate a Stellar anchor off-ramp
 */
router.post('/offramp/stellar/initiate', authenticate, async (req: Request, res: Response) => {
    try {
        const privyId = req.user!.id;
        const { anchorId, amountUsdc, bankName, bankAccountNumber, bankSortCode, workspaceId } = req.body;

        if (!anchorId || !amountUsdc || !bankName || !bankAccountNumber || !bankSortCode) {
            res.status(400).json({ success: false, error: { message: 'Missing required fields' } });
            return;
        }

        if (!ANCHORS[anchorId]) {
            res.status(400).json({ success: false, error: { message: 'Unsupported anchor' } });
            return;
        }

        // Get user's Stellar wallet seed
        const { data: user } = await supabase
            .from('users')
            .select('id, stellar_encrypted_seed')
            .eq('privy_id', privyId)
            .single();

        if (!user?.stellar_encrypted_seed) {
            res.status(400).json({ success: false, error: { message: 'No Stellar wallet configured. Generate one first.' } });
            return;
        }

        const record = await initiateAnchorOfframp({
            userId: user.id,
            workspaceId: workspaceId || undefined,
            anchorId,
            userEncryptedSeed: user.stellar_encrypted_seed,
            sourceAmountUsdc: Number(amountUsdc),
            bankName,
            bankAccountNumber,
            bankSortCode,
        });

        res.json({ success: true, data: record });
    } catch (error: any) {
        logger.error('Stellar off-ramp failed', { error: error.message });
        res.status(500).json({ success: false, error: { message: error.message || 'Off-ramp failed' } });
    }
});

/**
 * GET /api/wallet/offramp/stellar/orders
 * List user's Stellar off-ramp orders
 */
router.get('/offramp/stellar/orders', authenticate, async (req: Request, res: Response) => {
    try {
        const privyId = req.user!.id;
        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('privy_id', privyId)
            .single();

        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const records = await listAnchorOfframps(user.id);
        res.json({ success: true, data: records });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
});

/**
 * GET /api/wallet/offramp/stellar/orders/:id
 * Get a specific Stellar off-ramp order
 */
router.get('/offramp/stellar/orders/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const record = await checkAnchorOfframpStatus(id);
        if (!record) {
            res.status(404).json({ success: false, error: { message: 'Off-ramp not found' } });
            return;
        }
        res.json({ success: true, data: record });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
});

export default router;
