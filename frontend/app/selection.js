import { state } from './state.js';
import { applySelectionStyles } from './graph/styles.js';

let selectionListener = null;

export function registerSelectionListener(listener) {
    selectionListener = listener;
}

export function selectCell(cell) {
    state.selectedCellId = cell ? cell.id : null;
    applySelectionStyles();
    if (selectionListener) {
        selectionListener(cell);
    }
}

export function clearSelection() {
    selectCell(null);
}
