export class RateLimiter {
    constructor(config) {
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: config
        });
        Object.defineProperty(this, "timestamps", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
    }
    cleanup(now) {
        const windowStart = now - this.config.perMilliseconds;
        while (this.timestamps.length && this.timestamps[0] < windowStart) {
            this.timestamps.shift();
        }
    }
    async waitForTurn() {
        while (true) {
            const now = Date.now();
            this.cleanup(now);
            if (this.timestamps.length < this.config.maxRequests) {
                this.timestamps.push(now);
                return;
            }
            const earliest = this.timestamps[0];
            const delay = this.config.perMilliseconds - (now - earliest);
            await new Promise((resolve) => setTimeout(resolve, Math.max(delay, 0)));
        }
    }
    async schedule(fn) {
        await this.waitForTurn();
        try {
            return await fn();
        }
        finally {
            this.cleanup(Date.now());
        }
    }
}
