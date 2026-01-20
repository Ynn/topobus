import { state } from './state.js';
import { getDom } from './dom.js';
import { clamp } from './utils.js';
import { scheduleMinimap } from './minimap.js';
import { selectCell, clearSelection } from './selection.js';

export function bindInteractions() {
    const { paper } = state;
    if (!paper) return;

    paper.on('blank:pointerdown', (event) => {
        clearSelection();
        startPan(event);
    });

    paper.on('element:pointerclick', (elementView) => {
        selectCell(elementView.model);
    });

    paper.on('element:pointerdown', (elementView, event) => {
        if (shouldPanFromElement(elementView, event)) {
            startPan(event);
        }
    });

    const dom = getDom();
    if (state.wheelHandler && dom && dom.paper) {
        dom.paper.removeEventListener('wheel', state.wheelHandler);
    }

    state.wheelHandler = (event) => {
        if (!paper) return;
        event.preventDefault();
        const delta = Number(event.deltaY || 0);
        if (!Number.isFinite(delta)) return;
        const scale = paper.scale().sx || 1;
        const factor = Math.exp(-Math.sign(delta) * 0.12);
        const nextScale = clamp(scale * factor, 0.05, 6);
        const rect = paper.el.getBoundingClientRect();
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };

        // Performance optimization: track zoom state for CSS
        paper.el.classList.add('is-zooming');
        if (state.zoomTimeout) clearTimeout(state.zoomTimeout);
        state.zoomTimeout = setTimeout(() => {
            if (state.paper) state.paper.el.classList.remove('is-zooming');
            state.zoomTimeout = null;
        }, 200);

        zoomAt(point, nextScale);
    };

    if (dom && dom.paper) {
        dom.paper.addEventListener('wheel', state.wheelHandler, { passive: false });
        dom.paper.addEventListener('contextmenu', (event) => event.preventDefault());
    }

    if (dom && dom.paper) {
        if (state.middlePanHandler) {
            dom.paper.removeEventListener('mousedown', state.middlePanHandler, true);
        }

        const onMiddleMouseDown = (event) => {
            if (event.button !== 1) return;
            startPan(event);
            event.preventDefault();
            event.stopPropagation();
            if (event.stopImmediatePropagation) {
                event.stopImmediatePropagation();
            }
        };

        state.middlePanHandler = onMiddleMouseDown;
        dom.paper.addEventListener('mousedown', onMiddleMouseDown, true);

        if (state.pointerHandlers) {
            dom.paper.removeEventListener('pointerdown', state.pointerHandlers.down);
            dom.paper.removeEventListener('pointermove', state.pointerHandlers.move);
            dom.paper.removeEventListener('pointerup', state.pointerHandlers.up);
            dom.paper.removeEventListener('pointercancel', state.pointerHandlers.up);
        }
        if (state.dragIntentHandlers) {
            dom.paper.removeEventListener('pointerdown', state.dragIntentHandlers.down, true);
            dom.paper.removeEventListener('pointerup', state.dragIntentHandlers.up, true);
            dom.paper.removeEventListener('pointercancel', state.dragIntentHandlers.up, true);
        }

        const pointers = new Map();
        let pinchState = null;

        const startPinch = () => {
            const values = Array.from(pointers.values());
            if (values.length < 2) return;
            const [p1, p2] = values;
            const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const scale = state.paper ? state.paper.scale().sx || 1 : 1;
            pinchState = { distance, scale };
        };

        const updatePinch = () => {
            if (!pinchState || pointers.size < 2) return;
            const values = Array.from(pointers.values());
            const [p1, p2] = values;
            const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            if (!distance) return;
            const nextScale = clamp(pinchState.scale * (distance / pinchState.distance), 0.05, 6);
            const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            const rect = dom.paper.getBoundingClientRect();
            zoomAt({ x: mid.x - rect.left, y: mid.y - rect.top }, nextScale);
        };

        const onPointerDown = (event) => {
            if (event.pointerType === 'mouse') return;
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size === 2) {
                pinchState = null;
                state.panState = null;
                startPinch();
            }
            if (dom.paper.setPointerCapture) {
                dom.paper.setPointerCapture(event.pointerId);
            }
            event.preventDefault();
        };

        const onPointerMove = (event) => {
            if (event.pointerType === 'mouse') return;
            if (!pointers.has(event.pointerId)) return;
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size >= 2) {
                updatePinch();
                event.preventDefault();
            }
        };

        const onPointerUp = (event) => {
            if (event.pointerType === 'mouse') return;
            pointers.delete(event.pointerId);
            if (pointers.size < 2) {
                pinchState = null;
            }
        };

        state.pointerHandlers = {
            down: onPointerDown,
            move: onPointerMove,
            up: onPointerUp
        };

        dom.paper.addEventListener('pointerdown', onPointerDown, { passive: false });
        dom.paper.addEventListener('pointermove', onPointerMove, { passive: false });
        dom.paper.addEventListener('pointerup', onPointerUp);
        dom.paper.addEventListener('pointercancel', onPointerUp);

        const onDragIntentDown = (event) => {
            state.dragIntentTarget = event.target;
        };
        const onDragIntentUp = () => {
            state.dragIntentTarget = null;
        };
        state.dragIntentHandlers = {
            down: onDragIntentDown,
            up: onDragIntentUp
        };
        dom.paper.addEventListener('pointerdown', onDragIntentDown, true);
        dom.paper.addEventListener('pointerup', onDragIntentUp, true);
        dom.paper.addEventListener('pointercancel', onDragIntentUp, true);
    }

    if (!state.interactionsBound) {
        document.addEventListener('mousemove', handlePanMove);
        document.addEventListener('mouseup', stopPan);
        document.addEventListener('pointermove', handlePanMove);
        document.addEventListener('pointerup', stopPan);
        document.addEventListener('pointercancel', stopPan);
        state.interactionsBound = true;
    }

}

export function focusCell(cell) {
    const { paper } = state;
    if (!paper || !cell) return;
    const bbox = cell.getBBox();
    const paperSize = paper.getComputedSize();

    const targetScale = 1.2;

    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;

    const tx = paperSize.width / 2 - cx * targetScale;
    const ty = paperSize.height / 2 - cy * targetScale;

    paper.scale(targetScale, targetScale);
    paper.translate(tx, ty);
    scheduleMinimap();
}

function startPan(event) {
    const { paper } = state;
    if (!paper) return;
    state.panState = {
        startX: event.clientX,
        startY: event.clientY,
        tx: paper.translate().tx,
        ty: paper.translate().ty
    };

    // Performance optimization: disable interactivity during pan
    paper.setInteractivity(false);
    paper.el.classList.add('is-panning');

    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
        document.body.style.cursor = 'grabbing';
    }
}

function handlePanMove(event) {
    const { panState, paper } = state;
    if (event.type === 'pointermove' && event.pointerType === 'mouse') return;
    if (!panState || !paper) return;
    const dx = event.clientX - panState.startX;
    const dy = event.clientY - panState.startY;
    paper.translate(panState.tx + dx, panState.ty + dy);
    // REMOVED: scheduleMinimap() - Don't update minimap DURING pan for better performance
}

function stopPan() {
    if (!state.panState) return;
    state.panState = null;
    document.body.style.cursor = 'default';

    // Restore interactivity after pan
    if (state.paper) {
        state.paper.setInteractivity(state.interactiveFunc || true);
        state.paper.el.classList.remove('is-panning');
    }

    // Update minimap once at the end of panning
    scheduleMinimap();
}

function shouldPanFromElement(elementView, event) {
    if (!elementView || !event) return false;
    const kind = elementView.model ? elementView.model.get('kind') : null;
    const isHeader = isHeaderTarget(event.target);

    if (state.currentView === 'topology' && (kind === 'area' || kind === 'line')) {
        return !isHeader;
    }
    if (state.currentView === 'composite' && kind && kind.startsWith('composite-') && kind !== 'composite-object') {
        return !isHeader;
    }
    if (state.currentView === 'building' && kind === 'building-space') {
        return !isHeader;
    }
    return false;
}

function isHeaderTarget(target) {
    if (!target) return false;
    const handle = target.closest ? target.closest('[joint-selector]') : target;
    if (!handle) return false;
    const selector = handle.getAttribute('joint-selector');
    return selector === 'header' ||
        selector === 'label' ||
        selector === 'name' ||
        selector === 'address';
}

export function zoomAt(point, nextScale) {
    const { paper } = state;
    if (!paper) return;
    const scale = paper.scale().sx || 1;
    const t = paper.translate();
    const local = {
        x: (point.x - t.tx) / scale,
        y: (point.y - t.ty) / scale
    };
    paper.scale(nextScale, nextScale);
    syncPaperToContent({ resetView: false });
    const tx = point.x - local.x * nextScale;
    const ty = point.y - local.y * nextScale;
    paper.translate(tx, ty);

    // Zoom-based LOD: toggle class for CSS optimizations
    const { sx } = paper.scale();
    if (sx < 0.35) {
        paper.el.classList.add('zoom-far');
    } else {
        paper.el.classList.remove('zoom-far');
    }

    scheduleMinimap();
}

export function zoomBy(factor) {
    const { paper } = state;
    if (!paper) return;
    const dom = getDom();
    if (!dom || !dom.paper) return;
    const rect = dom.paper.getBoundingClientRect();
    const point = { x: rect.width / 2, y: rect.height / 2 };
    const scale = paper.scale().sx || 1;
    zoomAt(point, clamp(scale * factor, 0.05, 6));
}

export function fitContent() {
    const { paper } = state;
    if (!paper) return;
    const wasLarge = state.isLargeGraph;
    syncPaperToContent({ limitToViewport: true, resetView: false });
    paper.scaleContentToFit({ padding: 80, maxScale: 1 });
    if (wasLarge) {
        syncPaperToContent({ limitToViewport: false, resetView: false });
    }

    // Refresh Zoom-based LOD after fit
    const currentScale = paper.scale().sx;
    if (currentScale < 0.35) {
        paper.el.classList.add('zoom-far');
    } else {
        paper.el.classList.remove('zoom-far');
    }

    scheduleMinimap();
}

export function syncPaperToContent(options = {}) {
    const { paper, graph } = state;
    const dom = getDom();
    if (!paper || !graph || !dom || !dom.paper) return;
    const elements = graph.getElements();
    if (!elements.length) return;
    const bounds = computeGraphBounds(elements);
    if (!bounds) return;

    const padding = Number.isFinite(options.padding) ? options.padding : 80;
    const container = dom.paperContainer || dom.paper;
    const minWidth = container ? container.clientWidth : 0;
    const minHeight = container ? container.clientHeight : 0;
    if (options.resetView) {
        paper.scale(1, 1);
    }
    const scale = paper.scale().sx || 1;
    const limitToViewport = options.limitToViewport === true;
    const scaledWidth = bounds.width * scale + padding * 2;
    const scaledHeight = bounds.height * scale + padding * 2;
    const width = limitToViewport
        ? Math.max(minWidth, 1)
        : Math.max(minWidth, scaledWidth);
    const height = limitToViewport
        ? Math.max(minHeight, 1)
        : Math.max(minHeight, scaledHeight);
    paper.setDimensions(width, height);

    state.scrollMode = false;
    state.scrollPadding = 0;

    if (options.resetView) {
        paper.translate(padding - bounds.x * scale, padding - bounds.y * scale);
    }
}

function computeGraphBounds(elements) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    elements.forEach(cell => {
        if (cell.isLink && cell.isLink()) return;
        const bbox = cell.getBBox();
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
    });
    if (!isFinite(minX) || !isFinite(minY)) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function exportSvg() {
    const exportData = buildExportSvg();
    if (!exportData) return;
    const { svg } = exportData;
    const content = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `topobus-${state.currentView}.svg`;
    link.click();
    URL.revokeObjectURL(url);
}

function buildExportSvg() {
    const { paper, graph } = state;
    if (!paper || !paper.svg || !graph) return null;
    const svg = paper.svg.cloneNode(true);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const layers = svg.querySelector('.joint-layers')
        || svg.querySelector('[joint-selector="layers"]');
    const viewport = svg.querySelector('.joint-viewport');
    const bounds = computeExportBounds(graph);
    const padding = 2;
    let width = 0;
    let height = 0;
    if (bounds) {
        width = Math.max(1, Math.ceil(bounds.width + padding * 2));
        height = Math.max(1, Math.ceil(bounds.height + padding * 2));
        const tx = padding - bounds.x;
        const ty = padding - bounds.y;
        const target = layers || viewport;
        if (target) {
            target.setAttribute('transform', `translate(${tx}, ${ty})`);
        }
        if (layers && layers !== target) {
            layers.removeAttribute('transform');
        }
        if (viewport && viewport !== target) {
            viewport.removeAttribute('transform');
        }
    } else if (paper.getComputedSize) {
        const size = paper.getComputedSize();
        width = Math.max(1, Math.ceil(size.width));
        height = Math.max(1, Math.ceil(size.height));
    }

    if (width && height) {
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    return { svg, width, height };
}

function computeExportBounds(graph) {
    const cells = graph && typeof graph.getCells === 'function'
        ? graph.getCells()
        : [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    cells.forEach((cell) => {
        if (!cell || typeof cell.getBBox !== 'function') return;
        const bbox = cell.getBBox();
        if (!bbox) return;
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
    });
    if (!isFinite(minX) || !isFinite(minY)) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
