/**
 * CDP Auth Context
 * Provides authentication context using Coinbase Developer Platform embedded wallets
 * Supports EVM Smart Accounts and Solana wallets (Celo not supported for smart accounts)
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
    useCurrentUser,
    useSignInWithEmail,
    useVerifyEmailOTP,
    useSignInWithOAuth,
    useSignOut,
    useEvmAddress,
    useSolanaAddress,
    useIsInitialized,
    useGetAccessToken,
} from '@coinbase/cdp-hooks';

// User type matching existing app structure
interface CDPUser {
    id: string;
    email?: string;
    evmAddress?: string;
    solanaAddress?: string;
    evmSmartAccountAddress?: string;
    isNewUser?: boolean;
}

// Auth context type
interface CDPAuthContextType {
    // User state
    user: CDPUser | null;
    isReady: boolean;
    isAuthenticated: boolean;

    // Email authentication
    sendCode: (params: { email: string }) => Promise<void>;
    loginWithCode: (params: { code: string; email: string }) => Promise<void>;

    // OAuth authentication
    loginWithGoogle: () => Promise<void>;
    loginWithApple: () => Promise<void>;

    // Session management
    logout: () => Promise<void>;
    getAccessToken: () => Promise<string | null>;

    // Loading states
    isLoading: boolean;
    error: Error | null;

    // Internal state for OTP flow
    flowId: string | null;
}

const CDPAuthContext = createContext<CDPAuthContextType | undefined>(undefined);

interface CDPAuthProviderProps {
    children: ReactNode;
}

export const CDPAuthProvider: React.FC<CDPAuthProviderProps> = ({ children }) => {
    // CDP hooks
    const { isInitialized } = useIsInitialized();
    const { currentUser } = useCurrentUser();
    const { signInWithEmail } = useSignInWithEmail();
    const { verifyEmailOTP } = useVerifyEmailOTP();
    const { signInWithOAuth } = useSignInWithOAuth();
    const { signOut } = useSignOut();
    const { evmAddress } = useEvmAddress();
    const { solanaAddress } = useSolanaAddress();
    const { getAccessToken: cdpGetAccessToken } = useGetAccessToken();

    // Local state
    const [flowId, setFlowId] = useState<string | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [forceReady, setForceReady] = useState(false);

    // Debug logging
    console.log('[CDPAuth] isInitialized:', isInitialized, 'currentUser:', currentUser?.userId);

    // Timeout to force ready state if initialization takes too long
    React.useEffect(() => {
        if (!isInitialized) {
            const timer = setTimeout(() => {
                console.warn('[CDPAuth] Initialization timeout - forcing ready state');
                setForceReady(true);
            }, 5000); // 5 second timeout
            return () => clearTimeout(timer);
        }
    }, [isInitialized]);

    // Transform CDP user to app user format
    const user: CDPUser | null = currentUser ? {
        id: currentUser.userId,
        email: (currentUser as any).email, // Email may be in different property
        evmAddress: evmAddress || (currentUser.evmAccounts?.[0] as string | undefined),
        solanaAddress: solanaAddress || (currentUser.solanaAccounts?.[0] as string | undefined),
        evmSmartAccountAddress: currentUser.evmSmartAccounts?.[0] as string | undefined,
    } : null;

    const isAuthenticated = !!currentUser;
    const isReady = isInitialized || forceReady;

    // Email OTP - Step 1: Send code
    const sendCode = useCallback(async (params: { email: string }) => {
        console.log('[CDPAuth] sendCode called with email:', params.email);
        console.log('[CDPAuth] Current isInitialized:', isInitialized, 'forceReady:', forceReady);

        try {
            setError(null);
            setIsLoading(true);

            // Add timeout to prevent infinite hanging
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('signInWithEmail timed out after 15 seconds')), 15000)
            );

            console.log('[CDPAuth] Calling signInWithEmail...');
            const result = await Promise.race([
                signInWithEmail({ email: params.email }),
                timeoutPromise
            ]) as { flowId: string };

            console.log('[CDPAuth] signInWithEmail succeeded, flowId:', result.flowId);
            setFlowId(result.flowId);
        } catch (err: any) {
            console.error('[CDPAuth] Failed to send code:', err);
            console.error('[CDPAuth] Error details:', err?.message, err?.code);
            setError(err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [signInWithEmail, isInitialized, forceReady]);

    // Email OTP - Step 2: Verify code
    const loginWithCode = useCallback(async (params: { code: string; email: string }) => {
        if (!flowId) {
            throw new Error('No active OTP flow. Call sendCode first.');
        }

        try {
            setError(null);
            setIsLoading(true);
            const result = await verifyEmailOTP({
                flowId,
                otp: params.code
            });

            // Store if user is new for profile setup
            if (result.isNewUser) {
                console.log('[CDPAuth] New user detected');
            }

            setFlowId(null); // Clear flow after success
        } catch (err: any) {
            console.error('[CDPAuth] Failed to verify code:', err);
            setError(err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [flowId, verifyEmailOTP]);

    // OAuth - Google
    const loginWithGoogle = useCallback(async () => {
        try {
            setError(null);
            setIsLoading(true);
            await signInWithOAuth('google');
        } catch (err: any) {
            console.error('[CDPAuth] Google sign in failed:', err);
            setError(err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [signInWithOAuth]);

    // OAuth - Apple
    const loginWithApple = useCallback(async () => {
        try {
            setError(null);
            setIsLoading(true);
            await signInWithOAuth('apple');
        } catch (err: any) {
            console.error('[CDPAuth] Apple sign in failed:', err);
            setError(err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [signInWithOAuth]);

    // Logout
    const logout = useCallback(async () => {
        // If user is not authenticated, just return silently
        if (!currentUser) {
            console.log('[CDPAuth] No user to logout');
            return;
        }

        try {
            setError(null);
            setIsLoading(true);
            await signOut();
        } catch (err: any) {
            // Ignore "User is not authenticated" errors
            if (err.message?.includes('not authenticated')) {
                console.log('[CDPAuth] User already logged out');
                return;
            }
            console.error('[CDPAuth] Logout failed:', err);
            setError(err);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [signOut, currentUser]);

    // Get access token for backend API calls
    const getAccessToken = useCallback(async (): Promise<string | null> => {
        if (!currentUser) {
            return null;
        }

        try {
            // Use CDP's access token if available
            const token = await cdpGetAccessToken();
            return token;
        } catch (err) {
            console.error('[CDPAuth] Failed to get access token:', err);
            // Fallback: generate a simple session identifier
            return `cdp_${currentUser.userId}_${Date.now()}`;
        }
    }, [currentUser, cdpGetAccessToken]);

    const value: CDPAuthContextType = {
        user,
        isReady,
        isAuthenticated,
        sendCode,
        loginWithCode,
        loginWithGoogle,
        loginWithApple,
        logout,
        getAccessToken,
        isLoading,
        error,
        flowId,
    };

    return (
        <CDPAuthContext.Provider value={value}>
            {children}
        </CDPAuthContext.Provider>
    );
};

// Hook to use CDP auth context
export const useCDPAuth = (): CDPAuthContextType => {
    const context = useContext(CDPAuthContext);
    if (context === undefined) {
        throw new Error('useCDPAuth must be used within a CDPAuthProvider');
    }
    return context;
};

// Alias for backward compatibility with existing code
export const useAuth = useCDPAuth;
