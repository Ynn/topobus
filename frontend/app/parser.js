import { initWasm, parseKnxprojBytes } from './wasm.js';
import { state } from './state.js';
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
        const preferredLanguage = state.uiSettings && state.uiSettings.productLanguage
            ? String(state.uiSettings.productLanguage)
            : undefined;
        return parseKnxprojBytes(bytes, password, preferredLanguage);
    } catch (error) {
        if (isPasswordError(error)) {
            throw error;
        }
        console.warn('WASM parse failed, falling back to server.', error);
        return null;
    }
}

async function parseWithServer(file, password) {
    const apiClient = new ApiClient();
    const preferredLanguage = state.uiSettings && state.uiSettings.productLanguage
        ? String(state.uiSettings.productLanguage)
        : undefined;
    return apiClient.uploadProject(file, password, preferredLanguage, { maxRetries: 3, timeout: 60000 });
}

function isPasswordError(error) {
    const message = error && error.message ? error.message : String(error || '');
    const lower = message.toLowerCase();
    return lower.includes('password') || lower.includes('encrypted');
}
