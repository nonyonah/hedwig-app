import Redis from 'ioredis';
import { createLogger } from '../utils/logger';

const logger = createLogger('Redis');

let client: Redis | null = null;
let connectionFailed = false;

export function getRedis(): Redis | null {
    if (!process.env.REDIS_URL) return null;
    if (connectionFailed) return null;

    if (!client) {
        client = new Redis(process.env.REDIS_URL, {
            // Null = no limit on queued commands, but we handle failure by
            // nulling out the client below rather than crashing the process.
            maxRetriesPerRequest: null,
            retryStrategy: (times) => {
                if (times >= 3) {
                    // Give up retrying — fall back to in-memory for this run.
                    logger.warn('Redis unavailable after 3 attempts, falling back to in-memory mode');
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
