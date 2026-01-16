import { Request, Response, NextFunction } from 'express';
import { PrivyClient } from '@privy-io/server-auth';
import { AppError } from './errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger('AuthMiddleware');

// Initialize Privy client with increased timeout
const privy = new PrivyClient(
    process.env.PRIVY_APP_ID!,
    process.env.PRIVY_APP_SECRET!
);

// Cache for verification attempts
let verificationKeyCache: any = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                privyId: string;
                walletAddress?: string;
            };
        }
    }
}

async function verifyTokenWithRetry(token: string, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            logger.debug('Verification attempt', { attempt: i + 1, maxRetries: retries });

            // Use cached verification if available and recent
            const now = Date.now();
            if (verificationKeyCache && (now - cacheTimestamp) < CACHE_DURATION) {
                if (process.env.DEBUG_AUTH === 'true') {
                    logger.debug('Using cached verification key');
                }
            }

            const claims = await privy.verifyAuthToken(token);
            logger.debug('Token verified successfully');

            // Cache successful verification
            verificationKeyCache = claims;
            cacheTimestamp = now;

            return claims;
        } catch (error: any) {
            logger.warn('Verification attempt failed', { attempt: i + 1, error: error.message });

            if (i === retries - 1) {
                // Last attempt failed
                throw error;
            }

            // Wait before retry (exponential backoff)
            const waitTime = Math.min(1000 * Math.pow(2, i), 5000);
            logger.debug('Retrying verification', { waitTimeMs: waitTime });
            await new Promise(resolve => setTimeout(resolve, waitTime));
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
        
        // Debug logging - always show for now
        logger.debug('Token analysis', { 
            tokenLength: token?.length,
            hasDots: token?.includes('.'),
            first10Chars: token?.substring(0, 10) 
        });

        // Check if this is a demo token
        // Demo tokens are base64 encoded and DON'T contain dots
        // JWTs always contain two dots (header.payload.signature)
        const DEMO_EMAIL = process.env.DEMO_ACCOUNT_EMAIL || 'demo@hedwig.app';
        
        // Demo tokens don't have dots, JWTs always have dots
        if (!token.includes('.')) {
            logger.info('Token has no dots - checking if demo token');
            try {
                const decoded = Buffer.from(token, 'base64').toString('utf-8');
                logger.debug('Decoded token', { decoded: decoded.substring(0, 30) + '...' });
                
                if (decoded.startsWith('demo:')) {
                    // This is a demo token - extract the privy_id
                    const parts = decoded.split(':');
                    if (parts.length >= 2) {
                        const demoPrivyId = parts[1];
                        logger.info('Demo token detected', { email: DEMO_EMAIL, privyId: demoPrivyId });
                        
                        req.user = {
                            id: DEMO_EMAIL,
                            privyId: demoPrivyId,
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
        logger.debug('Token verified for user');

        if (!claims || !claims.userId) {
            logger.warn('Token verification failed: no claims or userId');
            throw new AppError('Invalid token', 401);
        }

        // Attach user info to request
        req.user = {
            id: claims.userId, // This will be the Privy user ID
            privyId: claims.userId,
            // walletAddress: claims.wallet?.address, // Removed as it's not on AuthTokenClaims
        };

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

// Optional authentication (user may or may not be logged in)
export const optionalAuth = async (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const claims = await privy.verifyAuthToken(token);

            if (claims && claims.userId) {
                req.user = {
                    id: claims.userId,
                    privyId: claims.userId,
                    // walletAddress: claims.wallet?.address, // Removed as it's not on AuthTokenClaims
                };
            }
        }

        next();
    } catch (error) {
        // Silently fail for optional auth
        next();
    }
};
