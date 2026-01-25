import { state } from './state.js';
import { normalizeFromGraphCell, normalizeFromTableItem, normalizeFromTreeSelection } from './entities/normalize.js';

const selectionListeners = new Set();
let currentSelection = null;
let lastTreeSelection = null;

function notify(selection) {
    selectionListeners.forEach((listener) => {
        try {
            listener(selection);
        } catch (error) {
            console.warn('Selection store listener failed', error);
        }
    });
}

export function registerSelectionListener(listener) {
    if (!listener) return () => {};
    selectionListeners.add(listener);
    return () => selectionListeners.delete(listener);
}

export function getSelection() {
    return currentSelection;
}

export function setSelection(selection) {
    currentSelection = selection;
    notify(selection);
}

export function clearSelection() {
    currentSelection = null;
    notify(null);
}

export function setSelectionFromGraph(cell) {
    if (!cell) {
        if (lastTreeSelection) {
            currentSelection = lastTreeSelection;
            notify(currentSelection);
        } else {
            clearSelection();
        }
        return;
    }
    const entity = normalizeFromGraphCell(cell, state);
    currentSelection = entity
        ? { kind: entity.kind, id: entity.id || '', address: entity.address || '', entity, source: 'graph' }
        : null;
    notify(currentSelection);
}

export function setSelectionFromTable(item) {
    if (!item) {
        if (lastTreeSelection) {
            currentSelection = lastTreeSelection;
            notify(currentSelection);
        } else {
            clearSelection();
        }
        return;
    }
    const entity = normalizeFromTableItem(item, state);
    currentSelection = entity
        ? { kind: entity.kind, id: entity.id || '', address: entity.address || '', entity, source: 'table' }
        : null;
    notify(currentSelection);
}

export function setSelectionFromTree(selection) {
    if (!selection) {
        lastTreeSelection = null;
        clearSelection();
        return;
    }
    const entity = normalizeFromTreeSelection(selection, state);
    currentSelection = entity
        ? { kind: entity.kind, id: entity.id || '', address: entity.address || '', entity, source: 'tree' }
        : null;
    lastTreeSelection = currentSelection;
    notify(currentSelection);
}
