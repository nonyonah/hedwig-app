import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_ACTIONS_STORAGE_KEY = '@hedwig_user_actions';

export interface ActionCounts {
    createInvoice: number;
    createPaymentLink: number;
    createProject: number;
    addMilestone: number;
    createContract: number;
    createProposal: number;
    offramp: number;
    sendPayment: number;
}

export interface Suggestion {
    id: keyof ActionCounts;
    label: string;
    text: string;
    icon?: string;
}

const DEFAULT_COUNTS: ActionCounts = {
    createInvoice: 0,
    createPaymentLink: 0,
    createProject: 0,
    addMilestone: 0,
    createContract: 0,
    createProposal: 0,
    offramp: 0,
    sendPayment: 0,
};

// All available suggestions with their prompts
const SUGGESTION_TEMPLATES: Record<keyof ActionCounts, Suggestion> = {
    createInvoice: {
        id: 'createInvoice',
        label: 'Create invoice',
        text: 'Create an invoice for ',
        icon: '📄',
    },
    createPaymentLink: {
        id: 'createPaymentLink',
        label: 'Payment link',
        text: 'Create a payment link for ',
        icon: '🔗',
    },
    createProject: {
        id: 'createProject',
        label: 'New project',
        text: 'Create a project for ',
        icon: '📁',
    },
    addMilestone: {
        id: 'addMilestone',
        label: 'Add milestone',
        text: 'Add a milestone to ',
        icon: '🎯',
    },
    createContract: {
        id: 'createContract',
        label: 'Create contract',
        text: 'Create a contract for ',
        icon: '📝',
    },
    createProposal: {
        id: 'createProposal',
        label: 'New proposal',
        text: 'Create a proposal for ',
        icon: '💡',
    },
    offramp: {
        id: 'offramp',
        label: 'Withdraw to bank',
        text: 'Withdraw ',
        icon: '🏦',
    },
    sendPayment: {
        id: 'sendPayment',
        label: 'Send payment',
        text: 'Send ',
        icon: '💸',
    },
};

// Default suggestions for new users
const DEFAULT_SUGGESTIONS: (keyof ActionCounts)[] = [
    'createInvoice',
    'createPaymentLink',
    'createProject',
    'addMilestone',
];

export function useUserActions() {
    const [actionCounts, setActionCounts] = useState<ActionCounts>(DEFAULT_COUNTS);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load action counts from storage
    useEffect(() => {
        const loadCounts = async () => {
            try {
                const stored = await AsyncStorage.getItem(USER_ACTIONS_STORAGE_KEY);
                if (stored) {
                    const parsed = JSON.parse(stored) as ActionCounts;
                    setActionCounts({ ...DEFAULT_COUNTS, ...parsed });
                }
            } catch (error) {
                console.error('[useUserActions] Failed to load counts:', error);
            } finally {
                setIsLoaded(true);
            }
        };
        loadCounts();
    }, []);

    // Save counts to storage
    const saveCounts = useCallback(async (counts: ActionCounts) => {
        try {
            await AsyncStorage.setItem(USER_ACTIONS_STORAGE_KEY, JSON.stringify(counts));
        } catch (error) {
            console.error('[useUserActions] Failed to save counts:', error);
        }
    }, []);

    // Record an action
    const recordAction = useCallback(async (actionId: keyof ActionCounts) => {
        const newCounts = { ...actionCounts, [actionId]: (actionCounts[actionId] || 0) + 1 };
        setActionCounts(newCounts);
        await saveCounts(newCounts);
    }, [actionCounts, saveCounts]);

    // Get top N suggestions based on usage
    const getTopSuggestions = useCallback((count: number = 4): Suggestion[] => {
        // Check if user has any recorded actions
        const totalActions = Object.values(actionCounts).reduce((sum, c) => sum + c, 0);

        if (totalActions === 0) {
            // Return default suggestions for new users
            return DEFAULT_SUGGESTIONS.slice(0, count).map(id => SUGGESTION_TEMPLATES[id]);
        }

        // Sort actions by count and get top ones
        const sorted = Object.entries(actionCounts)
            .filter(([_, count]) => count > 0)
            .sort(([, a], [, b]) => b - a)
            .slice(0, count)
            .map(([id]) => SUGGESTION_TEMPLATES[id as keyof ActionCounts]);

        // If we don't have enough, pad with defaults
        if (sorted.length < count) {
            const existingIds = new Set(sorted.map(s => s.id));
            const additional = DEFAULT_SUGGESTIONS
                .filter(id => !existingIds.has(id))
                .slice(0, count - sorted.length)
                .map(id => SUGGESTION_TEMPLATES[id]);
            return [...sorted, ...additional];
        }

        return sorted;
    }, [actionCounts]);

    // Get all suggestions (for showing full list)
    const getAllSuggestions = useCallback((): Suggestion[] => {
        return Object.values(SUGGESTION_TEMPLATES);
    }, []);

    // Reset action counts (for testing)
    const resetActions = useCallback(async () => {
        setActionCounts(DEFAULT_COUNTS);
        await AsyncStorage.removeItem(USER_ACTIONS_STORAGE_KEY);
    }, []);

    return {
        actionCounts,
        isLoaded,
        recordAction,
        getTopSuggestions,
        getAllSuggestions,
        resetActions,
    };
}
