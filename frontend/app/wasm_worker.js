let wasmModule = null;
let wasmReady = false;
let wasmInitPromise = null;

async function initWasm() {
    if (wasmReady) return true;
    if (wasmInitPromise) return wasmInitPromise;

    wasmInitPromise = (async () => {
        try {
            const module = await import('../wasm/topobus_wasm.js');
            if (typeof module.default === 'function') {
                const wasmUrl = new URL('../wasm/topobus_wasm_bg.wasm', import.meta.url);
                try {
                    await module.default({ module_or_path: wasmUrl });
                } catch (error) {
                    await module.default(wasmUrl);
                }
            }
            wasmModule = module;
            wasmReady = true;
            return true;
        } catch (error) {
            wasmModule = null;
            wasmReady = false;
            throw error;
        }
    })();

    return wasmInitPromise;
}

function serializeError(error) {
    if (!error) return { message: 'Unknown error' };
    if (typeof error === 'string') return { message: error };
    return {
        message: error.message || String(error),
        stack: error.stack || ''
    };
}

self.addEventListener('message', async (event) => {
    const { id, buffer, password, preferredLanguage } = event.data || {};
    if (!id) return;
    try {
        await initWasm();
        if (!wasmModule || typeof wasmModule.parse_knxproj !== 'function') {
            throw new Error('WASM parser not available');
        }
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
        const result = wasmModule.parse_knxproj(
            bytes,
            password || undefined,
            preferredLanguage || undefined
        );
        self.postMessage({ id, ok: true, result });
    } catch (error) {
        self.postMessage({ id, ok: false, error: serializeError(error) });
    }
});
