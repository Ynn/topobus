const DB_NAME = 'topobus-layout-cache';
const STORE_NAME = 'layouts';
const SESSION_FLAG = 'topobus_layout_cache_init';

let dbPromise = null;
let initPromise = null;

function hasStorage() {
    return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function getSessionStorage() {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage || null;
}

function openDb() {
    if (dbPromise) return dbPromise;
    if (!hasStorage()) {
        dbPromise = Promise.resolve(null);
        return dbPromise;
    }
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open layout cache DB'));
    });
    return dbPromise;
}

async function ensureInit() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        const db = await openDb().catch(() => null);
        if (!db) return null;
        const sessionStorage = getSessionStorage();
        if (sessionStorage && !sessionStorage.getItem(SESSION_FLAG)) {
            await clearLayoutCache();
            sessionStorage.setItem(SESSION_FLAG, '1');
        }
        return db;
    })();
    return initPromise;
}

export async function getLayoutCache(key) {
    if (!key) return null;
    const db = await ensureInit().catch(() => null);
    if (!db) return null;
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
    });
}

export async function setLayoutCache(key, value) {
    if (!key) return;
    const db = await ensureInit().catch(() => null);
    if (!db) return;
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
    });
}

export async function clearLayoutCache() {
    const db = await openDb().catch(() => null);
    if (!db) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Layout cache clear failed'));
        tx.onabort = () => reject(tx.error || new Error('Layout cache clear aborted'));
    });
}
