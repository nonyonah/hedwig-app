/**
 * Solana → Base Bridge Routes
 * 
 * Enables users to bridge tokens from Solana to Base
 * for offramping via Paycrest.
 * 
 * Routes:
 * GET /api/bridge/quote - Get bridge quote (fees, estimated time)
 * POST /api/bridge/build - Build bridge transaction for signing
 * GET /api/bridge/status/:id - Check bridge status
 * GET /api/bridge/balances - Get Solana wallet balances
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { solanaBridgeService, BridgeableToken } from '../services/solanabridge';

const router = Router();

/**
 * GET /api/bridge/quote
 * Get a quote for bridging tokens from Solana to Base
 * 
 * Query params:
 * - token: 'SOL' | 'USDC'
 * - amount: number (in token units)
 */
router.get('/quote', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { token = 'SOL', amount = '1' } = req.query;

        const amountNum = parseFloat(amount as string);
        if (isNaN(amountNum) || amountNum <= 0) {
            res.status(400).json({
                success: false,
                error: 'Invalid amount. Must be a positive number.',
            });
            return;
        }

        const validTokens: BridgeableToken[] = ['SOL', 'USDC'];
        if (!validTokens.includes(token as BridgeableToken)) {
            res.status(400).json({
                success: false,
                error: `Invalid token. Supported tokens: ${validTokens.join(', ')}`,
            });
            return;
        }

        const quote = await solanaBridgeService.getQuote(
            token as BridgeableToken,
            amountNum
        );

        res.json({
            success: true,
            data: quote,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/bridge/build
 * Build a bridge transaction for the user to sign
 * 
 * Body:
 * - fromAddress: Solana wallet address
 * - toAddress: Base wallet address (0x...)
 * - token: 'SOL' | 'USDC'
 * - amount: number
 */
router.post('/build', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { fromAddress, toAddress, token, amount } = req.body;

        // Validate required fields
        if (!fromAddress || !toAddress || !token || !amount) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: fromAddress, toAddress, token, amount',
            });
            return;
        }

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            res.status(400).json({
                success: false,
                error: 'Invalid amount. Must be a positive number.',
            });
            return;
        }

        const validTokens: BridgeableToken[] = ['SOL', 'USDC'];
        if (!validTokens.includes(token as BridgeableToken)) {
            res.status(400).json({
                success: false,
                error: `Invalid token. Supported tokens: ${validTokens.join(', ')}`,
            });
            return;
        }

        const result = await solanaBridgeService.buildBridgeTransaction({
            fromAddress,
            toAddress,
            token: token as BridgeableToken,
            amount: amountNum,
        });

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bridge/status/:bridgeId
 * Check the status of a bridge transaction
 * 
 * Params:
 * - bridgeId: Bridge transaction ID
 * 
 * Query:
 * - signature: Optional Solana transaction signature
 */
router.get('/status/:bridgeId', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { bridgeId } = req.params;
        const { signature } = req.query;

        if (!bridgeId) {
            res.status(400).json({
                success: false,
                error: 'Bridge ID is required',
            });
            return;
        }

        const status = await solanaBridgeService.getBridgeStatus(
            bridgeId,
            signature as string | undefined
        );

        res.json({
            success: true,
            data: status,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/bridge/balances
 * Get Solana wallet balances for bridging
 * 
 * Query:
 * - address: Solana wallet address
 */
router.get('/balances', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { address } = req.query;

        if (!address) {
            res.status(400).json({
                success: false,
                error: 'Wallet address is required',
            });
            return;
        }

        const balances = await solanaBridgeService.getBalances(address as string);

        res.json({
            success: true,
            data: balances,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/bridge/bridge-and-offramp
 * Initiate a bridge from Solana to Base followed by offramp via Paycrest
 * 
 * This is a convenience endpoint that combines:
 * 1. Build bridge transaction
 * 2. Prepare offramp order (to be created after bridge completes)
 * 
 * Body:
 * - solanaAddress: User's Solana wallet address
 * - baseAddress: User's Base wallet address
 * - token: 'SOL' | 'USDC'
 * - amount: Amount to bridge and offramp
 * - bankDetails: { bankName, accountNumber, accountName, currency }
 */
router.post('/bridge-and-offramp', authenticate, async (req: Request, res: Response, next) => {
    try {
        const {
            solanaAddress,
            baseAddress,
            token,
            amount,
            bankDetails,
        } = req.body;

        // Validate required fields
        if (!solanaAddress || !baseAddress || !token || !amount || !bankDetails) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields',
            });
            return;
        }

        // 1. Get bridge quote
        const quote = await solanaBridgeService.getQuote(
            token as BridgeableToken,
            parseFloat(amount)
        );

        // 2. Build bridge transaction
        const bridgeTx = await solanaBridgeService.buildBridgeTransaction({
            fromAddress: solanaAddress,
            toAddress: baseAddress,
            token: token as BridgeableToken,
            amount: parseFloat(amount),
        });

        // Return combined data for the frontend to:
        // 1. Show bridge details and get user confirmation
        // 2. Sign the Solana transaction
        // 3. Wait for bridge completion
        // 4. Create Paycrest offramp order
        res.json({
            success: true,
            data: {
                step: 'bridge',
                quote,
                bridgeTransaction: bridgeTx,
                nextStep: 'Sign the Solana transaction, then wait for bridge completion before offramping',
                offrampDetails: {
                    token: 'USDC', // Bridged tokens are USDC on Base
                    network: 'base',
                    estimatedReceiveAmount: quote.estimatedReceiveAmount,
                    bankDetails,
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
