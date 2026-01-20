import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './useAuth';

export type KYCStatus = 'not_started' | 'pending' | 'approved' | 'rejected' | 'retry_required';

interface KYCState {
    status: KYCStatus;
    applicantId: string | null;
    isApproved: boolean;
    isLoading: boolean;
    error: string | null;
}

interface StartKYCResult {
    accessToken: string;
    applicantId: string;
    status: KYCStatus;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export const useKYC = () => {
    const { getAccessToken } = useAuth();
    const [state, setState] = useState<KYCState>({
        status: 'not_started',
        applicantId: null,
        isApproved: false,
        isLoading: true,
        error: null,
    });

    /**
     * Fetch current KYC status from backend
     */
    const fetchStatus = useCallback(async () => {
        try {
            setState(prev => ({ ...prev, isLoading: true, error: null }));
            
            const token = await getAccessToken();
            if (!token) {
                setState(prev => ({ ...prev, isLoading: false }));
                return;
            }

            const response = await fetch(`${API_URL}/api/kyc/status`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch KYC status');
            }

            const data = await response.json();
            
            if (data.success) {
                setState({
                    status: data.data.status,
                    applicantId: data.data.applicantId,
                    isApproved: data.data.isApproved,
                    isLoading: false,
                    error: null,
                });

                // Cache status locally
                await AsyncStorage.setItem('kyc_status', data.data.status);
            }
        } catch (error) {
            console.error('Error fetching KYC status:', error);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }));
        }
    }, [getAccessToken]);

    /**
     * Start KYC verification flow - creates session and returns URL
     */
    const startKYC = useCallback(async (): Promise<{ url: string; sessionId: string } | null> => {
        try {
            setState(prev => ({ ...prev, isLoading: true, error: null }));
            
            const token = await getAccessToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            const response = await fetch(`${API_URL}/api/kyc/start`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to start KYC');
            }

            const data = await response.json();
            
            if (data.success) {
                // If status is already pending or we got a new session
                setState(prev => ({
                    ...prev,
                    status: data.data.status,
                    applicantId: data.data.sessionId, // reusing field name locally or rename to sessionId
                    isLoading: false,
                }));

                return {
                    url: data.data.url,
                    sessionId: data.data.sessionId,
                };
            }

            return null;
        } catch (error) {
            console.error('Error starting KYC:', error);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }));
            return null;
        }
    }, [getAccessToken]);

    /**
     * Check and sync KYC status
     */
    const checkStatus = useCallback(async (): Promise<KYCStatus> => {
        try {
            const token = await getAccessToken();
            if (!token) return state.status;

            const response = await fetch(`${API_URL}/api/kyc/status`, { // using status endpoint which is cleaner
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!response.ok) return state.status;

            const data = await response.json();
            
            if (data.success) {
                const newStatus = data.data.status as KYCStatus;
                setState(prev => ({
                    ...prev,
                    status: newStatus,
                    isApproved: newStatus === 'approved',
                }));
                await AsyncStorage.setItem('kyc_status', newStatus);
                return newStatus;
            }

            return state.status;
        } catch (error) {
            console.error('Error checking KYC status:', error);
            return state.status;
        }
    }, [getAccessToken, state.status]);

    /**
     * Check if action requires KYC
     */
    const requiresKYC = useCallback((action: 'offramp' | 'withdrawal'): boolean => {
        // All offramp and withdrawal actions require KYC
        return !state.isApproved;
    }, [state.isApproved]);

    // Fetch status on mount
    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    return {
        ...state,
        fetchStatus,
        startKYC,
        checkStatus,
        requiresKYC,
    };
};

export default useKYC;
