let wasmModule = null;
let wasmReady = false;
let wasmInitPromise = null;

export async function initWasm() {
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
            console.warn('WASM parser unavailable, falling back to server.', error);
            wasmModule = null;
            wasmReady = false;
            return false;
        }
    })();

    return wasmInitPromise;
}

export async function parseKnxprojBytes(bytes, password, preferredLanguage) {
    const ready = await initWasm();
    if (!ready || !wasmModule || typeof wasmModule.parse_knxproj !== 'function') {
        throw new Error('WASM parser not available');
    }
    return wasmModule.parse_knxproj(bytes, password || undefined, preferredLanguage || undefined);
}
