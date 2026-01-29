import { state } from './state.js';

let cachedTheme = null;

export function readTheme(force = false) {
    if (cachedTheme && !force) return cachedTheme;
    const styles = getComputedStyle(document.documentElement);
    const val = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
    const graphVal = (name, fallback) =>
        styles.getPropertyValue(`--graph-${name}`).trim() || val(`--${name}`, fallback);
    cachedTheme = {
        fontSans: val('--font-sans', 'sans-serif'),
        fontMono: val('--font-mono', 'monospace'),
        ink: graphVal('ink', '#1f2937'),
        muted: graphVal('muted', '#55606a'),
        accent: graphVal('accent', '#0f766e'),
        accentStrong: graphVal('accent-strong', graphVal('accent', '#0b5d57')),
        border: graphVal('border', '#e2e8f0'),
        deviceFill: graphVal('device-fill', '#f6e3b4'),
        deviceBorder: graphVal('device-border', '#b7791f'),
        deviceHeader: graphVal('device-header', '#f1d18b'),
        couplerFill: graphVal('coupler-fill', '#d9eef7'),
        couplerHeader: graphVal('coupler-header', '#c4dfed'),
        couplerBorder: graphVal('coupler-border', '#2b6f87'),
        objectFill: graphVal('object-fill', '#fff7e6'),
        objectFillTx: graphVal('object-fill-tx', '#e2f4ee'),
        // GroupObject semantic fills (graph only):
        // - S+T: ETS sending + KNX transmit
        // - S: ETS sending only
        // - NoC: KNX Communication flag disabled
        // - Other: default catch-all
        objectFillST: graphVal('object-fill-s-t', graphVal('object-fill-tx', '#e2f4ee')),
        objectFillS: graphVal('object-fill-s', graphVal('object-fill', '#fff7e6')),
        objectFillNoC: graphVal('object-fill-no-c', '#e2e8f0'),
        objectFillIsolated: graphVal('object-fill-isolated', '#e2e8f0'),
        objectFillOther: graphVal('object-fill-other', graphVal('object-fill', '#fff7e6')),
        objectBorder: graphVal('object-border', '#d7b56a'),
        lineFill: graphVal('line-fill', 'rgba(15,118,110,0.08)'),
        lineBorder: graphVal('line-border', '#0f766e'),
        areaFill: graphVal('area-fill', 'rgba(15,23,42,0.03)'),
        areaBorder: graphVal('area-border', '#1f2937')
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
