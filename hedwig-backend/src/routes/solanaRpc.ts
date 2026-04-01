import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger';

const router = Router();
const logger = createLogger('SolanaRpcProxy');

type SolanaCluster = 'mainnet' | 'devnet' | 'testnet';

function parseCluster(cluster: unknown): SolanaCluster | null {
    const normalized = String(cluster || '').toLowerCase();
    if (normalized === 'devnet' || normalized === 'testnet' || normalized === 'mainnet') {
        return normalized;
    }
    return null;
}

function getEnvDefaultCluster(): SolanaCluster {
    const envNetwork = (process.env.SOLANA_NETWORK || '').toLowerCase();
    if (envNetwork === 'devnet' || envNetwork === 'testnet' || envNetwork === 'mainnet') {
        return envNetwork;
    }
    if (envNetwork === 'test') {
        return 'devnet';
    }
    return 'mainnet';
}

function getRpcEndpoints(cluster: SolanaCluster): string[] {
    const configuredPrimaryByCluster: Record<SolanaCluster, string> = {
        mainnet: (process.env.SOLANA_RPC_URL || process.env.SOLANA_MAINNET_RPC || '').trim(),
        devnet: (process.env.SOLANA_DEVNET_RPC || '').trim(),
        testnet: (process.env.SOLANA_TESTNET_RPC || '').trim(),
    };
    const configuredFallbacksByCluster: Record<SolanaCluster, string[]> = {
        mainnet: (process.env.SOLANA_MAINNET_RPC_FALLBACKS || process.env.SOLANA_RPC_FALLBACKS || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        devnet: (process.env.SOLANA_DEVNET_RPC_FALLBACKS || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        testnet: (process.env.SOLANA_TESTNET_RPC_FALLBACKS || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    };
    const defaultRpcByCluster: Record<SolanaCluster, string> = {
        mainnet: 'https://api.mainnet-beta.solana.com',
        devnet: 'https://api.devnet.solana.com',
        testnet: 'https://api.testnet.solana.com',
    };

    const defaultRpcEndpoint = defaultRpcByCluster[cluster];
    const configuredPrimary = configuredPrimaryByCluster[cluster];
    const configuredFallbacks = configuredFallbacksByCluster[cluster];

    return [...new Set([configuredPrimary, ...configuredFallbacks, defaultRpcEndpoint].filter(Boolean))];
}

function redactRpcUrl(url: string): string {
    return url.replace(/\/v2\/[^/?#]+/g, '/v2/***');
}

const DEFAULT_ALLOWED_METHODS = [
    'getBalance',
    'getAccountInfo',
    'getTokenAccountsByOwner',
    'getTokenAccountBalance',
    'getLatestBlockhash',
    'getBlockHeight',
    'getSignatureStatuses',
    'getSignaturesForAddress',
    'getTransaction',
    'getParsedTransaction',
    'getParsedTransactions',
    'getProgramAccounts',
    'getBlock',
    'getSlot',
    'getEpochInfo',
    'getRecentPerformanceSamples',
    'getHealth',
    'getVersion',
    'simulateTransaction',
    'getFeeForMessage',
];

const ALLOWED_METHODS = new Set(
    String(process.env.SOLANA_RPC_ALLOWED_METHODS || DEFAULT_ALLOWED_METHODS.join(','))
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
);

const MAX_BATCH_SIZE = Math.max(1, Number(process.env.SOLANA_RPC_MAX_BATCH_SIZE || 25));
const MAX_PAYLOAD_BYTES = Math.max(1024, Number(process.env.SOLANA_RPC_MAX_PAYLOAD_BYTES || 65_536));
const UPSTREAM_TIMEOUT_MS = Math.max(500, Number(process.env.SOLANA_RPC_UPSTREAM_TIMEOUT_MS || 8_000));

function getMethodsFromPayload(payload: any): string[] {
    if (Array.isArray(payload)) {
        return payload
            .map((entry) => String(entry?.method || '').trim())
            .filter(Boolean);
    }
    return [String(payload?.method || '').trim()].filter(Boolean);
}

router.post('/', async (req: Request, res: Response) => {
    const payload = req.body;
    const explicitCluster = parseCluster(req.query.cluster);
    const cluster = explicitCluster || getEnvDefaultCluster();

    if (!payload || typeof payload !== 'object') {
        res.status(400).json({
            success: false,
            error: { message: 'Invalid JSON-RPC payload' },
        });
        return;
    }

    const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (payloadBytes > MAX_PAYLOAD_BYTES) {
        res.status(413).json({
            success: false,
            error: { message: `Payload too large (max ${MAX_PAYLOAD_BYTES} bytes)` },
        });
        return;
    }

    if (Array.isArray(payload) && payload.length > MAX_BATCH_SIZE) {
        res.status(400).json({
            success: false,
            error: { message: `RPC batch too large (max ${MAX_BATCH_SIZE})` },
        });
        return;
    }

    const methods = getMethodsFromPayload(payload);
    if (methods.length === 0 || methods.some((method) => !ALLOWED_METHODS.has(method))) {
        res.status(400).json({
            success: false,
            error: { message: 'Unsupported RPC method requested' },
        });
        return;
    }

    const endpoints = getRpcEndpoints(cluster);
    let lastError: string | null = null;

    for (const endpoint of endpoints) {
        try {
            const upstreamResponse = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
            });

            const responseText = await upstreamResponse.text();
            res.status(upstreamResponse.status);
            res.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || 'application/json');
            res.send(responseText);
            return;
        } catch (error) {
            lastError = error instanceof Error ? error.message : 'Unknown error';
            logger.warn('Solana RPC endpoint failed', {
                endpoint: redactRpcUrl(endpoint),
                error: lastError,
            });
        }
    }

    res.status(502).json({
        success: false,
        error: { message: `All Solana RPC endpoints failed${lastError ? `: ${lastError}` : ''}` },
    });
});

export default router;
