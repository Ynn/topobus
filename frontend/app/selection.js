import { state } from './state.js';
import { applySelectionStyles } from './graph/styles.js';
import { setSelectionFromGraph } from './selection_store.js';
import { stateManager } from './state_manager.js';

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
