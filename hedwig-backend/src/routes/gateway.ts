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
    gatewayBalanceToMicros,
    listGatewayChains,
    normalizeGatewayBalanceEntry,
    requestGatewayAttestation,
    type GatewayTransferRequest,
} from '../services/gateway';
import { extractPrivyWalletAddresses } from '../services/privyWallets';
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

async function resolveUserWalletAddresses(privyUserId: string): Promise<{ evmAddress: string | null; solanaAddress: string | null }> {
    const user = await getPrivyAuthClient().getUser(privyUserId);
    const wallets = extractPrivyWalletAddresses(user);
    const evmAddress = wallets.ethereum || null;
    return {
        evmAddress: evmAddress && isAddress(evmAddress) ? evmAddress : null,
        solanaAddress: wallets.solana || null,
    };
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

        const normalizedBalances = (balances.balances || []).map(normalizeGatewayBalanceEntry);
        const total = normalizedBalances.reduce((sum, item) => sum + BigInt(item.balance || '0'), 0n);

        res.json({
            success: true,
            data: {
                depositorAddress,
                chainKeys: chainKeys || listGatewayChains().map((chain) => chain.key),
                token: balances.token,
                balances: normalizedBalances,
                unifiedBalance: total.toString(),
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/gateway/balance
 * Mobile-friendly unified balance endpoint. Checks both the authenticated
 * user's EVM embedded wallet and Solana embedded wallet, then sums all
 * finalized Gateway balances that Circle currently reports.
 */
router.get('/balance', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { evmAddress, solanaAddress } = await resolveUserWalletAddresses(req.user!.id);
        const requestSources: Array<{ addressType: 'evm' | 'solana'; depositor: string; chainKeys: string[] }> = [];

        if (evmAddress) {
            const evmKeys = getGatewayNetwork() === 'mainnet'
                ? ['base', 'arbitrum', 'polygon', 'optimism']
                : ['baseSepolia', 'arbitrumSepolia', 'polygonAmoy', 'optimismSepolia', 'arcTestnet'];
            requestSources.push({
                addressType: 'evm',
                depositor: evmAddress,
                chainKeys: evmKeys,
            });
        }
        if (solanaAddress) {
            requestSources.push({
                addressType: 'solana',
                depositor: solanaAddress,
                chainKeys: ['solana'],
            });
        }

        const results = await Promise.all(
            requestSources.map((source) => fetchGatewayBalances(source.depositor, source.chainKeys))
        );
        const perDomain = results
            .flatMap((result) => result.balances || [])
            .map(normalizeGatewayBalanceEntry);
        const available = perDomain.reduce((sum, item) => sum + gatewayBalanceToMicros(item.rawBalance), 0n);

        logger.info('Gateway balance fetched', {
            userId: req.user!.id,
            network: getGatewayNetwork(),
            hasEvmAddress: Boolean(evmAddress),
            hasSolanaAddress: Boolean(solanaAddress),
            requestSources: requestSources.map((source) => ({
                addressType: source.addressType,
                chainKeys: source.chainKeys,
                depositorPrefix: source.depositor.slice(0, 8),
            })),
            perDomain: perDomain.map((entry: any) => ({
                domain: entry.domain,
                depositorPrefix: String(entry.depositor || '').slice(0, 8),
                rawBalance: entry.rawBalance,
                balance: entry.balance,
            })),
            available: available.toString(),
        });

        res.json({
            success: true,
            data: {
                available: available.toString(),
                pending: '0',
                perDomain,
                queriedSources: requestSources.map((source) => ({
                    addressType: source.addressType,
                    depositor: source.depositor,
                    chainKeys: source.chainKeys,
                })),
                evmAddress,
                solanaAddress,
                testnet: getGatewayNetwork() !== 'mainnet',
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
