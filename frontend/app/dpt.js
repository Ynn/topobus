import { state } from './state.js';

const DPT_CSV_PATH = new URL('../dpt.csv', import.meta.url);
let loadPromise = null;

export function loadDptCatalog() {
    if (state.dptCatalog) {
        return Promise.resolve(state.dptCatalog);
    }
    if (loadPromise) {
        return loadPromise;
    }
    loadPromise = fetch(DPT_CSV_PATH)
        .then((response) => (response.ok ? response.text() : ''))
        .then((text) => {
            state.dptCatalog = parseDptCsv(text || '');
            return state.dptCatalog;
        })
        .catch(() => {
            state.dptCatalog = emptyCatalog();
            return state.dptCatalog;
        });
    return loadPromise;
}

export function formatDatapointType(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    const catalog = state.dptCatalog;
    if (!catalog || !catalog.byId || catalog.byId.size === 0) {
        return trimmed;
    }
    const info = resolveDptInfo(trimmed, catalog);
    if (!info) return trimmed;
    return formatDptInfo(info);
}

function emptyCatalog() {
    return { byId: new Map(), byName: new Map() };
}

function parseDptCsv(text) {
    const catalog = emptyCatalog();
    if (!text) return catalog;
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) return catalog;

    const header = parseCsvLine(lines[0]).map((value) => value.trim());
    if (header.length > 0) {
        header[0] = header[0].replace(/^\uFEFF/, '');
    }
    const idx = {
        id: header.indexOf('Identifier'),
        name: header.indexOf('Name'),
        size: header.indexOf('Size'),
        type: header.indexOf('Type'),
        range: header.indexOf('Interpretation range'),
        note: header.indexOf('Note')
    };

    for (let i = 1; i < lines.length; i += 1) {
        const fields = parseCsvLine(lines[i]);
        if (fields.length === 0) continue;
        const rawId = fields[idx.id] || '';
        const rawName = fields[idx.name] || '';
        if (!rawId || !rawName) continue;

        const id = normalizeDptIdentifier(rawId);
        const info = {
            id,
            name: rawName.trim(),
            size: (fields[idx.size] || '').trim(),
            type: (fields[idx.type] || '').trim(),
            range: (fields[idx.range] || '').trim(),
            note: (fields[idx.note] || '').trim()
        };

        if (!catalog.byId.has(id)) {
            catalog.byId.set(id, info);
        }
        if (!catalog.byName.has(info.name)) {
            catalog.byName.set(info.name, info);
        }
    }

    return catalog;
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            const next = line[i + 1];
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.length > 0 || line.endsWith(',')) {
        values.push(current.trim());
    }
    return values;
}

function normalizeDptIdentifier(value) {
    const trimmed = String(value || '').trim();
    const match = trimmed.match(/^(\d+)\.(\d+)$/);
    if (!match) return trimmed;
    const main = Number(match[1]);
    const sub = match[2].padStart(3, '0');
    return `${main}.${sub}`;
}

function resolveDptInfo(raw, catalog) {
    let id = null;
    let name = null;

    const dpstMatch = raw.match(/^(DPST|DPT)-(\d+)(?:-(\d+))?$/i);
    if (dpstMatch) {
        const main = dpstMatch[2];
        const sub = dpstMatch[3];
        if (sub) {
            id = `${Number(main)}.${String(Number(sub)).padStart(3, '0')}`;
        } else {
            id = `${Number(main)}.000`;
        }
    } else if (/^\d+\.\d+$/.test(raw)) {
        id = normalizeDptIdentifier(raw);
    } else if (/^DPT_/i.test(raw)) {
        name = raw;
    }

    if (id && catalog.byId.has(id)) return catalog.byId.get(id);
    if (name && catalog.byName.has(name)) return catalog.byName.get(name);
    if (!name && catalog.byName.has(raw)) return catalog.byName.get(raw);
    return null;
}

function formatDptInfo(info) {
    const detail = [];
    if (info.id) detail.push(info.id);
    if (info.size) detail.push(info.size);
    const suffix = detail.length > 0 ? ` (${detail.join(', ')})` : '';
    return `${info.name || info.id}${suffix}`;
}
