import { initWasm, parseKnxprojBytes } from './wasm.js';
import { ApiClient } from './utils/api_client.js';

export async function parseKnxprojFile(file, password) {
    const wasmData = await tryParseWithWasm(file, password);
    if (wasmData) {
        return wasmData;
    }
    return parseWithServer(file, password);
}

async function tryParseWithWasm(file, password) {
    const ready = await initWasm();
    if (!ready) return null;

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    try {
        return parseKnxprojBytes(bytes, password);
    } catch (error) {
        console.warn('WASM parse failed, falling back to server.', error);
        return null;
    }
}

async function parseWithServer(file, password) {
    const apiClient = new ApiClient();
    return apiClient.uploadProject(file, password, { maxRetries: 3, timeout: 60000 });
}
