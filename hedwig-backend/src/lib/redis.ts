import Redis from 'ioredis';
import { createLogger } from '../utils/logger';

const logger = createLogger('Redis');

let client: Redis | null = null;
let pendingClient: Redis | null = null;
let connectionFailed = false;

export function isRedisFailClosed(): boolean {
    const explicit = process.env.REDIS_FAIL_CLOSED;
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return process.env.NODE_ENV === 'production';
}

function initClient(): void {
    const failClosed = isRedisFailClosed();
    const url = process.env.REDIS_URL;
    if (!url) return;

    // Don't reconnect after a past failure
    if (connectionFailed) return;

    // Prevent duplicate init
    if (client || pendingClient) return;

    pendingClient = new Redis(url, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: () => {
            connectionFailed = true;
            pendingClient?.disconnect();
            pendingClient = null;
            logger.warn('Redis unavailable, falling back to in-memory', {
                fallbackMode: failClosed ? 'disabled (fail-closed)' : 'in-memory',
            });
            return null;
        },
        lazyConnect: true,
    });

    pendingClient.on('error', (err) => {
        logger.error('Redis error', { error: err.message });
    });

    pendingClient.connect().then(() => {
        logger.info('Redis connected');
        client = pendingClient;
        pendingClient = null;
    }).catch(() => {
        connectionFailed = true;
        pendingClient = null;
    });
}

export function getRedis(): Redis | null {
    const failClosed = isRedisFailClosed();
    if (!process.env.REDIS_URL) {
        if (failClosed) {
            throw new Error('REDIS_URL is required when REDIS_FAIL_CLOSED is enabled');
        }
        return null;
    }
    if (connectionFailed) {
        if (failClosed) {
            throw new Error('Redis connection unavailable and REDIS_FAIL_CLOSED is enabled');
        }
        return null;
    }

    if (!client && !pendingClient) {
        initClient();
    }

    return client;
}

export async function closeRedis(): Promise<void> {
    if (pendingClient) {
        await pendingClient.quit().catch(() => {});
        pendingClient = null;
    }
    if (client) {
        await client.quit().catch(() => {});
        client = null;
    }
}
