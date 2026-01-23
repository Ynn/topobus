import { initWasm, parseKnxprojBytes } from './wasm.js';

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
    const formData = new FormData();
    formData.append('file', file);
    if (password) {
        formData.append('password', password);
    }

    const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
    });

    const responseText = await response.text();
    if (!response.ok) {
        throw new Error(responseText);
    }

    return JSON.parse(responseText);
}
