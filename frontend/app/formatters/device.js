import { resolveDatapointInfo } from '../dpt.js';

export function formatFlagsText(flags) {
    if (!flags) return '';
    if (typeof flags === 'string') {
        return flags.replace(/\s+/g, ' ').trim();
    }
    const active = [];
    if (flags.communication) active.push('C');
    if (flags.read) active.push('R');
    if (flags.write) active.push('W');
    if (flags.transmit) active.push('T');
    if (flags.update) active.push('U');
    if (flags.read_on_init) active.push('I');
    return active.join(' ');
}

export function formatDptLabel(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    const info = resolveDatapointInfo(trimmed);
    if (!info) return trimmed;
    if (info.name && info.id) return `${info.name} (${info.id})`;
    return info.name || info.id || trimmed;
}

export function resolveDptSize(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    const info = resolveDatapointInfo(trimmed);
    return info && info.size ? info.size : '';
}

export function formatDeviceName(value) {
    return String(value || '').trim();
}

export function formatDeviceAddress(value) {
    return String(value || '').trim();
}
