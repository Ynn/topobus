export function getNodeProp(node, key, fallback) {
    if (!node || !node.properties) return fallback;
    const value = node.properties[key];
    return value !== undefined && value !== null && String(value).trim() !== '' ? value : fallback;
}

export function formatDeviceName(node) {
    const props = node && node.properties ? node.properties : {};
    const name = String(props.name || node.label || '').trim();
    const nameLower = name.toLowerCase();
    const extras = [];
    const seen = new Set();
    const addExtra = (value) => {
        const trimmed = String(value || '').trim();
        if (!trimmed) return;
        const lowered = trimmed.toLowerCase();
        if (nameLower && nameLower.includes(lowered)) return;
        if (seen.has(lowered)) return;
        seen.add(lowered);
        extras.push(trimmed);
    };
    addExtra(props.manufacturer);
    addExtra(props.product_reference || props.product);

    if (!name) {
        return extras.join(' / ');
    }
    if (!extras.length) {
        return name;
    }
    return `${name} - ${extras.join(' / ')}`;
}

export function toBool(value) {
    if (value === true || value === false) return value;
    if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
    }
    return false;
}

export function createTextMeasurer() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const cache = new Map();
    const maxEntries = 4000;
    return (text, font) => {
        const value = String(text || '');
        const key = `${font}|${value}`;
        if (cache.has(key)) return cache.get(key);
        if (!ctx) return value.length * 7;
        ctx.font = font;
        const width = ctx.measureText(value).width;
        cache.set(key, width);
        if (cache.size > maxEntries) {
            cache.clear();
        }
        return width;
    };
}

export const measureTextWidth = createTextMeasurer();

export function fitTextToWidth(text, maxWidth, font) {
    const value = String(text || '');
    if (!value) return '';
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) return '';
    if (measureTextWidth(value, font) <= maxWidth) return value;
    const ellipsis = '...';
    let low = 0;
    let high = value.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = value.slice(0, mid) + ellipsis;
        if (measureTextWidth(candidate, font) <= maxWidth) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    const finalLen = Math.max(0, low - 1);
    return value.slice(0, finalLen) + ellipsis;
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function truncateText(text, max) {
    if (!text) return '';
    if (text.length <= max) return text;
    if (max <= 3) return text.slice(0, max);
    return text.slice(0, Math.max(0, max - 3)) + '...';
}

export function compareIndividualAddress(a, b) {
    const aParts = parseAddress(a.properties && a.properties.address ? a.properties.address : a.label);
    const bParts = parseAddress(b.properties && b.properties.address ? b.properties.address : b.label);
    for (let i = 0; i < 3; i += 1) {
        if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
    }
    return 0;
}

export function parseAddress(value) {
    const parts = String(value).split('.');
    const parsed = parts.map((part) => Number(part));
    while (parsed.length < 3) parsed.push(0);
    return parsed.map((num) => (Number.isFinite(num) ? num : 0));
}

export function getCouplerKind(address) {
    const parts = String(address || '').split('.');
    const parsed = parts.map((part) => {
        const match = String(part).trim().match(/^(\d+)/);
        return match ? Number(match[1]) : Number.NaN;
    });
    while (parsed.length < 3) parsed.push(Number.NaN);
    const [area, line, device] = parsed;
    if (!Number.isFinite(device) || device !== 0) return '';
    if (!Number.isFinite(area) || !Number.isFinite(line)) return '';
    if (line === 0) {
        return area === 0 ? 'backbone' : 'area';
    }
    return 'line';
}

export function compareGroupAddressNodes(a, b) {
    const parseNumber = (value) => {
        if (value == null) return Number.NaN;
        const num = Number(String(value).trim());
        return Number.isFinite(num) ? num : Number.NaN;
    };

    const aNum = parseNumber(getNodeProp(a, 'number', null));
    const bNum = parseNumber(getNodeProp(b, 'number', null));
    const aHas = Number.isFinite(aNum);
    const bHas = Number.isFinite(bNum);
    if (aHas && bHas && aNum !== bNum) return aNum - bNum;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;

    const aKey = getNodeProp(a, 'com_object_ref_id', '') || getNodeProp(a, 'object_name', a.label || '');
    const bKey = getNodeProp(b, 'com_object_ref_id', '') || getNodeProp(b, 'object_name', b.label || '');
    const keyCmp = String(aKey).localeCompare(String(bKey));
    if (keyCmp !== 0) return keyCmp;

    const aAddr = getNodeProp(a, 'group_address', '');
    const bAddr = getNodeProp(b, 'group_address', '');
    const addrCmp = compareGroupAddress(aAddr, bAddr);
    if (addrCmp !== 0) return addrCmp;

    const aName = getNodeProp(a, 'object_name', a.label || '');
    const bName = getNodeProp(b, 'object_name', b.label || '');
    return String(aName).localeCompare(String(bName));
}

export function compareGroupAddress(a, b) {
    const aParts = parseGroupAddress(a);
    const bParts = parseGroupAddress(b);
    for (let i = 0; i < 3; i += 1) {
        if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
    }
    return 0;
}

export function parseGroupAddress(value) {
    const cleaned = String(value || '').trim();
    if (!cleaned) return [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    const parts = cleaned.split(/[/.]/);
    const parsed = parts.map((part) => Number(part));
    while (parsed.length < 3) parsed.push(0);
    return parsed.slice(0, 3).map((num) => (Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER));
}

export function compareLabelNumber(a, b) {
    const extract = (label) => {
        const match = String(label).match(/(\d+)(?:\.(\d+))?/);
        if (!match) return [0, 0];
        return [Number(match[1]) || 0, Number(match[2]) || 0];
    };
    const [a1, a2] = extract(a);
    const [b1, b2] = extract(b);
    if (a1 !== b1) return a1 - b1;
    return a2 - b2;
}
