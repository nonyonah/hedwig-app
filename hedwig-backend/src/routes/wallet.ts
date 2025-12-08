import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { PrivyClient } from '@privy-io/node';
import { AppError } from '../middleware/errorHandler';
import { createPublicClient, http, formatEther, formatUnits } from 'viem';
import { baseSepolia } from 'viem/chains';

const router = Router();

// Initialize Privy Node SDK
const privy = new PrivyClient({
    appId: process.env.PRIVY_APP_ID!,
    appSecret: process.env.PRIVY_APP_SECRET!
});

// ERC20 ABI for balance fetching
const erc20Abi = [
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'owner', type: 'address' }],
        outputs: [{ type: 'uint256' }],
    },
    {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint8' }],
    },
] as const;

// Testnet Token Addresses
const TOKEN_ADDRESSES = {
    baseSepolia: {
        USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`,
    },
};

// Create viem client for RPC balance fetching (fallback)
const baseSepoliaClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
});

/**
 * GET /api/wallet/balance
 * Fetch balances for the user's embedded wallet
 * Uses direct RPC calls via viem for reliability on testnets
 */
router.get('/balance', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.privyId;
        console.log('[Wallet] Fetching balances for user:', userId);

        // 1. Get User to find Wallet Address
        const user = await privy.users()._get(userId);

        // Find the embedded wallet (note: snake_case in SDK response)
        const embeddedWallet = user.linked_accounts.find(
            (account: any) => account.type === 'wallet' && account.connector_type === 'embedded'
        ) as any;

        if (!embeddedWallet || !embeddedWallet.address) {
            throw new AppError('No embedded wallet found for this user', 404);
        }

        const walletAddress = embeddedWallet.address as `0x${string}`;
        console.log('[Wallet] Found wallet address:', walletAddress);

        const balances: any[] = [];

        // 2. Fetch balances using viem RPC (more reliable for testnets)

        // Base Sepolia - ETH (native)
        try {
            const ethBalance = await baseSepoliaClient.getBalance({ address: walletAddress });
            const ethFormatted = formatEther(ethBalance);
            console.log('[Wallet] Base ETH balance (raw):', ethBalance.toString(), 'formatted:', ethFormatted);
            balances.push({
                chain: 'base_sepolia',
                asset: 'eth',
                raw_value: ethBalance.toString(),
                display_values: {
                    eth: ethFormatted,
                    usd: (parseFloat(ethFormatted) * 3500).toFixed(2)
                }
            });
        } catch (e: any) {
            console.error('[Wallet] Error fetching Base ETH:', e.message);
            balances.push({
                chain: 'base_sepolia',
                asset: 'eth',
                raw_value: '0',
                display_values: { eth: '0', usd: '0.00' }
            });
        }

        // Base Sepolia - USDC
        try {
            const usdcBalance = await baseSepoliaClient.readContract({
                address: TOKEN_ADDRESSES.baseSepolia.USDC,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [walletAddress],
            });
            const usdcDecimals = await baseSepoliaClient.readContract({
                address: TOKEN_ADDRESSES.baseSepolia.USDC,
                abi: erc20Abi,
                functionName: 'decimals',
            });
            const usdcFormatted = formatUnits(usdcBalance, usdcDecimals);
            console.log('[Wallet] Base USDC balance (raw):', usdcBalance.toString(), 'decimals:', usdcDecimals, 'formatted:', usdcFormatted);
            balances.push({
                chain: 'base_sepolia',
                asset: 'usdc',
                raw_value: usdcBalance.toString(),
                display_values: {
                    token: usdcFormatted,
                    usd: usdcFormatted // USDC = $1
                }
            });
        } catch (e: any) {
            console.error('[Wallet] Error fetching Base USDC:', e.message);
            balances.push({
                chain: 'base_sepolia',
                asset: 'usdc',
                raw_value: '0',
                display_values: { token: '0', usd: '0' }
            });
        }

        // Celo Alfajores - Placeholder (not supported by Privy, would need separate RPC)
        balances.push({
            chain: 'celo_alfajores',
            asset: 'celo',
            raw_value: '0',
            display_values: { celo: '0', usd: '0.00' }
        });

        balances.push({
            chain: 'celo_alfajores',
            asset: 'cusd',
            raw_value: '0',
            display_values: { token: '0', usd: '0' }
        });

        console.log('[Wallet] Total balances fetched:', balances.length);

        res.json({
            success: true,
            data: { balances }
        });

    } catch (error: any) {
        console.error('[Wallet] Balance fetch error:', error.message);
        next(new AppError('Failed to fetch wallet balance', 500));
    }
});

export default router;
