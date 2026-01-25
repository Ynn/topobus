import { state } from './state.js';
import { getDom } from './dom.js';
import { registerSelectionListener } from './selection_store.js';
import { renderDetails } from './ui/details_panel.js';
import { selectCell } from './selection.js';
import { focusCell } from './interactions.js';

function selectCellById(cellId) {
    if (!cellId || !state.graph) return;
    const cell = state.graph.getCell(cellId);
    if (!cell) return;
    selectCell(cell);
}

function focusCellById(cellId) {
    if (!cellId || !state.graph) return;
    const cell = state.graph.getCell(cellId);
    if (!cell) return;
    focusCell(cell);
}

function handleSelectionUpdate(selection) {
    const dom = getDom();
    if (!dom || !dom.detailsContent) return;

    if (selection && dom.app && dom.app.classList.contains('tablet-layout')) {
        dom.app.classList.add('panel-open');
        if (dom.panelToggle) {
            dom.panelToggle.setAttribute('aria-expanded', 'true');
        }
    }

    const entity = selection ? selection.entity : null;
    renderDetails(entity, dom.detailsContent, {
        dom,
        onSelectCell: selectCellById,
        onFocusCell: focusCellById
    });
}

registerSelectionListener(handleSelectionUpdate);
