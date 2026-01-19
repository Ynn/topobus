import { state } from './state.js';

let cachedTheme = null;

export function readTheme(force = false) {
    if (cachedTheme && !force) return cachedTheme;
    const styles = getComputedStyle(document.documentElement);
    const val = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
    cachedTheme = {
        fontSans: val('--font-sans', 'sans-serif'),
        fontMono: val('--font-mono', 'monospace'),
        ink: val('--ink', '#1f2937'),
        muted: val('--muted', '#55606a'),
        accent: val('--accent', '#0f766e'),
        border: val('--border', '#e2e8f0'),
        deviceFill: val('--device-fill', '#f6e3b4'),
        deviceBorder: val('--device-border', '#b7791f'),
        deviceHeader: val('--device-header', '#f1d18b'),
        couplerFill: val('--coupler-fill', '#d9eef7'),
        couplerHeader: val('--coupler-header', '#c4dfed'),
        couplerBorder: val('--coupler-border', '#2b6f87'),
        objectFill: val('--object-fill', '#fff7e6'),
        objectFillTx: val('--object-fill-tx', '#e2f4ee'),
        objectBorder: val('--object-border', '#d7b56a'),
        lineFill: val('--line-fill', 'rgba(15,118,110,0.08)'),
        lineBorder: val('--line-border', '#0f766e'),
        areaFill: val('--area-fill', 'rgba(15,23,42,0.03)'),
        areaBorder: val('--area-border', '#1f2937')
    };
    return cachedTheme;
}

export function getLayoutSettings() {
    let scale = 1;
    if (state.viewPreferences.density === 'compact') {
        scale = 0.9;
    } else if (state.viewPreferences.density === 'spacious') {
        scale = 1.1;
    }
    const scaled = (value) => Math.max(1, Math.round(value * scale));

    return {
        scale,
        deviceMinWidth: Math.max(220, scaled(260)),
        deviceMaxWidth: Math.max(320, scaled(400)),
        headerHeight: scaled(52),
        rowHeight: scaled(28),
        rowGap: scaled(6),
        padding: scaled(12),
        columnGap: scaled(80),
        topGap: scaled(40),
        innerGap: scaled(14),
        headerFont: {
            address: Math.max(11, Math.round(13 * scale)),
            name: Math.max(10, Math.round(12 * scale))
        },
        rowFont: {
            name: Math.max(10, Math.round(11.5 * scale)),
            address: Math.max(9, Math.round(11 * scale))
        },
        topologyDeviceWidth: Math.max(150, scaled(180)),
        topologyDeviceHeight: Math.max(52, scaled(60)),
        linePadding: scaled(16),
        lineHeader: scaled(32),
        lineGap: scaled(18),
        areaPadding: scaled(24),
        areaHeader: scaled(34),
        areaGap: scaled(80),
        lineInnerGap: scaled(14)
    };
}
