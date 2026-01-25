export class GraphCache {
    #cache = new Map();
    #maxSize = 50;
    #stats = { hits: 0, misses: 0 };

    constructor(options = {}) {
        const size = Number(options.maxSize || 0);
        if (Number.isFinite(size) && size > 0) {
            this.#maxSize = size;
        }
    }

    get(key) {
        if (!key) return null;
        const entry = this.#cache.get(key);
        if (entry) {
            this.#stats.hits += 1;
            entry.lastAccessed = Date.now();
            return entry.data;
        }
        this.#stats.misses += 1;
        return null;
    }

    set(key, data) {
        if (!key) return;
        if (this.#cache.size >= this.#maxSize) {
            this.#evictOldest();
        }
        this.#cache.set(key, {
            data,
            created: Date.now(),
            lastAccessed: Date.now()
        });
    }

    clear() {
        this.#cache.clear();
    }

    invalidate(prefix) {
        if (!prefix) return;
        for (const key of this.#cache.keys()) {
            if (String(key).startsWith(prefix)) {
                this.#cache.delete(key);
            }
        }
    }

    getStats() {
        const total = this.#stats.hits + this.#stats.misses;
        const hitRate = total ? this.#stats.hits / total : 0;
        return {
            hits: this.#stats.hits,
            misses: this.#stats.misses,
            size: this.#cache.size,
            hitRate: `${(hitRate * 100).toFixed(2)}%`
        };
    }

    #evictOldest() {
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [key, entry] of this.#cache.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            this.#cache.delete(oldestKey);
        }
    }
}
