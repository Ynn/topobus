import { state } from './state.js';
import { applySelectionStyles } from './graph/styles.js';
import { setSelectionFromGraph } from './selection_store.js';
import { stateManager } from './state_manager.js';
import { getDom } from './dom.js';

const selectionListeners = new Set();

export function registerSelectionListener(listener) {
    if (!listener) return () => {};
    selectionListeners.add(listener);
    return () => selectionListeners.delete(listener);
}

export function selectCell(cell) {
    stateManager.setState('selectedCellId', cell ? cell.id : null);
    applySelectionStyles();
    setSelectionFromGraph(cell);
    updateSelectionBanner(cell);
    selectionListeners.forEach((listener) => {
        try {
            listener(cell);
        } catch (error) {
            console.warn('Selection listener failed', error);
        }
    });
}

export function highlightCell(cell) {
    stateManager.setState('selectedCellId', cell ? cell.id : null);
    applySelectionStyles();
}

export function clearSelection() {
    selectCell(null);
}

function updateSelectionBanner(cell) {
    const dom = getDom();
    if (!dom || !dom.selectionBanner || !dom.selectionBannerText) return;
    if (!cell) {
        dom.selectionBanner.classList.add('hidden');
        dom.selectionBannerText.textContent = '';
        return;
    }

    const kind = cell.get ? cell.get('kind') : '';
    let text = '';
    if (cell.isLink && cell.isLink()) {
        const ga = cell.get('groupAddress') || '';
        text = ga ? `Group Address ${ga}` : 'Link selected';
    } else if (kind === 'groupobject' || kind === 'composite-object') {
        const name = cell.get('fullName') || cell.get('name') || '';
        const ga = cell.get('groupAddress') || '';
        text = ga ? `${name || 'Group Object'} · ${ga}` : (name || 'Group Object');
    } else if (kind === 'device' || kind === 'composite-device') {
        const name = cell.get('fullName') || cell.get('name') || '';
        const address = cell.get('fullAddress') || cell.get('address') || '';
        text = name && address ? `${name} · ${address}` : (name || address || 'Device');
    } else {
        text = cell.get && cell.get('label') ? String(cell.get('label')) : 'Selection';
    }

    dom.selectionBannerText.textContent = text;
    dom.selectionBanner.classList.remove('hidden');
}
