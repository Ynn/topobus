import { state } from './state.js';

class StateManager {
    #listeners = new Map();
    #anyListeners = new Set();

    subscribe(key, callback) {
        if (!key || typeof callback !== 'function') return () => {};
        if (!this.#listeners.has(key)) {
            this.#listeners.set(key, new Set());
        }
        const set = this.#listeners.get(key);
        set.add(callback);
        return () => set.delete(callback);
    }

    subscribeAny(callback) {
        if (typeof callback !== 'function') return () => {};
        this.#anyListeners.add(callback);
        return () => this.#anyListeners.delete(callback);
    }

    getState(key) {
        return state[key];
    }

    setState(key, value) {
        const prev = state[key];
        if (Object.is(prev, value)) return;
        state[key] = value;
        this.#notify(key, value, prev);
    }

    setStatePatch(patch) {
        if (!patch || typeof patch !== 'object') return;
        Object.entries(patch).forEach(([key, value]) => {
            this.setState(key, value);
        });
    }

    #notify(key, value, prev) {
        const listeners = this.#listeners.get(key);
        if (listeners) {
            listeners.forEach((callback) => {
                try {
                    callback(value, prev);
                } catch (error) {
                    console.warn('State listener failed', error);
                }
            });
        }
        this.#anyListeners.forEach((callback) => {
            try {
                callback(key, value, prev);
            } catch (error) {
                console.warn('State listener failed', error);
            }
        });
    }
}

export const stateManager = new StateManager();
