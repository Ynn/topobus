const META_KEY = 'topobus.last_project_meta.v1';
const OPFS_DIR_NAME = 'topobus-cache';
const OPFS_FILE_NAME = 'last-project.knxproj';

function getLocalStorage() {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage || null;
    } catch {
        return null;
    }
}

function readMeta() {
    const storage = getLocalStorage();
    if (!storage) return null;
    try {
        const raw = storage.getItem(META_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeMeta(meta) {
    const storage = getLocalStorage();
    if (!storage) return;
    try {
        if (!meta) {
            storage.removeItem(META_KEY);
            return;
        }
        storage.setItem(META_KEY, JSON.stringify(meta));
    } catch {}
}

export function isProjectFilePersistenceSupported() {
    return typeof navigator !== 'undefined'
        && !!navigator.storage
        && typeof navigator.storage.getDirectory === 'function';
}

async function getProjectStoreDir(create = true) {
    if (!isProjectFilePersistenceSupported()) return null;
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(OPFS_DIR_NAME, { create });
}

async function getProjectFileHandle(create = false) {
    const dir = await getProjectStoreDir(create);
    if (!dir) return null;
    return dir.getFileHandle(OPFS_FILE_NAME, { create });
}

export function getStoredProjectMeta() {
    return readMeta();
}

export async function saveLastProjectFile(file) {
    if (!(file instanceof File)) return false;
    if (!isProjectFilePersistenceSupported()) return false;

    try {
        const handle = await getProjectFileHandle(true);
        if (!handle) return false;

        const writable = await handle.createWritable();
        if (typeof file.stream === 'function') {
            await file.stream().pipeTo(writable);
        } else {
            await writable.write(await file.arrayBuffer());
            await writable.close();
        }

        writeMeta({
            name: file.name || 'project.knxproj',
            size: Number.isFinite(file.size) ? file.size : null,
            type: file.type || 'application/octet-stream',
            lastModified: Number.isFinite(file.lastModified) ? file.lastModified : Date.now(),
            storedAt: Date.now()
        });
        console.info('[TopoBus] Saved current project in OPFS for reload recovery:', file.name);
        return true;
    } catch (error) {
        console.warn('Failed to persist project file in OPFS.', error);
        writeMeta(null);
        return false;
    }
}

export async function loadLastProjectFile() {
    if (!isProjectFilePersistenceSupported()) return null;
    const meta = readMeta();
    if (!meta) return null;

    try {
        const handle = await getProjectFileHandle(false);
        if (!handle) return null;
        const storedFile = await handle.getFile();
        if (!storedFile) return null;

        const lastModified = Number.isFinite(Number(meta.lastModified))
            ? Number(meta.lastModified)
            : Date.now();
        const fileName = meta.name && String(meta.name).trim()
            ? String(meta.name).trim()
            : storedFile.name;
        const fileType = meta.type && String(meta.type).trim()
            ? String(meta.type).trim()
            : (storedFile.type || 'application/octet-stream');

        const restoredFile = new File([storedFile], fileName, {
            type: fileType,
            lastModified
        });
        console.info('[TopoBus] Restored project from OPFS:', fileName);
        return {
            file: restoredFile,
            meta: {
                ...meta,
                size: Number.isFinite(storedFile.size) ? storedFile.size : meta.size
            }
        };
    } catch (error) {
        console.warn('Failed to restore project file from OPFS.', error);
        return null;
    }
}

export async function clearLastProjectFile() {
    writeMeta(null);
    if (!isProjectFilePersistenceSupported()) return;
    try {
        const dir = await getProjectStoreDir(false);
        if (!dir) return;
        await dir.removeEntry(OPFS_FILE_NAME);
    } catch {}
}
