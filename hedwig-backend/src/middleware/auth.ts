import { Request, Response, NextFunction } from 'express';
import { PrivyClient } from '@privy-io/server-auth';
import { AppError } from './errorHandler';

// Initialize Privy client
const privy = new PrivyClient(
    process.env.PRIVY_APP_ID!,
    process.env.PRIVY_APP_SECRET!
);

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

export const authenticate = async (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError('No token provided', 401);
        }

        const token = authHeader.split(' ')[1];

        // Verify token with Privy
        const claims = await privy.verifyAuthToken(token);

        if (!claims || !claims.userId) {
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
