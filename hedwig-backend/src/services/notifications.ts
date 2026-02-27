import axios from 'axios';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('Notifications');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushNotificationPayload {
    title: string;
    body: string;
    data?: Record<string, any>;
    sound?: 'default' | null;
    badge?: number;
    channelId?: string;
}

export interface ExpoPushMessage {
    to: string;
    title: string;
    body: string;
    data?: Record<string, any>;
    sound?: 'default' | null;
    badge?: number;
    channelId?: string;
}

export interface ExpoPushTicket {
    status: 'ok' | 'error';
    id?: string;
    message?: string;
    details?: any;
}

/**
 * NotificationService - Sends push notifications via Expo Push API
 */
class NotificationService {
    private isValidExpoToken(expoPushToken: string): boolean {
        return expoPushToken.startsWith('ExponentPushToken[') || expoPushToken.startsWith('ExpoPushToken[');
    }

    private async pruneTokens(tokens: string[]): Promise<number> {
        if (tokens.length === 0) return 0;

        const { error, count } = await supabase
            .from('device_tokens')
            .delete({ count: 'exact' })
            .in('expo_push_token', tokens);

        if (error) {
            logger.error('Failed pruning device tokens', { error: error.message, count: tokens.length });
            return 0;
        }

        return count || 0;
    }

    private async pruneMismatchedExperienceTokens(details: Record<string, string[]>): Promise<void> {
        const expectedExperienceId = process.env.EXPO_EXPECTED_EXPERIENCE_ID;
        if (!expectedExperienceId) {
            logger.warn('[Notifications] EXPO_EXPECTED_EXPERIENCE_ID not set; skipping wrong-project token pruning.');
            return;
        }

        const tokensToDelete = Object.entries(details)
            .filter(([experienceId]) => experienceId !== expectedExperienceId)
            .flatMap(([, tokens]) => tokens || [])
            .filter(Boolean);

        if (tokensToDelete.length === 0) return;

        const deleted = await this.pruneTokens(tokensToDelete);
        logger.info('[Notifications] Pruned mismatched Expo experience tokens', {
            expectedExperienceId,
            requestedDeleteCount: tokensToDelete.length,
            deletedCount: deleted,
        });
    }

    /**
     * Send a push notification to a single device
     */
    async sendPushNotification(expoPushToken: string, payload: PushNotificationPayload): Promise<ExpoPushTicket> {
        // Validate Expo push token format
        if (!expoPushToken.startsWith('ExponentPushToken[') && !expoPushToken.startsWith('ExpoPushToken[')) {
            logger.error('Invalid Expo push token format');
            return { status: 'error', message: 'Invalid token format' };
        }

        const message: ExpoPushMessage = {
            to: expoPushToken,
            title: payload.title,
            body: payload.body,
            data: payload.data,
            sound: payload.sound ?? 'default',
            channelId: payload.channelId,
        };

        try {
            const response = await axios.post(EXPO_PUSH_URL, message, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
            });

            const ticket = response.data.data?.[0] as ExpoPushTicket;

            if (ticket?.status === 'ok') {
                logger.info('Sent notification');
            } else {
                logger.error('Failed to send notification');
            }

            return ticket || { status: 'error', message: 'No ticket received' };
        } catch (error: any) {
            logger.error('Error sending push notification', { error: error.message });
            return { status: 'error', message: error.message };
        }
    }

    /**
     * Send push notifications to multiple devices
     */
    async sendBulkNotifications(tokens: string[], payload: PushNotificationPayload, allowRegroup: boolean = true): Promise<ExpoPushTicket[]> {
        const messages: ExpoPushMessage[] = tokens
            .filter(token => this.isValidExpoToken(token))
            .map(token => ({
                to: token,
                title: payload.title,
                body: payload.body,
                data: payload.data,
                sound: payload.sound ?? 'default',
                channelId: payload.channelId,
            }));

        if (messages.length === 0) {
            return [];
        }

        try {
            const response = await axios.post(EXPO_PUSH_URL, messages, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
            });

            return response.data.data as ExpoPushTicket[];
        } catch (error: any) {
            const responseData = error?.response?.data;
            const firstError = Array.isArray(responseData?.errors) ? responseData.errors[0] : undefined;
            const details = firstError?.details;

            // Handle PUSH_TOO_MANY_EXPERIENCE_IDS by regrouping tokens per experience ID.
            if (
                allowRegroup &&
                firstError?.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS' &&
                details &&
                typeof details === 'object'
            ) {
                logger.warn('[Notifications] PUSH_TOO_MANY_EXPERIENCE_IDS. Regrouping tokens by experienceId.', {
                    details,
                });
                await this.pruneMismatchedExperienceTokens(details as Record<string, string[]>);

                const allTickets: ExpoPushTicket[] = [];
                for (const experienceId of Object.keys(details)) {
                    const groupTokens = details[experienceId] as string[] | undefined;
                    if (!groupTokens || groupTokens.length === 0) continue;

                    // Recursively send for this subset without further regrouping.
                    const groupTickets = await this.sendBulkNotifications(groupTokens, payload, false);
                    allTickets.push(...groupTickets);
                }

                return allTickets;
            }

            logger.error('Error sending bulk notifications', { 
                error: error.message,
                response: responseData
            });
            return [];
        }
    }

    /**
     * Send notification to all devices for a user
     */
    async notifyUser(userId: string, payload: PushNotificationPayload): Promise<ExpoPushTicket[]> {
        try {
            // Get all device tokens for this user
            const { data: tokens, error } = await supabase
                .from('device_tokens')
                .select('expo_push_token')
                .eq('user_id', userId);

            if (error || !tokens || tokens.length === 0) {
                logger.debug('No device tokens found');
                return [];
            }

            const pushTokens = tokens.map(t => t.expo_push_token);
            return await this.sendBulkNotifications(pushTokens, payload);
        } catch (error: any) {
            logger.error('Error notifying user', { error: error.message });
            return [];
        }
    }

    /**
     * Send transaction notification to a user
     */
    async notifyTransaction(userId: string, txData: {
        type: 'received' | 'sent' | 'confirmed';
        amount: string;
        token: string;
        network: string;
        txHash?: string;
    }): Promise<ExpoPushTicket[]> {
        let title: string;
        let body: string;

        switch (txData.type) {
            case 'received':
                title = '💰 Payment Received!';
                body = `You received ${txData.amount} ${txData.token} on ${txData.network}`;
                break;
            case 'sent':
                title = '📤 Payment Sent';
                body = `You sent ${txData.amount} ${txData.token} on ${txData.network}`;
                break;
            case 'confirmed':
                title = '✅ Transaction Confirmed';
                body = `Your ${txData.amount} ${txData.token} transaction is confirmed`;
                break;
            default:
                title = 'Transaction Update';
                body = `${txData.amount} ${txData.token} on ${txData.network}`;
        }

        return await this.notifyUser(userId, {
            title,
            body,
            data: {
                type: 'transaction',
                txHash: txData.txHash,
                network: txData.network,
            },
        });
    }

    /**
     * Register a device token for push notifications
     */
    async registerDeviceToken(userId: string, expoPushToken: string, platform: 'ios' | 'android'): Promise<boolean> {
        try {
            const { error } = await supabase
                .from('device_tokens')
                .upsert({
                    user_id: userId,
                    expo_push_token: expoPushToken,
                    platform,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id,expo_push_token' });

            if (error) {
                logger.error('Failed to register device token');
                return false;
            }

            logger.info('Registered device token');
            return true;
        } catch (error: any) {
            logger.error('Error registering device token', { error: error.message });
            return false;
        }
    }

    /**
     * Remove a device token
     */
    async removeDeviceToken(expoPushToken: string): Promise<boolean> {
        try {
            const { error } = await supabase
                .from('device_tokens')
                .delete()
                .eq('expo_push_token', expoPushToken);

            if (error) {
                logger.error('Failed to remove device token');
                return false;
            }

            return true;
        } catch (error: any) {
            logger.error('Error removing device token', { error: error.message });
            return false;
        }
    }

    /**
     * Periodic cleanup for Expo device tokens:
     * - Remove malformed tokens
     * - Remove tokens not updated recently
     */
    async cleanupExpoDeviceTokens(staleDays: number = 45): Promise<{ invalidDeleted: number; staleDeleted: number }> {
        const cutoffDate = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();

        try {
            const { data: allTokens, error: fetchError } = await supabase
                .from('device_tokens')
                .select('expo_push_token');

            if (fetchError) {
                logger.error('Failed to fetch device tokens for cleanup', { error: fetchError.message });
                return { invalidDeleted: 0, staleDeleted: 0 };
            }

            const invalidTokens = (allTokens || [])
                .map((row: any) => row.expo_push_token as string)
                .filter((token: string) => token && !this.isValidExpoToken(token));

            const invalidDeleted = await this.pruneTokens(invalidTokens);

            const { error: staleError, count: staleDeletedCount } = await supabase
                .from('device_tokens')
                .delete({ count: 'exact' })
                .lt('updated_at', cutoffDate);

            if (staleError) {
                logger.error('Failed to prune stale device tokens', { error: staleError.message });
                return { invalidDeleted, staleDeleted: 0 };
            }

            const staleDeleted = staleDeletedCount || 0;
            logger.info('[Notifications] Expo token cleanup completed', {
                staleDays,
                invalidDeleted,
                staleDeleted,
            });

            return { invalidDeleted, staleDeleted };
        } catch (error: any) {
            logger.error('Unexpected error during Expo token cleanup', { error: error.message });
            return { invalidDeleted: 0, staleDeleted: 0 };
        }
    }

    /**
     * Send notification when a contract is approved by client
     */
    async notifyContractApproved(
        userId: string,
        contractId: string,
        contractTitle: string,
        clientName: string
    ): Promise<ExpoPushTicket[]> {
        // Also create in-app notification record
        try {
            await supabase
                .from('notifications')
                .insert({
                    user_id: userId,
                    type: 'contract_approved',
                    title: 'Contract Approved! 🎉',
                    message: `${clientName} has approved your contract: ${contractTitle}`,
                    metadata: {
                        contract_id: contractId,
                        client_name: clientName
                    },
                    is_read: false
                });
        } catch (err) {
            logger.error('Failed to create in-app notification');
        }

        return await this.notifyUser(userId, {
            title: '🎉 Contract Approved!',
            body: `${clientName} has approved your contract: ${contractTitle}`,
            data: {
                type: 'contract_approved',
                contractId,
                screen: '/contracts'
            },
        });
    }

    /**
     * Send notification to freelancer when a proposal is sent to client
     */
    async notifyProposalSent(
        userId: string,
        proposalId: string,
        proposalTitle: string,
        clientName: string,
        clientEmail: string
    ): Promise<ExpoPushTicket[]> {
        // Create in-app notification record
        try {
            await supabase
                .from('notifications')
                .insert({
                    user_id: userId,
                    type: 'proposal_sent',
                    title: 'Proposal Sent! 📤',
                    message: `Your proposal "${proposalTitle}" has been sent to ${clientName}`,
                    metadata: {
                        proposal_id: proposalId,
                        client_name: clientName,
                        client_email: clientEmail
                    },
                    is_read: false
                });
        } catch (err) {
            logger.error('Failed to create in-app notification');
        }

        return await this.notifyUser(userId, {
            title: '📤 Proposal Sent!',
            body: `Your proposal "${proposalTitle}" has been sent to ${clientName}`,
            data: {
                type: 'proposal_sent',
                proposalId,
                screen: '/proposals'
            },
        });
    }

    /**
     * Send notification to freelancer when proposal is accepted
     */
    async notifyProposalAccepted(
        userId: string,
        proposalId: string,
        proposalTitle: string,
        clientName: string
    ): Promise<ExpoPushTicket[]> {
        // Create in-app notification record
        try {
            await supabase
                .from('notifications')
                .insert({
                    user_id: userId,
                    type: 'proposal_accepted',
                    title: 'Proposal Accepted! 🎉',
                    message: `${clientName} has accepted your proposal: ${proposalTitle}`,
                    metadata: {
                        proposal_id: proposalId,
                        client_name: clientName
                    },
                    is_read: false
                });
        } catch (err) {
            logger.error('Failed to create in-app notification');
        }

        return await this.notifyUser(userId, {
            title: '🎉 Proposal Accepted!',
            body: `${clientName} has accepted your proposal: ${proposalTitle}`,
            data: {
                type: 'proposal_accepted',
                proposalId,
                screen: '/proposals'
            },
        });
    }
}

export default new NotificationService();
