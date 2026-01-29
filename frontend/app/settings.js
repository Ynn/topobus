import { state } from './state.js';
import { stateManager } from './state_manager.js';
import { getDom } from './dom.js';
import { applyFiltersAndRender } from './filters.js';
import { resetLayoutCaches } from './graph/layout.js';
import { updateLinkStyles, applyElementStyle, applySelectionStyles } from './graph/styles.js';
import { readTheme } from './theme.js';

const STORAGE_KEY = 'topobus.settings';
let draftSettings = null;
let activeSettingsTab = 'theme';

const DEFAULT_SETTINGS = {
    theme: 'latte',
    productLanguage: 'en',
    showAllGroupLinks: false,
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
    bindSettingsTabs(dom);
    if (dom.settingsTheme) {
        dom.settingsTheme.addEventListener('change', (event) => {
            const value = event.target.value;
            updateDraft({ theme: value });
        });
    }
    if (dom.settingsProductLanguage) {
        dom.settingsProductLanguage.addEventListener('change', (event) => {
            const value = event.target.value || 'en';
            updateDraft({ productLanguage: value });
        });
    }
    if (dom.settingsShowAllGaLinks) {
        dom.settingsShowAllGaLinks.addEventListener('change', (event) => {
            updateDraft({ showAllGroupLinks: Boolean(event.target.checked) });
        });
    }
    if (dom.settingsPreset) {
        dom.settingsPreset.addEventListener('change', (event) => {
            const preset = event.target.value;
            applyPreset(preset);
        });
    }
    if (dom.settingsReset) {
        dom.settingsReset.addEventListener('click', () => {
            resetSettings();
        });
    }
    if (dom.settingsSave) {
        dom.settingsSave.addEventListener('click', () => {
            saveSettings();
        });
    }
    if (dom.settingsCancel) {
        dom.settingsCancel.addEventListener('click', () => {
            cancelSettings();
        });
    }

    const updateNumber = (key, target, parser = Number) => {
        if (!target) return;
        target.addEventListener('change', () => {
            const next = parser(target.value);
            updateDraft({ elk: { [key]: Number.isFinite(next) ? next : target.value } });
        });
    };

    const updateStress = (key, target, parser = Number) => {
        if (!target) return;
        target.addEventListener('change', () => {
            const next = parser(target.value);
            updateDraft({ stress: { [key]: Number.isFinite(next) ? next : target.value } });
        });
    };

    if (dom.settingsAlgorithm) {
        dom.settingsAlgorithm.addEventListener('change', (event) => {
            updateDraft({ elk: { algorithm: event.target.value } });
        });
    }
    if (dom.settingsDirection) {
        dom.settingsDirection.addEventListener('change', (event) => {
            updateDraft({ elk: { direction: event.target.value } });
        });
    }
    if (dom.settingsEdgeRouting) {
        dom.settingsEdgeRouting.addEventListener('change', (event) => {
            updateDraft({ elk: { edgeRouting: event.target.value } });
        });
    }
    if (dom.settingsLayering) {
        dom.settingsLayering.addEventListener('change', (event) => {
            updateDraft({ elk: { layering: event.target.value } });
        });
    }
    if (dom.settingsNodePlacement) {
        dom.settingsNodePlacement.addEventListener('change', (event) => {
            updateDraft({ elk: { nodePlacement: event.target.value } });
        });
    }
    if (dom.settingsCrossing) {
        dom.settingsCrossing.addEventListener('change', (event) => {
            updateDraft({ elk: { crossingMinimization: event.target.value } });
        });
    }
    if (dom.settingsCycleBreaking) {
        dom.settingsCycleBreaking.addEventListener('change', (event) => {
            updateDraft({ elk: { cycleBreaking: event.target.value } });
        });
    }
    if (dom.settingsConsiderModelOrder) {
        dom.settingsConsiderModelOrder.addEventListener('change', (event) => {
            updateDraft({ elk: { considerModelOrder: event.target.checked } });
        });
    }
    if (dom.settingsMergeEdges) {
        dom.settingsMergeEdges.addEventListener('change', (event) => {
            updateDraft({ elk: { mergeEdges: event.target.checked } });
        });
    }
    if (dom.settingsSplinesMode) {
        dom.settingsSplinesMode.addEventListener('change', (event) => {
            updateDraft({ elk: { splinesMode: event.target.value } });
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
    const current = getDraft();
    const next = mergeSettings(current, preset);
    next.elkPreset = preset.elkPreset || presetKey;
    setDraft(next);
}

function updateDraft(patch) {
    const current = getDraft();
    const next = mergeSettings(current, patch);
    if (patch && (Object.prototype.hasOwnProperty.call(patch, 'elk') ||
        Object.prototype.hasOwnProperty.call(patch, 'stress'))) {
        next.elkPreset = 'custom';
    }
    setDraft(next);
}

function resetSettings() {
    const next = mergeSettings({}, DEFAULT_SETTINGS);
    setDraft(next);
}

function saveSettings() {
    const next = getDraft();
    applySettings(next);
    closeSettings();
}

function cancelSettings() {
    setDraft(state.uiSettings || DEFAULT_SETTINGS);
    closeSettings();
}

function getDraft() {
    if (!draftSettings) {
        draftSettings = mergeSettings({}, state.uiSettings || DEFAULT_SETTINGS);
    }
    return draftSettings;
}

function setDraft(settings) {
    draftSettings = mergeSettings({}, settings);
    syncSettingsUI(draftSettings);
}

function applySettings(settings, { persist = true, rerender = true } = {}) {
    stateManager.setStatePatch({
        uiSettings: settings,
        elkSettings: settings.elk,
        elkPreset: settings.elkPreset || 'custom'
    });
    const previousTheme = state.themeName;
    stateManager.setState('themeName', settings.theme || 'latte');
    const themeChanged = previousTheme !== state.themeName;

    applyTheme(state.themeName);
    readTheme(true);
    syncSettingsUI(settings);
    if (themeChanged) {
        resetLayoutCaches();
        stateManager.setStatePatch({
            lastGraphKey: null,
            lastGraphViewType: null
        });
    }
    refreshGraphTheme();

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
            if (themeChanged && typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => requestAnimationFrame(() => refreshGraphTheme()));
            }
        }
    }
}

function refreshGraphTheme() {
    const { graph } = state;
    if (!graph) return;
    const theme = readTheme(true);
    graph.getElements().forEach((el) => {
        applyElementStyle(el, theme, false);
        const kind = el.get('kind');
        if (kind === 'device' || kind === 'composite-device') {
            el.attr('address/fill', theme.ink);
            el.attr('name/fill', theme.ink);
            el.attr('summary/fill', theme.ink);
            return;
        }
        if (kind === 'groupobject' || kind === 'composite-object') {
            const isTx = el.get('isTransmitter');
            const isRx = el.get('isReceiver');
            const addressColor = isTx ? theme.accent : (isRx ? theme.ink : theme.muted);
            el.attr('name/fill', theme.ink);
            el.attr('address/fill', addressColor);
            return;
        }
        if (kind === 'area' || kind === 'line' || kind === 'segment' || kind === 'building-space' ||
            kind === 'composite-main' || kind === 'composite-middle' || kind === 'composite-ga') {
            el.attr('label/fill', theme.ink);
            el.attr('summary/fill', theme.ink);
        }
    });
    updateLinkStyles();
    applySelectionStyles();
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
    if (dom.settingsTheme) dom.settingsTheme.value = settings.theme || 'latte';
    if (dom.settingsProductLanguage) dom.settingsProductLanguage.value = settings.productLanguage || 'en';
    if (dom.settingsShowAllGaLinks) {
        dom.settingsShowAllGaLinks.checked = Boolean(settings.showAllGroupLinks);
    }
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
    setDraft(state.uiSettings || DEFAULT_SETTINGS);
    setActiveSettingsTab(activeSettingsTab, dom.settingsOverlay);
}

function closeSettings() {
    const dom = getDom();
    if (!dom || !dom.settingsOverlay) return;
    dom.settingsOverlay.classList.add('hidden');
}

function bindSettingsTabs(dom) {
    if (!dom.settingsOverlay) return;
    const tabs = Array.from(dom.settingsOverlay.querySelectorAll('.settings-tab'));
    if (!tabs.length) return;
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            const key = tab.getAttribute('data-settings-tab') || 'theme';
            activeSettingsTab = key;
            setActiveSettingsTab(key, dom.settingsOverlay);
        });
    });
}

function setActiveSettingsTab(key, root) {
    if (!root) return;
    const tabs = Array.from(root.querySelectorAll('.settings-tab'));
    const panels = Array.from(root.querySelectorAll('.settings-tab-panel'));
    tabs.forEach((tab) => {
        const tabKey = tab.getAttribute('data-settings-tab');
        const isActive = tabKey === key;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    panels.forEach((panel) => {
        const panelKey = panel.getAttribute('data-settings-panel');
        panel.classList.toggle('active', panelKey === key);
    });
}
