let workerCounter = 0;

export function parseKnxprojBytesWithWorker(buffer, password, preferredLanguage, options = {}) {
    if (typeof Worker === 'undefined') {
        return Promise.reject(new Error('Web Worker not supported'));
    }
    const timeoutMs = Number(options.timeoutMs || 0) || 120000;
    const id = `parse-${Date.now()}-${workerCounter++}`;
    const worker = new Worker(new URL('./wasm_worker.js', import.meta.url), { type: 'module' });

    return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            if (settled) return;
            settled = true;
            worker.terminate();
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };

        const timeoutId = timeoutMs
            ? setTimeout(() => {
                cleanup();
                reject(new Error('WASM worker timeout'));
            }, timeoutMs)
            : null;

        worker.addEventListener('message', (event) => {
            const data = event.data || {};
            if (data.id !== id) return;
            cleanup();
            if (data.ok) {
                resolve(data.result);
            } else {
                const err = data.error || {};
                const message = err.message || 'WASM worker error';
                const error = new Error(message);
                if (err.stack) error.stack = err.stack;
                reject(error);
            }
        });

        worker.addEventListener('error', (event) => {
            cleanup();
            reject(event.error || new Error('WASM worker failed'));
        });

        worker.postMessage(
            { id, buffer, password: password || null, preferredLanguage: preferredLanguage || null },
            buffer ? [buffer] : []
        );
    });
}
