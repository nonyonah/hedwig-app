import Redis from 'ioredis';
import { createLogger } from '../utils/logger';

const logger = createLogger('Redis');

let client: Redis | null = null;

export function getRedis(): Redis | null {
    if (!process.env.REDIS_URL) return null;

    if (!client) {
        client = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => Math.min(times * 100, 3000),
            enableOfflineQueue: false,
            lazyConnect: true,
        });

        client.on('connect', () => logger.info('Redis connected'));
        client.on('error', (err) => logger.error('Redis error', { error: err.message }));
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
