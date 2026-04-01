import { Request, Response, NextFunction } from 'express';
import { PrivyClient } from '@privy-io/server-auth';
import { AppError } from './errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger('AuthMiddleware');

let privyClient: PrivyClient | null = null;

export function getPrivyAuthClient(): PrivyClient {
    if (privyClient) {
        return privyClient;
    }

    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;

    if (!appId || !appSecret) {
        throw new AppError('Privy is not configured on the backend (missing PRIVY_APP_ID/PRIVY_APP_SECRET)', 500);
    }

    privyClient = new PrivyClient(appId, appSecret);
    return privyClient;
}

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                privyId: string;
            };
        }
    }
}

// Retry config
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const NON_RETRYABLE_AUTH_ERROR_CODES = new Set([
    'ERR_JWS_INVALID',
    'ERR_JWT_INVALID',
    'ERR_JWT_MALFORMED',
    'ERR_JWT_EXPIRED',
    'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
]);

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
]);

function isRetryableAuthError(error: unknown): boolean {
    const err = error as any;
    const code = String(err?.code || '').trim();
    const name = String(err?.name || '').trim();
    const message = String(err?.message || '').toLowerCase();

    if (code && NON_RETRYABLE_AUTH_ERROR_CODES.has(code)) return false;
    if (name.startsWith('JWT') || name.startsWith('JWS')) return false;
    if (message.includes('invalid compact jws')) return false;
    if (message.includes('jwt') && message.includes('invalid')) return false;
    if (message.includes('token expired')) return false;

    if (code && RETRYABLE_NETWORK_ERROR_CODES.has(code)) return true;
    if (message.includes('timeout')) return true;
    if (message.includes('network')) return true;
    if (message.includes('temporarily unavailable')) return true;

    // Default to no retry so invalid/malformed auth tokens fail fast.
    return false;
}

/**
 * Retry logic for token verification (handles transient network issues)
 */
async function verifyTokenWithRetry(token: string, retries = MAX_RETRIES): Promise<any> {
    const privy = getPrivyAuthClient();

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            logger.debug('Verification attempt', { attempt, maxRetries: retries });
            const claims = await privy.verifyAuthToken(token);
            logger.debug('Token verified successfully');
            return claims;
        } catch (error) {
            const shouldRetry = isRetryableAuthError(error);
            if (!shouldRetry || attempt === retries) {
                throw error;
            }
            logger.debug('Verification attempt failed, retrying', { attempt, error });
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        }
    }
}

export const authenticate = async (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.warn('No authorization header or invalid format');
            throw new AppError('No token provided', 401);
        }

        const token = authHeader.split(' ')[1];
        
        // Debug logging
        logger.debug('Token analysis', { 
            tokenLength: token?.length ? '[REDACTED]' : 0,
            hasDots: token?.includes('.'),
            first10Chars: token?.substring(0, 10) 
        });

        // Only allow demo tokens when explicitly enabled outside production.
        const demoAuthEnabled =
            process.env.ENABLE_DEMO_AUTH === 'true' && process.env.NODE_ENV !== 'production';
        const DEMO_EMAIL = process.env.DEMO_ACCOUNT_EMAIL || 'demo@hedwig.app';

        // Demo tokens don't have dots, JWTs always have dots
        if (demoAuthEnabled && !token.includes('.')) {
            logger.info('Token has no dots - checking if demo token');
            try {
                const decoded = Buffer.from(token, 'base64').toString('utf-8');
                logger.debug('Decoded token', { decoded: decoded.substring(0, 30) + '...' });
                
                if (decoded.startsWith('demo:')) {
                    const parts = decoded.split(':');
                    if (parts.length >= 2) {
                        const demoUserId = parts[1];
                        logger.info('Demo token detected', { email: DEMO_EMAIL, userId: demoUserId });
                        
                        req.user = {
                            id: demoUserId,
                            privyId: demoUserId,
                        };
                        next();
                        return;
                    }
                }
            } catch (decodeError) {
                logger.debug('Failed to decode potential demo token', { error: decodeError });
            }
        }

        // Verify token with Privy (with retry logic)
        const claims = await verifyTokenWithRetry(token);

        if (!claims || !claims.userId) {
            logger.warn('Token verification failed: no claims or userId');
            throw new AppError('Invalid token', 401);
        }

        // Attach user info to request
        req.user = {
            id: claims.userId, // This will be the Privy user ID (did:privy:xxxxx)
            privyId: claims.userId,
        };

        logger.debug('Token verified for user', { userId: claims.userId });

        next();
    } catch (error) {
        logger.error('Authentication error', { error: error instanceof Error ? error.message : 'Unknown' });
        if (error instanceof AppError) {
            next(error);
        } else {
            next(new AppError('Authentication failed', 401));
        }
    }
};
