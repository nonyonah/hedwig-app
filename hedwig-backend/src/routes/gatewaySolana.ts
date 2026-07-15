import { Router, Request, Response, NextFunction } from 'express';
import { Connection, Transaction, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { authenticate } from '../middleware/auth';
import { createLogger } from '../utils/logger';

const router = Router();
const logger = createLogger('GatewaySolana');

function getFeePayer(): Keypair {
    const secret = process.env.GATEWAY_SOLANA_FEE_PAYER_SECRET_KEY;
    if (!secret) {
        throw new Error('GATEWAY_SOLANA_FEE_PAYER_SECRET_KEY not configured');
    }
    return Keypair.fromSecretKey(bs58.decode(secret));
}

function getRpcUrl(): string {
    return (process.env.SOLANA_RPC_URL || '').trim();
}

/**
 * GET /api/gateway/solana/fee-payer
 * Returns the fee-payer public key used for gasless Solana transactions.
 */
router.get('/fee-payer', authenticate, (_req: Request, res: Response) => {
    try {
        const feePayer = getFeePayer();
        res.json({ success: true, data: { address: feePayer.publicKey.toBase58() } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: { message: error.message } });
    }
});

/**
 * POST /api/gateway/solana/relay
 * Accepts a partially-signed Solana transaction, co-signs with
 * the configured fee-payer wallet, and submits it to the network.
 *
 * Body:
 *   - transaction: string (base58-encoded partially-signed Transaction)
 *
 * The frontend builds the tx with feePayer set to the relay's pubkey,
 * has the user sign it (the user is a signer in the instruction accounts),
 * then sends the partially-signed bytes here.
 */
router.post('/relay', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { transaction } = req.body;

        if (!transaction || typeof transaction !== 'string') {
            res.status(400).json({
                success: false,
                error: { message: 'transaction (base58 encoded) is required' },
            });
            return;
        }

        const feePayer = getFeePayer();
        const rpcUrl = getRpcUrl();

        if (!rpcUrl) {
            res.status(500).json({
                success: false,
                error: { message: 'SOLANA_RPC_URL not configured' },
            });
            return;
        }

        const connection = new Connection(rpcUrl, 'confirmed');
        const tx = Transaction.from(bs58.decode(transaction));

        if (!tx.feePayer || tx.feePayer.toBase58() !== feePayer.publicKey.toBase58()) {
            res.status(400).json({
                success: false,
                error: {
                    message: `Transaction feePayer does not match relay wallet. ` +
                        `Expected ${feePayer.publicKey.toBase58()}, got ${tx.feePayer?.toBase58() || 'none'}`,
                },
            });
            return;
        }

        tx.partialSign(feePayer);

        const signature = await connection.sendRawTransaction(tx.serialize(), {
            preflightCommitment: 'confirmed',
        });

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        await connection.confirmTransaction(
            { signature, blockhash, lastValidBlockHeight },
            'confirmed',
        );

        logger.info('Solana fee-payer relay success', {
            signature,
            userId: req.user!.id,
        });

        res.json({
            success: true,
            data: { signature },
        });
    } catch (error) {
        logger.error('Solana fee-payer relay failed', { error });
        next(error);
    }
});

export default router;
