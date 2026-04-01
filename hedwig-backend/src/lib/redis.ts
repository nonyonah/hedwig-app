import Redis from 'ioredis';
import { createLogger } from '../utils/logger';

const logger = createLogger('Redis');

let client: Redis | null = null;
let connectionFailed = false;

export function isRedisFailClosed(): boolean {
    const explicit = process.env.REDIS_FAIL_CLOSED;
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return process.env.NODE_ENV === 'production';
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

    if (!client) {
        client = new Redis(process.env.REDIS_URL, {
            // Null = no limit on queued commands, but we handle failure by
            // nulling out the client below rather than crashing the process.
            maxRetriesPerRequest: null,
            retryStrategy: (times) => {
                if (times >= 3) {
                    // Give up retrying — fall back to in-memory for this run.
                    logger.warn('Redis unavailable after 3 attempts', {
                        fallbackMode: failClosed ? 'disabled (fail-closed)' : 'in-memory',
                    });
                    connectionFailed = true;
                    client?.disconnect();
                    client = null;
                    return null; // stops retrying
                }
                return Math.min(times * 200, 2000);
            },
            enableOfflineQueue: true,
            lazyConnect: false,
        });

        client.on('connect', () => {
            connectionFailed = false;
            logger.info('Redis connected');
        });

        client.on('error', (err) => {
            // Log but don't throw — the retryStrategy handles giving up.
            logger.error('Redis error', { error: err.message });
        });

        client.on('reconnecting', () => logger.warn('Redis reconnecting'));
    }

    return client;
}

export async function closeRedis(): Promise<void> {
    if (client) {
        await client.quit().catch(() => {});
        client = null;
    }
}
