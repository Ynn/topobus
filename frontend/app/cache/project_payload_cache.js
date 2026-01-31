import { resolveDptSize } from '../formatters/device.js';

const DB_NAME = 'topobus-project-cache';
const DB_VERSION = 2;
const DEVICE_STORE = 'device-payload';
const GRAPH_STORE = 'project-graphs';
const SESSION_FLAG = 'topobus_project_cache_init';

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
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DEVICE_STORE)) {
                db.createObjectStore(DEVICE_STORE);
            }
            if (!db.objectStoreNames.contains(GRAPH_STORE)) {
                db.createObjectStore(GRAPH_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open project cache DB'));
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
            await clearProjectPayloadCache();
            sessionStorage.setItem(SESSION_FLAG, '1');
        }
        return db;
    })();
    return initPromise;
}

function buildDeviceKey(projectKey, deviceKey) {
    if (!projectKey || !deviceKey) return null;
    return `${projectKey}::${deviceKey}`;
}

export async function getDevicePayload(projectKey, deviceKey) {
    const key = buildDeviceKey(projectKey, deviceKey);
    if (!key) return null;
    const db = await ensureInit().catch(() => null);
    if (!db) return null;
    return new Promise((resolve) => {
        const tx = db.transaction(DEVICE_STORE, 'readonly');
        const store = tx.objectStore(DEVICE_STORE);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
    });
}

export async function setDevicePayload(projectKey, deviceKey, payload) {
    const key = buildDeviceKey(projectKey, deviceKey);
    if (!key) return false;
    const db = await ensureInit().catch(() => null);
    if (!db) return false;
    return new Promise((resolve) => {
        const tx = db.transaction(DEVICE_STORE, 'readwrite');
        const store = tx.objectStore(DEVICE_STORE);
        const request = store.put(payload, key);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
    });
}

export async function clearProjectPayloadCache() {
    const db = await openDb().catch(() => null);
    if (!db) return;
    return new Promise((resolve, reject) => {
        const stores = [];
        if (db.objectStoreNames.contains(DEVICE_STORE)) stores.push(DEVICE_STORE);
        if (db.objectStoreNames.contains(GRAPH_STORE)) stores.push(GRAPH_STORE);
        if (!stores.length) {
            resolve();
            return;
        }
        const tx = db.transaction(stores, 'readwrite');
        stores.forEach((name) => {
            const store = tx.objectStore(name);
            store.clear();
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Project cache clear failed'));
        tx.onabort = () => reject(tx.error || new Error('Project cache clear aborted'));
    });
}

export async function getProjectGraphs(projectKey) {
    if (!projectKey) return null;
    const db = await ensureInit().catch(() => null);
    if (!db || !db.objectStoreNames.contains(GRAPH_STORE)) return null;
    return new Promise((resolve) => {
        const tx = db.transaction(GRAPH_STORE, 'readonly');
        const store = tx.objectStore(GRAPH_STORE);
        const request = store.get(projectKey);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
    });
}

export async function setProjectGraphs(projectKey, graphs) {
    if (!projectKey) return false;
    const db = await ensureInit().catch(() => null);
    if (!db || !db.objectStoreNames.contains(GRAPH_STORE)) return false;
    return new Promise((resolve) => {
        const tx = db.transaction(GRAPH_STORE, 'readwrite');
        const store = tx.objectStore(GRAPH_STORE);
        const request = store.put(graphs, projectKey);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
    });
}

export async function getProjectCacheStats(projectKey) {
    if (!projectKey) return null;
    const db = await ensureInit().catch(() => null);
    if (!db) return null;
    const stats = {
        devicePayloadCount: 0,
        hasProjectGraphs: false
    };
    if (db.objectStoreNames.contains(DEVICE_STORE)) {
        stats.devicePayloadCount = await new Promise((resolve) => {
            const tx = db.transaction(DEVICE_STORE, 'readonly');
            const store = tx.objectStore(DEVICE_STORE);
            const request = store.count();
            request.onsuccess = () => resolve(request.result || 0);
            request.onerror = () => resolve(0);
        });
    }
    if (db.objectStoreNames.contains(GRAPH_STORE)) {
        stats.hasProjectGraphs = await new Promise((resolve) => {
            const tx = db.transaction(GRAPH_STORE, 'readonly');
            const store = tx.objectStore(GRAPH_STORE);
            const request = store.get(projectKey);
            request.onsuccess = () => resolve(Boolean(request.result));
            request.onerror = () => resolve(false);
        });
    }
    return stats;
}

export async function offloadDevicePayloads(projectKey, project) {
    if (!projectKey || !project || !Array.isArray(project.devices)) return false;

    const candidates = [];
    const fallbackMap = new Map();
    project.devices.forEach((device) => {
        if (!device) return;
        const deviceKey = device.individual_address || device.instance_id || '';
        if (!deviceKey) return;
        const entries = Array.isArray(device.configuration_entries) ? device.configuration_entries : [];
        const config = device.configuration && typeof device.configuration === 'object' ? device.configuration : null;
        const links = Array.isArray(device.group_links) ? device.group_links : [];
        links.forEach((link) => {
            if (!link || !link.group_address) return;
            const address = String(link.group_address);
            let entry = fallbackMap.get(address);
            if (!entry) {
                entry = { datapoint_type: '', object_size: '' };
                fallbackMap.set(address, entry);
            }
            if (!entry.datapoint_type && link.datapoint_type) {
                entry.datapoint_type = link.datapoint_type;
            }
            if (!entry.object_size && link.object_size) {
                entry.object_size = link.object_size;
            }
            if (!entry.object_size && link.datapoint_type) {
                entry.object_size = resolveDptSize(link.datapoint_type);
            }
        });
        const hasConfig = entries.length > 0 || (config && Object.keys(config).length > 0);
        const hasLinks = links.length > 0;
        if (!hasConfig && !hasLinks) return;
        candidates.push({ device, deviceKey, entries, config: config || {}, links });
    });

    if (!candidates.length) return false;
    const db = await ensureInit().catch(() => null);
    if (!db) return false;

    const stored = await new Promise((resolve) => {
        const tx = db.transaction(DEVICE_STORE, 'readwrite');
        const store = tx.objectStore(DEVICE_STORE);
        candidates.forEach(({ deviceKey, entries, config, links }) => {
            const key = buildDeviceKey(projectKey, deviceKey);
            if (!key) return;
            store.put({ configuration_entries: entries, configuration: config, group_links: links }, key);
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
    });

    if (!stored) return false;

    candidates.forEach(({ device, entries, links }) => {
        device._config_entry_count = entries.length;
        device._config_cached = true;
        device.configuration_entries = [];
        device.configuration = {};
        device._link_count = links.length;
        device._links_cached = true;
        device.group_links = [];
    });
    if (fallbackMap.size) {
        project._group_address_fallbacks = fallbackMap;
    }
    return true;
}

export async function offloadProjectGraphs(projectKey, project) {
    if (!projectKey || !project) return false;
    const topology = project.topology_graph || null;
    const group = project.group_address_graph || null;
    if (!topology && !group) return false;

    const payload = {
        topology_graph: topology,
        group_address_graph: group
    };
    const stored = await setProjectGraphs(projectKey, payload);
    if (!stored) return false;

    project._graph_cached = true;
    project._graph_load_failed = false;
    project._graph_counts = {
        topology: {
            nodes: topology && Array.isArray(topology.nodes) ? topology.nodes.length : 0,
            edges: topology && Array.isArray(topology.edges) ? topology.edges.length : 0
        },
        group: {
            nodes: group && Array.isArray(group.nodes) ? group.nodes.length : 0,
            edges: group && Array.isArray(group.edges) ? group.edges.length : 0
        }
    };
    project.topology_graph = null;
    project.group_address_graph = null;
    return true;
}
