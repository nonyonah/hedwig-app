import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AppError } from './errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger('AuthMiddleware');

// Initialize Supabase client for auth verification
const supabaseAuth = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for token verification
);

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                supabaseId: string;
                email?: string;
                // Legacy field for backward compatibility during migration
                privyId?: string;
            };
        }
    }
}

/**
 * Verify Supabase JWT token
 */
async function verifySupabaseToken(token: string): Promise<{ userId: string; email?: string }> {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    
    if (error || !user) {
        logger.warn('Supabase token verification failed', { error: error?.message });
        throw new AppError('Invalid token', 401);
    }
    
    return {
        userId: user.id,
        email: user.email,
    };
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
                    // This is a demo token - extract the user_id
                    const parts = decoded.split(':');
                    if (parts.length >= 2) {
                        const demoUserId = parts[1];
                        logger.info('Demo token detected', { email: DEMO_EMAIL, userId: demoUserId });
                        
                        req.user = {
                            id: demoUserId,
                            supabaseId: demoUserId,
                            email: DEMO_EMAIL,
                            privyId: demoUserId, // Legacy compatibility
                        };
                        next();
                        return;
                    }
                }
            } catch (decodeError) {
                logger.debug('Failed to decode potential demo token', { error: decodeError });
            }
        }

        // Verify token with Supabase Auth
        const claims = await verifySupabaseToken(token);
        logger.debug('Token verified for user', { userId: claims.userId });

        // Attach user info to request
        req.user = {
            id: claims.userId,
            supabaseId: claims.userId,
            email: claims.email,
            privyId: claims.userId, // Legacy compatibility - use same ID
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
            
            // Check for demo token first
            if (!token.includes('.')) {
                try {
                    const decoded = Buffer.from(token, 'base64').toString('utf-8');
                    if (decoded.startsWith('demo:')) {
                        const parts = decoded.split(':');
                        if (parts.length >= 2) {
                            req.user = {
                                id: parts[1],
                                supabaseId: parts[1],
                                email: process.env.DEMO_ACCOUNT_EMAIL || 'demo@hedwig.app',
                                privyId: parts[1],
                            };
                            next();
                            return;
                        }
                    }
                } catch {
                    // Not a demo token, continue to Supabase verification
                }
            }
            
            // Try Supabase verification
            try {
                const claims = await verifySupabaseToken(token);
                req.user = {
                    id: claims.userId,
                    supabaseId: claims.userId,
                    email: claims.email,
                    privyId: claims.userId,
                };
            } catch {
                // Token invalid, but this is optional auth so continue without user
            }
        }

        next();
    } catch (error) {
        // Silently fail for optional auth
        next();
    }
};
