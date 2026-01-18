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
    dom.viewSelector.value = state.currentView;
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
    setupResponsiveToggles();

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
    const suggestionWrap = ensureSuggestionWrap(dom.searchInput);

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

    const updateSuggestions = (value) => {
        if (!suggestionWrap) return;
        const query = String(value || '').trim().toLowerCase();
        if (!query) {
            clearSuggestions(suggestionWrap);
            return;
        }

        const elements = state.graph ? state.graph.getElements() : [];
        const matches = [];
        elements.forEach((el) => {
            if (matches.length >= 18) return;
            const name = (el.get('fullName') || '').toString();
            const address = (el.get('fullAddress') || el.get('groupAddress') || '').toString();
            const combined = `${name} ${address}`.toLowerCase();
            if (combined.includes(query)) {
                matches.push({
                    id: el.id,
                    name,
                    address
                });
            }
        });

        renderSuggestions(suggestionWrap, matches);
    };

    dom.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            performSearch();
            clearSuggestions(suggestionWrap);
        }
    });

    dom.searchInput.addEventListener('input', (e) => {
        updateSuggestions(e.target.value);
    });

    dom.searchInput.addEventListener('focus', (e) => {
        updateSuggestions(e.target.value);
    });

    dom.searchInput.addEventListener('blur', () => {
        if (!suggestionWrap) return;
        setTimeout(() => clearSuggestions(suggestionWrap), 150);
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

    dom.resizeHandle.addEventListener('touchstart', (e) => {
        isResizing = true;
        dom.resizeHandle.classList.add('active');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    }, { passive: false });

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

    document.addEventListener('touchmove', (e) => {
        if (!isResizing) return;
        const touch = e.touches && e.touches[0];
        if (!touch) return;
        const newWidth = document.body.clientWidth - touch.clientX;
        if (newWidth >= 200 && newWidth <= 800) {
            dom.infoPanel.style.width = `${newWidth}px`;
        }
        e.preventDefault();
    }, { passive: false });

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

    document.addEventListener('touchend', () => {
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

function setupResponsiveToggles() {
    const dom = getDom();
    if (!dom || !dom.app) return;

    const app = dom.app;
    const tabletQuery = window.matchMedia('(max-width: 1200px)');

    const setToggleState = (button, isOpen) => {
        if (!button) return;
        button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    };

    const setFiltersOpen = (isOpen) => {
        app.classList.toggle('filters-open', isOpen);
        setToggleState(dom.filtersToggle, isOpen);
    };

    const setPanelOpen = (isOpen) => {
        app.classList.toggle('panel-open', isOpen);
        setToggleState(dom.panelToggle, isOpen);
    };

    if (dom.filtersToggle) {
        dom.filtersToggle.addEventListener('click', () => {
            setFiltersOpen(!app.classList.contains('filters-open'));
        });
    }

    if (dom.panelToggle) {
        dom.panelToggle.addEventListener('click', () => {
            setPanelOpen(!app.classList.contains('panel-open'));
        });
    }

    const syncTabletLayout = () => {
        const isTablet = tabletQuery.matches;
        app.classList.toggle('tablet-layout', isTablet);
        if (!isTablet) {
            app.classList.remove('filters-open', 'panel-open');
            setToggleState(dom.filtersToggle, false);
            setToggleState(dom.panelToggle, false);
        } else {
            setToggleState(dom.filtersToggle, app.classList.contains('filters-open'));
            setToggleState(dom.panelToggle, app.classList.contains('panel-open'));
        }
    };

    syncTabletLayout();
    if (typeof tabletQuery.addEventListener === 'function') {
        tabletQuery.addEventListener('change', syncTabletLayout);
    } else if (typeof tabletQuery.addListener === 'function') {
        tabletQuery.addListener(syncTabletLayout);
    }
}

function ensureSuggestionWrap(input) {
    const parent = input.parentElement;
    if (!parent) return null;
    let wrap = parent.querySelector('.search-suggestions');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'search-suggestions hidden';
        parent.appendChild(wrap);
    }
    return wrap;
}

function renderSuggestions(container, matches) {
    if (!container) return;
    container.innerHTML = '';
    if (!matches.length) {
        container.classList.add('hidden');
        return;
    }

    matches.forEach((match) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'search-suggestion';
        item.dataset.id = match.id;

        const title = document.createElement('div');
        title.className = 'suggestion-title';
        title.textContent = match.name || match.address || 'Node';

        const meta = document.createElement('div');
        meta.className = 'suggestion-meta';
        meta.textContent = match.address || '';

        item.appendChild(title);
        item.appendChild(meta);

        item.addEventListener('mousedown', (event) => {
            event.preventDefault();
            const cell = state.graph ? state.graph.getCell(match.id) : null;
            if (cell) {
                selectCell(cell);
                focusCell(cell);
            }
            container.classList.add('hidden');
        });

        container.appendChild(item);
    });

    container.classList.remove('hidden');
}

function clearSuggestions(container) {
    if (!container) return;
    container.innerHTML = '';
    container.classList.add('hidden');
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
