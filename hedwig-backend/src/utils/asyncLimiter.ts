type Task<T> = () => Promise<T>;

/**
 * Tiny in-process concurrency limiter for outbound I/O.
 */
export class AsyncLimiter {
    private active = 0;
    private readonly queue: Array<() => void> = [];
    private readonly maxConcurrent: number;
    private readonly maxQueue: number;

    constructor(maxConcurrent: number, maxQueue: number = 500) {
        this.maxConcurrent = Math.max(1, Math.floor(maxConcurrent));
        this.maxQueue = Math.max(1, Math.floor(maxQueue));
    }

    async run<T>(task: Task<T>): Promise<T> {
        if (this.active >= this.maxConcurrent) {
            if (this.queue.length >= this.maxQueue) {
                throw new Error(`AsyncLimiter queue overflow (maxQueue=${this.maxQueue})`);
            }
            await new Promise<void>((resolve) => this.queue.push(resolve));
        }

        this.active += 1;
        try {
            return await task();
        } finally {
            this.active -= 1;
            const next = this.queue.shift();
            if (next) next();
        }
    }
}
