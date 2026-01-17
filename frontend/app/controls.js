import { state } from './state.js';
import { getDom } from './dom.js';
import { applyFiltersAndRender, refreshFilterControls } from './filters.js';
import { zoomBy, exportSvg, exportPng, fitContent, syncPaperToContent } from './interactions.js';
import { selectCell } from './selection.js';
import { focusCell } from './interactions.js';
import { scheduleMinimap } from './minimap.js';

export function setupViewSelector() {
    const dom = getDom();
    if (!dom || !dom.viewSelector) return;
    dom.viewSelector.addEventListener('change', (e) => {
        state.currentView = e.target.value;
        if (state.currentProject) {
            applyFiltersAndRender();
        }
        refreshViewControls();
    });
}

export function setupControls() {
    setupSearch();
    setupResizeHandle();
    setupExportSelect();

    const dom = getDom();
    if (!dom) return;

    if (dom.zoomInBtn) {
        dom.zoomInBtn.addEventListener('click', () => {
            zoomBy(1.2);
        });
    }

    if (dom.zoomOutBtn) {
        dom.zoomOutBtn.addEventListener('click', () => {
            zoomBy(0.8);
        });
    }

    if (dom.fitBtn) {
        dom.fitBtn.addEventListener('click', () => {
            fitContent();
        });
    }

    if (dom.relayoutBtn) {
        dom.relayoutBtn.addEventListener('click', () => {
            if (state.currentProject) {
                applyFiltersAndRender();
            }
        });
    }

}

function setupSearch() {
    const dom = getDom();
    if (!dom || !dom.searchInput) return;

    const performSearch = () => {
        const query = dom.searchInput.value.trim().toLowerCase();
        if (!query || !state.graph) return;

        const elements = state.graph.getElements();
        const match = elements.find(el => {
            const name = (el.get('fullName') || '').toLowerCase();
            const address = (el.get('fullAddress') || el.get('groupAddress') || '').toLowerCase();
            return name.includes(query) || address.includes(query);
        });

        if (match) {
            selectCell(match);
            focusCell(match);
        }
    };

    dom.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

function setupResizeHandle() {
    const dom = getDom();
    if (!dom || !dom.resizeHandle || !dom.infoPanel) return;

    let isResizing = false;

    dom.resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        dom.resizeHandle.classList.add('active');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    dom.resizeHandle.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        isResizing = true;
        dom.resizeHandle.classList.add('active');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        if (dom.resizeHandle.setPointerCapture) {
            dom.resizeHandle.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const newWidth = document.body.clientWidth - e.clientX;

        if (newWidth >= 200 && newWidth <= 800) {
            dom.infoPanel.style.width = `${newWidth}px`;
        }
    });

    document.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse') return;
        if (!isResizing) return;
        const newWidth = document.body.clientWidth - e.clientX;
        if (newWidth >= 200 && newWidth <= 800) {
            dom.infoPanel.style.width = `${newWidth}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            dom.resizeHandle.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });

    document.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'mouse') return;
        if (isResizing) {
            isResizing = false;
            dom.resizeHandle.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

function setupExportSelect() {
    const dom = getDom();
    if (!dom || !dom.exportSelect) return;
    dom.exportSelect.addEventListener('change', (event) => {
        const value = event.target.value;
        if (value === 'svg') {
            exportSvg();
        } else if (value === 'png') {
            exportPng();
        }
        event.target.value = '';
    });
}

export function setupResizeHandler() {
    window.addEventListener('resize', () => {
        if (state.paper) {
            syncPaperToContent({
                resetView: false
            });
            scheduleMinimap();
        }
    });
}

export function refreshViewControls() {
    const linkStyle = document.getElementById('link-style');
    if (linkStyle) {
        linkStyle.disabled = state.currentView !== 'group';
    }
    refreshFilterControls();
}
