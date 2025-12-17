import axios from 'axios';
import { supabase } from '../lib/supabase';

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
    /**
     * Send a push notification to a single device
     */
    async sendPushNotification(expoPushToken: string, payload: PushNotificationPayload): Promise<ExpoPushTicket> {
        // Validate Expo push token format
        if (!expoPushToken.startsWith('ExponentPushToken[') && !expoPushToken.startsWith('ExpoPushToken[')) {
            console.error('[Notifications] Invalid Expo push token format:', expoPushToken);
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
                console.log(`[Notifications] Sent notification to ${expoPushToken}`);
            } else {
                console.error('[Notifications] Failed to send:', ticket?.message);
            }

            return ticket || { status: 'error', message: 'No ticket received' };
        } catch (error: any) {
            console.error('[Notifications] Error sending push notification:', error.message);
            return { status: 'error', message: error.message };
        }
    }

    /**
     * Send push notifications to multiple devices
     */
    async sendBulkNotifications(tokens: string[], payload: PushNotificationPayload): Promise<ExpoPushTicket[]> {
        const messages: ExpoPushMessage[] = tokens
            .filter(token => token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
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
            console.error('[Notifications] Error sending bulk notifications:', error.message);
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
                console.log(`[Notifications] No device tokens found for user ${userId}`);
                return [];
            }

            const pushTokens = tokens.map(t => t.expo_push_token);
            return await this.sendBulkNotifications(pushTokens, payload);
        } catch (error: any) {
            console.error('[Notifications] Error notifying user:', error.message);
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
                console.error('[Notifications] Failed to register device token:', error);
                return false;
            }

            console.log(`[Notifications] Registered device token for user ${userId}`);
            return true;
        } catch (error: any) {
            console.error('[Notifications] Error registering device token:', error.message);
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
                console.error('[Notifications] Failed to remove device token:', error);
                return false;
            }

            return true;
        } catch (error: any) {
            console.error('[Notifications] Error removing device token:', error.message);
            return false;
        }
    }
}

export default new NotificationService();
