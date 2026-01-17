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
        zoomAt(point, nextScale);
    };

    if (dom && dom.paper) {
        dom.paper.addEventListener('wheel', state.wheelHandler, { passive: false });
        dom.paper.addEventListener('contextmenu', (event) => event.preventDefault());
    }

    if (dom && dom.paper) {
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
    scheduleMinimap();
}

function stopPan() {
    state.panState = null;
    document.body.style.cursor = 'default';
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

export function exportPng() {
    const exportData = buildExportSvg();
    if (!exportData) return;
    const { svg, width, height } = exportData;
    if (!width || !height) return;
    const content = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
        const ratio = window.devicePixelRatio || 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            URL.revokeObjectURL(url);
            return;
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob((pngBlob) => {
            if (!pngBlob) return;
            const pngUrl = URL.createObjectURL(pngBlob);
            const link = document.createElement('a');
            link.href = pngUrl;
            link.download = `topobus-${state.currentView}.png`;
            link.click();
            URL.revokeObjectURL(pngUrl);
        }, 'image/png');
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
    };
    img.src = url;
}

function buildExportSvg() {
    const { paper, graph } = state;
    if (!paper || !paper.svg || !graph) return null;
    const svg = paper.svg.cloneNode(true);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const viewport = svg.querySelector('.joint-viewport')
        || svg.querySelector('.joint-layers')
        || svg.querySelector('[joint-selector="layers"]');
    const bounds = computeGraphBounds(graph.getElements());
    const padding = 60;
    let width = 0;
    let height = 0;
    if (bounds) {
        width = Math.max(1, Math.round(bounds.width + padding * 2));
        height = Math.max(1, Math.round(bounds.height + padding * 2));
        if (viewport) {
            viewport.setAttribute(
                'transform',
                `translate(${padding - bounds.x}, ${padding - bounds.y}) scale(1)`
            );
        }
    } else if (paper.getComputedSize) {
        const size = paper.getComputedSize();
        width = Math.max(1, Math.round(size.width));
        height = Math.max(1, Math.round(size.height));
    }

    if (width && height) {
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    return { svg, width, height };
}
