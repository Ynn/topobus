import { state } from './state.js';
import { ApiClient } from './utils/api_client.js';
import { parseKnxprojBytesWithWorker } from './wasm_worker_client.js';

export async function parseKnxprojFile(file, password, options = {}) {
    const allowServerFallback = options && options.allowServerFallback !== false;
    const wasmData = await tryParseWithWasm(file, password, {
        strict: !allowServerFallback
    });
    if (wasmData) {
        return wasmData;
    }
    if (!allowServerFallback) {
        throw new Error('Local parsing failed and server fallback is disabled.');
    }
    return parseWithServer(file, password);
}

async function tryParseWithWasm(file, password, options = {}) {
    const buffer = await file.arrayBuffer();
    try {
        const preferredLanguage = state.uiSettings && state.uiSettings.productLanguage
            ? String(state.uiSettings.productLanguage)
            : undefined;
        return await parseKnxprojBytesWithWorker(buffer, password, preferredLanguage);
    } catch (error) {
        if (isPasswordError(error)) {
            throw error;
        }
        if (options && options.strict) {
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
