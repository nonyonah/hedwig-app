import { Router, Request, Response, NextFunction } from 'express';
import { isAddress } from 'viem';
import { authenticate, getPrivyAuthClient } from '../middleware/auth';
import {
    buildEvmBurnIntent,
    fetchGatewayBalances,
    GATEWAY_EIP712_DOMAIN,
    GATEWAY_EIP712_TYPES,
    getGatewayApiBaseUrl,
    getGatewayNetwork,
    listGatewayChains,
    requestGatewayAttestation,
    type GatewayTransferRequest,
} from '../services/gateway';
import { createLogger } from '../utils/logger';

const router = Router();
const logger = createLogger('GatewayRoutes');

async function resolveUserEvmAddress(privyUserId: string): Promise<string> {
    const user = await getPrivyAuthClient().getUser(privyUserId);

    const linkedWalletAddress = user.linkedAccounts.find((account) => {
        const wallet = account as any;
        return wallet?.type === 'wallet' && wallet?.chainType === 'ethereum' && wallet?.address;
    });

    const resolvedLinkedAddress = linkedWalletAddress ? (linkedWalletAddress as any).address : null;

    const fallbackWalletAddress = user.wallet?.address;
    const address = resolvedLinkedAddress || fallbackWalletAddress;

    if (!address || !isAddress(address)) {
        throw new Error('No valid EVM wallet address found for this user');
    }

    return address;
}

function asChainKeys(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value
        .map((item) => String(item || '').trim())
        .filter(Boolean);
}

/**
 * GET /api/gateway/config
 * Returns supported Gateway chain configuration (Celo intentionally excluded).
 */
router.get('/config', authenticate, (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            network: getGatewayNetwork(),
            apiBaseUrl: getGatewayApiBaseUrl(),
            celoSupported: false,
            supportedChains: listGatewayChains(),
            eip712: {
                domain: GATEWAY_EIP712_DOMAIN,
                types: GATEWAY_EIP712_TYPES,
            },
        },
    });
});

/**
 * POST /api/gateway/balances
 * Body:
 * - depositorAddress?: string (defaults to authenticated user's EVM address)
 * - chainKeys?: string[] (optional filter)
 */
router.post('/balances', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const requestedDepositor = String(req.body?.depositorAddress || '').trim();
        const depositorAddress = requestedDepositor || await resolveUserEvmAddress(req.user!.id);
        const chainKeys = asChainKeys(req.body?.chainKeys);
        const balances = await fetchGatewayBalances(depositorAddress, chainKeys);

        const total = (balances.balances || []).reduce((sum, item) => {
            const parsed = Number(item.balance || 0);
            return sum + (Number.isFinite(parsed) ? parsed : 0);
        }, 0);

        res.json({
            success: true,
            data: {
                depositorAddress,
                chainKeys: chainKeys || listGatewayChains().map((chain) => chain.key),
                token: balances.token,
                balances: balances.balances || [],
                unifiedBalance: total.toFixed(6),
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/gateway/transfer/prepare-evm
 * Body:
 * - sourceChainKey: string
 * - destinationChainKey: string
 * - amountUsdc: string
 * - destinationRecipient?: string (defaults to depositorAddress)
 * - depositorAddress?: string (defaults to authenticated user's EVM address)
 * - maxFeeMicrousdc?: string
 */
router.post('/transfer/prepare-evm', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sourceChainKey = String(req.body?.sourceChainKey || '').trim();
        const destinationChainKey = String(req.body?.destinationChainKey || '').trim();
        const amountUsdc = String(req.body?.amountUsdc || '').trim();
        const requestedDepositor = String(req.body?.depositorAddress || '').trim();

        if (!sourceChainKey || !destinationChainKey || !amountUsdc) {
            res.status(400).json({
                success: false,
                error: { message: 'sourceChainKey, destinationChainKey, and amountUsdc are required' },
            });
            return;
        }

        const depositorAddress = requestedDepositor || await resolveUserEvmAddress(req.user!.id);
        const destinationRecipient = String(req.body?.destinationRecipient || depositorAddress).trim();

        const prepared = buildEvmBurnIntent({
            sourceChainKey,
            destinationChainKey,
            amountUsdc,
            depositorAddress,
            destinationRecipient,
            maxFeeMicrousdc: req.body?.maxFeeMicrousdc ? String(req.body.maxFeeMicrousdc) : undefined,
        });

        res.json({
            success: true,
            data: {
                depositorAddress,
                destinationRecipient,
                sourceChain: prepared.sourceChain,
                destinationChain: prepared.destinationChain,
                burnIntent: prepared.burnIntent,
                typedData: prepared.typedData,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/gateway/transfer/attestation
 * Body:
 * - requests: [{ burnIntent, signature }]
 */
router.post('/transfer/attestation', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const requests = req.body?.requests as GatewayTransferRequest[] | undefined;

        if (!Array.isArray(requests) || requests.length === 0) {
            res.status(400).json({
                success: false,
                error: { message: 'requests array is required' },
            });
            return;
        }

        const attestation = await requestGatewayAttestation(requests);

        res.json({
            success: true,
            data: {
                attestation: attestation.attestation,
                signature: attestation.signature,
            },
        });
    } catch (error) {
        logger.error('Gateway attestation failed', { error });
        next(error);
    }
});

export default router;
