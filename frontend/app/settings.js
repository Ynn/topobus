import { state } from './state.js';
import { getDom } from './dom.js';
import { applyFiltersAndRender } from './filters.js';
import { updateLinkStyles, applyElementStyle } from './graph/styles.js';
import { readTheme } from './theme.js';

const STORAGE_KEY = 'topobus.settings';

const DEFAULT_SETTINGS = {
    theme: 'classic',
    elkPreset: 'balanced',
    elk: {
        algorithm: 'layered',
        direction: 'RIGHT',
        edgeRouting: 'POLYLINE',
        layering: 'NETWORK_SIMPLEX',
        nodePlacement: 'BRANDES_KOEPF',
        crossingMinimization: 'LAYER_SWEEP',
        cycleBreaking: 'GREEDY_MODEL_ORDER',
        considerModelOrder: true,
        thoroughness: 7,
        spacingNodeNode: 80,
        spacingLayer: 140,
        spacingEdgeNodeBetweenLayers: 40,
        spacingEdgeEdgeBetweenLayers: 10,
        spacingEdgeNode: 30,
        spacingEdgeEdge: 20,
        mergeEdges: true,
        splinesMode: 'CONSERVATIVE'
    },
    stress: {
        iterations: 300,
        epsilon: 0.001,
        desiredEdgeLength: 100
    }
};

const PRESETS = {
    fast: {
        elkPreset: 'fast',
        elk: {
            algorithm: 'layered',
            direction: 'RIGHT',
            edgeRouting: 'POLYLINE',
            layering: 'LONGEST_PATH',
            nodePlacement: 'BRANDES_KOEPF',
            crossingMinimization: 'NONE',
            cycleBreaking: 'GREEDY',
            considerModelOrder: false,
            thoroughness: 3,
            spacingNodeNode: 50,
            spacingLayer: 90,
            spacingEdgeNodeBetweenLayers: 20,
            spacingEdgeEdgeBetweenLayers: 10,
            spacingEdgeNode: 10,
            spacingEdgeEdge: 10,
            mergeEdges: true,
            splinesMode: 'SLOPPY'
        }
    },
    balanced: {
        elkPreset: 'balanced',
        elk: {
            algorithm: 'layered',
            direction: 'RIGHT',
            edgeRouting: 'POLYLINE',
            layering: 'NETWORK_SIMPLEX',
            nodePlacement: 'BRANDES_KOEPF',
            crossingMinimization: 'LAYER_SWEEP',
            cycleBreaking: 'GREEDY_MODEL_ORDER',
            considerModelOrder: true,
            thoroughness: 7,
            spacingNodeNode: 80,
            spacingLayer: 140,
            spacingEdgeNodeBetweenLayers: 40,
            spacingEdgeEdgeBetweenLayers: 10,
            spacingEdgeNode: 30,
            spacingEdgeEdge: 20,
            mergeEdges: true,
            splinesMode: 'CONSERVATIVE'
        }
    },
    quality: {
        elkPreset: 'quality',
        elk: {
            algorithm: 'layered',
            direction: 'RIGHT',
            edgeRouting: 'ORTHOGONAL',
            layering: 'NETWORK_SIMPLEX',
            nodePlacement: 'LINEAR_SEGMENTS',
            crossingMinimization: 'LAYER_SWEEP',
            cycleBreaking: 'GREEDY_MODEL_ORDER',
            considerModelOrder: true,
            thoroughness: 12,
            spacingNodeNode: 120,
            spacingLayer: 220,
            spacingEdgeNodeBetweenLayers: 60,
            spacingEdgeEdgeBetweenLayers: 20,
            spacingEdgeNode: 40,
            spacingEdgeEdge: 30,
            mergeEdges: true,
            splinesMode: 'CONSERVATIVE'
        }
    },
    stress: {
        elkPreset: 'stress',
        elk: {
            algorithm: 'stress',
            direction: 'RIGHT',
            edgeRouting: 'POLYLINE',
            layering: 'NETWORK_SIMPLEX',
            nodePlacement: 'BRANDES_KOEPF',
            crossingMinimization: 'LAYER_SWEEP',
            cycleBreaking: 'GREEDY',
            considerModelOrder: false,
            thoroughness: 7,
            spacingNodeNode: 80,
            spacingLayer: 140,
            spacingEdgeNodeBetweenLayers: 40,
            spacingEdgeEdgeBetweenLayers: 10,
            spacingEdgeNode: 30,
            spacingEdgeEdge: 20,
            mergeEdges: true,
            splinesMode: 'SLOPPY'
        },
        stress: {
            iterations: 300,
            epsilon: 0.001,
            desiredEdgeLength: 120
        }
    }
};

export function initSettings() {
    const dom = getDom();
    const settings = loadSettings();
    applySettings(settings, { persist: false, rerender: false });

    if (!dom) return;
    if (dom.settingsBtn) {
        dom.settingsBtn.addEventListener('click', () => openSettings());
    }
    if (dom.settingsClose) {
        dom.settingsClose.addEventListener('click', () => closeSettings());
    }
    if (dom.settingsOverlay) {
        dom.settingsOverlay.addEventListener('click', (event) => {
            if (event.target === dom.settingsOverlay) closeSettings();
        });
    }

    bindSettingsControls(dom);
}

function bindSettingsControls(dom) {
    if (!dom) return;
    if (dom.settingsTheme) {
        dom.settingsTheme.addEventListener('change', (event) => {
            const value = event.target.value;
            updateSettings({ theme: value });
        });
    }
    if (dom.settingsPreset) {
        dom.settingsPreset.addEventListener('change', (event) => {
            const preset = event.target.value;
            applyPreset(preset);
        });
    }

    const updateNumber = (key, target, parser = Number) => {
        if (!target) return;
        target.addEventListener('change', () => {
            const next = parser(target.value);
            updateSettings({ elk: { [key]: Number.isFinite(next) ? next : target.value } });
        });
    };

    const updateStress = (key, target, parser = Number) => {
        if (!target) return;
        target.addEventListener('change', () => {
            const next = parser(target.value);
            updateSettings({ stress: { [key]: Number.isFinite(next) ? next : target.value } });
        });
    };

    if (dom.settingsAlgorithm) {
        dom.settingsAlgorithm.addEventListener('change', (event) => {
            updateSettings({ elk: { algorithm: event.target.value } });
        });
    }
    if (dom.settingsDirection) {
        dom.settingsDirection.addEventListener('change', (event) => {
            updateSettings({ elk: { direction: event.target.value } });
        });
    }
    if (dom.settingsEdgeRouting) {
        dom.settingsEdgeRouting.addEventListener('change', (event) => {
            updateSettings({ elk: { edgeRouting: event.target.value } });
        });
    }
    if (dom.settingsLayering) {
        dom.settingsLayering.addEventListener('change', (event) => {
            updateSettings({ elk: { layering: event.target.value } });
        });
    }
    if (dom.settingsNodePlacement) {
        dom.settingsNodePlacement.addEventListener('change', (event) => {
            updateSettings({ elk: { nodePlacement: event.target.value } });
        });
    }
    if (dom.settingsCrossing) {
        dom.settingsCrossing.addEventListener('change', (event) => {
            updateSettings({ elk: { crossingMinimization: event.target.value } });
        });
    }
    if (dom.settingsCycleBreaking) {
        dom.settingsCycleBreaking.addEventListener('change', (event) => {
            updateSettings({ elk: { cycleBreaking: event.target.value } });
        });
    }
    if (dom.settingsConsiderModelOrder) {
        dom.settingsConsiderModelOrder.addEventListener('change', (event) => {
            updateSettings({ elk: { considerModelOrder: event.target.checked } });
        });
    }
    if (dom.settingsMergeEdges) {
        dom.settingsMergeEdges.addEventListener('change', (event) => {
            updateSettings({ elk: { mergeEdges: event.target.checked } });
        });
    }
    if (dom.settingsSplinesMode) {
        dom.settingsSplinesMode.addEventListener('change', (event) => {
            updateSettings({ elk: { splinesMode: event.target.value } });
        });
    }

    updateNumber('thoroughness', dom.settingsThoroughness);
    updateNumber('spacingNodeNode', dom.settingsSpacingNodeNode);
    updateNumber('spacingLayer', dom.settingsSpacingLayer);
    updateNumber('spacingEdgeNodeBetweenLayers', dom.settingsSpacingEdgeNodeBetweenLayers);
    updateNumber('spacingEdgeEdgeBetweenLayers', dom.settingsSpacingEdgeEdgeBetweenLayers);
    updateNumber('spacingEdgeNode', dom.settingsSpacingEdgeNode);
    updateNumber('spacingEdgeEdge', dom.settingsSpacingEdgeEdge);

    updateStress('iterations', dom.settingsStressIterations);
    updateStress('epsilon', dom.settingsStressEpsilon, Number);
    updateStress('desiredEdgeLength', dom.settingsStressEdgeLength);
}

function applyPreset(presetKey) {
    const preset = PRESETS[presetKey] || PRESETS.balanced;
    const current = loadSettings();
    const next = mergeSettings(current, preset);
    next.elkPreset = preset.elkPreset || presetKey;
    applySettings(next);
}

function updateSettings(patch) {
    const current = loadSettings();
    const next = mergeSettings(current, patch);
    next.elkPreset = 'custom';
    applySettings(next);
}

function applySettings(settings, { persist = true, rerender = true } = {}) {
    state.uiSettings = settings;
    state.elkSettings = settings.elk;
    state.elkPreset = settings.elkPreset || 'custom';
    state.themeName = settings.theme || 'latte';

    applyTheme(state.themeName);
    readTheme(true);
    syncSettingsUI(settings);

    if (persist) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (_) {
            // ignore storage errors
        }
    }

    if (rerender) {
        const dom = getDom();
        if (dom && dom.graphView && dom.graphView.style.display !== 'none') {
            applyFiltersAndRender();
        } else {
            refreshGraphTheme();
        }
    } else {
        refreshGraphTheme();
    }
}

function refreshGraphTheme() {
    const { graph } = state;
    if (!graph) return;
    const theme = readTheme(true);
    graph.getElements().forEach((el) => applyElementStyle(el, theme, false));
    updateLinkStyles();
}

function applyTheme(theme) {
    const body = document.body;
    const root = document.documentElement;
    if (!body || !root) return;
    body.classList.remove('theme-classic', 'theme-latte', 'theme-mocha');
    root.classList.remove('theme-classic', 'theme-latte', 'theme-mocha');
    const cls = theme === 'mocha'
        ? 'theme-mocha'
        : (theme === 'latte' ? 'theme-latte' : 'theme-classic');
    body.classList.add(cls);
    root.classList.add(cls);
}

function loadSettings() {
    const stored = readStoredSettings();
    return mergeSettings(DEFAULT_SETTINGS, stored || {});
}

function readStoredSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function mergeSettings(base, patch) {
    const result = { ...base, ...patch };
    result.elk = { ...base.elk, ...(patch.elk || {}) };
    result.stress = { ...base.stress, ...(patch.stress || {}) };
    return result;
}

function syncSettingsUI(settings) {
    const dom = getDom();
    if (!dom) return;
    if (dom.settingsTheme) dom.settingsTheme.value = settings.theme || 'classic';
    if (dom.settingsPreset) dom.settingsPreset.value = settings.elkPreset || 'custom';
    if (dom.settingsAlgorithm) dom.settingsAlgorithm.value = settings.elk.algorithm || 'layered';
    if (dom.settingsDirection) dom.settingsDirection.value = settings.elk.direction || 'RIGHT';
    if (dom.settingsEdgeRouting) dom.settingsEdgeRouting.value = settings.elk.edgeRouting || 'POLYLINE';
    if (dom.settingsLayering) dom.settingsLayering.value = settings.elk.layering || 'NETWORK_SIMPLEX';
    if (dom.settingsNodePlacement) dom.settingsNodePlacement.value = settings.elk.nodePlacement || 'BRANDES_KOEPF';
    if (dom.settingsCrossing) dom.settingsCrossing.value = settings.elk.crossingMinimization || 'LAYER_SWEEP';
    if (dom.settingsCycleBreaking) dom.settingsCycleBreaking.value = settings.elk.cycleBreaking || 'GREEDY_MODEL_ORDER';
    if (dom.settingsConsiderModelOrder) dom.settingsConsiderModelOrder.checked = Boolean(settings.elk.considerModelOrder);
    if (dom.settingsMergeEdges) dom.settingsMergeEdges.checked = Boolean(settings.elk.mergeEdges);
    if (dom.settingsSplinesMode) dom.settingsSplinesMode.value = settings.elk.splinesMode || 'CONSERVATIVE';
    if (dom.settingsThoroughness) dom.settingsThoroughness.value = settings.elk.thoroughness ?? 7;
    if (dom.settingsSpacingNodeNode) dom.settingsSpacingNodeNode.value = settings.elk.spacingNodeNode ?? 80;
    if (dom.settingsSpacingLayer) dom.settingsSpacingLayer.value = settings.elk.spacingLayer ?? 140;
    if (dom.settingsSpacingEdgeNodeBetweenLayers) dom.settingsSpacingEdgeNodeBetweenLayers.value = settings.elk.spacingEdgeNodeBetweenLayers ?? 40;
    if (dom.settingsSpacingEdgeEdgeBetweenLayers) dom.settingsSpacingEdgeEdgeBetweenLayers.value = settings.elk.spacingEdgeEdgeBetweenLayers ?? 10;
    if (dom.settingsSpacingEdgeNode) dom.settingsSpacingEdgeNode.value = settings.elk.spacingEdgeNode ?? 30;
    if (dom.settingsSpacingEdgeEdge) dom.settingsSpacingEdgeEdge.value = settings.elk.spacingEdgeEdge ?? 20;

    if (dom.settingsStressIterations) dom.settingsStressIterations.value = settings.stress.iterations ?? 300;
    if (dom.settingsStressEpsilon) dom.settingsStressEpsilon.value = settings.stress.epsilon ?? 0.001;
    if (dom.settingsStressEdgeLength) dom.settingsStressEdgeLength.value = settings.stress.desiredEdgeLength ?? 100;
}

function openSettings() {
    const dom = getDom();
    if (!dom || !dom.settingsOverlay) return;
    dom.settingsOverlay.classList.remove('hidden');
    syncSettingsUI(state.uiSettings || DEFAULT_SETTINGS);
}

function closeSettings() {
    const dom = getDom();
    if (!dom || !dom.settingsOverlay) return;
    dom.settingsOverlay.classList.add('hidden');
}
