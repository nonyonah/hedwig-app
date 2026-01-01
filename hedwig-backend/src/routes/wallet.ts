import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { PrivyClient } from '@privy-io/node';
import { AppError } from '../middleware/errorHandler';
import { supabase } from '../lib/supabase';
import { createPublicClient, http, formatEther, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';

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

// Mainnet Token Addresses
const TOKEN_ADDRESSES = {
    base: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`, // Base Mainnet USDC
    },
    solana: {
        // Mainnet USDC SPL token address for Solana
        USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    },
};

// Create viem clients for RPC balance fetching
const baseClient = createPublicClient({
    chain: base,
    transport: http(),
});

// Create Solana Mainnet connection - use env var or default mainnet RPC
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');

/**
 * GET /api/wallet/balance
 * Fetch balances for the user's embedded wallet
 * Uses direct RPC calls via viem for reliability on testnets
 */
router.get('/balance', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.privyId;
        console.log('[Wallet] Fetching balances for user:', userId);

        // 1. Get User to find Wallet Addresses
        const user = await privy.users()._get(userId);

        // Find the embedded EVM wallet
        const embeddedEvmWallet = user.linked_accounts.find(
            (account: any) => account.type === 'wallet' &&
                account.connector_type === 'embedded' &&
                account.address.startsWith('0x')
        ) as any;

        // Find the embedded Solana wallet
        const embeddedSolanaWallet = user.linked_accounts.find(
            (account: any) => account.type === 'wallet' &&
                account.connector_type === 'embedded' &&
                !account.address.startsWith('0x')
        ) as any;

        const evmAddress = embeddedEvmWallet?.address as `0x${string}` | undefined;
        const solanaAddress = embeddedSolanaWallet?.address as string | undefined;

        console.log('[Wallet] Found EVM address:', evmAddress);
        console.log('[Wallet] Found Solana address:', solanaAddress);

        const balances: any[] = [];

        // ========== BASE MAINNET ==========
        if (evmAddress) {
            // Base Mainnet - ETH (native)
            try {
                const ethBalance = await baseClient.getBalance({ address: evmAddress });
                const ethFormatted = formatEther(ethBalance);
                console.log('[Wallet] Base ETH balance:', ethFormatted);
                balances.push({
                    chain: 'base',
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
                    chain: 'base',
                    asset: 'eth',
                    raw_value: '0',
                    display_values: { eth: '0', usd: '0.00' }
                });
            }

            // Base Mainnet - USDC
            try {
                const usdcBalance = await baseClient.readContract({
                    address: TOKEN_ADDRESSES.base.USDC,
                    abi: erc20Abi,
                    functionName: 'balanceOf',
                    args: [evmAddress],
                });
                const usdcDecimals = await baseClient.readContract({
                    address: TOKEN_ADDRESSES.base.USDC,
                    abi: erc20Abi,
                    functionName: 'decimals',
                });
                const usdcFormatted = formatUnits(usdcBalance, usdcDecimals);
                console.log('[Wallet] Base USDC balance:', usdcFormatted);
                balances.push({
                    chain: 'base',
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
                    chain: 'base',
                    asset: 'usdc',
                    raw_value: '0',
                    display_values: { token: '0', usd: '0' }
                });
            }
        } else {
            // No EVM wallet found, return zeros
            console.log('[Wallet] No EVM wallet found, returning zero balances');
            balances.push(
                { chain: 'base', asset: 'eth', raw_value: '0', display_values: { eth: '0', usd: '0.00' } },
                { chain: 'base', asset: 'usdc', raw_value: '0', display_values: { token: '0', usd: '0' } }
            );
        }

        // ========== SOLANA MAINNET ==========
        if (solanaAddress) {
            // Native SOL
            try {
                const solanaPublicKey = new PublicKey(solanaAddress!);
                const solBalance = await solanaConnection.getBalance(solanaPublicKey);
                const solFormatted = (solBalance / LAMPORTS_PER_SOL).toFixed(9);
                console.log('[Wallet] Solana SOL balance:', solFormatted);
                balances.push({
                    chain: 'solana',
                    asset: 'sol',
                    raw_value: solBalance.toString(),
                    display_values: {
                        sol: solFormatted,
                        usd: (parseFloat(solFormatted) * 180).toFixed(2) // Approx SOL price
                    }
                });
            } catch (e: any) {
                console.error('[Wallet] Error fetching Solana SOL:', e.message);
                balances.push({
                    chain: 'solana',
                    asset: 'sol',
                    raw_value: '0',
                    display_values: { sol: '0', usd: '0.00' }
                });
            }

            // Solana USDC (SPL Token)
            try {
                const walletPublicKey = new PublicKey(solanaAddress!);
                const usdcMintAddress = new PublicKey(TOKEN_ADDRESSES.solana.USDC);

                // Get the Associated Token Account for this wallet and USDC mint
                const tokenAccountAddress = await getAssociatedTokenAddress(
                    usdcMintAddress,
                    walletPublicKey
                );

                // Try to get the token account info
                const tokenAccount = await getAccount(solanaConnection, tokenAccountAddress);
                const usdcBalance = Number(tokenAccount.amount) / 1_000_000; // USDC has 6 decimals
                console.log('[Wallet] Solana USDC balance:', usdcBalance);

                balances.push({
                    chain: 'solana',
                    asset: 'usdc',
                    raw_value: tokenAccount.amount.toString(),
                    display_values: {
                        token: usdcBalance.toFixed(2),
                        usd: usdcBalance.toFixed(2) // USDC = $1
                    }
                });
            } catch (e: any) {
                // Token account may not exist if user hasn't received USDC before
                console.log('[Wallet] Solana USDC: No token account found or error:', e.message);
                balances.push({
                    chain: 'solana',
                    asset: 'usdc',
                    raw_value: '0',
                    display_values: { token: '0', usd: '0' }
                });
            }
        }


        // ========== STACKS TESTNET (Bitcoin L2) ==========
        // Stacks wallet is generated client-side using Stacks.js
        // Look up the address from our database (stored by client after generation)

        // Get user from database to check for stacks address
        const { data: userData } = await supabase
            .from('users')
            .select('stacks_wallet_address')
            .eq('privy_id', userId)
            .single();

        const stacksAddress = userData?.stacks_wallet_address as string | undefined;
        console.log('[Wallet] Found Stacks address:', stacksAddress);

        if (stacksAddress) {
            // Fetch STX balance from Stacks Testnet API
            try {
                const stacksResponse = await fetch(
                    `https://stacks-node-api.testnet.stacks.co/extended/v1/address/${stacksAddress}/balances`
                );

                if (stacksResponse.ok) {
                    const stacksData = await stacksResponse.json() as { stx?: { balance?: string } };
                    // Balance is in microSTX, convert to STX
                    const balanceInMicroSTX = BigInt(stacksData.stx?.balance || '0');
                    const balanceInSTX = Number(balanceInMicroSTX) / 1_000_000;

                    balances.push({
                        chain: 'bitcoin_testnet',
                        asset: 'stx',
                        raw_value: stacksData.stx?.balance || '0',
                        display_values: { stx: balanceInSTX.toFixed(6), usd: '0.00' }
                    });
                    console.log('[Wallet] Stacks STX balance:', balanceInSTX);
                } else {
                    balances.push({
                        chain: 'bitcoin_testnet',
                        asset: 'stx',
                        raw_value: '0',
                        display_values: { stx: '0', usd: '0.00' }
                    });
                }
            } catch (e: any) {
                console.log('[Wallet] Stacks STX balance error:', e.message);
                balances.push({
                    chain: 'bitcoin_testnet',
                    asset: 'stx',
                    raw_value: '0',
                    display_values: { stx: '0', usd: '0.00' }
                });
            }
        } else {
            console.log('[Wallet] No Stacks wallet found, returning zero balance');
            balances.push({
                chain: 'bitcoin_testnet',
                asset: 'stx',
                raw_value: '0',
                display_values: { stx: '0', usd: '0.00' }
            });
        }

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

/**
 * POST /api/wallet/export
 * Export private key for a user's embedded wallet
 * SECURITY: This endpoint requires authentication and should only be used
 * when the user has explicitly confirmed they want to export their key.
 */
router.post('/export', authenticate, async (req: Request, res: Response, next) => {
    try {
        const userId = req.user!.privyId;
        const { chainType } = req.body; // 'ethereum' or 'solana'
        
        console.log('[Wallet] Export request for user:', userId, 'chain:', chainType);
        
        if (!chainType || !['ethereum', 'solana'].includes(chainType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid chainType. Must be "ethereum" or "solana".'
            });
        }
        
        // Get user to find the wallet
        const user = await privy.users()._get(userId);
        
        // Find the embedded wallet for the requested chain
        const embeddedWallet = user.linked_accounts.find(
            (account: any) => account.type === 'wallet' && 
                account.connector_type === 'embedded' &&
                ((chainType === 'ethereum' && account.address?.startsWith('0x')) ||
                 (chainType === 'solana' && !account.address?.startsWith('0x')))
        ) as any;
        
        if (!embeddedWallet) {
            return res.status(404).json({
                success: false,
                error: `No ${chainType} embedded wallet found for this user.`
            });
        }
        
        console.log('[Wallet] Found wallet:', embeddedWallet.address);
        
        // Export the wallet using Privy's API
        // Note: The wallet ID format for embedded wallets
        const walletId = embeddedWallet.id || embeddedWallet.wallet_id;
        
        if (!walletId) {
            return res.status(400).json({
                success: false,
                error: 'Wallet ID not found. Cannot export.'
            });
        }
        
        try {
            const exportResult = await privy.wallets().export(walletId, {});
            
            console.log('[Wallet] Export successful for wallet:', embeddedWallet.address);
            
            res.json({
                success: true,
                data: {
                    address: embeddedWallet.address,
                    chainType,
                    privateKey: exportResult.private_key
                }
            });
        } catch (exportError: any) {
            console.error('[Wallet] Privy export error:', exportError);
            
            // Handle specific Privy errors
            if (exportError.message?.includes('not found')) {
                return res.status(404).json({
                    success: false,
                    error: 'Wallet not found in Privy system.'
                });
            }
            
            return res.status(500).json({
                success: false,
                error: 'Failed to export wallet. The wallet may not support export.'
            });
        }
        
    } catch (error: any) {
        console.error('[Wallet] Export error:', error.message);
        next(new AppError('Failed to export wallet', 500));
    }
});

export default router;
