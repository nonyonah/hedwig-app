import { Request, Response, NextFunction } from 'express';
import { PrivyClient } from '@privy-io/server-auth';
import { AppError } from './errorHandler';

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
            console.log(`[Auth] Verification attempt ${i + 1}/${retries}`);

            // Use cached verification if available and recent
            const now = Date.now();
            if (verificationKeyCache && (now - cacheTimestamp) < CACHE_DURATION) {
                console.log('[Auth] Using cached verification key');
            }

            const claims = await privy.verifyAuthToken(token);
            console.log('[Auth] Token verified successfully');

            // Cache successful verification
            verificationKeyCache = claims;
            cacheTimestamp = now;

            return claims;
        } catch (error: any) {
            console.error(`[Auth] Attempt ${i + 1} failed:`, error.message);

            if (i === retries - 1) {
                // Last attempt failed
                throw error;
            }

            // Wait before retry (exponential backoff)
            const waitTime = Math.min(1000 * Math.pow(2, i), 5000);
            console.log(`[Auth] Retrying in ${waitTime}ms...`);
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
            console.error('[Auth] No authorization header or invalid format');
            throw new AppError('No token provided', 401);
        }

        const token = authHeader.split(' ')[1];
        console.log('[Auth] Attempting to verify token...');

        // Verify token with Privy (with retry logic)
        const claims = await verifyTokenWithRetry(token);
        console.log('[Auth] Token verified successfully, userId:', claims?.userId);

        if (!claims || !claims.userId) {
            console.error('[Auth] Token verification failed: no claims or userId');
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
        console.error('[Auth] Authentication error:', error);
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
