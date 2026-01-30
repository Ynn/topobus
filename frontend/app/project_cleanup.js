import { state } from './state.js';
import { stateManager } from './state_manager.js';
import { resetLayoutCaches } from './graph/layout.js';
import { resetEntityCaches } from './entities/normalize.js';
import { resetClassicViewCaches } from './classic_view.js';
import { disposeGraph } from './graph/render.js';
import { resetMinimap } from './minimap.js';
import { clearSelection } from './selection.js';
import { unbindInteractions } from './interactions.js';

export function prepareForProjectLoad() {
    clearSelection();
    unbindInteractions();
    disposeGraph();
    resetMinimap();
    resetLayoutCaches();
    resetEntityCaches();
    resetClassicViewCaches();

    if (state.deviceGraphCache && typeof state.deviceGraphCache.clear === 'function') {
        state.deviceGraphCache.clear();
    }

    stateManager.setStatePatch({
        currentProject: null,
        currentGraphData: null,
        currentNodeIndex: null,
        topologyIndex: null,
        groupAddressIndex: null,
        deviceIndex: null,
        currentTableData: null,
        selectionIndex: null,
        filteredProject: null,
        graphBounds: null,
        graphBoundsDirty: true,
        groupSummaryLinks: [],
        hiddenGroupLinks: [],
        linkAlignFrame: null,
        pendingLinkAlign: null,
        minimapState: null,
        minimapFrame: null,
        minimapTimeout: null,
        zoomTimeout: null,
        graphResetView: false,
        isLargeGraph: false
    });
}
