import { state } from './state.js';
import { applySelectionStyles } from './graph/styles.js';

const selectionListeners = new Set();

export function registerSelectionListener(listener) {
    if (!listener) return () => {};
    selectionListeners.add(listener);
    return () => selectionListeners.delete(listener);
}

export function selectCell(cell) {
    state.selectedCellId = cell ? cell.id : null;
    applySelectionStyles();
    selectionListeners.forEach((listener) => {
        try {
            listener(cell);
        } catch (error) {
            console.warn('Selection listener failed', error);
        }
    });
}

export function highlightCell(cell) {
    state.selectedCellId = cell ? cell.id : null;
    applySelectionStyles();
}

export function clearSelection() {
    selectCell(null);
}
