import { state } from '../state.js';
import { getDom } from '../dom.js';
import { readTheme } from '../theme.js';
import { formatDeviceName } from '../utils.js';
import { layoutGroupView, layoutTopologyView, alignGroupLinks, normalizeContainerLayout } from './layout.js';
import { renderCompositeGraph } from './composite.js';
import { renderBuildingGraph } from './building.js';
import { updateLinkStyles, zForElement, rebuildSelectionIndex } from './styles.js';
import { bindInteractions, fitContent, syncPaperToContent, updateZoomLOD, ensureGraphVisible, ensureDeviceVisible } from '../interactions.js';
import { clearSelection } from '../selection.js';
import { scheduleMinimap, setMinimapEnabled } from '../minimap.js';
import { startGraphLoading, stopGraphLoading } from './loading.js';
import { isLargeGraph } from '../config/performance.js';
import { GraphCache } from '../cache/graph_cache.js';
import { DeviceGraphBuilder } from './device_graph_builder.js';
import { stateManager } from '../state_manager.js';

const deviceGraphBuilder = new DeviceGraphBuilder();
let autoFitToken = 0;

stateManager.subscribe('currentProject', () => {
    if (state.deviceGraphCache instanceof GraphCache) {
        state.deviceGraphCache.clear();
    }
});

export function renderGraph(projectData, viewType) {
    const resetView = state.graphResetView === true;
    stateManager.setState('graphResetView', false);
    const isBuilding = viewType === 'building';
    const isDevice = viewType === 'device';
    const graphData = isBuilding
        ? null
        : (isDevice
            ? buildDeviceGraphData(projectData)
            : (viewType === 'topology'
                ? buildTopologyGraphData(projectData)
                : projectData.group_address_graph));
    const nodeIndex = graphData && graphData.nodes
        ? new Map(graphData.nodes.map(node => [node.id, node]))
        : null;
    const nodeCount = isBuilding
        ? countBuildingNodes(projectData)
        : (graphData && graphData.nodes
            ? (viewType === 'group'
                ? graphData.nodes.filter(n => n.kind !== 'groupaddress').length
                : graphData.nodes.length)
            : 0);
    stateManager.setStatePatch({
        currentGraphData: graphData,
        currentNodeIndex: nodeIndex,
        isLargeGraph: isLargeGraph(nodeCount)
    });
    setMinimapEnabled(true);

    const dom = getDom();
    if (state.paper) {
        if (state.paper.undelegateEvents) {
            state.paper.undelegateEvents();
        }
        if (state.paper.stopListening) {
            state.paper.stopListening();
        }
        stateManager.setState('paper', null);
    }
    if (dom && dom.paper) {
        dom.paper.innerHTML = '';
    }

    const GraphModel = joint.dia.SearchGraph || joint.dia.Graph;
    const sortingMode = (joint.dia.Paper.sorting && joint.dia.Paper.sorting.APPROX) || joint.dia.Paper.sorting.EXACT;

    stateManager.setState('graph', new GraphModel({}, {
        cellNamespace: joint.shapes,
        search: joint.dia.SearchGraph ? { type: 'quadtree' } : undefined
    }));
    stateManager.setStatePatch({
        groupSummaryMode: false,
        groupHierarchySummaryMode: false,
        deviceSummaryMode: false,
        groupSummaryLinks: [],
        hiddenGroupLinks: [],
        graphBoundsDirty: true
    });

    stateManager.setState('paper', new joint.dia.Paper({
        el: dom.paper,
        model: state.graph,
        width: '100%',
        height: '100%',
        gridSize: 10,
        drawGrid: false,
        async: true,
        background: { color: 'transparent' },
        cellViewNamespace: joint.shapes,
        sorting: sortingMode,
        validateUnembedding: () => false,
        interactive: (() => {
            const handler = (cellView) => {
            const kind = cellView.model.get('kind');
            if (viewType === 'group' || viewType === 'device') {
                if (kind === 'groupobject') {
                    return { elementMove: false, linkMove: false, labelMove: false };
                }
                if (kind === 'device') {
                    return { elementMove: true, linkMove: false, labelMove: false };
                }
                return { elementMove: false, linkMove: false, labelMove: false };
            }
            if (viewType === 'topology') {
                if (kind === 'area' || kind === 'line') {
                    return { elementMove: isHeaderDragTarget(cellView), linkMove: false, labelMove: false };
                }
                const movable = kind === 'device';
                return { elementMove: movable, linkMove: false, labelMove: false };
            }
            if (viewType === 'composite') {
                const movable = kind && kind.startsWith('composite-') && kind !== 'composite-object';
                if (movable) {
                    return { elementMove: isHeaderDragTarget(cellView), linkMove: false, labelMove: false };
                }
                return { elementMove: false, linkMove: false, labelMove: false };
            }
            if (viewType === 'building') {
                if (kind === 'building-space') {
                    return { elementMove: isHeaderDragTarget(cellView), linkMove: false, labelMove: false };
                }
                const movable = kind === 'device';
                return { elementMove: movable, linkMove: false, labelMove: false };
            }
            return { elementMove: true, linkMove: false, labelMove: false };
            };
            stateManager.setState('interactiveFunc', handler);
            return handler;
        })()
    }));

    if (state.isLargeGraph) {
        state.paper.el.classList.add('is-large-graph');
    } else {
        state.paper.el.classList.remove('is-large-graph');
    }

    bindInteractions();
    if (state.paper.freeze) {
        state.paper.freeze();
    }
    if (state.graph.startBatch) {
        state.graph.startBatch('render');
    }
    state.graph.on('change:position', (cell, pos, opt) => {
        if (opt && opt.skipParentResize) return;
        if (viewType === 'group') {
            scheduleLinkAlign(cell);
        }
        stateManager.setState('graphBoundsDirty', true);
        scheduleMinimap();
    });
    state.graph.on('change:size', () => {
        stateManager.setState('graphBoundsDirty', true);
        scheduleMinimap();
    });
    state.graph.on('add', () => {
        stateManager.setState('graphBoundsDirty', true);
        scheduleMinimap();
    });
    state.graph.on('remove', () => {
        stateManager.setState('graphBoundsDirty', true);
        scheduleMinimap();
    });
    state.paper.on('element:pointerup', () => {
        if (viewType === 'group') {
            alignGroupLinks();
            return;
        }
        if (viewType === 'topology' || viewType === 'composite' || viewType === 'building') {
            normalizeContainerLayout();
        }
    });

    if (viewType === 'composite') {
        renderCompositeGraph(projectData, state.graph);
        if (state.graph.stopBatch) {
            state.graph.stopBatch('render');
        }
        if (state.paper.unfreeze) {
            state.paper.unfreeze();
        }
        updateLinkStyles();
        rebuildSelectionIndex();
        clearSelection();
        syncPaperToContent({
            resetView: resetView || state.isLargeGraph
        });
        if (!state.isLargeGraph || resetView) {
            fitContent();
        } else {
            scheduleAutoFit();
        }
        scheduleMinimap();
        stopGraphLoading();
        return;
    }
    if (viewType === 'building') {
        renderBuildingGraph(projectData, state.graph);
        if (state.graph.stopBatch) {
            state.graph.stopBatch('render');
        }
        if (state.paper.unfreeze) {
            state.paper.unfreeze();
        }
        rebuildSelectionIndex();
        clearSelection();
        syncPaperToContent({
            resetView: resetView || state.isLargeGraph
        });
        if (!state.isLargeGraph || resetView) {
            fitContent();
        } else {
            scheduleAutoFit();
        }
        scheduleMinimap();
        stopGraphLoading();
        return;
    }

    const nodesToRender = viewType === 'group'
        ? filterGroupViewNodes(graphData.nodes)
        : graphData.nodes;

    const elements = [];
    const elementsById = new Map();

    nodesToRender.forEach(node => {
        const element = createNodeElement(node);
        elements.push(element);
        elementsById.set(node.id, element);
    });

    const nodeById = new Map(nodesToRender.map(node => [node.id, node]));
    const filteredEdges = viewType === 'group'
        ? graphData.edges.filter((edge) => {
            const sourceNode = nodeById.get(edge.source);
            const targetNode = nodeById.get(edge.target);
            if (!sourceNode || !targetNode) return false;
            if (sourceNode.kind !== 'groupobject' || targetNode.kind !== 'groupobject') return true;
            if (!sourceNode.parent_id || !targetNode.parent_id) return true;
            return sourceNode.parent_id !== targetNode.parent_id;
        })
        : graphData.edges;
    const links = filteredEdges.map(edge => createLinkElement(edge));
    elements.forEach(element => element.set('z', zForElement(element.get('kind'), viewType)));
    const linkZ = viewType === 'group' ? 5 : -1;
    links.forEach(link => link.set('z', linkZ));

    if (state.graph.resetCells) {
        state.graph.resetCells(links.concat(elements));
    } else {
        state.graph.addCells(links.concat(elements));
    }

    if (viewType === 'group' || viewType === 'device') {
        const deviceCount = nodesToRender.filter(node => node.kind === 'device').length;
        if (deviceCount > 1 && typeof window !== 'undefined' && window.ELK) {
            startGraphLoading('Optimizing layout...');
        }
        layoutGroupView(nodesToRender, elementsById, { viewType });
    } else {
        layoutTopologyView(nodesToRender, elementsById);
    }

    if (state.graph.stopBatch) {
        state.graph.stopBatch('render');
    }
    if (state.paper.unfreeze) {
        state.paper.unfreeze();
    }
    updateLinkStyles();
    rebuildSelectionIndex();
    clearSelection();

    syncPaperToContent({
        resetView: resetView || state.isLargeGraph
    });
    if (!state.isLargeGraph || resetView) {
        fitContent();
    } else {
        scheduleAutoFit();
    }
    updateZoomLOD();
    scheduleMinimap();
    stopGraphLoading();
}

function scheduleAutoFit() {
    const token = ++autoFitToken;
    const run = (force = false) => {
        if (token !== autoFitToken) return;
        if (!ensureDeviceVisible({ force })) {
            ensureGraphVisible({ force });
        }
    };
    requestAnimationFrame(() => run(false));
    setTimeout(() => run(false), 180);
    setTimeout(() => run(true), 600);
}

function filterGroupViewNodes(nodes) {
    const deviceIds = new Set();
    nodes.forEach((node) => {
        if (node.kind === 'groupobject' && node.parent_id) {
            deviceIds.add(node.parent_id);
        }
    });
    return nodes.filter((node) => {
        if (node.kind === 'groupaddress') return false;
        if (node.kind === 'device') return deviceIds.has(node.id);
        return true;
    });
}

function buildDeviceGraphData(projectData) {
    const cache = getDeviceGraphCache();
    const cacheKey = deviceGraphBuilder.buildCacheKey(projectData, state.filters);
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const result = deviceGraphBuilder.build(projectData);
    cache.set(cacheKey, result);
    return result;
}

function getDeviceGraphCache() {
    if (!(state.deviceGraphCache instanceof GraphCache)) {
        stateManager.setState('deviceGraphCache', new GraphCache({ maxSize: 100 }));
    }
    return state.deviceGraphCache;
}

function buildTopologyGraphData(projectData) {
    const graph = projectData && projectData.topology_graph ? projectData.topology_graph : null;
    if (!graph || !Array.isArray(graph.nodes)) {
        return { nodes: [], edges: [] };
    }

    const nodes = graph.nodes.map((node) => ({
        ...node,
        properties: { ...(node.properties || {}) }
    }));
    const edges = Array.isArray(graph.edges) ? graph.edges.map((edge) => ({ ...edge })) : [];

    const devices = nodes.filter((node) => node.kind === 'device');
    const segmentsByLine = new Map();

    devices.forEach((device) => {
        const lineId = device.parent_id;
        if (!lineId) return;
        const segmentKey = resolveSegmentKeyFromNode(device);
        if (!segmentsByLine.has(lineId)) {
            segmentsByLine.set(lineId, new Map());
        }
        const segmentMap = segmentsByLine.get(lineId);
        if (!segmentMap.has(segmentKey)) {
            segmentMap.set(segmentKey, buildSegmentInfoFromNode(device, segmentKey, lineId));
        }
    });

    segmentsByLine.forEach((segmentMap, lineId) => {
        if (segmentMap.size <= 1) return;
        segmentMap.forEach((segmentInfo, segmentKey) => {
            nodes.push({
                id: segmentInfo.id,
                kind: 'segment',
                label: segmentInfo.label,
                parent_id: lineId,
                properties: {
                    segment: segmentInfo.label,
                    name: segmentInfo.name,
                    medium: segmentInfo.medium,
                    domain: segmentInfo.domain,
                    segment_id: segmentInfo.segmentId,
                    segment_number: segmentInfo.segmentNumber
                }
            });
            segmentMap.set(segmentKey, segmentInfo);
        });

        devices.forEach((device) => {
            if (device.parent_id !== lineId) return;
            const segmentKey = resolveSegmentKeyFromNode(device);
            const segmentInfo = segmentMap.get(segmentKey);
            if (segmentInfo) {
                device.parent_id = segmentInfo.id;
            }
        });
    });

    return { nodes, edges };
}

function resolveSegmentKeyFromNode(node) {
    const props = node && node.properties ? node.properties : {};
    const number = props.segment_number != null ? String(props.segment_number) : '';
    const id = props.segment_id != null ? String(props.segment_id) : '';
    if (number) return number;
    if (id) return id;
    return '0';
}

function buildSegmentInfoFromNode(node, segmentKey, lineId) {
    const props = node && node.properties ? node.properties : {};
    const number = props.segment_number != null ? String(props.segment_number) : '';
    const id = props.segment_id != null ? String(props.segment_id) : '';
    const label = number ? `Segment ${number}` : (id ? `Segment ${id}` : 'Segment 0');
    const safeLine = String(lineId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeSeg = String(segmentKey || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
        id: `segment_${safeLine}_${safeSeg}`,
        label,
        name: id && number ? id : '',
        medium: props.segment_medium || props.segment_medium_type || '',
        domain: props.segment_domain_address || props.segment_domain || '',
        segmentId: id,
        segmentNumber: number
    };
}

function countBuildingNodes(projectData) {
    const spaces = projectData && Array.isArray(projectData.locations)
        ? projectData.locations
        : [];
    let count = 0;
    const walk = (list) => {
        list.forEach((space) => {
            count += 1;
            if (Array.isArray(space.devices)) {
                count += space.devices.length;
            }
            if (Array.isArray(space.children)) {
                walk(space.children);
            }
        });
    };
    walk(spaces);
    return count;
}

function isHeaderDragTarget(cellView) {
    const target = state.dragIntentTarget;
    if (!target || !cellView || !cellView.el) return false;
    if (!cellView.el.contains(target)) return false;
    const handle = target.closest ? target.closest('[joint-selector]') : target;
    const selector = handle ? handle.getAttribute('joint-selector') : null;
    if (!selector) return false;
    return selector === 'header' ||
        selector === 'label' ||
        selector === 'name' ||
        selector === 'address';
}

function scheduleLinkAlign(cell) {
    stateManager.setState('pendingLinkAlign', cell);
    if (state.linkAlignFrame) return;
    stateManager.setState('linkAlignFrame', requestAnimationFrame(() => {
        stateManager.setState('linkAlignFrame', null);
        const target = state.pendingLinkAlign;
        stateManager.setState('pendingLinkAlign', null);
        if (target) {
            alignGroupLinks(target);
        } else {
            alignGroupLinks();
        }
    }));
}

export function createNodeElement(node) {
    if (node.kind === 'device') {
        const address = node.properties && node.properties.address ? node.properties.address : '';
        const rawName = node.properties && node.properties.name ? node.properties.name : node.label;
        const displayName = formatDeviceName(node);
        const element = new joint.shapes.knx.Device({
            id: node.id,
            kind: node.kind,
            attrs: {
                address: { text: address },
                name: { text: displayName },
                summary: { text: address }
            }
        });
        element.set('fullAddress', address);
        element.set('fullName', displayName || rawName);
        element.set('nodeProps', node.properties || {});
        return element;
    }

    if (node.kind === 'groupobject') {
        const address = node.properties && node.properties.group_address ? node.properties.group_address : '';
        const theme = readTheme();
        const isTx = node.properties && node.properties.is_transmitter === 'true';
        const isRx = node.properties && node.properties.is_receiver === 'true';
        const fill = isTx ? theme.objectFillTx : theme.objectFill;
        const addressColor = theme.ink;
        const element = new joint.shapes.knx.GroupObject({
            id: node.id,
            kind: node.kind,
            attrs: {
                body: { fill },
                name: { text: node.label },
                address: { text: address, fill: addressColor }
            }
        });
        element.set('fullName', node.label);
        element.set('groupAddress', address);
        element.set('isTransmitter', isTx);
        element.set('isReceiver', isRx);
        element.set('nodeProps', node.properties || {});
        return element;
    }

    if (node.kind === 'area') {
        const element = new joint.shapes.knx.Area({
            id: node.id,
            kind: node.kind,
            attrs: {
                label: { text: node.label }
            }
        });
        element.set('fullLabel', node.label);
        element.set('nodeProps', node.properties || {});
        return element;
    }

    if (node.kind === 'line') {
        const element = new joint.shapes.knx.Line({
            id: node.id,
            kind: node.kind,
            attrs: {
                label: { text: node.label }
            }
        });
        element.set('fullLabel', node.label);
        element.set('nodeProps', node.properties || {});
        return element;
    }

    if (node.kind === 'segment') {
        const element = new joint.shapes.knx.Line({
            id: node.id,
            kind: node.kind,
            attrs: {
                label: { text: node.label }
            }
        });
        element.set('fullLabel', node.label);
        element.set('nodeProps', node.properties || {});
        return element;
    }

    return new joint.shapes.standard.Rectangle({
        id: node.id,
        kind: node.kind,
        size: { width: 180, height: 60 },
        attrs: {
            body: {
                fill: '#ffffff',
                stroke: '#1f2937',
                strokeWidth: 1.5,
                rx: 6,
                ry: 6
            },
            label: {
                text: node.label,
                fill: '#1f2937',
                fontSize: 12,
                fontFamily: readTheme().fontSans
            }
        }
    });
}

export function createLinkElement(edge) {
    const theme = readTheme();
    const direction = edge.properties && edge.properties.direction ? edge.properties.direction : 'directed';
    const groupAddress = edge.properties && edge.properties.group_address ? edge.properties.group_address : '';
    const link = new joint.shapes.standard.Link({
        source: { id: edge.source },
        target: { id: edge.target },
        router: { name: 'normal' },
        connector: { name: 'normal' },
        attrs: {
            line: {
                stroke: theme.accent,
                strokeWidth: 2,
                strokeDasharray: '6 4',
                opacity: 0.8
            }
        }
    });

    link.set('linkDirection', direction);
    link.set('groupAddress', groupAddress);

    if (edge.label) {
        link.labels([{
            attrs: {
                text: {
                    text: edge.label,
                    fontSize: 10,
                    fontFamily: theme.fontMono,
                    fill: theme.ink
                },
                rect: {
                    fill: '#ffffff',
                    stroke: theme.accent,
                    strokeWidth: 0.5,
                    rx: 3,
                    ry: 3
                }
            }
        }]);
    }

    return link;
}
