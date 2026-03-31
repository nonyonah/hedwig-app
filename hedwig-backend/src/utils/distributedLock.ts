import { getRedis } from '../lib/redis';
import { createLogger } from './logger';

const logger = createLogger('DistributedLock');

/**
 * Acquire a Redis-backed distributed lock and run fn inside it.
 * If Redis is unavailable, falls back to running fn directly (single-instance safe).
 * Returns true if fn ran, false if the lock was held by another instance.
 */
export async function withLock(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<void>,
): Promise<boolean> {
    const redis = getRedis();

    if (!redis) {
        // No Redis — run directly (safe for single-instance deployments)
        await fn();
        return true;
    }

    const lockKey = `lock:scheduler:${key}`;

    try {
        const acquired = await redis.set(lockKey, '1', 'EX', ttlSeconds, 'NX');
        if (!acquired) {
            logger.debug('Lock already held by another instance, skipping', { key });
            return false;
        }

        try {
            await fn();
        } finally {
            await redis.del(lockKey).catch(() => {});
        }

        return true;
    } catch (err: any) {
        logger.error('Lock error, running without lock', { key, error: err?.message });
        await fn();
        return true;
    }
}
