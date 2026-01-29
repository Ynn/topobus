import { state } from './state.js';
import { getDom } from './dom.js';
import { clamp } from './utils.js';
import { scheduleMinimap } from './minimap.js';
import { selectCell, clearSelection } from './selection.js';
import { readTheme } from './theme.js';
import { rebuildSelectionIndex } from './graph/styles.js';
import { stateManager } from './state_manager.js';
import { normalizeFromGraphCell } from './entities/normalize.js';
import { initContextMenu, openContextMenu, copyTextToClipboard, openWebSearch } from './context_menu.js';
import { requestNavigation } from './navigation.js';

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
        } else {
            paper.el.classList.add('is-dragging');
        }
    });

    paper.on('element:pointerup', () => {
        paper.el.classList.remove('is-dragging');
    });

    paper.on('element:contextmenu', (elementView, event) => {
        if (!elementView || !event) return;
        event.preventDefault();
        const cell = elementView.model;
        if (!cell) return;
        openGraphContextMenu(cell, event.clientX, event.clientY);
    });

    const dom = getDom();
    if (state.wheelHandler && dom && dom.paper) {
        dom.paper.removeEventListener('wheel', state.wheelHandler);
    }

    const wheelHandler = (event) => {
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
        stateManager.setState('zoomTimeout', setTimeout(() => {
            if (state.paper) state.paper.el.classList.remove('is-zooming');
            stateManager.setState('zoomTimeout', null);
        }, 200));

        zoomAt(point, nextScale);
    };
    stateManager.setState('wheelHandler', wheelHandler);

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

        stateManager.setState('middlePanHandler', onMiddleMouseDown);
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
                stateManager.setState('panState', null);
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

        stateManager.setState('pointerHandlers', {
            down: onPointerDown,
            move: onPointerMove,
            up: onPointerUp
        });

        dom.paper.addEventListener('pointerdown', onPointerDown, { passive: false });
        dom.paper.addEventListener('pointermove', onPointerMove, { passive: false });
        dom.paper.addEventListener('pointerup', onPointerUp);
        dom.paper.addEventListener('pointercancel', onPointerUp);

        const onDragIntentDown = (event) => {
            stateManager.setState('dragIntentTarget', event.target);
        };
        const onDragIntentUp = () => {
            stateManager.setState('dragIntentTarget', null);
        };
        stateManager.setState('dragIntentHandlers', {
            down: onDragIntentDown,
            up: onDragIntentUp
        });
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
        stateManager.setState('interactionsBound', true);
    }

}

function openGraphContextMenu(cell, x, y) {
    initContextMenu();
    const entity = normalizeFromGraphCell(cell, state);
    if (!entity) return;
    const items = [];
    const label = entity.title || entity.address || entity.name || '';
    if (label) {
        items.push({
            label: `Copy "${label.length > 32 ? `${label.slice(0, 32)}…` : label}"`,
            action: () => copyTextToClipboard(label)
        });
        items.push({
            label: 'Search on the web',
            action: () => openWebSearch(label)
        });
    }

    const navItems = [];
    if (entity.kind === 'group-address' && entity.address) {
        navItems.push({ label: 'Open Group Address', action: () => requestNavigation({ type: 'group-address', address: entity.address }) });
    } else if (entity.kind === 'device' && entity.address) {
        navItems.push({ label: 'Open Device (Topology)', action: () => requestNavigation({ type: 'device', address: entity.address }) });
    } else if (entity.kind === 'group-object') {
        let deviceAddress = '';
        const parentId = cell.get ? cell.get('parent') : null;
        if (parentId && state.graph) {
            const parentCell = state.graph.getCell(parentId);
            if (parentCell) {
                deviceAddress = parentCell.get('fullAddress') || parentCell.get('address') || '';
            }
        }
        if (deviceAddress) {
            navItems.push({ label: 'Open Device (Topology)', action: () => requestNavigation({ type: 'device', address: deviceAddress }) });
        }
        const groupAddress = entity.address || '';
        if (groupAddress) {
            navItems.push({ label: `Open Group Address (${groupAddress})`, action: () => requestNavigation({ type: 'group-address', address: groupAddress }) });
        }
    }

    if (navItems.length) {
        items.push({ type: 'separator' });
        items.push(...navItems);
    }

    if (!items.length) return;
    openContextMenu(items, { x, y });
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
    stateManager.setState('panState', {
        startX: event.clientX,
        startY: event.clientY,
        tx: paper.translate().tx,
        ty: paper.translate().ty
    });

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
    stateManager.setState('panState', null);
    document.body.style.cursor = 'default';

    // Restore interactivity after pan
    if (state.paper) {
        state.paper.setInteractivity(state.interactiveFunc || true);
        state.paper.el.classList.remove('is-panning');
        state.paper.el.classList.remove('is-dragging');
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
    updateZoomLOD();
    scheduleMinimap();
}

export function updateZoomLOD() {
    const { paper } = state;
    if (!paper) return;
    const { sx } = paper.scale();
    if (sx < 0.35) {
        paper.el.classList.add('zoom-far');
    } else {
        paper.el.classList.remove('zoom-far');
    }
    updateGroupSummaryLOD(sx);
    updateGroupHierarchySummaryLOD(sx);
    updateDeviceSummaryLOD(sx);
}

function updateGroupSummaryLOD(scale) {
    if (state.currentView !== 'group') {
        disableGroupSummary();
        return;
    }
    if (state.viewPreferences.groupGraph !== 'flat') {
        disableGroupSummary();
        return;
    }
    const showAt = 0.35;
    const hideAt = 0.45;
    if (state.groupSummaryMode) {
        if (scale > hideAt) {
            disableGroupSummary();
        }
        return;
    }
    if (scale < showAt) {
        enableGroupSummary();
    } else {
        disableGroupSummary();
    }
}

function updateGroupHierarchySummaryLOD(scale) {
    if (state.currentView !== 'group' || state.viewPreferences.groupGraph !== 'hierarchy') {
        disableGroupHierarchySummary();
        return;
    }
    const showAt = 0.35;
    const hideAt = 0.45;
    if (state.groupHierarchySummaryMode) {
        if (scale > hideAt) {
            disableGroupHierarchySummary();
        }
        return;
    }
    if (scale < showAt) {
        enableGroupHierarchySummary();
    } else {
        disableGroupHierarchySummary();
    }
}

function enableGroupHierarchySummary() {
    if (state.groupHierarchySummaryMode || !state.graph) return;
    if (state.graph.startBatch) {
        state.graph.startBatch('ga-summary');
    }
    state.graph.getElements().forEach((el) => {
        if (el.get('kind') !== 'composite-ga') return;
        const address = el.get('groupAddress') || el.get('fullAddress') || '';
        const size = typeof el.size === 'function' ? el.size() : { height: 60 };
        const fontSize = Math.max(22, Math.min(46, Math.round((size.height || 60) * 0.35)));
        el.attr('summary/text', address);
        el.attr('summary/fontSize', fontSize);
        el.attr('summary/display', address ? 'block' : 'none');
    });
    state.graph.getElements().forEach((el) => {
        const kind = el.get('kind');
        if (kind === 'composite-device') {
            el.attr('body/display', 'none');
            el.attr('header/display', 'none');
            el.attr('headerMask/display', 'none');
            el.attr('address/display', 'none');
            el.attr('name/display', 'none');
            el.attr('summary/display', 'none');
        } else if (kind === 'composite-object') {
            el.attr('body/display', 'none');
            el.attr('name/display', 'none');
            el.attr('address/display', 'none');
        }
    });
    if (state.graph.stopBatch) {
        state.graph.stopBatch('ga-summary');
    }
    stateManager.setState('groupHierarchySummaryMode', true);
    rebuildSelectionIndex();
}

function disableGroupHierarchySummary() {
    if (!state.groupHierarchySummaryMode || !state.graph) return;
    if (state.graph.startBatch) {
        state.graph.startBatch('ga-summary');
    }
    state.graph.getElements().forEach((el) => {
        if (el.get('kind') !== 'composite-ga') return;
        el.attr('summary/display', 'none');
    });
    state.graph.getElements().forEach((el) => {
        const kind = el.get('kind');
        if (kind === 'composite-device') {
            el.removeAttr('body/display');
            el.removeAttr('header/display');
            el.removeAttr('headerMask/display');
            el.removeAttr('address/display');
            el.removeAttr('name/display');
            el.removeAttr('summary/display');
        } else if (kind === 'composite-object') {
            el.removeAttr('body/display');
            el.removeAttr('name/display');
            el.removeAttr('address/display');
        }
    });
    if (state.graph.stopBatch) {
        state.graph.stopBatch('ga-summary');
    }
    stateManager.setState('groupHierarchySummaryMode', false);
    rebuildSelectionIndex();
}

function updateDeviceSummaryLOD(scale) {
    if (!state.graph) return;
    if (state.currentView === 'group') {
        if (state.deviceSummaryMode) {
            disableDeviceSummary();
        }
        return;
    }
    const show = scale < 0.35;
    if (show && !state.deviceSummaryMode) {
        enableDeviceSummary();
        return;
    }
    if (!show && state.deviceSummaryMode) {
        disableDeviceSummary();
    }
}

function enableDeviceSummary() {
    if (state.deviceSummaryMode || !state.graph) return;
    if (state.graph.startBatch) {
        state.graph.startBatch('device-summary');
    }
    state.graph.getElements().forEach((el) => {
        const kind = el.get('kind');
        if (kind !== 'device' && kind !== 'composite-device') return;
        let address = el.get('fullAddress') || el.attr('address/text') || '';
        if (state.currentView === 'buildings') {
            const raw = String(address || '');
            const base = raw.split('(')[0].replace(/\s+/g, '');
            address = base || raw.trim();
        }
        const size = typeof el.size === 'function' ? el.size() : { height: 60 };
        const fontSize = Math.max(24, Math.min(48, Math.round((size.height || 60) * 0.7)));
        el.attr('summary/text', address);
        el.attr('summary/fontSize', fontSize);
        el.attr('summary/display', address ? 'block' : 'none');
    });
    if (state.graph.stopBatch) {
        state.graph.stopBatch('device-summary');
    }
    stateManager.setState('deviceSummaryMode', true);
}

function disableDeviceSummary() {
    if (!state.deviceSummaryMode || !state.graph) return;
    if (state.graph.startBatch) {
        state.graph.startBatch('device-summary');
    }
    state.graph.getElements().forEach((el) => {
        const kind = el.get('kind');
        if (kind !== 'device' && kind !== 'composite-device') return;
        el.attr('summary/display', 'none');
    });
    if (state.graph.stopBatch) {
        state.graph.stopBatch('device-summary');
    }
    stateManager.setState('deviceSummaryMode', false);
}

function enableGroupSummary() {
    if (state.groupSummaryMode) return;
    if (!state.graph || !state.currentGraphData) return;

    const graphData = state.currentGraphData;
    const nodes = Array.isArray(graphData.nodes) ? graphData.nodes : [];
    const edges = Array.isArray(graphData.edges) ? graphData.edges : [];
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const pairKeys = new Set();

    edges.forEach((edge) => {
        const sourceNode = nodeById.get(edge.source);
        const targetNode = nodeById.get(edge.target);
        if (!sourceNode || !targetNode) return;
        if (sourceNode.kind !== 'groupobject' || targetNode.kind !== 'groupobject') return;
        const sourceDevice = sourceNode.parent_id;
        const targetDevice = targetNode.parent_id;
        if (!sourceDevice || !targetDevice) return;
        if (sourceDevice === targetDevice) return;
        const [left, right] = sourceDevice < targetDevice
            ? [sourceDevice, targetDevice]
            : [targetDevice, sourceDevice];
        pairKeys.add(`${left}|${right}`);
    });

    const theme = readTheme();
    const aggregateLinks = [];
    if (state.graph.startBatch) {
        state.graph.startBatch('summary');
    }
    pairKeys.forEach((key) => {
        const [a, b] = key.split('|');
        const link = new joint.shapes.standard.Link({
            source: { id: a },
            target: { id: b },
            attrs: {
                line: {
                    stroke: theme.accent,
                    strokeWidth: 2.5,
                    opacity: 0.9,
                    targetMarker: { type: 'none' },
                    sourceMarker: { type: 'none' }
                }
            }
        });
        link.set('isAggregate', true);
        link.set('z', 0);
        aggregateLinks.push(link);
    });

    if (aggregateLinks.length) {
        state.graph.addCells(aggregateLinks);
    }
    stateManager.setState('groupSummaryLinks', aggregateLinks);

    const hiddenLinks = [];
    state.graph.getLinks().forEach((link) => {
        if (link.get('isAggregate')) return;
        hiddenLinks.push({
            link,
            lineDisplay: link.attr('line/display'),
            lineOpacity: link.attr('line/opacity'),
            labels: link.labels()
        });
        link.attr('line/display', 'none');
        link.attr('line/opacity', 0);
        if (link.labels().length) {
            link.labels([]);
        }
    });
    stateManager.setState('hiddenGroupLinks', hiddenLinks);

    state.graph.getElements().forEach((el) => {
        if (el.get('kind') !== 'groupobject') return;
        el.attr('body/display', 'none');
        el.attr('name/display', 'none');
        el.attr('address/display', 'none');
    });

    state.graph.getElements().forEach((el) => {
        if (el.get('kind') !== 'groupobject-frame') return;
        el.attr('body/display', 'none');
        el.attr('label/display', 'none');
    });

    state.graph.getElements().forEach((el) => {
        if (el.get('kind') !== 'device') return;
        const props = el.get('nodeProps') || {};
        const summary = props.address || el.get('fullAddress') || el.attr('address/text') || '';
        el.attr('name/display', 'none');
        el.attr('address/display', 'none');
        el.attr('summary/text', summary);
        el.attr('summary/display', summary ? 'block' : 'none');
    });

    if (state.graph.stopBatch) {
        state.graph.stopBatch('summary');
    }
    stateManager.setState('groupSummaryMode', true);
    rebuildSelectionIndex();
}

function disableGroupSummary() {
    if (!state.groupSummaryMode) return;
    if (!state.graph) return;
    if (state.graph.startBatch) {
        state.graph.startBatch('summary');
    }

    state.groupSummaryLinks.forEach((link) => {
        if (state.graph.getCell(link.id)) {
            link.remove();
        }
    });
    stateManager.setState('groupSummaryLinks', []);

    state.hiddenGroupLinks.forEach((entry) => {
        const link = entry.link;
        if (!link) return;
        if (entry.lineDisplay != null) {
            link.attr('line/display', entry.lineDisplay);
        } else {
            link.removeAttr('line/display');
        }
        if (entry.lineOpacity != null) {
            link.attr('line/opacity', entry.lineOpacity);
        } else {
            link.removeAttr('line/opacity');
        }
        if (Array.isArray(entry.labels)) {
            link.labels(entry.labels);
        }
    });
    stateManager.setState('hiddenGroupLinks', []);

    state.graph.getElements().forEach((el) => {
        if (el.get('kind') !== 'groupobject') return;
        el.removeAttr('body/display');
        el.removeAttr('name/display');
        el.removeAttr('address/display');
    });

    state.graph.getElements().forEach((el) => {
        if (el.get('kind') !== 'groupobject-frame') return;
        el.removeAttr('body/display');
        el.removeAttr('label/display');
    });
    state.graph.getElements().forEach((el) => {
        if (el.get('kind') !== 'device') return;
        el.removeAttr('name/display');
        el.removeAttr('address/display');
        el.attr('summary/display', 'none');
    });

    if (state.graph.stopBatch) {
        state.graph.stopBatch('summary');
    }
    stateManager.setState('groupSummaryMode', false);
    rebuildSelectionIndex();
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

    updateZoomLOD();
    scheduleMinimap();
}

export function ensureGraphVisible(options = {}) {
    const { paper, graph } = state;
    const dom = getDom();
    if (!paper || !graph || !dom) return false;
    const elements = graph.getElements();
    if (!elements.length) return false;
    const bounds = getGraphBounds(elements);
    if (!bounds) return false;
    const container = dom.paperContainer || dom.paper;
    if (!container) return false;
    const width = container.clientWidth || 0;
    const height = container.clientHeight || 0;
    if (!width || !height) return false;
    const scale = paper.scale().sx || 1;
    const translate = paper.translate();
    const viewLeft = -translate.tx / scale;
    const viewTop = -translate.ty / scale;
    const viewRight = viewLeft + width / scale;
    const viewBottom = viewTop + height / scale;
    const padding = Number.isFinite(options.padding) ? options.padding : 40;
    const boundsLeft = bounds.x;
    const boundsTop = bounds.y;
    const boundsRight = bounds.x + bounds.width;
    const boundsBottom = bounds.y + bounds.height;
    const intersects = !(boundsRight < viewLeft + padding ||
        boundsLeft > viewRight - padding ||
        boundsBottom < viewTop + padding ||
        boundsTop > viewBottom - padding);
    const tooLarge = bounds.width > (width / scale) * 1.2 || bounds.height > (height / scale) * 1.2;
    if (!intersects || tooLarge || options.force === true) {
        fitContent();
        return true;
    }
    return false;
}

export function ensureDeviceVisible(options = {}) {
    const { paper, graph } = state;
    const dom = getDom();
    if (!paper || !graph || !dom) return false;
    const elements = graph.getElements().filter((el) => el.get('kind') === 'device');
    if (!elements.length) return false;
    const container = dom.paperContainer || dom.paper;
    if (!container) return false;
    const width = container.clientWidth || 0;
    const height = container.clientHeight || 0;
    if (!width || !height) return false;
    const scale = paper.scale().sx || 1;
    const translate = paper.translate();
    const viewLeft = -translate.tx / scale;
    const viewTop = -translate.ty / scale;
    const viewRight = viewLeft + width / scale;
    const viewBottom = viewTop + height / scale;
    const padding = Number.isFinite(options.padding) ? options.padding : 20;
    const fullyVisible = elements.some((el) => {
        const bbox = el.getBBox();
        return bbox.x >= viewLeft + padding &&
            bbox.y >= viewTop + padding &&
            bbox.x + bbox.width <= viewRight - padding &&
            bbox.y + bbox.height <= viewBottom - padding;
    });
    if (!fullyVisible || options.force === true) {
        fitContent();
        return true;
    }
    return false;
}

export function syncPaperToContent(options = {}) {
    const { paper, graph } = state;
    const dom = getDom();
    if (!paper || !graph || !dom || !dom.paper) return;
    const elements = graph.getElements();
    if (!elements.length) return;
    const bounds = getGraphBounds(elements);
    if (!bounds) return;

    const padding = Number.isFinite(options.padding) ? options.padding : 80;
    const container = dom.paperContainer || dom.paper;
    const minWidth = container ? container.clientWidth : 0;
    const minHeight = container ? container.clientHeight : 0;
    if (options.resetView) {
        paper.scale(1, 1);
        updateZoomLOD();
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

    stateManager.setStatePatch({
        scrollMode: false,
        scrollPadding: 0
    });

    if (options.resetView) {
        paper.translate(padding - bounds.x * scale, padding - bounds.y * scale);
    }
}

function getGraphBounds(elements) {
    if (!state.graphBoundsDirty && state.graphBounds) {
        return state.graphBounds;
    }
    const bounds = computeGraphBounds(elements);
    stateManager.setStatePatch({
        graphBounds: bounds,
        graphBoundsDirty: false
    });
    return bounds;
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
