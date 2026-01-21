import { Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

// Required for expo-web-browser to work with auth session
WebBrowser.maybeCompleteAuthSession();

// Demo user object for when in demo mode
const DEMO_USER = {
    id: 'demo-user-hedwig-app-review',
    email: 'demo@hedwig.app',
};

// Web mock return value (static object to avoid hooks on web)
const WEB_MOCK_RETURN = {
    user: null,
    session: null,
    isReady: true,
    isDemo: false,
    login: async () => { console.log('Login not supported on web viewer'); },
    loginWithEmail: async () => { console.log('Login not supported on web viewer'); },
    verifyOtp: async () => { return {} as any; },
    logout: async () => { console.log('Logout not supported on web viewer'); },
    getAccessToken: async () => null,
};

export const useAuth = () => {
    // Check if we're on web - return static mock immediately
    const isWeb = Platform.OS === 'web';

    const [user, setUser] = useState<User | typeof DEMO_USER | null>(isWeb ? null : null);
    const [session, setSession] = useState<Session | null>(null);
    const [isReady, setIsReady] = useState(isWeb ? true : false);
    const [isDemo, setIsDemo] = useState(false);

    useEffect(() => {
        if (isWeb) return;

        let mounted = true;

        const initialize = async () => {
            try {
                // Check for demo mode first
                const demoFlag = await AsyncStorage.getItem('isDemo');
                const demoToken = await AsyncStorage.getItem('demoToken');
                
                if (demoFlag === 'true' && demoToken) {
                    if (mounted) {
                        setIsDemo(true);
                        setUser(DEMO_USER);
                        setIsReady(true);
                    }
                    return;
                }

                // Get current Supabase session
                const { data: { session: currentSession } } = await supabase.auth.getSession();
                
                if (mounted) {
                    setSession(currentSession);
                    setUser(currentSession?.user ?? null);
                    setIsReady(true);
                }
            } catch (error) {
                console.error('Auth initialization error:', error);
                if (mounted) {
                    setIsReady(true);
                }
            }
        };

        initialize();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, newSession) => {
                if (!mounted) return;

                console.log('Auth state changed:', event);
                setSession(newSession);
                setUser(newSession?.user ?? null);

                // Clear demo mode if user logs in normally
                if (event === 'SIGNED_IN' && newSession) {
                    await AsyncStorage.removeItem('isDemo');
                    await AsyncStorage.removeItem('demoToken');
                    setIsDemo(false);
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [isWeb]);

    // Handle deep link URL for OAuth callback
    useEffect(() => {
        if (isWeb) return;

        const handleDeepLink = async (event: { url: string }) => {
            const url = event.url;
            console.log('Deep link received:', url);

            if (url.includes('access_token=') || url.includes('#access_token=')) {
                try {
                    const hashPart = url.split('#')[1];
                    if (hashPart) {
                        const params = new URLSearchParams(hashPart);
                        const accessToken = params.get('access_token');
                        const refreshToken = params.get('refresh_token');

                        if (accessToken && refreshToken) {
                            const { error } = await supabase.auth.setSession({
                                access_token: accessToken,
                                refresh_token: refreshToken,
                            });

                            if (error) {
                                console.error('Error setting session from OAuth:', error);
                            } else {
                                console.log('OAuth session set successfully');
                            }
                        }
                    }
                } catch (err) {
                    console.error('Error parsing OAuth callback URL:', err);
                }
            }
        };

        const subscription = Linking.addEventListener('url', handleDeepLink);

        Linking.getInitialURL().then((url) => {
            if (url) {
                handleDeepLink({ url });
            }
        });

        return () => {
            subscription.remove();
        };
    }, [isWeb]);

    // Sign in with OAuth provider (Google or Apple)
    const login = useCallback(async (provider: 'google' | 'apple') => {
        if (isWeb) {
            console.log('Login not supported on web viewer');
            return;
        }

        try {
            // Use makeRedirectUri which properly handles dev and production builds
            const redirectUrl = makeRedirectUri({
                scheme: 'hedwig',
                path: 'auth/callback',
            });
            console.log('OAuth redirect URL:', redirectUrl);

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: redirectUrl,
                    skipBrowserRedirect: true,
                },
            });

            if (error) {
                console.error('OAuth login error:', error);
                throw error;
            }

            if (data?.url) {
                // Open the OAuth URL in an auth session
                const result = await WebBrowser.openAuthSessionAsync(
                    data.url,
                    redirectUrl,
                    {
                        showInRecents: true,
                        preferEphemeralSession: false,
                    }
                );

                console.log('OAuth browser result:', result);

                if (result.type === 'success' && result.url) {
                    const url = result.url;
                    
                    // Parse access_token from URL fragment
                    const hashPart = url.split('#')[1];
                    if (hashPart) {
                        const params = new URLSearchParams(hashPart);
                        const accessToken = params.get('access_token');
                        const refreshToken = params.get('refresh_token');

                        if (accessToken && refreshToken) {
                            const { error: sessionError } = await supabase.auth.setSession({
                                access_token: accessToken,
                                refresh_token: refreshToken,
                            });

                            if (sessionError) {
                                console.error('Error setting OAuth session:', sessionError);
                                throw sessionError;
                            }
                        }
                    }
                } else if (result.type === 'cancel') {
                    console.log('User cancelled OAuth flow');
                }
            }
        } catch (err) {
            console.error('OAuth flow error:', err);
            throw err;
        }
    }, [isWeb]);

    // Sign in with email OTP
    const loginWithEmail = useCallback(async (email: string) => {
        if (isWeb) {
            console.log('Login not supported on web viewer');
            return;
        }
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true,
            },
        });
        if (error) {
            console.error('Email OTP error:', error);
            throw error;
        }
    }, [isWeb]);

    // Verify OTP code
    const verifyOtp = useCallback(async (email: string, token: string) => {
        if (isWeb) {
            console.log('Verify OTP not supported on web viewer');
            return {} as any;
        }
        const { data, error } = await supabase.auth.verifyOtp({
            email,
            token,
            type: 'email',
        });
        if (error) {
            console.error('OTP verification error:', error);
            throw error;
        }
        return data;
    }, [isWeb]);

    // Logout
    const logout = useCallback(async () => {
        if (isWeb) {
            console.log('Logout not supported on web viewer');
            return;
        }
        
        const demoFlag = await AsyncStorage.getItem('isDemo');
        if (demoFlag === 'true') {
            await AsyncStorage.removeItem('isDemo');
            await AsyncStorage.removeItem('demoToken');
            setIsDemo(false);
            setUser(null);
            return;
        }

        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Logout error:', error);
            throw error;
        }
        
        setUser(null);
        setSession(null);
    }, [isWeb]);

    // Get access token for API calls
    const getAccessToken = useCallback(async (): Promise<string | null> => {
        if (isWeb) return null;
        
        const demoFlag = await AsyncStorage.getItem('isDemo');
        if (demoFlag === 'true') {
            const demoToken = await AsyncStorage.getItem('demoToken');
            if (demoToken) {
                return demoToken;
            }
        }

        const { data: { session: currentSession } } = await supabase.auth.getSession();
        return currentSession?.access_token ?? null;
    }, [isWeb]);

    return {
        user,
        session,
        isReady,
        isDemo,
        login,
        loginWithEmail,
        verifyOtp,
        logout,
        getAccessToken,
    };
};
